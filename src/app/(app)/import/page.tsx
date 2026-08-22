"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { FileSpreadsheet, RefreshCw, Undo2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ApiError, apiFetch } from "@/lib/client";
import { dollarsToCents, formatDay, formatMoney, formatNumber } from "@/lib/format";
import { todayStr } from "@/lib/dates";
import { CANONICAL_FIELDS, FIELD_LABELS } from "@/lib/import/metaHeaders";
import type { Campaign, CampaignTree, ImportJob, MetricLevel } from "@/lib/types";

interface PreviewResponse {
  headers: string[];
  mapping: Record<string, string>;
  level: MetricLevel | null;
  usable: boolean;
  missing: string[];
  counts: { total: number; valid: number; matched: number; willCreate: number; skipped: number };
  sample: {
    date: string;
    entity: string | null;
    campaign: string | null;
    impressions: number;
    clicks: number;
    spend_cents: number;
    conversions: number;
    state: "matched" | "will_create" | "skipped";
    reason: string | null;
  }[];
  parseErrors: string[];
}

interface CommitResult {
  jobId: number;
  imported: number;
  skipped: number;
  created: number;
  dateMin: string | null;
  dateMax: string | null;
  errors: { row: number; reason: string }[];
}

export default function ImportPage() {
  const [jobsVersion, setJobsVersion] = useState(0);
  return (
    <>
      <TopBar title="Import data" subtitle="Bring performance metrics in from Meta" />
      <div className="space-y-6">
        <CsvImportCard onImported={() => setJobsVersion((v) => v + 1)} />
        <ManualMetricCard />
        <ImportJobsCard version={jobsVersion} onChanged={() => setJobsVersion((v) => v + 1)} />
      </div>
    </>
  );
}

function stateBadge(state: "matched" | "will_create" | "skipped") {
  if (state === "matched") return <Badge tone="positive">Matched</Badge>;
  if (state === "will_create") return <Badge tone="ocean">Will create</Badge>;
  return <Badge tone="warn">Skipped</Badge>;
}

function CsvImportCard({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [level, setLevel] = useState<MetricLevel | "">("");
  const [createMissing, setCreateMissing] = useState(true);
  const [collision, setCollision] = useState<"overwrite" | "skip">("overwrite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const runPreview = useCallback(
    async (f: File, overrideMapping?: Record<string, string>, overrideLevel?: string) => {
      setBusy(true);
      setError(null);
      setResult(null);
      const form = new FormData();
      form.append("file", f);
      if (overrideMapping) form.append("mapping", JSON.stringify(overrideMapping));
      if (overrideLevel) form.append("level", overrideLevel);
      if (createMissing) form.append("createMissing", "1");
      try {
        const res = await apiFetch<PreviewResponse>("/api/import/csv/preview", {
          method: "POST",
          body: form,
        });
        setPreview(res);
        setMapping(res.mapping);
        setLevel(res.level ?? "");
      } catch (e) {
        setPreview(null);
        setError(e instanceof ApiError ? e.message : "Could not read that file");
      } finally {
        setBusy(false);
      }
    },
    [createMissing],
  );

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    if (level) form.append("level", level);
    if (createMissing) form.append("createMissing", "1");
    form.append("collision", collision);
    try {
      const res = await apiFetch<{ result: CommitResult }>("/api/import/csv/commit", {
        method: "POST",
        body: form,
      });
      setResult(res.result);
      setPreview(null);
      setFile(null);
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Meta CSV import"
        subtitle="Export a report from Ads Manager broken down by day, then drop it here"
      />
      <div className="p-5">
        {!preview && !result ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-card border border-dashed border-hairline-strong bg-surface/60 px-6 py-10 text-center hover:border-ocean"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) {
                setFile(f);
                void runPreview(f);
              }
            }}
          >
            <Icon icon={FileSpreadsheet} size={22} className="text-ocean" />
            <p className="mt-2 text-[13px] font-medium">Drop a CSV or click to choose</p>
            <p className="mt-1 text-xs text-muted">
              Campaign, ad set, or ad level — columns are matched automatically and you can adjust
              them before anything is written.
            </p>
          </button>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              void runPreview(f);
            }
            e.target.value = "";
          }}
        />

        {busy ? <p className="mt-3 text-[13px] text-faint">Working…</p> : null}
        {error ? <p className="mt-3 text-sm text-negative">{error}</p> : null}

        {preview ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
              <span className="font-medium">{file?.name}</span>
              <span className="text-muted">
                {formatNumber(preview.counts.total)} rows · {preview.counts.matched} matched ·{" "}
                {preview.counts.willCreate} will create · {preview.counts.skipped} skipped
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => file && void runPreview(file, mapping, level || undefined)}
              >
                <Icon icon={RefreshCw} size={13} />
                Re-check
              </Button>
            </div>

            {!preview.usable ? (
              <p className="rounded-btn bg-warn/10 px-3 py-2 text-[13px] text-warn">
                This mapping still needs {preview.missing.join(", ")}.
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  Column mapping
                </p>
                <div className="max-h-72 overflow-y-auto rounded-card border border-hairline">
                  <table className="w-full text-[13px]">
                    <tbody>
                      {preview.headers.map((h) => (
                        <tr key={h} className="border-b border-hairline last:border-b-0">
                          <td className="max-w-40 truncate px-3 py-1.5 font-medium" title={h}>
                            {h}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="w-full rounded-btn border border-hairline bg-raised px-2 py-1 text-[13px]"
                              value={mapping[h] ?? "ignore"}
                              onChange={(e) =>
                                setMapping((m) => ({ ...m, [h]: e.target.value }))
                              }
                            >
                              {CANONICAL_FIELDS.map((f) => (
                                <option key={f} value={f}>
                                  {FIELD_LABELS[f]}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <Field label="Data level" hint="The finest entity each row describes">
                  <Select value={level} onChange={(e) => setLevel(e.target.value as MetricLevel)}>
                    <option value="campaign">Campaign</option>
                    <option value="adset">Ad set</option>
                    <option value="ad">Ad</option>
                  </Select>
                </Field>
                <label className="flex items-start gap-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-(--ocean)"
                    checked={createMissing}
                    onChange={(e) => setCreateMissing(e.target.checked)}
                  />
                  <span>
                    Create missing campaigns, ad sets, and ads as paused drafts
                    <span className="block text-xs text-muted">
                      Otherwise rows that do not match by Meta ID or name are skipped.
                    </span>
                  </span>
                </label>
                <Field label="If a day already has data">
                  <Select
                    value={collision}
                    onChange={(e) => setCollision(e.target.value as "overwrite" | "skip")}
                  >
                    <option value="overwrite">Overwrite with the file&apos;s values</option>
                    <option value="skip">Keep existing values</option>
                  </Select>
                </Field>
              </div>
            </div>

            {preview.sample.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  Preview
                </p>
                <div className="overflow-x-auto rounded-card border border-hairline">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-hairline text-left text-xs text-faint">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Entity</th>
                        <th className="px-3 py-2 text-right font-medium">Impr.</th>
                        <th className="px-3 py-2 text-right font-medium">Clicks</th>
                        <th className="px-3 py-2 text-right font-medium">Spend</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((s, i) => (
                        <tr key={i} className="border-b border-hairline last:border-b-0">
                          <td className="numeric px-3 py-1.5">{s.date}</td>
                          <td className="max-w-56 truncate px-3 py-1.5">{s.entity}</td>
                          <td className="numeric px-3 py-1.5 text-right">
                            {formatNumber(s.impressions)}
                          </td>
                          <td className="numeric px-3 py-1.5 text-right">{formatNumber(s.clicks)}</td>
                          <td className="numeric px-3 py-1.5 text-right">
                            {formatMoney(s.spend_cents)}
                          </td>
                          <td className="px-3 py-1.5">
                            <span title={s.reason ?? undefined}>{stateBadge(s.state)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {preview.parseErrors.length > 0 ? (
              <details className="text-[13px] text-muted">
                <summary className="cursor-pointer">
                  {preview.parseErrors.length} row issue{preview.parseErrors.length > 1 ? "s" : ""}
                </summary>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                  {preview.parseErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={busy || !preview.usable || preview.counts.valid === 0}
                onClick={() => void commit()}
              >
                Import {preview.counts.matched + preview.counts.willCreate} rows
              </Button>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="rounded-card border border-hairline bg-ocean-wash/60 px-4 py-3 text-[13px]">
            <p className="font-medium text-ocean">
              Imported {result.imported} rows
              {result.created > 0 ? ` · created ${result.created} entities` : ""}
              {result.skipped > 0 ? ` · skipped ${result.skipped}` : ""}
              {result.dateMin ? ` · ${formatDay(result.dateMin)} – ${formatDay(result.dateMax!)}` : ""}
            </p>
            {result.errors.length > 0 ? (
              <p className="mt-1 text-xs text-muted">
                First issue: row {result.errors[0].row} — {result.errors[0].reason}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ManualMetricCard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tree, setTree] = useState<CampaignTree | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [level, setLevel] = useState<MetricLevel>("campaign");
  const [adsetId, setAdsetId] = useState("");
  const [adId, setAdId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [impressions, setImpressions] = useState("");
  const [reach, setReach] = useState("");
  const [clicks, setClicks] = useState("");
  const [spend, setSpend] = useState("");
  const [conversions, setConversions] = useState("");
  const [conversionValue, setConversionValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ campaigns: Campaign[] }>("/api/campaigns")
      .then((r) => setCampaigns(r.campaigns))
      .catch(() => setError("Could not load campaigns"));
  }, []);

  useEffect(() => {
    setTree(null);
    setAdsetId("");
    setAdId("");
    if (!campaignId) return;
    apiFetch<{ campaign: CampaignTree }>(`/api/campaigns/${campaignId}?tree=1`)
      .then((r) => setTree(r.campaign))
      .catch(() => setError("Could not load the campaign structure"));
  }, [campaignId]);

  const adSet = tree?.ad_sets.find((s) => String(s.id) === adsetId) ?? null;

  async function submit() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const int = (v: string): number => (v.trim() === "" ? 0 : Math.round(Number(v)));
      await apiFetch("/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          date,
          level,
          campaign_id: Number(campaignId),
          adset_id: level === "campaign" ? null : Number(adsetId) || null,
          ad_id: level === "ad" ? Number(adId) || null : null,
          impressions: int(impressions),
          reach: reach.trim() === "" ? null : Math.round(Number(reach)),
          clicks: int(clicks),
          spend_cents: dollarsToCents(spend) ?? 0,
          conversions: conversions.trim() === "" ? 0 : Number(conversions),
          conversion_value_cents: dollarsToCents(conversionValue) ?? 0,
          frequency: null,
        }),
      });
      setMessage(`Saved metrics for ${formatDay(date)}`);
      setImpressions("");
      setReach("");
      setClicks("");
      setSpend("");
      setConversions("");
      setConversionValue("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save — check the fields");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    campaignId !== "" &&
    date !== "" &&
    (level === "campaign" || adsetId !== "") &&
    (level !== "ad" || adId !== "");

  return (
    <Card>
      <CardHeader
        title="Manual entry"
        subtitle="Record one day of metrics by hand — useful for quick checks or offline data"
      />
      <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
        <Field label="Date">
          <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Campaign">
          <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Choose…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Level">
          <Select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as MetricLevel);
              setAdsetId("");
              setAdId("");
            }}
          >
            <option value="campaign">Whole campaign</option>
            <option value="adset">One ad set</option>
            <option value="ad">One ad</option>
          </Select>
        </Field>
        {level !== "campaign" ? (
          <Field label="Ad set">
            <Select value={adsetId} onChange={(e) => setAdsetId(e.target.value)}>
              <option value="">Choose…</option>
              {(tree?.ad_sets ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div />
        )}
        {level === "ad" ? (
          <Field label="Ad">
            <Select value={adId} onChange={(e) => setAdId(e.target.value)}>
              <option value="">Choose…</option>
              {(adSet?.ads ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Impressions">
          <Input inputMode="numeric" value={impressions} onChange={(e) => setImpressions(e.target.value)} />
        </Field>
        <Field label="Reach" hint="Optional">
          <Input inputMode="numeric" value={reach} onChange={(e) => setReach(e.target.value)} />
        </Field>
        <Field label="Link clicks">
          <Input inputMode="numeric" value={clicks} onChange={(e) => setClicks(e.target.value)} />
        </Field>
        <Field label="Spend (USD)">
          <Input inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} />
        </Field>
        <Field label="Conversions">
          <Input inputMode="decimal" value={conversions} onChange={(e) => setConversions(e.target.value)} />
        </Field>
        <Field label="Conversion value (USD)">
          <Input
            inputMode="decimal"
            value={conversionValue}
            onChange={(e) => setConversionValue(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-hairline px-5 py-4">
        <div className="text-[13px]">
          {message ? <span className="text-positive">{message}</span> : null}
          {error ? <span className="text-negative">{error}</span> : null}
        </div>
        <Button variant="primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save metrics"}
        </Button>
      </div>
    </Card>
  );
}

function ImportJobsCard({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);

  useEffect(() => {
    apiFetch<{ jobs: ImportJob[] }>("/api/import/jobs")
      .then((r) => setJobs(r.jobs))
      .catch(() => {});
  }, [version]);

  async function undo(job: ImportJob) {
    if (
      !window.confirm(
        `Undo the import of "${job.filename}"? Its ${job.rows_imported} metric rows will be removed.`,
      )
    )
      return;
    await apiFetch(`/api/import/jobs/${job.id}`, { method: "DELETE" });
    onChanged();
  }

  if (jobs.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Import history" subtitle="Each import can be undone as a unit" />
      <table className="w-full text-[13px]">
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-hairline last:border-b-0">
              <td className="px-5 py-2.5 font-medium">{j.filename}</td>
              <td className="px-3 py-2.5 text-muted">{j.level} level</td>
              <td className="numeric px-3 py-2.5 text-muted">
                {j.rows_imported} rows{j.rows_skipped > 0 ? ` · ${j.rows_skipped} skipped` : ""}
              </td>
              <td className="numeric px-3 py-2.5 text-muted">
                {j.date_min ? `${j.date_min} – ${j.date_max}` : "—"}
              </td>
              <td className={clsx("px-5 py-2.5 text-right")}>
                <Button size="sm" variant="ghost" onClick={() => void undo(j)}>
                  <Icon icon={Undo2} size={14} />
                  Undo
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

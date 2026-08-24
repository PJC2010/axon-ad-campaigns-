"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Check,
  Info,
  Lightbulb,
  OctagonAlert,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { ApiError, apiFetch } from "@/lib/client";
import { formatDay } from "@/lib/format";
import type { RecommendationWithNames } from "@/lib/repo/recommendations";
import type { RecoSeverity } from "@/lib/types";

const SEVERITY_META: Record<
  RecoSeverity,
  { icon: typeof Info; cls: string; label: string }
> = {
  critical: { icon: OctagonAlert, cls: "text-negative", label: "Critical" },
  warning: { icon: TriangleAlert, cls: "text-warn", label: "Worth a look" },
  info: { icon: Info, cls: "text-ocean", label: "Opportunity" },
};

interface GenerateResponse {
  window: { from: string; to: string };
  heuristic: { created: number; updated: number; suppressed: number; resolved: number };
  claude: { status: string; reason?: string; created?: number; updated?: number };
  recommendations: RecommendationWithNames[];
}

export default function RecommendationsPage() {
  const [recos, setRecos] = useState<RecommendationWithNames[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    apiFetch<{ recommendations: RecommendationWithNames[] }>("/api/recommendations")
      .then((r) => setRecos(r.recommendations))
      .catch(() => setError("Could not load recommendations"));
  }, []);

  useEffect(reload, [reload]);

  async function generate() {
    setGenerating(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiFetch<GenerateResponse>("/api/recommendations", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRecos(res.recommendations);
      const parts = [
        `Analyzed ${formatDay(res.window.from)} – ${formatDay(res.window.to)}`,
        `${res.heuristic.created + res.heuristic.updated} from the rules engine`,
      ];
      if (res.claude.status === "ok") {
        parts.push(`${(res.claude.created ?? 0) + (res.claude.updated ?? 0)} from Claude`);
      } else if (res.claude.status === "skipped" && res.claude.reason === "no_api_key") {
        parts.push("Claude skipped — set ANTHROPIC_API_KEY to enable narrative analysis");
      } else if (res.claude.status === "error") {
        parts.push(`Claude unavailable: ${res.claude.reason}`);
      }
      setNotice(parts.join(" · "));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Generation failed — try again");
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(reco: RecommendationWithNames, status: "new" | "dismissed" | "done") {
    await apiFetch(`/api/recommendations/${reco.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    reload();
  }

  const open = (recos ?? []).filter((r) => r.status === "new");
  const closed = (recos ?? []).filter((r) => r.status !== "new");

  return (
    <>
      <TopBar
        title="Recommendations"
        subtitle="What to scale, pause, and refresh — from the rules engine and Claude"
        actions={
          <Button variant="primary" onClick={() => void generate()} disabled={generating}>
            <Icon icon={Sparkles} size={15} />
            {generating ? "Analyzing…" : "Generate"}
          </Button>
        }
      />

      {notice ? <p className="mb-4 text-[13px] text-muted">{notice}</p> : null}
      {error ? <p className="mb-4 text-sm text-negative">{error}</p> : null}

      {recos && open.length === 0 && closed.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No recommendations yet"
          hint="Generate an analysis of the last two weeks. The rules engine always runs; Claude adds narrative recommendations when an API key is configured."
          action={
            <Button variant="primary" onClick={() => void generate()} disabled={generating}>
              {generating ? "Analyzing…" : "Generate recommendations"}
            </Button>
          }
        />
      ) : null}

      <div className="space-y-3">
        {open.map((r) => (
          <RecoCard key={r.id} reco={r} onStatus={setStatus} />
        ))}
      </div>

      {closed.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-[13px] font-medium text-muted">
            Done and dismissed ({closed.length})
          </summary>
          <div className="mt-3 space-y-3 opacity-70">
            {closed.map((r) => (
              <RecoCard key={r.id} reco={r} onStatus={setStatus} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function RecoCard({
  reco,
  onStatus,
}: {
  reco: RecommendationWithNames;
  onStatus: (r: RecommendationWithNames, s: "new" | "dismissed" | "done") => Promise<void>;
}) {
  const meta = SEVERITY_META[reco.severity];
  const chips = Object.entries(reco.metrics_json);
  return (
    <div className="rounded-card border border-hairline bg-surface p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className={clsx("mt-0.5", meta.cls)}>
          <Icon icon={meta.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-semibold leading-snug">{reco.title}</h3>
            <Badge tone={reco.source === "claude" ? "ocean" : "neutral"}>
              {reco.source === "claude" ? "Claude" : "Rules engine"}
            </Badge>
            {reco.status === "done" ? <Badge tone="positive">Done</Badge> : null}
            {reco.status === "dismissed" ? <Badge tone="neutral">Dismissed</Badge> : null}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{reco.body}</p>
          {chips.length > 0 ? (
            <p className="mt-2.5 flex flex-wrap gap-1.5">
              {chips.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-muted"
                >
                  {k}: <span className="numeric font-medium text-ink">{v}</span>
                </span>
              ))}
            </p>
          ) : null}
          <p className="mt-2.5 flex items-center gap-3 text-xs text-faint">
            {reco.campaign_id ? (
              <Link
                href={`/campaigns/${reco.campaign_id}`}
                className="text-ocean hover:underline"
              >
                {reco.campaign_name ?? "View campaign"}
                {reco.ad_name ? ` — ${reco.ad_name}` : ""}
              </Link>
            ) : (
              <span>Account level</span>
            )}
            <span>{formatDay(reco.created_at.slice(0, 10))}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {reco.status === "new" ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => void onStatus(reco, "done")}>
                <Icon icon={Check} size={14} />
                Done
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void onStatus(reco, "dismissed")}>
                <Icon icon={X} size={14} />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => void onStatus(reco, "new")}>
              <Icon icon={RotateCcw} size={14} />
              Reopen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

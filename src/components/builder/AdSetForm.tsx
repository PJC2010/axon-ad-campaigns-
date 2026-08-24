"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { ApiError, apiFetch, type FieldErrors } from "@/lib/client";
import { centsToDollarInput, dollarsToCents } from "@/lib/format";
import {
  BID_STRATEGIES,
  BILLING_EVENTS,
  COUNTRIES,
  GENDERS,
  OPTIMIZATION_GOALS,
  PLACEMENTS,
  PLACEMENT_TYPES,
  STATUSES,
  countryName,
} from "@/lib/meta/enums";
import type { AdSet } from "@/lib/types";

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-3 mt-7 border-b border-hairline pb-1.5 text-xs font-semibold uppercase tracking-wide text-faint first:mt-0">
      {children}
    </p>
  );
}

const AGE_OPTIONS = Array.from({ length: 48 }, (_, i) => 18 + i);

export function AdSetForm({
  open,
  ...props
}: {
  open: boolean;
  campaignId: number;
  campaignIsCbo: boolean;
  initial?: AdSet | null;
  onClose: () => void;
  onSaved: (adSet: AdSet) => void;
}) {
  // Mount the form fresh on every open (keyed by what's being edited) so the
  // field state initializes straight from props — no sync-in-effect needed.
  if (!open) return null;
  return <AdSetFormFields key={props.initial?.id ?? "new"} {...props} />;
}

function AdSetFormFields({
  campaignId,
  campaignIsCbo,
  initial,
  onClose,
  onSaved,
}: {
  campaignId: number;
  campaignIsCbo: boolean;
  initial?: AdSet | null;
  onClose: () => void;
  onSaved: (adSet: AdSet) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState<AdSet["status"]>(initial?.status ?? "DRAFT");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">(
    initial?.budget_type ?? "daily",
  );
  const [budget, setBudget] = useState(centsToDollarInput(initial?.budget_cents));
  const [startTime, setStartTime] = useState(initial?.start_time ?? "");
  const [endTime, setEndTime] = useState(initial?.end_time ?? "");
  const [countries, setCountries] = useState<string[]>(initial?.countries ?? []);
  const [ageMin, setAgeMin] = useState(initial?.age_min ?? 18);
  const [ageMax, setAgeMax] = useState(initial?.age_max ?? 65);
  const [genders, setGenders] = useState<AdSet["genders"]>(initial?.genders ?? "all");
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [interestDraft, setInterestDraft] = useState("");
  const [placementType, setPlacementType] = useState<AdSet["placement_type"]>(
    initial?.placement_type ?? "advantage_plus",
  );
  const [placements, setPlacements] = useState<string[]>(initial?.placements ?? []);
  const [optimizationGoal, setOptimizationGoal] = useState<AdSet["optimization_goal"]>(
    initial?.optimization_goal ?? "LINK_CLICKS",
  );
  const [billingEvent, setBillingEvent] = useState<AdSet["billing_event"]>(
    initial?.billing_event ?? "IMPRESSIONS",
  );
  const [bidStrategy, setBidStrategy] = useState<AdSet["bid_strategy"]>(
    initial?.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
  );
  const [bidAmount, setBidAmount] = useState(centsToDollarInput(initial?.bid_amount_cents));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsBidAmount = bidStrategy === "COST_CAP" || bidStrategy === "BID_CAP";
  const availableCountries = useMemo(
    () => COUNTRIES.filter(([code]) => !countries.includes(code)),
    [countries],
  );
  const placementsByPlatform = useMemo(() => {
    const groups = new Map<string, typeof PLACEMENTS[number][]>();
    for (const p of PLACEMENTS) {
      groups.set(p.platform, [...(groups.get(p.platform) ?? []), p]);
    }
    return [...groups.entries()];
  }, []);

  function addInterest() {
    const v = interestDraft.trim();
    if (!v || interests.includes(v)) {
      setInterestDraft("");
      return;
    }
    setInterests((prev) => [...prev, v]);
    setInterestDraft("");
  }

  async function submit() {
    setSaving(true);
    setErrors({});
    setFormError(null);
    const payload = {
      name,
      status,
      budget_type: campaignIsCbo ? null : budgetType,
      budget_cents: campaignIsCbo ? null : dollarsToCents(budget),
      start_time: startTime || null,
      end_time: endTime || null,
      countries,
      age_min: ageMin,
      age_max: ageMax,
      genders,
      interests,
      placement_type: placementType,
      placements: placementType === "manual" ? placements : [],
      optimization_goal: optimizationGoal,
      billing_event: billingEvent,
      bid_strategy: bidStrategy,
      bid_amount_cents: needsBidAmount ? dollarsToCents(bidAmount) : null,
    };
    try {
      const res = initial
        ? await apiFetch<{ adSet: AdSet }>(`/api/adsets/${initial.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ adSet: AdSet }>("/api/adsets", {
            method: "POST",
            body: JSON.stringify({ ...payload, campaign_id: campaignId }),
          });
      onSaved(res.adSet);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors ?? {});
        if (e.code === "duplicate_name") setErrors({ name: e.message });
        else if (!e.fieldErrors) setFormError(e.message);
      } else {
        setFormError("Something went wrong — try again");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? "Edit ad set" : "New ad set"}
      subtitle="Audience, budget, placements, and delivery"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Create ad set"}
          </Button>
        </>
      }
    >
      <SectionLabel>Basics</SectionLabel>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Field label="Ad set name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prospecting — US, broad" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AdSet["status"])}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <SectionLabel>Budget and schedule</SectionLabel>
      {campaignIsCbo ? (
        <p className="rounded-btn bg-ocean-wash px-3 py-2 text-[13px] text-ocean">
          Advantage campaign budget is on — the campaign budget covers this ad set.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Budget type">
            <Select
              value={budgetType}
              onChange={(e) => setBudgetType(e.target.value as "daily" | "lifetime")}
            >
              <option value="daily">Daily budget</option>
              <option value="lifetime">Lifetime budget</option>
            </Select>
          </Field>
          <Field label="Amount (USD)" error={errors.budget_cents}>
            <Input
              inputMode="decimal"
              placeholder="25"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Start" error={errors.start_time}>
          <Input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </Field>
        <Field label="End" hint="Optional" error={errors.end_time}>
          <Input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>
      </div>

      <SectionLabel>Audience</SectionLabel>
      <Field label="Locations" error={errors.countries}>
        <div className="flex flex-wrap items-center gap-1.5">
          {countries.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full bg-ocean-wash px-2.5 py-1 text-xs font-medium text-ocean"
            >
              {countryName(code)}
              <button
                type="button"
                aria-label={`Remove ${countryName(code)}`}
                onClick={() => setCountries((prev) => prev.filter((c) => c !== code))}
                className="hover:text-ocean-deep"
              >
                <Icon icon={X} size={12} />
              </button>
            </span>
          ))}
          <select
            className="rounded-btn border border-hairline bg-raised px-2 py-1 text-xs text-muted focus:outline-none"
            value=""
            onChange={(e) => {
              if (e.target.value) setCountries((prev) => [...prev, e.target.value]);
            }}
          >
            <option value="">Add country…</option>
            {availableCountries.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-4">
        <Field label="Age from">
          <Select value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))}>
            {AGE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a === 65 ? "65+" : a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Age to" error={errors.age_max}>
          <Select value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))}>
            {AGE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a === 65 ? "65+" : a}
              </option>
            ))}
          </Select>
        </Field>
        <div className="pb-0.5">
          <span className="mb-1.5 block text-[13px] font-medium">Gender</span>
          <Segmented options={GENDERS} value={genders} onChange={setGenders} />
        </div>
      </div>
      <div className="mt-4">
        <Field
          label="Interest targeting"
          hint="Type an interest and press Enter — leave empty for broad targeting"
        >
          <div className="flex flex-wrap items-center gap-1.5 rounded-btn border border-hairline bg-raised px-2 py-1.5">
            {interests.map((i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-ink/6 px-2.5 py-1 text-xs font-medium text-ink"
              >
                {i}
                <button
                  type="button"
                  aria-label={`Remove ${i}`}
                  onClick={() => setInterests((prev) => prev.filter((v) => v !== i))}
                  className="text-muted hover:text-ink"
                >
                  <Icon icon={X} size={12} />
                </button>
              </span>
            ))}
            <input
              className="min-w-28 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-faint"
              placeholder={interests.length === 0 ? "running, small business owners…" : ""}
              value={interestDraft}
              onChange={(e) => setInterestDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addInterest();
                }
              }}
              onBlur={addInterest}
            />
          </div>
        </Field>
      </div>

      <SectionLabel>Placements</SectionLabel>
      <div className="space-y-2">
        {PLACEMENT_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setPlacementType(t.value)}
            className={clsx(
              "block w-full rounded-card border px-3.5 py-3 text-left transition-colors duration-150",
              placementType === t.value
                ? "border-ocean bg-ocean-wash"
                : "border-hairline bg-surface hover:border-hairline-strong",
            )}
          >
            <span
              className={clsx(
                "block text-[13px] font-semibold",
                placementType === t.value ? "text-ocean" : "text-ink",
              )}
            >
              {t.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted">{t.help}</span>
          </button>
        ))}
      </div>
      {placementType === "manual" ? (
        <div className="mt-3 rounded-card border border-hairline bg-surface p-4">
          {errors.placements ? (
            <p className="mb-2 text-xs text-negative">{errors.placements}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            {placementsByPlatform.map(([platform, items]) => (
              <div key={platform}>
                <p className="mb-1.5 text-xs font-semibold text-muted">{platform}</p>
                <div className="space-y-1">
                  {items.map((p) => (
                    <label key={p.value} className="flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-(--ocean)"
                        checked={placements.includes(p.value)}
                        onChange={(e) =>
                          setPlacements((prev) =>
                            e.target.checked
                              ? [...prev, p.value]
                              : prev.filter((v) => v !== p.value),
                          )
                        }
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <SectionLabel>Delivery</SectionLabel>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Optimization goal" hint="What Meta optimizes delivery for">
          <Select
            value={optimizationGoal}
            onChange={(e) => setOptimizationGoal(e.target.value as AdSet["optimization_goal"])}
          >
            {OPTIMIZATION_GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Billing event">
          <Select
            value={billingEvent}
            onChange={(e) => setBillingEvent(e.target.value as AdSet["billing_event"])}
          >
            {BILLING_EVENTS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field
          label="Bid strategy"
          hint={BID_STRATEGIES.find((b) => b.value === bidStrategy)?.help}
        >
          <Select
            value={bidStrategy}
            onChange={(e) => setBidStrategy(e.target.value as AdSet["bid_strategy"])}
          >
            {BID_STRATEGIES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        {needsBidAmount ? (
          <Field label="Bid amount (USD)" error={errors.bid_amount_cents}>
            <Input
              inputMode="decimal"
              placeholder="5"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />
          </Field>
        ) : null}
      </div>

      {formError ? <p className="mt-4 text-sm text-negative">{formError}</p> : null}
    </Drawer>
  );
}

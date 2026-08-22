"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ApiError, apiFetch, type FieldErrors } from "@/lib/client";
import { centsToDollarInput, dollarsToCents } from "@/lib/format";
import { OBJECTIVES, SPECIAL_AD_CATEGORIES, STATUSES } from "@/lib/meta/enums";
import type { Campaign } from "@/lib/types";

export function CampaignForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Campaign | null;
  onSaved: (campaign: Campaign) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [objective, setObjective] = useState(initial?.objective ?? "OUTCOME_SALES");
  const [status, setStatus] = useState(initial?.status ?? "DRAFT");
  const [special, setSpecial] = useState<string[]>(initial?.special_ad_categories ?? []);
  const [isCbo, setIsCbo] = useState(initial?.is_cbo ?? true);
  const [budgetType, setBudgetType] = useState(initial?.budget_type ?? "daily");
  const [budget, setBudget] = useState(centsToDollarInput(initial?.budget_cents));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setErrors({});
    setFormError(null);
    const payload = {
      name,
      objective,
      status,
      special_ad_categories: special,
      is_cbo: isCbo,
      budget_type: isCbo ? budgetType : null,
      budget_cents: isCbo ? dollarsToCents(budget) : null,
    };
    try {
      const res = initial
        ? await apiFetch<{ campaign: Campaign }>(`/api/campaigns/${initial.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ campaign: Campaign }>("/api/campaigns", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      onSaved(res.campaign);
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

  function toggleSpecial(value: string) {
    setSpecial((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Campaign name" error={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring sale — prospecting"
            autoFocus
          />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Campaign["status"])}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div>
        <span className="mb-2 block text-[13px] font-medium">Objective</span>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {OBJECTIVES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setObjective(o.value)}
              className={clsx(
                "rounded-card border px-3.5 py-3 text-left transition-colors duration-150",
                objective === o.value
                  ? "border-ocean bg-ocean-wash"
                  : "border-hairline bg-surface hover:border-hairline-strong",
              )}
            >
              <span
                className={clsx(
                  "block text-[13px] font-semibold",
                  objective === o.value ? "text-ocean" : "text-ink",
                )}
              >
                {o.label}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{o.help}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-[13px] font-medium">Special ad categories</span>
        <p className="mb-2 text-xs text-faint">
          Required by Meta for ads about credit, employment, housing, social issues, or financial
          products. Leave unchecked for everything else.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {SPECIAL_AD_CATEGORIES.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-(--ocean)"
                checked={special.includes(c.value)}
                onChange={() => toggleSpecial(c.value)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-card border border-hairline bg-surface p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-(--ocean)"
            checked={isCbo}
            onChange={(e) => setIsCbo(e.target.checked)}
          />
          <span>
            <span className="block text-[13px] font-medium">Advantage campaign budget</span>
            <span className="mt-0.5 block text-xs text-muted">
              One budget for the whole campaign, distributed across ad sets automatically. Turn off
              to budget each ad set separately.
            </span>
          </span>
        </label>
        {isCbo ? (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Budget type">
              <Select
                value={budgetType ?? "daily"}
                onChange={(e) => setBudgetType(e.target.value as "daily" | "lifetime")}
              >
                <option value="daily">Daily budget</option>
                <option value="lifetime">Lifetime budget</option>
              </Select>
            </Field>
            <Field label="Amount (USD)" error={errors.budget_cents}>
              <Input
                inputMode="decimal"
                placeholder="50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </div>

      {formError ? <p className="text-sm text-negative">{formError}</p> : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create campaign"}
        </Button>
      </div>
    </form>
  );
}

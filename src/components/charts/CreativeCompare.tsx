"use client";

import { useState } from "react";
import Link from "next/link";
import type { Derived } from "@/lib/metrics/derive";
import type { CreativePerformanceRow } from "@/lib/repo/metrics";
import { CreativeThumb } from "@/components/creatives/CreativeThumb";
import { formatMoney, formatNumber, formatPercent, formatRatio } from "@/lib/format";
import { CHART } from "./chartTheme";

type Row = CreativePerformanceRow & { derived: Derived };
type Measure = "ctr" | "cpa" | "roas" | "spend";

const MEASURES: { value: Measure; label: string }[] = [
  { value: "ctr", label: "CTR" },
  { value: "cpa", label: "Cost per result" },
  { value: "roas", label: "ROAS" },
  { value: "spend", label: "Spend" },
];

function measureValue(row: Row, m: Measure): number | null {
  if (m === "ctr") return row.derived.ctr;
  if (m === "cpa") return row.derived.cpa_cents;
  if (m === "roas") return row.derived.roas;
  return row.spend_cents;
}

function formatMeasure(v: number | null, m: Measure): string {
  if (m === "ctr") return formatPercent(v);
  if (m === "cpa") return formatMoney(v);
  if (m === "roas") return formatRatio(v);
  return formatMoney(v, true);
}

/**
 * Horizontal magnitude comparison across creatives — single measure, single
 * hue (identity lives in the row label + thumbnail, not in color).
 */
export function CreativeCompare({ rows }: { rows: Row[] }) {
  const [measure, setMeasure] = useState<Measure>("ctr");

  const withValues = rows
    .map((r) => ({ row: r, value: measureValue(r, measure) }))
    .filter((r) => r.value != null && Number.isFinite(r.value)) as {
    row: Row;
    value: number;
  }[];
  // "Best first": costs sort ascending, everything else descending.
  withValues.sort((a, b) => (measure === "cpa" ? a.value - b.value : b.value - a.value));
  const max = Math.max(...withValues.map((r) => r.value), 0);

  if (rows.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px] text-muted">
        No ad-level metrics with linked creatives in this range yet. Creative performance is
        derived from ad-level rows via each ad&apos;s attached creatives.
      </p>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {MEASURES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMeasure(m.value)}
            className={
              m.value === measure
                ? "rounded-full bg-ocean-wash px-3 py-1 text-xs font-medium text-ocean"
                : "rounded-full px-3 py-1 text-xs font-medium text-muted hover:text-ink"
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2.5">
        {withValues.map(({ row, value }) => (
          <li key={row.creative_id} className="flex items-center gap-3">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-btn border border-hairline">
              <CreativeThumb
                creative={{
                  id: row.creative_id,
                  kind: row.kind,
                  original_name: row.original_name,
                  mime: "",
                }}
              />
            </span>
            <span className="w-44 shrink-0">
              <Link
                href="/creatives"
                className="block truncate text-[13px] font-medium hover:text-ocean"
                title={row.original_name}
              >
                {row.original_name}
              </Link>
              <span className="numeric block text-[11px] text-faint">
                {row.ads_count} ad{row.ads_count > 1 ? "s" : ""} ·{" "}
                {formatNumber(row.impressions)} impr.
              </span>
            </span>
            <span className="relative h-4 flex-1 overflow-hidden rounded-[4px] bg-ink/5">
              <span
                className="absolute inset-y-0 left-0 rounded-[4px]"
                style={{
                  width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`,
                  background: CHART.series1,
                }}
              />
            </span>
            <span className="numeric w-20 shrink-0 text-right text-[13px] font-medium">
              {formatMeasure(value, measure)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

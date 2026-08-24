// Pure metric aggregation and derivation. All rollups flow through here so
// CTR/CPC/CPM/CPA/ROAS are computed one way everywhere.

import { dayRange } from "@/lib/dates";

export interface MetricSums {
  impressions: number;
  reach: number | null;
  clicks: number;
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
}

export interface Totals extends MetricSums {
  /** True when reach was summed across entities/levels — reach is not additive, treat as approximate. */
  reach_approx: boolean;
}

export interface Derived {
  ctr: number | null; // fraction, clicks / impressions
  cpc_cents: number | null;
  cpm_cents: number | null;
  cpa_cents: number | null;
  roas: number | null;
  frequency: number | null; // impressions / reach
}

type RowLike = Partial<MetricSums> & { reach?: number | null };

export function aggregate(rows: RowLike[]): Totals {
  const t: Totals = {
    impressions: 0,
    reach: null,
    clicks: 0,
    spend_cents: 0,
    conversions: 0,
    conversion_value_cents: 0,
    reach_approx: false,
  };
  let reachRows = 0;
  for (const r of rows) {
    t.impressions += r.impressions ?? 0;
    t.clicks += r.clicks ?? 0;
    t.spend_cents += r.spend_cents ?? 0;
    t.conversions += r.conversions ?? 0;
    t.conversion_value_cents += r.conversion_value_cents ?? 0;
    if (r.reach != null) {
      t.reach = (t.reach ?? 0) + r.reach;
      reachRows += 1;
    }
  }
  t.reach_approx = reachRows > 1;
  return t;
}

export function derive(t: MetricSums): Derived {
  const safe = (num: number, den: number | null | undefined): number | null =>
    den && den > 0 ? num / den : null;
  return {
    ctr: safe(t.clicks, t.impressions),
    cpc_cents: safe(t.spend_cents, t.clicks),
    cpm_cents: t.impressions > 0 ? (t.spend_cents / t.impressions) * 1000 : null,
    cpa_cents: safe(t.spend_cents, t.conversions),
    roas: t.spend_cents > 0 ? t.conversion_value_cents / t.spend_cents : null,
    frequency: safe(t.impressions, t.reach),
  };
}

export interface SeriesPoint extends MetricSums {
  date: string;
  ctr: number | null;
}

/** Sum rows per day and zero-fill every day in [from, to]. */
export function buildSeries(
  rows: (RowLike & { date: string })[],
  from: string,
  to: string,
): SeriesPoint[] {
  const byDay = new Map<string, MetricSums>();
  for (const r of rows) {
    const cur = byDay.get(r.date) ?? {
      impressions: 0,
      reach: null,
      clicks: 0,
      spend_cents: 0,
      conversions: 0,
      conversion_value_cents: 0,
    };
    cur.impressions += r.impressions ?? 0;
    cur.clicks += r.clicks ?? 0;
    cur.spend_cents += r.spend_cents ?? 0;
    cur.conversions += r.conversions ?? 0;
    cur.conversion_value_cents += r.conversion_value_cents ?? 0;
    if (r.reach != null) cur.reach = (cur.reach ?? 0) + r.reach;
    byDay.set(r.date, cur);
  }
  return dayRange(from, to).map((date) => {
    const s = byDay.get(date) ?? {
      impressions: 0,
      reach: null,
      clicks: 0,
      spend_cents: 0,
      conversions: 0,
      conversion_value_cents: 0,
    };
    return { date, ...s, ctr: s.impressions > 0 ? s.clicks / s.impressions : null };
  });
}

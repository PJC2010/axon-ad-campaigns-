import type { DB } from "@/lib/repo/util";
import type { Campaign, MetricDaily } from "@/lib/types";
import { listCampaigns } from "@/lib/repo/campaigns";
import { listAdSets } from "@/lib/repo/adsets";
import { selectCreativePerformance, type CreativePerformanceRow } from "@/lib/repo/metrics";
import { selectEffectiveDaily } from "@/lib/metrics/effective";
import { aggregate, buildSeries, derive, type Derived, type SeriesPoint, type Totals } from "@/lib/metrics/derive";
import { previousWindow } from "@/lib/dates";

export interface Rollup {
  totals: Totals;
  derived: Derived;
}

function rollup(rows: MetricDaily[]): Rollup {
  const totals = aggregate(rows);
  return { totals, derived: derive(totals) };
}

export interface DashboardPayload {
  range: { from: string; to: string };
  kpis: Rollup & { prev: Rollup };
  series: SeriesPoint[];
  leaderboard: (Rollup & {
    campaign: Pick<Campaign, "id" | "name" | "status" | "objective">;
  })[];
  creatives: (CreativePerformanceRow & { derived: Derived })[];
}

export function buildDashboard(db: DB, from: string, to: string): DashboardPayload {
  const rows = selectEffectiveDaily(db, { from, to });
  const prevRange = previousWindow(from, to);
  const prevRows = selectEffectiveDaily(db, { from: prevRange.from, to: prevRange.to });

  const byCampaign = new Map<number, MetricDaily[]>();
  for (const r of rows) {
    byCampaign.set(r.campaign_id, [...(byCampaign.get(r.campaign_id) ?? []), r]);
  }

  const leaderboard = listCampaigns(db)
    .filter((c) => c.status !== "ARCHIVED" || byCampaign.has(c.id))
    .map((c) => ({
      campaign: { id: c.id, name: c.name, status: c.status, objective: c.objective },
      ...rollup(byCampaign.get(c.id) ?? []),
    }))
    .sort((a, b) => b.totals.spend_cents - a.totals.spend_cents);

  return {
    range: { from, to },
    kpis: { ...rollup(rows), prev: rollup(prevRows) },
    series: buildSeries(rows, from, to),
    leaderboard,
    creatives: selectCreativePerformance(db, { from, to }).map((c) => ({
      ...c,
      derived: derive(c),
    })),
  };
}

export interface CampaignInsightsPayload {
  range: { from: string; to: string };
  kpis: Rollup & { prev: Rollup };
  series: SeriesPoint[];
  adSets: (Rollup & { id: number | null; name: string })[];
  ads: (Rollup & { id: number; name: string; adset_name: string })[];
  /** True when some days only had campaign-level rows (no per-ad attribution). */
  hasUnattributedDays: boolean;
}

export function buildCampaignInsights(
  db: DB,
  campaignId: number,
  from: string,
  to: string,
): CampaignInsightsPayload {
  const rows = selectEffectiveDaily(db, { from, to, campaignId });
  const prevRange = previousWindow(from, to);
  const prevRows = selectEffectiveDaily(db, {
    from: prevRange.from,
    to: prevRange.to,
    campaignId,
  });

  const adSetNames = new Map(listAdSets(db, campaignId).map((s) => [s.id, s.name]));
  const adRows = db
    .prepare("SELECT id, name, adset_id FROM ads WHERE adset_id IN (SELECT id FROM ad_sets WHERE campaign_id = ?)")
    .all(campaignId) as { id: number; name: string; adset_id: number }[];
  const adNames = new Map(adRows.map((a) => [a.id, a]));

  const byAdSet = new Map<number | null, MetricDaily[]>();
  const byAd = new Map<number, MetricDaily[]>();
  let hasUnattributedDays = false;
  for (const r of rows) {
    byAdSet.set(r.adset_id, [...(byAdSet.get(r.adset_id) ?? []), r]);
    if (r.ad_id != null) byAd.set(r.ad_id, [...(byAd.get(r.ad_id) ?? []), r]);
    if (r.adset_id == null) hasUnattributedDays = true;
  }

  const adSets = [...byAdSet.entries()]
    .map(([id, list]) => ({
      id,
      name: id == null ? "Campaign level (not attributed)" : (adSetNames.get(id) ?? `Ad set ${id}`),
      ...rollup(list),
    }))
    .sort((a, b) => b.totals.spend_cents - a.totals.spend_cents);

  const ads = [...byAd.entries()]
    .map(([id, list]) => {
      const meta = adNames.get(id);
      return {
        id,
        name: meta?.name ?? `Ad ${id}`,
        adset_name: meta ? (adSetNames.get(meta.adset_id) ?? "") : "",
        ...rollup(list),
      };
    })
    .sort((a, b) => b.totals.spend_cents - a.totals.spend_cents);

  return {
    range: { from, to },
    kpis: { ...rollup(rows), prev: rollup(prevRows) },
    series: buildSeries(rows, from, to),
    adSets,
    ads,
    hasUnattributedDays,
  };
}

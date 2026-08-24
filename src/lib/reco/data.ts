import type { DB } from "@/lib/repo/util";
import type { MetricDaily } from "@/lib/types";
import { listCampaigns } from "@/lib/repo/campaigns";
import { listMetrics } from "@/lib/repo/metrics";
import { getAdCreativeLinks } from "@/lib/repo/ads";
import { selectEffectiveDaily } from "@/lib/metrics/effective";
import { aggregate, derive } from "@/lib/metrics/derive";
import { addDays, todayStr } from "@/lib/dates";
import type { AdAnalysis, AnalysisInput, WindowStats } from "./types";

export function buildWindowStats(rows: MetricDaily[]): WindowStats {
  const totals = aggregate(rows);
  const d = derive(totals);
  let freq: number | null = null;
  let weightedFreq = 0;
  let freqImpressions = 0;
  for (const r of rows) {
    if (r.frequency != null && r.impressions > 0) {
      weightedFreq += r.frequency * r.impressions;
      freqImpressions += r.impressions;
    }
  }
  if (freqImpressions > 0) freq = weightedFreq / freqImpressions;
  else if (d.frequency != null) freq = d.frequency;
  return {
    impressions: totals.impressions,
    clicks: totals.clicks,
    spend_cents: totals.spend_cents,
    conversions: totals.conversions,
    conversion_value_cents: totals.conversion_value_cents,
    reach: totals.reach,
    ctr: d.ctr,
    cpm_cents: d.cpm_cents,
    cpa_cents: d.cpa_cents,
    roas: d.roas,
    frequency: freq,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Assemble the analysis window (default: the last 14 full days, split into
 * two 7-day halves) that both the heuristics engine and the Claude summary
 * read from. Campaign rollups use effective-level rows; per-ad stats use
 * ad-level rows directly.
 */
export function buildAnalysisInput(
  db: DB,
  opts: { to?: string; windowDays?: number } = {},
): AnalysisInput {
  const to = opts.to ?? addDays(todayStr(), -1);
  const windowDays = opts.windowDays ?? 14;
  const from = addDays(to, -(windowDays - 1));
  const h1To = addDays(from, Math.floor(windowDays / 2) - 1);

  const effective = selectEffectiveDaily(db, { from, to });
  const inH1 = (r: MetricDaily) => r.date <= h1To;

  const byCampaign = new Map<number, MetricDaily[]>();
  for (const r of effective) {
    byCampaign.set(r.campaign_id, [...(byCampaign.get(r.campaign_id) ?? []), r]);
  }

  const campaigns = listCampaigns(db)
    .filter((c) => byCampaign.has(c.id))
    .map((c) => {
      const rows = byCampaign.get(c.id)!;
      return {
        campaign_id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        is_cbo: c.is_cbo,
        budget_type: c.budget_type,
        budget_cents: c.budget_cents,
        window: buildWindowStats(rows),
        h1: buildWindowStats(rows.filter(inH1)),
        h2: buildWindowStats(rows.filter((r) => !inH1(r))),
      };
    });

  // Per-ad stats come straight from ad-level rows (not the effective set —
  // a campaign whose effective grain is coarser simply has no ad analysis).
  const adRows = listMetrics(db, { from, to }).filter((r) => r.level === "ad");
  const byAd = new Map<number, MetricDaily[]>();
  for (const r of adRows) {
    byAd.set(r.ad_id!, [...(byAd.get(r.ad_id!) ?? []), r]);
  }
  const adMeta = new Map(
    (
      db
        .prepare(
          `SELECT a.id, a.name, a.adset_id, s.name AS adset_name, s.campaign_id, c.name AS campaign_name
           FROM ads a JOIN ad_sets s ON s.id = a.adset_id JOIN campaigns c ON c.id = s.campaign_id`,
        )
        .all() as {
        id: number;
        name: string;
        adset_id: number;
        adset_name: string;
        campaign_id: number;
        campaign_name: string;
      }[]
    ).map((a) => [a.id, a]),
  );
  const links = getAdCreativeLinks(db, [...byAd.keys()]);

  const ads: AdAnalysis[] = [...byAd.entries()]
    .map(([adId, rows]) => {
      const meta = adMeta.get(adId);
      const creativeLinks = links.get(adId) ?? [];
      return {
        ad_id: adId,
        ad_name: meta?.name ?? `Ad ${adId}`,
        adset_id: meta?.adset_id ?? 0,
        adset_name: meta?.adset_name ?? "",
        campaign_id: meta?.campaign_id ?? rows[0].campaign_id,
        campaign_name: meta?.campaign_name ?? "",
        creative_ids: creativeLinks.map((l) => l.creative_id),
        creative_names: creativeLinks.map((l) => l.creative?.original_name ?? ""),
        window: buildWindowStats(rows),
        h1: buildWindowStats(rows.filter(inH1)),
        h2: buildWindowStats(rows.filter((r) => !inH1(r))),
      };
    })
    .sort((a, b) => b.window.spend_cents - a.window.spend_cents);

  return {
    from,
    to,
    h1_to: h1To,
    account: {
      window: buildWindowStats(effective),
      h1: buildWindowStats(effective.filter(inH1)),
      h2: buildWindowStats(effective.filter((r) => !inH1(r))),
      median_cpa_cents: median(
        campaigns.map((c) => c.window.cpa_cents).filter((v): v is number => v != null),
      ),
      avg_cpa_cents: buildWindowStats(effective).cpa_cents,
    },
    campaigns,
    ads,
  };
}

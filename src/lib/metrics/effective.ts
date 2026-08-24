import type { MetricDaily } from "@/lib/types";
import type { DB } from "@/lib/repo/util";

/**
 * The single source of truth for metric rollups.
 *
 * Metrics can be recorded at campaign, ad-set, or ad grain for the same
 * campaign and day (coarse CSV first, finer API rows later). Summing across
 * grains would double-count, so every rollup reads only the FINEST grain
 * present per (campaign_id, date): ad > adset > campaign. A campaign-level
 * row is automatically superseded the moment ad-level rows land for that day.
 */
export function selectEffectiveDaily(
  db: DB,
  opts: { from: string; to: string; campaignId?: number },
): MetricDaily[] {
  const params: Record<string, unknown> = { from: opts.from, to: opts.to };
  let campaignFilter = "";
  if (opts.campaignId != null) {
    campaignFilter = "AND m.campaign_id = @campaignId";
    params.campaignId = opts.campaignId;
  }
  return db
    .prepare(
      `WITH ranked AS (
         SELECT m.*, CASE m.level WHEN 'ad' THEN 3 WHEN 'adset' THEN 2 ELSE 1 END AS lvl
         FROM metric_daily m
         WHERE m.date BETWEEN @from AND @to ${campaignFilter}
       ),
       best AS (
         SELECT campaign_id, date, MAX(lvl) AS use_lvl
         FROM ranked GROUP BY campaign_id, date
       )
       SELECT r.id, r.date, r.level, r.campaign_id, r.adset_id, r.ad_id,
              r.impressions, r.reach, r.clicks, r.spend_cents, r.conversions,
              r.conversion_value_cents, r.frequency, r.source, r.import_job_id
       FROM ranked r
       JOIN best b ON b.campaign_id = r.campaign_id AND b.date = r.date AND r.lvl = b.use_lvl
       ORDER BY r.date, r.campaign_id, r.adset_id, r.ad_id`,
    )
    .all(params) as MetricDaily[];
}

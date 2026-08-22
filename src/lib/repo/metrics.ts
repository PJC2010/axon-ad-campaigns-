import type { MetricDaily, MetricLevel, MetricSource } from "@/lib/types";
import type { DB } from "./util";

export interface MetricUpsertInput {
  date: string;
  level: MetricLevel;
  campaign_id: number;
  adset_id: number | null;
  ad_id: number | null;
  impressions: number;
  reach: number | null;
  clicks: number;
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
  frequency: number | null;
  source: MetricSource;
  import_job_id?: number | null;
}

export type UpsertOutcome = "inserted" | "updated" | "skipped";

/**
 * Select-then-write upsert on the (date, level, entity) key. SQLite's
 * ON CONFLICT can't reliably target the ifnull() expression index, so this
 * runs as an explicit lookup + insert/update; call inside a transaction for
 * batch imports.
 */
export function upsertMetricDaily(
  db: DB,
  row: MetricUpsertInput,
  onConflict: "overwrite" | "skip" = "overwrite",
): UpsertOutcome {
  const existing = db
    .prepare(
      `SELECT id FROM metric_daily
       WHERE date = @date AND level = @level AND campaign_id = @campaign_id
         AND ifnull(adset_id, 0) = ifnull(@adset_id, 0)
         AND ifnull(ad_id, 0) = ifnull(@ad_id, 0)`,
    )
    .get({
      date: row.date,
      level: row.level,
      campaign_id: row.campaign_id,
      adset_id: row.adset_id,
      ad_id: row.ad_id,
    }) as { id: number } | undefined;

  if (existing) {
    if (onConflict === "skip") return "skipped";
    db.prepare(
      `UPDATE metric_daily SET
         impressions = @impressions, reach = @reach, clicks = @clicks,
         spend_cents = @spend_cents, conversions = @conversions,
         conversion_value_cents = @conversion_value_cents, frequency = @frequency,
         source = @source, import_job_id = @import_job_id,
         updated_at = datetime('now')
       WHERE id = @id`,
    ).run({ ...normalized(row), id: existing.id });
    return "updated";
  }

  db.prepare(
    `INSERT INTO metric_daily
       (date, level, campaign_id, adset_id, ad_id, impressions, reach, clicks,
        spend_cents, conversions, conversion_value_cents, frequency, source, import_job_id)
     VALUES (@date, @level, @campaign_id, @adset_id, @ad_id, @impressions, @reach, @clicks,
        @spend_cents, @conversions, @conversion_value_cents, @frequency, @source, @import_job_id)`,
  ).run(normalized(row));
  return "inserted";
}

function normalized(row: MetricUpsertInput) {
  return {
    date: row.date,
    level: row.level,
    campaign_id: row.campaign_id,
    adset_id: row.adset_id,
    ad_id: row.ad_id,
    impressions: Math.round(row.impressions),
    reach: row.reach == null ? null : Math.round(row.reach),
    clicks: Math.round(row.clicks),
    spend_cents: Math.round(row.spend_cents),
    conversions: row.conversions,
    conversion_value_cents: Math.round(row.conversion_value_cents),
    frequency: row.frequency,
    source: row.source,
    import_job_id: row.import_job_id ?? null,
  };
}

export function listMetrics(
  db: DB,
  opts: {
    from: string;
    to: string;
    campaignId?: number;
    adSetId?: number;
    adId?: number;
  },
): MetricDaily[] {
  const clauses = ["date BETWEEN @from AND @to"];
  const params: Record<string, unknown> = { from: opts.from, to: opts.to };
  if (opts.campaignId != null) {
    clauses.push("campaign_id = @campaignId");
    params.campaignId = opts.campaignId;
  }
  if (opts.adSetId != null) {
    clauses.push("adset_id = @adSetId");
    params.adSetId = opts.adSetId;
  }
  if (opts.adId != null) {
    clauses.push("ad_id = @adId");
    params.adId = opts.adId;
  }
  return db
    .prepare(
      `SELECT id, date, level, campaign_id, adset_id, ad_id, impressions, reach, clicks,
              spend_cents, conversions, conversion_value_cents, frequency, source, import_job_id
       FROM metric_daily WHERE ${clauses.join(" AND ")}
       ORDER BY date DESC, campaign_id, level, adset_id, ad_id`,
    )
    .all(params) as MetricDaily[];
}

export function deleteMetric(db: DB, id: number): boolean {
  return db.prepare("DELETE FROM metric_daily WHERE id = ?").run(id).changes > 0;
}

export interface CreativePerformanceRow {
  creative_id: number;
  original_name: string;
  kind: "image" | "video";
  ads_count: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
}

/**
 * Creative performance is derived purely from ad-level rows via the ad→creative
 * links. A creative in several ads sums across them; each card of a carousel is
 * attributed the full ad's metrics (documented approximation).
 */
export function selectCreativePerformance(
  db: DB,
  opts: { from: string; to: string },
): CreativePerformanceRow[] {
  return db
    .prepare(
      `SELECT cr.id AS creative_id, cr.original_name, cr.kind,
              COUNT(DISTINCT ac.ad_id) AS ads_count,
              SUM(m.impressions) AS impressions,
              SUM(m.reach) AS reach,
              SUM(m.clicks) AS clicks,
              SUM(m.spend_cents) AS spend_cents,
              SUM(m.conversions) AS conversions,
              SUM(m.conversion_value_cents) AS conversion_value_cents
       FROM metric_daily m
       JOIN ad_creatives ac ON ac.ad_id = m.ad_id
       JOIN creatives cr ON cr.id = ac.creative_id
       WHERE m.level = 'ad' AND m.date BETWEEN @from AND @to
       GROUP BY cr.id
       ORDER BY spend_cents DESC`,
    )
    .all({ from: opts.from, to: opts.to }) as CreativePerformanceRow[];
}

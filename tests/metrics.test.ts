import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/open";
import type { DB } from "@/lib/repo/util";
import { createCampaign } from "@/lib/repo/campaigns";
import { createAdSet } from "@/lib/repo/adsets";
import { createAd } from "@/lib/repo/ads";
import { campaignCreate, adSetCreate, adCreate } from "@/lib/validation/schemas";
import { upsertMetricDaily, selectCreativePerformance } from "@/lib/repo/metrics";
import { selectEffectiveDaily } from "@/lib/metrics/effective";
import { aggregate, buildSeries, derive } from "@/lib/metrics/derive";

let db: DB;
let campaignId: number;
let adsetId: number;
let adId: number;

beforeEach(() => {
  db = openDb(":memory:");
  campaignId = createCampaign(
    db,
    campaignCreate.parse({ name: "Spring sale", objective: "OUTCOME_SALES" }),
  ).id;
  adsetId = createAdSet(db, adSetCreate.parse({ campaign_id: campaignId, name: "Prospecting" })).id;
  adId = createAd(db, adCreate.parse({ adset_id: adsetId, name: "Hook A" })).id;
});

function insert(
  level: "campaign" | "adset" | "ad",
  date: string,
  metrics: Partial<{ impressions: number; clicks: number; spend_cents: number; conversions: number }>,
) {
  return upsertMetricDaily(db, {
    date,
    level,
    campaign_id: campaignId,
    adset_id: level === "campaign" ? null : adsetId,
    ad_id: level === "ad" ? adId : null,
    impressions: metrics.impressions ?? 0,
    reach: null,
    clicks: metrics.clicks ?? 0,
    spend_cents: metrics.spend_cents ?? 0,
    conversions: metrics.conversions ?? 0,
    conversion_value_cents: 0,
    frequency: null,
    source: "manual",
  });
}

describe("effective-level precedence", () => {
  it("uses only the finest grain present per campaign-day — never double-counts", () => {
    // Day 1: both campaign-level (coarse) and ad-level (fine) rows exist.
    insert("campaign", "2026-08-01", { impressions: 99999, spend_cents: 999999 });
    insert("ad", "2026-08-01", { impressions: 1000, spend_cents: 5000 });
    // Day 2: only campaign-level.
    insert("campaign", "2026-08-02", { impressions: 500, spend_cents: 2500 });

    const rows = selectEffectiveDaily(db, { from: "2026-08-01", to: "2026-08-02" });
    expect(rows).toHaveLength(2);
    const day1 = rows.find((r) => r.date === "2026-08-01")!;
    expect(day1.level).toBe("ad");
    expect(day1.impressions).toBe(1000);
    const day2 = rows.find((r) => r.date === "2026-08-02")!;
    expect(day2.level).toBe("campaign");

    const totals = aggregate(rows);
    expect(totals.impressions).toBe(1500);
    expect(totals.spend_cents).toBe(7500);
  });

  it("prefers adset over campaign when ad rows are absent", () => {
    insert("campaign", "2026-08-01", { impressions: 100 });
    insert("adset", "2026-08-01", { impressions: 40 });
    const rows = selectEffectiveDaily(db, { from: "2026-08-01", to: "2026-08-01" });
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("adset");
  });

  it("keeps campaigns independent", () => {
    const other = createCampaign(
      db,
      campaignCreate.parse({ name: "Other", objective: "OUTCOME_LEADS" }),
    ).id;
    insert("ad", "2026-08-01", { impressions: 10 });
    upsertMetricDaily(db, {
      date: "2026-08-01",
      level: "campaign",
      campaign_id: other,
      adset_id: null,
      ad_id: null,
      impressions: 7,
      reach: null,
      clicks: 0,
      spend_cents: 0,
      conversions: 0,
      conversion_value_cents: 0,
      frequency: null,
      source: "manual",
    });
    const rows = selectEffectiveDaily(db, { from: "2026-08-01", to: "2026-08-01" });
    expect(rows).toHaveLength(2);
    expect(aggregate(rows).impressions).toBe(17);
  });
});

describe("upsert", () => {
  it("updates in place on the entity-day key", () => {
    expect(insert("ad", "2026-08-01", { impressions: 10 })).toBe("inserted");
    expect(insert("ad", "2026-08-01", { impressions: 25 })).toBe("updated");
    const rows = selectEffectiveDaily(db, { from: "2026-08-01", to: "2026-08-01" });
    expect(rows).toHaveLength(1);
    expect(rows[0].impressions).toBe(25);
  });

  it("respects the skip collision policy", () => {
    insert("ad", "2026-08-01", { impressions: 10 });
    const outcome = upsertMetricDaily(
      db,
      {
        date: "2026-08-01",
        level: "ad",
        campaign_id: campaignId,
        adset_id: adsetId,
        ad_id: adId,
        impressions: 999,
        reach: null,
        clicks: 0,
        spend_cents: 0,
        conversions: 0,
        conversion_value_cents: 0,
        frequency: null,
        source: "csv",
      },
      "skip",
    );
    expect(outcome).toBe("skipped");
    const rows = selectEffectiveDaily(db, { from: "2026-08-01", to: "2026-08-01" });
    expect(rows[0].impressions).toBe(10);
  });
});

describe("derive", () => {
  it("computes the derived metrics", () => {
    const d = derive({
      impressions: 10000,
      reach: 5000,
      clicks: 250,
      spend_cents: 12000,
      conversions: 10,
      conversion_value_cents: 36000,
    });
    expect(d.ctr).toBeCloseTo(0.025);
    expect(d.cpc_cents).toBeCloseTo(48);
    expect(d.cpm_cents).toBeCloseTo(1200);
    expect(d.cpa_cents).toBeCloseTo(1200);
    expect(d.roas).toBeCloseTo(3);
    expect(d.frequency).toBeCloseTo(2);
  });

  it("returns null instead of dividing by zero", () => {
    const d = derive({
      impressions: 0,
      reach: null,
      clicks: 0,
      spend_cents: 0,
      conversions: 0,
      conversion_value_cents: 0,
    });
    expect(d.ctr).toBeNull();
    expect(d.cpc_cents).toBeNull();
    expect(d.cpm_cents).toBeNull();
    expect(d.cpa_cents).toBeNull();
    expect(d.roas).toBeNull();
    expect(d.frequency).toBeNull();
  });

  it("flags summed reach as approximate", () => {
    const t = aggregate([
      { impressions: 10, reach: 8 },
      { impressions: 12, reach: 9 },
    ]);
    expect(t.reach).toBe(17);
    expect(t.reach_approx).toBe(true);
  });
});

describe("buildSeries", () => {
  it("zero-fills missing days across the range", () => {
    const series = buildSeries(
      [
        { date: "2026-08-01", impressions: 100, clicks: 5, spend_cents: 100 },
        { date: "2026-08-03", impressions: 50, clicks: 1, spend_cents: 50 },
      ],
      "2026-08-01",
      "2026-08-04",
    );
    expect(series.map((s) => s.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
    expect(series[1].impressions).toBe(0);
    expect(series[0].ctr).toBeCloseTo(0.05);
    expect(series[1].ctr).toBeNull();
  });
});

describe("creative performance", () => {
  it("attributes ad-level metrics to linked creatives", () => {
    const ins = db.prepare(
      "INSERT INTO creatives (kind, filename, original_name, mime, size_bytes) VALUES ('image', ?, ?, 'image/png', 10)",
    );
    const c1 = Number(ins.run("a.png", "a.png").lastInsertRowid);
    db.prepare(
      "INSERT INTO ad_creatives (ad_id, creative_id, position) VALUES (?, ?, 0)",
    ).run(adId, c1);
    insert("ad", "2026-08-01", { impressions: 1000, clicks: 30, spend_cents: 4000 });
    insert("campaign", "2026-08-01", { impressions: 9999 }); // must not leak into creatives

    const rows = selectCreativePerformance(db, { from: "2026-08-01", to: "2026-08-31" });
    expect(rows).toHaveLength(1);
    expect(rows[0].creative_id).toBe(c1);
    expect(rows[0].impressions).toBe(1000);
    expect(rows[0].ads_count).toBe(1);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/open";
import type { DB } from "@/lib/repo/util";
import { HEURISTIC_THRESHOLDS, runHeuristics } from "@/lib/reco/heuristics";
import { buildAccountSummary } from "@/lib/reco/claude";
import { buildAnalysisInput } from "@/lib/reco/data";
import { persistDrafts } from "@/lib/reco/persist";
import { listRecommendations, setRecommendationStatus } from "@/lib/repo/recommendations";
import { seed } from "@/lib/seed";
import type {
  AdAnalysis,
  AnalysisInput,
  CampaignAnalysis,
  RecoDraft,
  WindowStats,
} from "@/lib/reco/types";

const T = HEURISTIC_THRESHOLDS;

function stats(p: Partial<WindowStats> & { spend_cents?: number }): WindowStats {
  const impressions = p.impressions ?? 10000;
  const clicks = p.clicks ?? 200;
  const spend = p.spend_cents ?? 10000;
  const conversions = p.conversions ?? 10;
  const value = p.conversion_value_cents ?? 0;
  return {
    impressions,
    clicks,
    spend_cents: spend,
    conversions,
    conversion_value_cents: value,
    reach: p.reach ?? Math.round(impressions / 1.5),
    ctr: p.ctr ?? (impressions > 0 ? clicks / impressions : null),
    cpm_cents: p.cpm_cents ?? (impressions > 0 ? (spend / impressions) * 1000 : null),
    cpa_cents: p.cpa_cents !== undefined ? p.cpa_cents : conversions > 0 ? spend / conversions : null,
    roas: p.roas !== undefined ? p.roas : spend > 0 && value > 0 ? value / spend : null,
    frequency: p.frequency ?? 1.5,
  };
}

function ad(overrides: Partial<AdAnalysis>): AdAnalysis {
  return {
    ad_id: 1,
    ad_name: "Test ad",
    adset_id: 1,
    adset_name: "Test ad set",
    campaign_id: 1,
    campaign_name: "Test campaign",
    creative_ids: [1],
    creative_names: ["hero.png"],
    window: stats({}),
    h1: stats({}),
    h2: stats({}),
    ...overrides,
  };
}

function campaign(overrides: Partial<CampaignAnalysis>): CampaignAnalysis {
  return {
    campaign_id: 1,
    name: "Test campaign",
    status: "ACTIVE",
    objective: "OUTCOME_SALES",
    is_cbo: true,
    budget_type: "daily",
    budget_cents: 10000,
    window: stats({}),
    h1: stats({}),
    h2: stats({}),
    ...overrides,
  };
}

function input(overrides: Partial<AnalysisInput>): AnalysisInput {
  return {
    from: "2026-08-08",
    to: "2026-08-21",
    h1_to: "2026-08-14",
    account: {
      window: stats({}),
      h1: stats({}),
      h2: stats({}),
      median_cpa_cents: 1000,
      avg_cpa_cents: 1000,
    },
    campaigns: [],
    ads: [],
    ...overrides,
  };
}

function rules(drafts: RecoDraft[]): string[] {
  return drafts.map((d) => d.rule!);
}

describe("creative_fatigue", () => {
  it("fires just above the frequency threshold, not below", () => {
    const above = runHeuristics(
      input({ ads: [ad({ window: stats({ frequency: T.fatigue_frequency + 0.01, conversions: 5 }) })] }),
    );
    expect(rules(above)).toContain("creative_fatigue");
    const below = runHeuristics(
      input({ ads: [ad({ window: stats({ frequency: T.fatigue_frequency - 0.01, conversions: 5 }) })] }),
    );
    expect(rules(below)).not.toContain("creative_fatigue");
  });

  it("fires on a week-over-week CTR collapse with enough volume", () => {
    const collapsing = ad({
      window: stats({ frequency: 2, conversions: 5 }),
      h1: stats({ impressions: 3000, clicks: 90, frequency: 2 }), // 3.0%
      h2: stats({ impressions: 3000, clicks: 50, frequency: 2 }), // 1.67% < 60% of 3.0%
    });
    expect(rules(runHeuristics(input({ ads: [collapsing] })))).toContain("creative_fatigue");

    const lowVolume = ad({
      window: stats({ frequency: 2, conversions: 5 }),
      h1: stats({ impressions: 1500, clicks: 45, frequency: 2 }),
      h2: stats({ impressions: 1500, clicks: 25, frequency: 2 }),
    });
    expect(rules(runHeuristics(input({ ads: [lowVolume] })))).not.toContain("creative_fatigue");
  });
});

describe("scale_winner", () => {
  it("fires at the ROAS/spend/conversion floors, not below any of them", () => {
    const winner = campaign({
      window: stats({
        spend_cents: T.winner_min_spend_cents,
        conversions: T.winner_min_conversions,
        conversion_value_cents: T.winner_min_spend_cents * T.winner_roas,
      }),
    });
    expect(rules(runHeuristics(input({ campaigns: [winner] })))).toContain("scale_winner");

    const lowRoas = campaign({
      window: stats({
        spend_cents: 10000,
        conversions: 20,
        conversion_value_cents: Math.round(10000 * (T.winner_roas - 0.05)),
      }),
    });
    expect(rules(runHeuristics(input({ campaigns: [lowRoas] })))).not.toContain("scale_winner");

    const lowSpend = campaign({
      window: stats({
        spend_cents: T.winner_min_spend_cents - 100,
        conversions: 20,
        conversion_value_cents: T.winner_min_spend_cents * 3,
      }),
    });
    expect(rules(runHeuristics(input({ campaigns: [lowSpend] })))).not.toContain("scale_winner");
  });

  it("falls back to CPA vs the account median when revenue is not tracked", () => {
    const cheap = campaign({
      campaign_id: 1,
      name: "Cheap leads",
      window: stats({ spend_cents: 10000, conversions: 20, cpa_cents: 690, roas: null }),
    });
    const other = campaign({ campaign_id: 2, name: "Other" });
    const drafts = runHeuristics(
      input({
        campaigns: [cheap, other],
        account: { ...input({}).account, median_cpa_cents: 1000 },
      }),
    );
    expect(drafts.find((d) => d.rule === "scale_winner")?.campaign_id).toBe(1);
  });
});

describe("pause_loser", () => {
  it("fires on zero conversions past the spend threshold", () => {
    const loser = ad({
      window: stats({ spend_cents: T.loser_min_spend_cents, conversions: 0 }),
    });
    const drafts = runHeuristics(
      input({ ads: [loser], account: { ...input({}).account, avg_cpa_cents: null } }),
    );
    expect(rules(drafts)).toContain("pause_loser");
    expect(drafts.find((d) => d.rule === "pause_loser")?.severity).toBe("critical");
  });

  it("stays quiet below the threshold or with any conversion", () => {
    const smallSpend = ad({
      window: stats({ spend_cents: T.loser_min_spend_cents - 100, conversions: 0 }),
    });
    const converted = ad({ window: stats({ spend_cents: 100000, conversions: 1 }) });
    const account = { ...input({}).account, avg_cpa_cents: null };
    expect(rules(runHeuristics(input({ ads: [smallSpend], account })))).not.toContain("pause_loser");
    expect(rules(runHeuristics(input({ ads: [converted], account })))).not.toContain("pause_loser");
  });

  it("raises the bar to 3x the account average CPA", () => {
    const account = { ...input({}).account, avg_cpa_cents: 2000 }; // threshold = $60
    const under = ad({ window: stats({ spend_cents: 5000, conversions: 0 }) });
    expect(rules(runHeuristics(input({ ads: [under], account })))).not.toContain("pause_loser");
    const over = ad({ window: stats({ spend_cents: 6001, conversions: 0 }) });
    expect(rules(runHeuristics(input({ ads: [over], account })))).toContain("pause_loser");
  });
});

describe("budget_reallocation", () => {
  const strong = () =>
    campaign({
      campaign_id: 1,
      name: "Strong",
      window: stats({ spend_cents: 50000, conversions: 50, conversion_value_cents: 150000 }), // 3.0x
    });
  const weak = () =>
    campaign({
      campaign_id: 2,
      name: "Weak",
      window: stats({ spend_cents: 50000, conversions: 30, conversion_value_cents: 100000 }), // 2.0x
    });

  it("fires when the gap and spend share are both large enough", () => {
    const drafts = runHeuristics(input({ campaigns: [strong(), weak()] }));
    const realloc = drafts.find((d) => d.rule === "budget_reallocation");
    expect(realloc).toBeDefined();
    expect(realloc!.scope_level).toBe("account");
    expect(realloc!.body).toContain("Strong");
    expect(realloc!.body).toContain("Weak");
  });

  it("stays quiet when the gap is under 1.5x", () => {
    const closeWeak = campaign({
      campaign_id: 2,
      name: "Weak",
      window: stats({ spend_cents: 50000, conversions: 30, conversion_value_cents: 101000 }), // 2.02x vs 3.0x < 1.5 gap
    });
    expect(
      rules(runHeuristics(input({ campaigns: [strong(), closeWeak] }))),
    ).not.toContain("budget_reallocation");
  });

  it("stays quiet when the weak campaign's share is small", () => {
    const tinyWeak = campaign({
      campaign_id: 2,
      name: "Weak",
      window: stats({ spend_cents: 6000, conversions: 3, conversion_value_cents: 6000 }), // 1.0x but ~11% share
    });
    expect(
      rules(runHeuristics(input({ campaigns: [strong(), tinyWeak] }))),
    ).not.toContain("budget_reallocation");
  });

  it("never compares a revenue campaign against a lead campaign", () => {
    const leads = campaign({
      campaign_id: 2,
      name: "Leads",
      objective: "OUTCOME_LEADS",
      window: stats({ spend_cents: 50000, conversions: 100, roas: null }), // CPA only
    });
    expect(
      rules(runHeuristics(input({ campaigns: [strong(), leads] }))),
    ).not.toContain("budget_reallocation");
  });

  it("ranks by CPA when no campaign tracks revenue", () => {
    const cheap = campaign({
      campaign_id: 1,
      name: "Cheap",
      window: stats({ spend_cents: 50000, conversions: 100, roas: null }), // $5 CPA
    });
    const dear = campaign({
      campaign_id: 2,
      name: "Dear",
      window: stats({ spend_cents: 50000, conversions: 40, roas: null }), // $12.50 CPA
    });
    const realloc = runHeuristics(input({ campaigns: [cheap, dear] })).find(
      (d) => d.rule === "budget_reallocation",
    );
    expect(realloc).toBeDefined();
    expect(realloc!.title).toContain('from "Dear" to "Cheap"');
  });
});

describe("cpm_alert", () => {
  it("fires on a 1.3x week-over-week jump with enough spend in both halves", () => {
    const jumping = campaign({
      h1: stats({ impressions: 10000, spend_cents: 10000 }), // $10 CPM
      h2: stats({ impressions: 10000, spend_cents: 13000 }), // $13 CPM
    });
    const drafts = runHeuristics(input({ campaigns: [jumping] }));
    expect(rules(drafts)).toContain("cpm_alert");
    expect(drafts.find((d) => d.rule === "cpm_alert")?.severity).toBe("warning");
  });

  it("stays quiet just below the jump threshold", () => {
    const stable = campaign({
      h1: stats({ impressions: 10000, spend_cents: 10000 }),
      h2: stats({ impressions: 10000, spend_cents: 12900 }),
    });
    expect(rules(runHeuristics(input({ campaigns: [stable] })))).not.toContain("cpm_alert");
  });

  it("flags an absolutely high CPM as info", () => {
    const pricey = campaign({
      window: stats({ impressions: 1000, spend_cents: 5100 }), // $51 CPM
    });
    const drafts = runHeuristics(input({ campaigns: [pricey] }));
    expect(drafts.find((d) => d.rule === "cpm_alert")?.severity).toBe("info");
  });
});

describe("against seeded data (end to end)", () => {
  let db: DB;
  let uploads: string;

  beforeEach(() => {
    db = openDb(":memory:");
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), "axon-reco-"));
    seed(db, uploads);
  });

  afterEach(() => fs.rmSync(uploads, { recursive: true, force: true }));

  it("finds the scenarios the seed bakes in", () => {
    const analysis = buildAnalysisInput(db);
    const drafts = runHeuristics(analysis);
    const byRule = new Map(drafts.map((d) => [d.rule, d]));

    expect(byRule.get("pause_loser")?.title).toContain("Hook B");
    expect(byRule.get("creative_fatigue")?.title).toContain("Carousel");
    expect(byRule.get("cpm_alert")?.body).toMatch(/rose from/);
    expect(byRule.get("scale_winner")?.title).toContain("Spring sale");
  });

  it("persists with update-in-place, suppression, and resolution", () => {
    const analysis = buildAnalysisInput(db);
    const drafts = runHeuristics(analysis);

    const first = persistDrafts(db, "heuristic", drafts);
    expect(first.created).toBe(drafts.length);

    const second = persistDrafts(db, "heuristic", drafts);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(drafts.length);

    // Dismiss one; regenerating must not resurrect it.
    const all = listRecommendations(db, { status: "new" });
    const dismissed = all.find((r) => r.rule === "scale_winner")!;
    setRecommendationStatus(db, dismissed.id, "dismissed");
    const third = persistDrafts(db, "heuristic", drafts);
    expect(third.suppressed).toBe(1);
    expect(third.updated).toBe(drafts.length - 1);

    // A rule that stops firing is removed from the open list.
    const withoutLoser = drafts.filter((d) => d.rule !== "pause_loser");
    const fourth = persistDrafts(db, "heuristic", withoutLoser);
    expect(fourth.resolved).toBe(1);
    expect(
      listRecommendations(db, { status: "new" }).some((r) => r.rule === "pause_loser"),
    ).toBe(false);
  });

  it("builds a compact Claude summary from real data", () => {
    const analysis = buildAnalysisInput(db);
    const drafts = runHeuristics(analysis);
    const summary = buildAccountSummary(analysis, drafts);
    expect(summary.length).toBeLessThan(8000);
    const parsed = JSON.parse(summary);
    expect(parsed.campaigns.map((c: { name: string }) => c.name)).toContain(
      "Spring sale — prospecting",
    );
    expect(parsed.rules_engine_findings.length).toBe(drafts.length);
    expect(summary).not.toContain('"series"');
  });
});

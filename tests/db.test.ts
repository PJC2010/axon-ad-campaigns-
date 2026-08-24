import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/open";
import type { DB } from "@/lib/repo/util";
import {
  createCampaign,
  deleteCampaign,
  findCampaignByName,
  getCampaign,
  listCampaigns,
  updateCampaign,
} from "@/lib/repo/campaigns";
import { createAdSet, getAdSet, listAdSets } from "@/lib/repo/adsets";
import {
  createAd,
  getAdCreativeLinks,
  getCampaignTree,
  listAds,
  replaceAdCreatives,
} from "@/lib/repo/ads";
import { getSetting, setSetting } from "@/lib/repo/settings";
import { campaignCreate, adSetCreate, adCreate } from "@/lib/validation/schemas";

let db: DB;

function makeCampaign(name = "Spring sale") {
  return createCampaign(
    db,
    campaignCreate.parse({
      name,
      objective: "OUTCOME_SALES",
      is_cbo: true,
      budget_type: "daily",
      budget_cents: 5000,
      special_ad_categories: [],
    }),
  );
}

function makeAdSet(campaignId: number, name = "Prospecting US") {
  return createAdSet(
    db,
    adSetCreate.parse({
      campaign_id: campaignId,
      name,
      countries: ["US", "CA"],
      interests: ["running", "fitness"],
      optimization_goal: "OFFSITE_CONVERSIONS",
    }),
  );
}

beforeEach(() => {
  db = openDb(":memory:");
});

describe("migrations", () => {
  it("applies the initial migration once and records it", () => {
    const rows = db.prepare("SELECT version FROM schema_migrations").all() as {
      version: string;
    }[];
    expect(rows.map((r) => r.version)).toContain("0001_init.sql");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ["campaigns", "ad_sets", "ads", "creatives", "metric_daily", "recommendations"]) {
      expect(tables).toContain(t);
    }
  });
});

describe("campaigns repo", () => {
  it("round-trips JSON and boolean fields", () => {
    const c = createCampaign(
      db,
      campaignCreate.parse({
        name: "Housing leads",
        objective: "OUTCOME_LEADS",
        special_ad_categories: ["HOUSING"],
        is_cbo: false,
      }),
    );
    expect(c.special_ad_categories).toEqual(["HOUSING"]);
    expect(c.is_cbo).toBe(false);
    expect(getCampaign(db, c.id)?.name).toBe("Housing leads");
  });

  it("enforces case-insensitive unique names", () => {
    makeCampaign("Spring sale");
    expect(() => makeCampaign("SPRING SALE")).toThrow();
    expect(findCampaignByName(db, "spring SALE")?.name).toBe("Spring sale");
  });

  it("rejects invalid objective at the database layer", () => {
    expect(() =>
      db
        .prepare("INSERT INTO campaigns (name, objective) VALUES ('x', 'CONVERSIONS')")
        .run(),
    ).toThrow(/CHECK/);
  });

  it("updates only provided fields", () => {
    const c = makeCampaign();
    const updated = updateCampaign(db, c.id, { status: "ACTIVE" });
    expect(updated?.status).toBe("ACTIVE");
    expect(updated?.objective).toBe("OUTCOME_SALES");
    expect(updated?.updated_at).toBeTruthy();
  });
});

describe("ad sets and ads", () => {
  it("validates and stores targeting fields", () => {
    const c = makeCampaign();
    const s = makeAdSet(c.id);
    expect(s.countries).toEqual(["US", "CA"]);
    expect(s.interests).toContain("running");
    expect(getAdSet(db, s.id)?.optimization_goal).toBe("OFFSITE_CONVERSIONS");
  });

  it("rejects age_max below age_min via CHECK", () => {
    const c = makeCampaign();
    expect(() =>
      db
        .prepare(
          "INSERT INTO ad_sets (campaign_id, name, age_min, age_max) VALUES (?, 'x', 40, 30)",
        )
        .run(c.id),
    ).toThrow(/CHECK/);
  });

  it("zod requires bid amount for cost cap", () => {
    expect(() =>
      adSetCreate.parse({ campaign_id: 1, name: "x", bid_strategy: "COST_CAP" }),
    ).toThrow(/bid amount/i);
  });

  it("cascade deletes ad sets and ads with the campaign", () => {
    const c = makeCampaign();
    const s = makeAdSet(c.id);
    createAd(db, adCreate.parse({ adset_id: s.id, name: "Ad 1" }));
    deleteCampaign(db, c.id);
    expect(listCampaigns(db)).toHaveLength(0);
    expect(listAdSets(db, c.id)).toHaveLength(0);
    expect(db.prepare("SELECT count(*) AS n FROM ads").get()).toEqual({ n: 0 });
  });
});

describe("ad creatives", () => {
  it("replaces the ordered attachment list atomically", () => {
    const c = makeCampaign();
    const s = makeAdSet(c.id);
    const ad = createAd(db, adCreate.parse({ adset_id: s.id, name: "Carousel", format: "carousel" }));
    const ins = db.prepare(
      "INSERT INTO creatives (kind, filename, original_name, mime, size_bytes) VALUES ('image', ?, ?, 'image/png', 10)",
    );
    const c1 = Number(ins.run("a.png", "a.png").lastInsertRowid);
    const c2 = Number(ins.run("b.png", "b.png").lastInsertRowid);

    replaceAdCreatives(db, ad.id, {
      items: [
        { creative_id: c2, position: 0, card_headline: "First", card_url: null },
        { creative_id: c1, position: 1, card_headline: null, card_url: null },
      ],
    });
    let links = getAdCreativeLinks(db, [ad.id]).get(ad.id)!;
    expect(links.map((l) => l.creative_id)).toEqual([c2, c1]);
    expect(links[0].creative?.filename).toBe("b.png");

    replaceAdCreatives(db, ad.id, {
      items: [{ creative_id: c1, position: 0, card_headline: null, card_url: null }],
    });
    links = getAdCreativeLinks(db, [ad.id]).get(ad.id)!;
    expect(links).toHaveLength(1);

    const tree = getCampaignTree(db, c.id)!;
    expect(tree.ad_sets[0].ads[0].creatives[0].creative_id).toBe(c1);
    expect(listAds(db, s.id)).toHaveLength(1);
  });
});

describe("settings", () => {
  it("upserts key/value pairs", () => {
    setSetting(db, "currency", "USD");
    setSetting(db, "currency", "EUR");
    expect(getSetting(db, "currency")).toBe("EUR");
    expect(getSetting(db, "missing")).toBeNull();
  });
});

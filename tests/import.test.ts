import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/open";
import type { DB } from "@/lib/repo/util";
import {
  detectLevel,
  guessMapping,
  mappingIsUsable,
  parseCsvDate,
  parseMetricNumber,
  rowsToMetricDrafts,
} from "@/lib/import/mapping";
import { commitImport, resolveDrafts } from "@/lib/import/commit";
import { createCampaign } from "@/lib/repo/campaigns";
import { campaignCreate } from "@/lib/validation/schemas";
import { deleteImportJob, listImportJobs } from "@/lib/repo/jobs";
import { selectEffectiveDaily } from "@/lib/metrics/effective";

function fixture(name: string): Record<string, string>[] {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
}

function fixtureHeaders(name: string): string[] {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  return Papa.parse(text, { header: true, preview: 1 }).meta.fields ?? [];
}

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("header mapping", () => {
  it("maps a real ad-level export and prefers link clicks", () => {
    const headers = fixtureHeaders("meta_ad_level.csv");
    const mapping = guessMapping(headers);
    expect(mapping["Reporting starts"]).toBe("date");
    expect(mapping["Reporting ends"]).toBe("reporting_ends");
    expect(mapping["Link clicks"]).toBe("clicks");
    expect(mapping["Clicks (all)"]).toBe("ignore");
    expect(mapping["CTR (link click-through rate)"]).toBe("ignore");
    expect(mapping["Amount spent (USD)"]).toBe("spend");
    expect(mapping["Purchases"]).toBe("conversions");
    expect(mapping["Purchases conversion value"]).toBe("conversion_value");
    expect(detectLevel(mapping)).toBe("ad");
    expect(mappingIsUsable(mapping).ok).toBe(true);
  });

  it("maps a campaign-level export with Day dates and Results", () => {
    const mapping = guessMapping(fixtureHeaders("meta_campaign_level.csv"));
    expect(mapping["Day"]).toBe("date");
    expect(mapping["Results"]).toBe("conversions");
    expect(mapping["Cost per result"]).toBe("ignore");
    expect(detectLevel(mapping)).toBe("campaign");
  });
});

describe("value parsing", () => {
  it("parses currency, thousands separators, and percents", () => {
    expect(parseMetricNumber("1,234.56")).toBeCloseTo(1234.56);
    expect(parseMetricNumber("$12.30")).toBeCloseTo(12.3);
    expect(parseMetricNumber("3.1%")).toBeCloseTo(3.1);
    expect(parseMetricNumber("")).toBeNull();
    expect(parseMetricNumber("--")).toBeNull();
  });

  it("parses ISO and US dates", () => {
    expect(parseCsvDate("2026-08-01")).toBe("2026-08-01");
    expect(parseCsvDate("8/1/2026")).toBe("2026-08-01");
    expect(parseCsvDate("13/13/2026")).toBeNull();
    expect(parseCsvDate("yesterday")).toBeNull();
  });
});

describe("rows to drafts", () => {
  it("converts money to cents and rejects multi-day rows", () => {
    const rows = fixture("meta_ad_level.csv");
    const mapping = guessMapping(fixtureHeaders("meta_ad_level.csv"));
    const { drafts, errors } = rowsToMetricDrafts(rows, mapping, "ad");
    expect(drafts).toHaveLength(4);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/broken down by day/);
    const first = drafts[0];
    expect(first.date).toBe("2026-08-01");
    expect(first.impressions).toBe(12450);
    expect(first.clicks).toBe(310); // link clicks, not clicks (all)
    expect(first.spend_cents).toBe(14210);
    expect(first.conversion_value_cents).toBe(118000);
    expect(first.frequency).toBeCloseTo(1.27);
  });
});

describe("entity resolution and commit", () => {
  it("dry-run marks unknown entities as will_create without writing", () => {
    const rows = fixture("meta_ad_level.csv");
    const mapping = guessMapping(fixtureHeaders("meta_ad_level.csv"));
    const { drafts } = rowsToMetricDrafts(rows, mapping, "ad");
    const resolved = resolveDrafts(db, drafts, "ad", true, false);
    expect(resolved.every((r) => r.state === "will_create")).toBe(true);
    expect(db.prepare("SELECT count(*) AS n FROM campaigns").get()).toEqual({ n: 0 });
  });

  it("skips rows when entities are missing and creation is off", () => {
    const rows = fixture("meta_ad_level.csv");
    const mapping = guessMapping(fixtureHeaders("meta_ad_level.csv"));
    const { drafts } = rowsToMetricDrafts(rows, mapping, "ad");
    const resolved = resolveDrafts(db, drafts, "ad", false, false);
    expect(resolved.every((r) => r.state === "skipped")).toBe(true);
  });

  it("commits an ad-level file end to end, creating shell entities once", () => {
    const rows = fixture("meta_ad_level.csv");
    const headers = fixtureHeaders("meta_ad_level.csv");
    const mapping = guessMapping(headers);
    const { drafts, errors } = rowsToMetricDrafts(rows, mapping, "ad");
    const result = commitImport(db, {
      drafts,
      parseErrors: errors,
      level: "ad",
      createMissing: true,
      collision: "overwrite",
      filename: "meta_ad_level.csv",
      mapping,
    });

    expect(result.imported).toBe(4);
    expect(result.skipped).toBe(1); // the multi-day row
    expect(result.dateMin).toBe("2026-08-01");
    expect(result.dateMax).toBe("2026-08-02");
    expect(db.prepare("SELECT count(*) AS n FROM campaigns").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT count(*) AS n FROM ad_sets").get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT count(*) AS n FROM ads").get()).toEqual({ n: 3 });

    const jobs = listImportJobs(db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].rows_imported).toBe(4);

    // matched (not created) on re-import; overwrite keeps one row per entity-day
    const again = commitImport(db, {
      drafts,
      parseErrors: errors,
      level: "ad",
      createMissing: true,
      collision: "overwrite",
      filename: "meta_ad_level.csv",
      mapping,
    });
    expect(again.created).toBe(0);
    expect(db.prepare("SELECT count(*) AS n FROM metric_daily").get()).toEqual({ n: 4 });
  });

  it("matches existing campaigns case-insensitively at campaign level", () => {
    createCampaign(db, campaignCreate.parse({ name: "SPRING SALE", objective: "OUTCOME_SALES" }));
    const rows = fixture("meta_campaign_level.csv");
    const mapping = guessMapping(fixtureHeaders("meta_campaign_level.csv"));
    const { drafts } = rowsToMetricDrafts(rows, mapping, "campaign");
    const resolved = resolveDrafts(db, drafts, "campaign", false, false);
    const spring = resolved.filter((r) => r.draft.campaign_name === "Spring sale");
    expect(spring.every((r) => r.state === "matched")).toBe(true);
    const others = resolved.filter((r) => r.draft.campaign_name !== "Spring sale");
    expect(others.every((r) => r.state === "skipped")).toBe(true);
  });

  it("undo removes the job's metric rows", () => {
    const rows = fixture("meta_campaign_level.csv");
    const mapping = guessMapping(fixtureHeaders("meta_campaign_level.csv"));
    const { drafts, errors } = rowsToMetricDrafts(rows, mapping, "campaign");
    const result = commitImport(db, {
      drafts,
      parseErrors: errors,
      level: "campaign",
      createMissing: true,
      collision: "overwrite",
      filename: "x.csv",
      mapping,
    });
    expect(result.imported).toBe(4);
    const undo = deleteImportJob(db, result.jobId);
    expect(undo?.metricsDeleted).toBe(4);
    expect(
      selectEffectiveDaily(db, { from: "2026-08-01", to: "2026-08-02" }),
    ).toHaveLength(0);
    expect(listImportJobs(db)).toHaveLength(0);
  });
});

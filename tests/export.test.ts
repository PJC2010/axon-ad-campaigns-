import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Papa from "papaparse";
import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/open";
import type { DB } from "@/lib/repo/util";
import { createCampaign } from "@/lib/repo/campaigns";
import { createAdSet } from "@/lib/repo/adsets";
import { createAd, getCampaignTree, replaceAdCreatives } from "@/lib/repo/ads";
import { createCreative } from "@/lib/repo/creatives";
import { campaignCreate, adSetCreate, adCreate } from "@/lib/validation/schemas";
import {
  META_BULK_COLUMNS,
  campaignToBulkCsv,
  campaignToBulkRows,
  exportSlug,
} from "@/lib/export/metaBulk";
import { buildExportZip } from "@/lib/export/zip";

let db: DB;
let campaignId: number;

function buildFixture(uploads?: string) {
  const campaign = createCampaign(
    db,
    campaignCreate.parse({
      name: "Spring sale",
      objective: "OUTCOME_SALES",
      status: "ACTIVE",
      is_cbo: true,
      budget_type: "daily",
      budget_cents: 5000,
    }),
  );
  campaignId = campaign.id;
  const adset = createAdSet(
    db,
    adSetCreate.parse({
      campaign_id: campaign.id,
      name: "Prospecting US",
      status: "ACTIVE",
      countries: ["US", "CA"],
      age_min: 25,
      age_max: 54,
      genders: "women",
      optimization_goal: "OFFSITE_CONVERSIONS",
      billing_event: "IMPRESSIONS",
      start_time: "2026-09-01T09:00",
    }),
  );
  createAdSet(db, adSetCreate.parse({ campaign_id: campaign.id, name: "Empty set" }));

  const mkCreative = (name: string) => {
    if (uploads) fs.writeFileSync(path.join(uploads, `stored-${name}`), `data-${name}`);
    return createCreative(db, {
      kind: "image",
      filename: `stored-${name}`,
      original_name: name,
      mime: "image/png",
      size_bytes: 10,
      width: 1080,
      height: 1080,
      duration_seconds: null,
      tags: [],
    }).id;
  };
  const hero = mkCreative("hero.png");
  const cardA = mkCreative("card-a.png");
  const cardB = mkCreative("card-b.png");

  const single = createAd(
    db,
    adCreate.parse({
      adset_id: adset.id,
      name: "Hook A",
      headline: "Spring looks",
      primary_text: "Fresh fits, free shipping",
      description: "Shop today",
      destination_url: "https://example.com/spring",
      display_link: "example.com",
      cta: "SHOP_NOW",
      utm_params: "utm_source=facebook&utm_medium=paid_social",
    }),
  );
  replaceAdCreatives(db, single.id, {
    items: [{ creative_id: hero, position: 0, card_headline: null, card_url: null }],
  });

  const carousel = createAd(
    db,
    adCreate.parse({ adset_id: adset.id, name: "Cards", format: "carousel", cta: "LEARN_MORE" }),
  );
  replaceAdCreatives(db, carousel.id, {
    items: [
      { creative_id: cardA, position: 0, card_headline: null, card_url: null },
      { creative_id: cardB, position: 1, card_headline: null, card_url: null },
    ],
  });
}

beforeEach(() => {
  db = openDb(":memory:");
});

describe("meta bulk export", () => {
  it("emits one row per ad plus a row for empty ad sets, in column order", () => {
    buildFixture();
    const tree = getCampaignTree(db, campaignId)!;
    const rows = campaignToBulkRows(tree);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toHaveLength(META_BULK_COLUMNS.length);

    const byName = Object.fromEntries(
      rows.map((r) => [r[META_BULK_COLUMNS.indexOf("Ad Name")], r]),
    );
    const col = (row: string[], name: (typeof META_BULK_COLUMNS)[number]) =>
      row[META_BULK_COLUMNS.indexOf(name)];

    const hook = byName["Hook A"];
    expect(col(hook, "Campaign Name")).toBe("Spring sale");
    expect(col(hook, "Campaign Objective")).toBe("Outcome Sales");
    expect(col(hook, "Campaign Status")).toBe("ACTIVE");
    expect(col(hook, "Campaign Daily Budget")).toBe("50.00");
    expect(col(hook, "Campaign Lifetime Budget")).toBe("");
    expect(col(hook, "Ad Set Daily Budget")).toBe(""); // CBO: no ad set budget
    expect(col(hook, "Ad Set Time Start")).toBe("09/01/2026 09:00");
    expect(col(hook, "Countries")).toBe("United States, Canada");
    expect(col(hook, "Age Min")).toBe("25");
    expect(col(hook, "Age Max")).toBe("54");
    expect(col(hook, "Gender")).toBe("Women");
    expect(col(hook, "Optimization Goal")).toBe("OFFSITE_CONVERSIONS");
    expect(col(hook, "Title")).toBe("Spring looks");
    expect(col(hook, "Body")).toBe("Fresh fits, free shipping");
    expect(col(hook, "Link Description")).toBe("Shop today");
    expect(col(hook, "Link")).toBe("https://example.com/spring");
    expect(col(hook, "Call to Action")).toBe("SHOP_NOW");
    expect(col(hook, "Image File Name")).toBe("hero.png");
    expect(col(hook, "URL Tags")).toBe("utm_source=facebook&utm_medium=paid_social");

    const cards = byName["Cards"];
    expect(col(cards, "Image File Name")).toBe("card-a.png;card-b.png");

    const emptyRow = rows.find((r) => col(r, "Ad Set Name") === "Empty set")!;
    expect(col(emptyRow, "Ad Name")).toBe("");
  });

  it("produces BOM-prefixed CRLF CSV that round-trips through a parser", () => {
    buildFixture();
    const csv = campaignToBulkCsv(getCampaignTree(db, campaignId)!);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
    const parsed = Papa.parse<string[]>(csv.slice(1), { skipEmptyLines: true });
    expect(parsed.data[0]).toEqual([...META_BULK_COLUMNS]);
    expect(parsed.data).toHaveLength(4); // header + 3 rows
  });

  it("bundles the CSV and referenced creative files into the zip", async () => {
    const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "axon-export-"));
    try {
      buildFixture(uploads);
      const tree = getCampaignTree(db, campaignId)!;
      const buffer = await buildExportZip(tree, uploads);
      const zip = await JSZip.loadAsync(buffer);
      const names = Object.keys(zip.files)
        .filter((n) => !zip.files[n].dir)
        .sort();
      expect(names).toEqual([
        "creatives/card-a.png",
        "creatives/card-b.png",
        "creatives/hero.png",
        "spring-sale.csv",
      ]);
      expect(await zip.file("creatives/hero.png")!.async("string")).toBe("data-hero.png");
    } finally {
      fs.rmSync(uploads, { recursive: true, force: true });
    }
  });

  it("slugs campaign names for filenames", () => {
    expect(exportSlug("Spring sale — prospecting")).toBe("spring-sale-prospecting");
    expect(exportSlug("***")).toBe("campaign");
  });
});

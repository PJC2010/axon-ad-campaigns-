// Deterministic sample data: three campaigns that exercise every feature —
// a winner, a zero-conversion loser, a fatiguing carousel, CPM creep, and one
// campaign tracked only at campaign level (exercises the precedence path).

import fs from "node:fs";
import path from "node:path";
import type { DB } from "@/lib/repo/util";
import { createCampaign } from "@/lib/repo/campaigns";
import { createAdSet } from "@/lib/repo/adsets";
import { createAd, replaceAdCreatives } from "@/lib/repo/ads";
import { createCreative } from "@/lib/repo/creatives";
import { upsertMetricDaily } from "@/lib/repo/metrics";
import { campaignCreate, adSetCreate, adCreate } from "@/lib/validation/schemas";
import { addDays, todayStr } from "@/lib/dates";

// mulberry32 — small deterministic PRNG so seeded data is stable run to run.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKDAY_FACTOR = [0.82, 1.0, 1.04, 1.06, 1.02, 0.95, 0.85]; // Sun..Sat

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

interface AdPlan {
  name: string;
  format: "single_image" | "carousel";
  headline: string;
  primary_text: string;
  cta: "SHOP_NOW" | "SIGN_UP" | "LEARN_MORE";
  destination_url: string;
  creativeKeys: string[];
  // daily generation parameters
  impressions: number;
  ctr0: number; // starting CTR (fraction)
  ctrDrift: number; // fraction change per day (negative = decay)
  cvr: number; // conversions per click
  aovCents: number; // 0 for lead campaigns
  cpmCents: number;
  cpmDrift: number; // cents per day, applied only across the final 14 days (recent creep)
  freq0: number;
  freqDrift: number; // per day
}

function svgCreative(label: string, w: number, h: number, bg: string, fg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <rect x="${w * 0.06}" y="${h * 0.08}" width="${w * 0.2}" height="${h * 0.055}" rx="${h * 0.028}" fill="${fg}" opacity="0.25"/>
  <circle cx="${w * 0.78}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.16}" fill="${fg}" opacity="0.2"/>
  <text x="${w * 0.06}" y="${h * 0.62}" font-family="Georgia, serif" font-size="${Math.round(h * 0.085)}" font-weight="700" fill="${fg}">${label}</text>
  <text x="${w * 0.06}" y="${h * 0.72}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(h * 0.04)}" fill="${fg}" opacity="0.75">Sample creative — Axon ad campaigns</text>
</svg>`;
}

const CREATIVE_SPECS: Record<
  string,
  { file: string; label: string; w: number; h: number; bg: string; fg: string; tags: string[] }
> = {
  hero: { file: "hero-lifestyle.svg", label: "Spring looks", w: 1080, h: 1080, bg: "#1A5A75", fg: "#F7F4EE", tags: ["spring", "hero"] },
  grid: { file: "product-grid.svg", label: "New arrivals", w: 1080, h: 1080, bg: "#6E8B67", fg: "#F7F4EE", tags: ["spring", "product"] },
  best1: { file: "bestseller-1.svg", label: "Bestseller 01", w: 1080, h: 1080, bg: "#8A6489", fg: "#F7F4EE", tags: ["carousel", "bestsellers"] },
  best2: { file: "bestseller-2.svg", label: "Bestseller 02", w: 1080, h: 1080, bg: "#C2A14D", fg: "#16181D", tags: ["carousel", "bestsellers"] },
  best3: { file: "bestseller-3.svg", label: "Bestseller 03", w: 1080, h: 1080, bg: "#C07A88", fg: "#16181D", tags: ["carousel", "bestsellers"] },
  offer: { file: "offer-20.svg", label: "20% off", w: 1200, h: 628, bg: "#16181D", fg: "#F7F4EE", tags: ["offer", "retargeting"] },
  checklist: { file: "lead-checklist.svg", label: "Free checklist", w: 1200, h: 628, bg: "#F7F4EE", fg: "#16181D", tags: ["lead magnet"] },
  webinar: { file: "lead-webinar.svg", label: "Live walkthrough", w: 1200, h: 628, bg: "#1A5A75", fg: "#F7F4EE", tags: ["lead magnet"] },
};

export interface SeedResult {
  campaigns: number;
  adSets: number;
  ads: number;
  creatives: number;
  metricRows: number;
  from: string;
  to: string;
}

export function seed(db: DB, uploadsDir: string, days = 60): SeedResult {
  const rand = mulberry32(20260822);
  const to = addDays(todayStr(), -1);
  const from = addDays(to, -(days - 1));

  fs.mkdirSync(uploadsDir, { recursive: true });
  const creativeIds: Record<string, number> = {};
  for (const [key, spec] of Object.entries(CREATIVE_SPECS)) {
    const svg = svgCreative(spec.label, spec.w, spec.h, spec.bg, spec.fg);
    const filename = `seed-${spec.file}`;
    fs.writeFileSync(path.join(uploadsDir, filename), svg);
    creativeIds[key] = createCreative(db, {
      kind: "image",
      filename,
      original_name: spec.file,
      mime: "image/svg+xml",
      size_bytes: Buffer.byteLength(svg),
      width: spec.w,
      height: spec.h,
      duration_seconds: null,
      tags: spec.tags,
    }).id;
  }

  // ---- Campaign A: Spring sale (SALES, CBO) --------------------------------
  const springSale = createCampaign(
    db,
    campaignCreate.parse({
      name: "Spring sale — prospecting",
      objective: "OUTCOME_SALES",
      status: "ACTIVE",
      is_cbo: true,
      budget_type: "daily",
      budget_cents: 15000,
    }),
  );
  const prospecting = createAdSet(
    db,
    adSetCreate.parse({
      campaign_id: springSale.id,
      name: "Prospecting — US broad",
      status: "ACTIVE",
      budget_type: null,
      countries: ["US"],
      age_min: 25,
      age_max: 54,
      interests: ["online shopping", "spring fashion"],
      optimization_goal: "OFFSITE_CONVERSIONS",
      billing_event: "IMPRESSIONS",
    }),
  );
  const retargeting = createAdSet(
    db,
    adSetCreate.parse({
      campaign_id: springSale.id,
      name: "Retargeting — 30 day",
      status: "ACTIVE",
      budget_type: null,
      countries: ["US", "CA"],
      placement_type: "manual",
      placements: ["facebook_feed", "instagram_feed", "instagram_stories"],
      optimization_goal: "OFFSITE_CONVERSIONS",
    }),
  );

  // ---- Campaign B: Newsletter signups (LEADS, ad-set budgets) --------------
  const newsletter = createCampaign(
    db,
    campaignCreate.parse({
      name: "Newsletter signups",
      objective: "OUTCOME_LEADS",
      status: "ACTIVE",
      is_cbo: false,
    }),
  );
  const lookalike = createAdSet(
    db,
    adSetCreate.parse({
      campaign_id: newsletter.id,
      name: "Lookalike 1% — subscribers",
      status: "ACTIVE",
      budget_type: "daily",
      budget_cents: 3000,
      countries: ["US"],
      optimization_goal: "LEAD_GENERATION",
    }),
  );
  const interests = createAdSet(
    db,
    adSetCreate.parse({
      campaign_id: newsletter.id,
      name: "Interests — small business",
      status: "ACTIVE",
      budget_type: "daily",
      budget_cents: 2800,
      countries: ["US", "CA", "GB"],
      interests: ["small business owners", "entrepreneurship"],
      optimization_goal: "LEAD_GENERATION",
    }),
  );

  // ---- Campaign C: Brand awareness (campaign-level metrics only) -----------
  const awareness = createCampaign(
    db,
    campaignCreate.parse({
      name: "Brand awareness — reels",
      objective: "OUTCOME_AWARENESS",
      status: "ACTIVE",
      is_cbo: true,
      budget_type: "daily",
      budget_cents: 2000,
    }),
  );

  const adPlans: (AdPlan & { adsetId: number })[] = [
    {
      adsetId: prospecting.id,
      name: "Hook A — lifestyle hero",
      format: "single_image",
      headline: "Spring looks are here",
      primary_text: "Fresh fits for longer days. Free shipping on orders over $60.",
      cta: "SHOP_NOW",
      destination_url: "https://shop.example.com/spring",
      creativeKeys: ["hero"],
      impressions: 6000,
      ctr0: 0.024,
      ctrDrift: 0,
      cvr: 0.06,
      aovCents: 4000,
      cpmCents: 900,
      cpmDrift: 0,
      freq0: 1.25,
      freqDrift: 0.004,
    },
    {
      adsetId: prospecting.id,
      name: "Hook B — product grid",
      format: "single_image",
      headline: "New arrivals",
      primary_text: "Nine new styles, one collection.",
      cta: "SHOP_NOW",
      destination_url: "https://shop.example.com/new",
      creativeKeys: ["grid"],
      impressions: 3500,
      ctr0: 0.011,
      ctrDrift: 0,
      cvr: 0, // the loser: spend with zero conversions
      aovCents: 0,
      cpmCents: 1050,
      cpmDrift: 0,
      freq0: 1.2,
      freqDrift: 0.003,
    },
    {
      adsetId: retargeting.id,
      name: "Carousel — bestsellers",
      format: "carousel",
      headline: "Back in stock",
      primary_text: "The three styles you kept looking at.",
      cta: "SHOP_NOW",
      destination_url: "https://shop.example.com/bestsellers",
      creativeKeys: ["best1", "best2", "best3"],
      impressions: 2600,
      ctr0: 0.028,
      ctrDrift: -0.00027, // decays to ~1.2% across 60 days
      cvr: 0.045,
      aovCents: 3600,
      cpmCents: 1100,
      cpmDrift: 0,
      freq0: 2.2,
      freqDrift: 0.04, // climbs past 4 — creative fatigue
    },
    {
      adsetId: retargeting.id,
      name: "Static — 20% offer",
      format: "single_image",
      headline: "20% off this week",
      primary_text: "Come back and take 20% off your saved items.",
      cta: "SHOP_NOW",
      destination_url: "https://shop.example.com/offer",
      creativeKeys: ["offer"],
      impressions: 1800,
      ctr0: 0.017,
      ctrDrift: 0,
      cvr: 0.035,
      aovCents: 3400,
      cpmCents: 1000,
      cpmDrift: 0,
      freq0: 1.9,
      freqDrift: 0.006,
    },
    {
      adsetId: lookalike.id,
      name: "Lead magnet — checklist",
      format: "single_image",
      headline: "The 12-point launch checklist",
      primary_text: "Everything to check before your next product launch. Free.",
      cta: "SIGN_UP",
      destination_url: "https://example.com/checklist",
      creativeKeys: ["checklist"],
      impressions: 4200,
      ctr0: 0.02,
      ctrDrift: 0,
      cvr: 0.08,
      aovCents: 0,
      cpmCents: 700,
      // Recent CPM creep, steep enough that the whole campaign's blended CPM
      // (this ad + the steady walkthrough ad) still jumps >=1.3x week over week.
      cpmDrift: 85,
      freq0: 1.4,
      freqDrift: 0.005,
    },
    {
      adsetId: interests.id,
      name: "Lead magnet — walkthrough",
      format: "single_image",
      headline: "Watch the 10-minute walkthrough",
      primary_text: "See how owners run their numbers without a spreadsheet.",
      cta: "SIGN_UP",
      destination_url: "https://example.com/walkthrough",
      creativeKeys: ["webinar"],
      impressions: 3800,
      ctr0: 0.018,
      ctrDrift: 0,
      cvr: 0.07,
      aovCents: 0,
      cpmCents: 750,
      cpmDrift: 0,
      freq0: 1.35,
      freqDrift: 0.004,
    },
  ];

  let adCount = 0;
  let metricRows = 0;
  const adsetToCampaign = new Map<number, number>([
    [prospecting.id, springSale.id],
    [retargeting.id, springSale.id],
    [lookalike.id, newsletter.id],
    [interests.id, newsletter.id],
  ]);

  const insertAll = db.transaction(() => {
    for (const plan of adPlans) {
      const ad = createAd(
        db,
        adCreate.parse({
          adset_id: plan.adsetId,
          name: plan.name,
          status: "ACTIVE",
          format: plan.format,
          headline: plan.headline,
          primary_text: plan.primary_text,
          description: "Free shipping over $60",
          destination_url: plan.destination_url,
          cta: plan.cta,
          utm_params: `utm_source=facebook&utm_medium=paid_social&utm_campaign=${encodeURIComponent(
            plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          )}`,
          identity_page: "Axon Outfitters",
        }),
      );
      adCount += 1;
      replaceAdCreatives(db, ad.id, {
        items: plan.creativeKeys.map((key, i) => ({
          creative_id: creativeIds[key],
          position: i,
          card_headline: plan.format === "carousel" ? CREATIVE_SPECS[key].label : null,
          card_url: null,
        })),
      });

      for (let d = 0; d < days; d += 1) {
        const date = addDays(from, d);
        const season = WEEKDAY_FACTOR[weekdayOf(date)];
        const noise = 0.82 + rand() * 0.36;
        const impressions = Math.round(plan.impressions * season * noise);
        const ctr = Math.max(0.002, plan.ctr0 + plan.ctrDrift * d) * (0.9 + rand() * 0.2);
        const clicks = Math.round(impressions * ctr);
        const rampSteps = Math.max(0, d - (days - 15)); // 1..14 across the final two weeks
        const cpm = plan.cpmCents + plan.cpmDrift * rampSteps;
        const spendCents = Math.round((impressions / 1000) * cpm * (0.95 + rand() * 0.1));
        const conversions = Math.round(clicks * plan.cvr * (0.85 + rand() * 0.3));
        const frequency = plan.freq0 + plan.freqDrift * d;
        upsertMetricDaily(db, {
          date,
          level: "ad",
          campaign_id: adsetToCampaign.get(plan.adsetId)!,
          adset_id: plan.adsetId,
          ad_id: ad.id,
          impressions,
          reach: Math.round(impressions / frequency),
          clicks,
          spend_cents: spendCents,
          conversions,
          conversion_value_cents: conversions * plan.aovCents,
          frequency: Math.round(frequency * 100) / 100,
          source: "seed",
        });
        metricRows += 1;
      }
    }

    // Campaign C: coarse campaign-level rows only.
    for (let d = 0; d < days; d += 1) {
      const date = addDays(from, d);
      const season = WEEKDAY_FACTOR[weekdayOf(date)];
      const noise = 0.85 + rand() * 0.3;
      const impressions = Math.round(9000 * season * noise);
      const clicks = Math.round(impressions * 0.005 * (0.9 + rand() * 0.2));
      upsertMetricDaily(db, {
        date,
        level: "campaign",
        campaign_id: awareness.id,
        adset_id: null,
        ad_id: null,
        impressions,
        reach: Math.round(impressions / 1.6),
        clicks,
        spend_cents: Math.round((impressions / 1000) * 320),
        conversions: 0,
        conversion_value_cents: 0,
        frequency: 1.6,
        source: "seed",
      });
      metricRows += 1;
    }
  });
  insertAll();

  return {
    campaigns: 3,
    adSets: 4,
    ads: adCount,
    creatives: Object.keys(creativeIds).length,
    metricRows,
    from,
    to,
  };
}

export function hasAnyData(db: DB): boolean {
  const row = db.prepare("SELECT count(*) AS n FROM campaigns").get() as { n: number };
  return row.n > 0;
}

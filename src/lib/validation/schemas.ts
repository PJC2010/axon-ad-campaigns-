import { z } from "zod";
import {
  AD_FORMAT_VALUES,
  BID_STRATEGY_VALUES,
  BILLING_EVENT_VALUES,
  CTA_VALUES,
  OBJECTIVE_VALUES,
  OPTIMIZATION_GOAL_VALUES,
  PLACEMENT_VALUES,
  SPECIAL_AD_CATEGORY_VALUES,
  STATUSES,
  type AdFormat,
  type BidStrategy,
  type BillingEvent,
  type Cta,
  type Objective,
  type OptimizationGoal,
  type Placement,
  type SpecialAdCategory,
} from "@/lib/meta/enums";
import { isDateStr } from "@/lib/dates";

const statusEnum = z.enum(STATUSES);
const budgetTypeEnum = z.enum(["daily", "lifetime"]);
const urlOrEmpty = z.union([z.literal(""), z.url()]);
// From <input type="datetime-local">: 'YYYY-MM-DDTHH:mm'
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Use the date-time picker");

export const campaignBase = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  objective: z.enum(OBJECTIVE_VALUES as [Objective, ...Objective[]]),
  status: statusEnum.default("DRAFT"),
  special_ad_categories: z
    .array(z.enum(SPECIAL_AD_CATEGORY_VALUES as [SpecialAdCategory, ...SpecialAdCategory[]]))
    .default([]),
  is_cbo: z.boolean().default(false),
  budget_type: budgetTypeEnum.nullable().default(null),
  budget_cents: z.number().int().min(0).nullable().default(null),
});

function requireCboBudget(
  c: { is_cbo?: boolean; budget_type?: "daily" | "lifetime" | null; budget_cents?: number | null },
  ctx: z.RefinementCtx,
) {
  if (c.is_cbo && (!c.budget_type || !c.budget_cents)) {
    ctx.addIssue({
      code: "custom",
      message: "Campaign budget type and amount are required when Advantage campaign budget is on",
      path: ["budget_cents"],
    });
  }
}

export const campaignCreate = campaignBase.superRefine(requireCboBudget);
export const campaignPatch = campaignBase.partial().superRefine(requireCboBudget);

export const adSetBase = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  status: statusEnum.default("DRAFT"),
  budget_type: budgetTypeEnum.nullable().default("daily"),
  budget_cents: z.number().int().min(0).nullable().default(null),
  start_time: localDateTime.nullable().default(null),
  end_time: localDateTime.nullable().default(null),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
  age_min: z.number().int().min(18).max(65).default(18),
  age_max: z.number().int().min(18).max(65).default(65),
  genders: z.enum(["all", "men", "women"]).default("all"),
  interests: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  placement_type: z.enum(["advantage_plus", "manual"]).default("advantage_plus"),
  placements: z.array(z.enum(PLACEMENT_VALUES as [Placement, ...Placement[]])).default([]),
  optimization_goal: z
    .enum(OPTIMIZATION_GOAL_VALUES as [OptimizationGoal, ...OptimizationGoal[]])
    .default("LINK_CLICKS"),
  billing_event: z
    .enum(BILLING_EVENT_VALUES as [BillingEvent, ...BillingEvent[]])
    .default("IMPRESSIONS"),
  bid_strategy: z
    .enum(BID_STRATEGY_VALUES as [BidStrategy, ...BidStrategy[]])
    .default("LOWEST_COST_WITHOUT_CAP"),
  bid_amount_cents: z.number().int().min(0).nullable().default(null),
});

function adSetRules(
  s: {
    age_min?: number;
    age_max?: number;
    placement_type?: "advantage_plus" | "manual";
    placements?: unknown[];
    bid_strategy?: BidStrategy;
    bid_amount_cents?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (s.age_min != null && s.age_max != null && s.age_max < s.age_min) {
    ctx.addIssue({ code: "custom", message: "Maximum age must be at least the minimum age", path: ["age_max"] });
  }
  if (s.placement_type === "manual" && (!s.placements || s.placements.length === 0)) {
    ctx.addIssue({ code: "custom", message: "Choose at least one placement", path: ["placements"] });
  }
  if ((s.bid_strategy === "COST_CAP" || s.bid_strategy === "BID_CAP") && !s.bid_amount_cents) {
    ctx.addIssue({ code: "custom", message: "This bid strategy needs a bid amount", path: ["bid_amount_cents"] });
  }
}

export const adSetCreate = adSetBase
  .extend({ campaign_id: z.number().int().positive() })
  .superRefine(adSetRules);
export const adSetPatch = adSetBase.partial().superRefine(adSetRules);

export const adBase = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  status: statusEnum.default("DRAFT"),
  identity_page: z.string().trim().max(120).nullable().default(null),
  identity_instagram: z.string().trim().max(120).nullable().default(null),
  format: z.enum(AD_FORMAT_VALUES as [AdFormat, ...AdFormat[]]).default("single_image"),
  primary_text: z.string().max(3000).default(""),
  headline: z.string().max(255).default(""),
  description: z.string().max(255).default(""),
  destination_url: urlOrEmpty.default(""),
  display_link: z.string().trim().max(200).nullable().default(null),
  cta: z.enum(CTA_VALUES as [Cta, ...Cta[]]).default("LEARN_MORE"),
  utm_params: z.string().trim().max(600).default(""),
});

export const adCreate = adBase.extend({ adset_id: z.number().int().positive() });
export const adPatch = adBase.partial();

export const adCreativesPut = z.object({
  items: z
    .array(
      z.object({
        creative_id: z.number().int().positive(),
        position: z.number().int().min(0),
        card_headline: z.string().max(255).nullable().default(null),
        card_url: z.union([z.literal(""), z.url()]).nullable().default(null),
      }),
    )
    .max(10),
});

const dateStr = z.string().refine(isDateStr, "Use YYYY-MM-DD");

export const manualMetricInput = z
  .object({
    date: dateStr,
    level: z.enum(["campaign", "adset", "ad"]),
    campaign_id: z.number().int().positive(),
    adset_id: z.number().int().positive().nullable().default(null),
    ad_id: z.number().int().positive().nullable().default(null),
    impressions: z.number().int().min(0).default(0),
    reach: z.number().int().min(0).nullable().default(null),
    clicks: z.number().int().min(0).default(0),
    spend_cents: z.number().int().min(0).default(0),
    conversions: z.number().min(0).default(0),
    conversion_value_cents: z.number().int().min(0).default(0),
    frequency: z.number().min(0).nullable().default(null),
  })
  .superRefine((m, ctx) => {
    if (m.level === "campaign" && (m.adset_id || m.ad_id)) {
      ctx.addIssue({ code: "custom", message: "Campaign-level rows must not set an ad set or ad" });
    }
    if (m.level === "adset" && (!m.adset_id || m.ad_id)) {
      ctx.addIssue({ code: "custom", message: "Ad set-level rows need an ad set and no ad" });
    }
    if (m.level === "ad" && (!m.adset_id || !m.ad_id)) {
      ctx.addIssue({ code: "custom", message: "Ad-level rows need both an ad set and an ad" });
    }
  });

export const creativePatch = z.object({
  original_name: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export type CampaignCreateInput = z.infer<typeof campaignCreate>;
export type CampaignPatchInput = z.infer<typeof campaignPatch>;
export type AdSetCreateInput = z.infer<typeof adSetCreate>;
export type AdSetPatchInput = z.infer<typeof adSetPatch>;
export type AdCreateInput = z.infer<typeof adCreate>;
export type AdPatchInput = z.infer<typeof adPatch>;
export type AdCreativesPutInput = z.infer<typeof adCreativesPut>;
export type ManualMetricInput = z.infer<typeof manualMetricInput>;

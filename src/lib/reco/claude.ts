// Claude-written narrative recommendations, layered on top of the heuristics.
// Requires ANTHROPIC_API_KEY; every failure mode degrades gracefully so the
// rules engine's output is never blocked.

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { DB } from "@/lib/repo/util";
import { claudeConfigured } from "@/lib/env";
import { getSetting } from "@/lib/repo/settings";
import { findCampaignByName } from "@/lib/repo/campaigns";
import type { AnalysisInput, RecoDraft } from "./types";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

export function resolveClaudeModel(db: DB): string {
  return (
    getSetting(db, "claude_model") || process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL
  );
}

const ClaudeRecoSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
        severity: z.enum(["info", "warning", "critical"]),
        scope_level: z.enum(["account", "campaign", "adset", "ad", "creative"]),
        scope_name: z.string().nullable(),
      }),
    )
    .max(5),
});

const cents = (v: number | null): number | null =>
  v == null ? null : Math.round(v) / 100;
const rate = (v: number | null): number | null =>
  v == null ? null : Math.round(v * 10000) / 10000;

function statsline(s: AnalysisInput["account"]["window"]) {
  return {
    spend: cents(s.spend_cents),
    impressions: s.impressions,
    clicks: s.clicks,
    ctr: rate(s.ctr),
    cpm: cents(s.cpm_cents),
    conversions: Math.round(s.conversions * 10) / 10,
    cpa: cents(s.cpa_cents),
    revenue: cents(s.conversion_value_cents),
    roas: s.roas == null ? null : Math.round(s.roas * 100) / 100,
    frequency: s.frequency == null ? null : Math.round(s.frequency * 100) / 100,
  };
}

/**
 * Compact JSON (~4 KB) the model reasons over: window totals with halves,
 * per-campaign rollups, the top/bottom ads, and what the rules engine found.
 * No raw daily series.
 */
export function buildAccountSummary(
  input: AnalysisInput,
  heuristicFindings: RecoDraft[],
): string {
  const adLine = (a: AnalysisInput["ads"][number]) => ({
    ad: a.ad_name,
    campaign: a.campaign_name,
    creatives: a.creative_names.filter(Boolean),
    ...statsline(a.window),
  });
  const adsBySpend = [...input.ads].sort(
    (a, b) => b.window.spend_cents - a.window.spend_cents,
  );
  const summary = {
    window: { from: input.from, to: input.to, halves_split_after: input.h1_to },
    account: {
      window: statsline(input.account.window),
      prior_week: statsline(input.account.h1),
      last_week: statsline(input.account.h2),
      median_campaign_cpa: cents(input.account.median_cpa_cents),
    },
    campaigns: input.campaigns.map((c) => ({
      name: c.name,
      objective: c.objective,
      status: c.status,
      daily_budget: c.is_cbo ? cents(c.budget_cents) : null,
      window: statsline(c.window),
      prior_week: statsline(c.h1),
      last_week: statsline(c.h2),
    })),
    top_ads: adsBySpend.slice(0, 5).map(adLine),
    bottom_ads: adsBySpend.slice(-5).filter((a) => !adsBySpend.slice(0, 5).includes(a)).map(adLine),
    rules_engine_findings: heuristicFindings.map((f) => ({
      rule: f.rule,
      severity: f.severity,
      title: f.title,
      numbers: f.metrics,
    })),
  };
  return JSON.stringify(summary);
}

const SYSTEM_PROMPT = `You are the advertising analyst inside Axon, a business-intelligence tool for small businesses. You review two weeks of Meta ad performance data and write recommendations the owner can act on this week.

Voice: a trusted advisor who happens to be good with numbers. Sentence case. No emoji. Plain language — say "cost per result", not jargon. Cite the actual numbers from the data in every recommendation.

Rules:
- At most 5 recommendations, ordered most important first.
- Every recommendation must name a concrete action (scale, pause, shift budget, refresh creative, fix tracking, broaden audience).
- Only reference campaigns, ads, and creatives that appear in the data. Never invent names or numbers.
- The rules engine's findings are included; do not simply restate them — add judgement, connect findings, or surface what they miss (tracking gaps, objective mismatches, spend concentration).
- scope_name must be the exact name of the campaign or ad the recommendation targets, or null for account-level advice.`;

export type ClaudeRunResult =
  | { status: "ok"; drafts: RecoDraft[] }
  | { status: "skipped"; reason: "no_api_key" | "no_data" }
  | { status: "error"; reason: string };

function resolveScope(
  db: DB,
  input: AnalysisInput,
  scopeLevel: string,
  scopeName: string | null,
): Pick<RecoDraft, "scope_level" | "campaign_id" | "adset_id" | "ad_id" | "creative_id"> {
  const none = {
    scope_level: "account" as const,
    campaign_id: null,
    adset_id: null,
    ad_id: null,
    creative_id: null,
  };
  if (!scopeName) return none;
  const lower = scopeName.trim().toLowerCase();

  if (scopeLevel === "campaign" || scopeLevel === "account") {
    const campaign = findCampaignByName(db, scopeName);
    if (campaign) {
      return { ...none, scope_level: "campaign", campaign_id: campaign.id };
    }
  }
  if (scopeLevel === "ad" || scopeLevel === "adset" || scopeLevel === "creative") {
    const ad = input.ads.find((a) => a.ad_name.toLowerCase() === lower);
    if (ad) {
      return {
        scope_level: "ad",
        campaign_id: ad.campaign_id,
        adset_id: ad.adset_id,
        ad_id: ad.ad_id,
        creative_id: ad.creative_ids[0] ?? null,
      };
    }
    const byCreative = input.ads.find((a) =>
      a.creative_names.some((n) => n.toLowerCase() === lower),
    );
    if (byCreative) {
      const idx = byCreative.creative_names.findIndex((n) => n.toLowerCase() === lower);
      return {
        scope_level: "creative",
        campaign_id: byCreative.campaign_id,
        adset_id: byCreative.adset_id,
        ad_id: byCreative.ad_id,
        creative_id: byCreative.creative_ids[idx] ?? null,
      };
    }
  }
  // Fall back: try campaign match regardless of stated level, else account.
  const campaign = findCampaignByName(db, scopeName);
  if (campaign) return { ...none, scope_level: "campaign", campaign_id: campaign.id };
  return none;
}

export async function generateClaudeRecommendations(
  db: DB,
  input: AnalysisInput,
  heuristicFindings: RecoDraft[],
): Promise<ClaudeRunResult> {
  if (!claudeConfigured()) return { status: "skipped", reason: "no_api_key" };
  if (input.account.window.impressions === 0 && input.account.window.spend_cents === 0) {
    return { status: "skipped", reason: "no_data" };
  }

  const client = new Anthropic({ timeout: 60_000 });
  const model = resolveClaudeModel(db);
  const summary = buildAccountSummary(input, heuristicFindings);

  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the account's performance data for ${input.from} to ${input.to} as JSON:\n\n${summary}\n\nWrite your recommendations.`,
        },
      ],
      output_config: { format: zodOutputFormat(ClaudeRecoSchema) },
    });

    if (response.stop_reason === "refusal") {
      return { status: "error", reason: "Claude declined to analyze this data" };
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      return { status: "error", reason: "Claude's response could not be parsed" };
    }

    const drafts: RecoDraft[] = parsed.recommendations.map((r) => ({
      source: "claude",
      rule: null,
      severity: r.severity,
      ...resolveScope(db, input, r.scope_level, r.scope_name),
      title: r.title,
      body: r.body,
      metrics: {},
      fingerprint: `claude:${crypto.createHash("sha1").update(r.title).digest("hex")}`,
    }));
    return { status: "ok", drafts };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { status: "error", reason: "The Anthropic API key was rejected" };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { status: "error", reason: "Rate limited by the Anthropic API — try again shortly" };
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return { status: "error", reason: "Could not reach the Anthropic API" };
    }
    if (e instanceof Anthropic.APIError) {
      return { status: "error", reason: `Anthropic API error (${e.status ?? "unknown"})` };
    }
    throw e;
  }
}

// Deterministic rules engine. Pure function of AnalysisInput so every rule is
// unit-testable at its exact threshold. Thresholds are exported for tests and
// for display in the UI.

import { formatMoney, formatPercent, formatRatio } from "@/lib/format";
import type { AnalysisInput, RecoDraft } from "./types";

export const HEURISTIC_THRESHOLDS = {
  fatigue_frequency: 3.5,
  fatigue_ctr_drop: 0.6, // h2 CTR below 60% of h1 CTR
  fatigue_min_half_impressions: 2000,
  winner_roas: 2.0,
  winner_min_spend_cents: 5000,
  winner_min_conversions: 10,
  winner_cpa_factor: 0.7, // CPA at or below 70% of the account median
  loser_min_spend_cents: 3000,
  loser_cpa_multiplier: 3, // or 3x the account average CPA, whichever is larger
  realloc_min_spend_cents: 5000,
  realloc_roas_gap: 1.5,
  realloc_min_share: 0.2,
  realloc_shift: 0.15,
  cpm_jump: 1.3,
  cpm_min_half_spend_cents: 2000,
  cpm_absolute_cents: 5000, // $50 CPM
} as const;

const T = HEURISTIC_THRESHOLDS;

function fingerprint(rule: string, scope: string, id: number | string): string {
  return `heuristic:${rule}:${scope}:${id}`;
}

function creativeFatigue(input: AnalysisInput): RecoDraft[] {
  const drafts: RecoDraft[] = [];
  for (const ad of input.ads) {
    const freq = ad.window.frequency;
    const highFrequency = freq != null && freq > T.fatigue_frequency;
    const ctrCollapse =
      ad.h1.ctr != null &&
      ad.h2.ctr != null &&
      ad.h1.impressions >= T.fatigue_min_half_impressions &&
      ad.h2.impressions >= T.fatigue_min_half_impressions &&
      ad.h2.ctr < ad.h1.ctr * T.fatigue_ctr_drop;
    if (!highFrequency && !ctrCollapse) continue;

    const reasons: string[] = [];
    if (highFrequency) {
      reasons.push(`people have seen it ${freq!.toFixed(1)} times on average`);
    }
    if (ctrCollapse) {
      reasons.push(
        `CTR fell from ${formatPercent(ad.h1.ctr)} to ${formatPercent(ad.h2.ctr)} week over week`,
      );
    }
    const creativeNote =
      ad.creative_names.filter(Boolean).length > 0
        ? ` Its creative${ad.creative_ids.length > 1 ? "s" : ""} (${ad.creative_names
            .filter(Boolean)
            .join(", ")}) ${ad.creative_ids.length > 1 ? "have" : "has"} likely worn out.`
        : "";
    drafts.push({
      source: "heuristic",
      rule: "creative_fatigue",
      severity: "warning",
      scope_level: "ad",
      campaign_id: ad.campaign_id,
      adset_id: ad.adset_id,
      ad_id: ad.ad_id,
      creative_id: ad.creative_ids[0] ?? null,
      title: `Refresh the creative on "${ad.ad_name}"`,
      body:
        `This ad in ${ad.campaign_name} is showing fatigue: ${reasons.join(", and ")}.` +
        creativeNote +
        ` Swap in fresh creative or rotate this ad out before performance erodes further.`,
      metrics: {
        frequency: freq != null ? Math.round(freq * 100) / 100 : "—",
        "CTR (prior week)": formatPercent(ad.h1.ctr),
        "CTR (last week)": formatPercent(ad.h2.ctr),
        spend: formatMoney(ad.window.spend_cents, true),
      },
      fingerprint: fingerprint("creative_fatigue", "ad", ad.ad_id),
    });
  }
  return drafts;
}

function scaleWinner(input: AnalysisInput): RecoDraft[] {
  const drafts: RecoDraft[] = [];
  for (const c of input.campaigns) {
    if (
      c.window.spend_cents < T.winner_min_spend_cents ||
      c.window.conversions < T.winner_min_conversions
    ) {
      continue;
    }
    const roasWin = c.window.roas != null && c.window.roas >= T.winner_roas;
    const cpaWin =
      !roasWin &&
      c.window.roas == null &&
      c.window.cpa_cents != null &&
      input.account.median_cpa_cents != null &&
      input.campaigns.length > 1 &&
      c.window.cpa_cents <= input.account.median_cpa_cents * T.winner_cpa_factor;
    if (!roasWin && !cpaWin) continue;

    const why = roasWin
      ? `returned ${formatRatio(c.window.roas)} on ${formatMoney(c.window.spend_cents, true)} of spend`
      : `is converting at ${formatMoney(c.window.cpa_cents)} per result — well under the account median of ${formatMoney(input.account.median_cpa_cents)}`;
    const budgetNote =
      c.is_cbo && c.budget_cents != null && c.budget_type === "daily"
        ? ` Consider raising the daily budget about 20%, from ${formatMoney(c.budget_cents, true)} to ${formatMoney(Math.round(c.budget_cents * 1.2), true)}.`
        : ` Consider raising its budget about 20% and watching results for a week.`;
    drafts.push({
      source: "heuristic",
      rule: "scale_winner",
      severity: "info",
      scope_level: "campaign",
      campaign_id: c.campaign_id,
      adset_id: null,
      ad_id: null,
      creative_id: null,
      title: `Scale "${c.name}"`,
      body: `Over the last two weeks this campaign ${why}, across ${Math.round(c.window.conversions)} conversions.${budgetNote}`,
      metrics: {
        spend: formatMoney(c.window.spend_cents, true),
        conversions: Math.round(c.window.conversions),
        ...(roasWin
          ? { ROAS: formatRatio(c.window.roas) }
          : { CPA: formatMoney(c.window.cpa_cents) }),
      },
      fingerprint: fingerprint("scale_winner", "campaign", c.campaign_id),
    });
  }
  return drafts;
}

function pauseLoser(input: AnalysisInput): RecoDraft[] {
  const drafts: RecoDraft[] = [];
  const threshold = Math.max(
    T.loser_min_spend_cents,
    input.account.avg_cpa_cents != null
      ? input.account.avg_cpa_cents * T.loser_cpa_multiplier
      : 0,
  );
  for (const ad of input.ads) {
    if (ad.window.conversions > 0 || ad.window.spend_cents < threshold) continue;
    drafts.push({
      source: "heuristic",
      rule: "pause_loser",
      severity: "critical",
      scope_level: "ad",
      campaign_id: ad.campaign_id,
      adset_id: ad.adset_id,
      ad_id: ad.ad_id,
      creative_id: ad.creative_ids[0] ?? null,
      title: `Pause "${ad.ad_name}" — spending without converting`,
      body:
        `This ad in ${ad.campaign_name} has spent ${formatMoney(ad.window.spend_cents, true)} over the last two weeks with zero recorded conversions` +
        (input.account.avg_cpa_cents != null
          ? ` — several times the account's average cost per result (${formatMoney(input.account.avg_cpa_cents)}).`
          : ".") +
        ` Pause it, or give it a different audience or creative before spending more.`,
      metrics: {
        spend: formatMoney(ad.window.spend_cents, true),
        conversions: 0,
        clicks: ad.window.clicks,
        CTR: formatPercent(ad.window.ctr),
      },
      fingerprint: fingerprint("pause_loser", "ad", ad.ad_id),
    });
  }
  return drafts;
}

function budgetReallocation(input: AnalysisInput): RecoDraft[] {
  const eligible = input.campaigns.filter(
    (c) => c.window.spend_cents >= T.realloc_min_spend_cents,
  );
  if (eligible.length < 2) return [];

  // Only campaigns measured in the same currency are comparable: rank by ROAS
  // when at least two track revenue; rank by inverse CPA when none do. A mix
  // of revenue and lead campaigns is apples-to-oranges — stay quiet.
  const revenue = eligible.filter((c) => c.window.roas != null && c.window.roas > 0);
  let ranked: { c: (typeof eligible)[number]; s: number }[];
  if (revenue.length >= 2) {
    ranked = revenue.map((c) => ({ c, s: c.window.roas! })).sort((a, b) => b.s - a.s);
  } else if (revenue.length === 0) {
    const withCpa = eligible.filter((c) => c.window.cpa_cents != null);
    if (withCpa.length < 2) return [];
    ranked = withCpa.map((c) => ({ c, s: 1 / c.window.cpa_cents! })).sort((a, b) => b.s - a.s);
  } else {
    return [];
  }

  const top = ranked[0].c;
  const bottom = ranked[ranked.length - 1].c;
  const totalSpend = input.campaigns.reduce((s, c) => s + c.window.spend_cents, 0);
  if (totalSpend === 0) return [];
  const bottomShare = bottom.window.spend_cents / totalSpend;
  if (ranked[0].s < ranked[ranked.length - 1].s * T.realloc_roas_gap) return [];
  if (bottomShare < T.realloc_min_share) return [];

  const shiftPerDayCents = Math.round(
    (bottom.window.spend_cents * T.realloc_shift) / 14,
  );
  const compare =
    top.window.roas != null && bottom.window.roas != null
      ? `${formatRatio(top.window.roas)} vs ${formatRatio(bottom.window.roas)} ROAS`
      : `${formatMoney(top.window.cpa_cents)} vs ${formatMoney(bottom.window.cpa_cents)} per result`;
  return [
    {
      source: "heuristic",
      rule: "budget_reallocation",
      severity: "warning",
      scope_level: "account",
      campaign_id: top.campaign_id,
      adset_id: null,
      ad_id: null,
      creative_id: null,
      title: `Shift budget from "${bottom.name}" to "${top.name}"`,
      body:
        `"${top.name}" is clearly outperforming "${bottom.name}" (${compare}), while the weaker campaign still takes ${formatPercent(bottomShare, 0)} of total spend. ` +
        `Moving about ${T.realloc_shift * 100}% of its budget — roughly ${formatMoney(shiftPerDayCents, true)} a day — toward the stronger campaign should buy the same traffic more efficiently.`,
      metrics: {
        [`${top.name}`]:
          top.window.roas != null ? formatRatio(top.window.roas) : formatMoney(top.window.cpa_cents),
        [`${bottom.name}`]:
          bottom.window.roas != null
            ? formatRatio(bottom.window.roas)
            : formatMoney(bottom.window.cpa_cents),
        "suggested shift": `${formatMoney(shiftPerDayCents, true)}/day`,
      },
      fingerprint: fingerprint("budget_reallocation", "account", 0),
    },
  ];
}

function cpmAlert(input: AnalysisInput): RecoDraft[] {
  const drafts: RecoDraft[] = [];
  for (const c of input.campaigns) {
    const jump =
      c.h1.cpm_cents != null &&
      c.h2.cpm_cents != null &&
      c.h1.spend_cents >= T.cpm_min_half_spend_cents &&
      c.h2.spend_cents >= T.cpm_min_half_spend_cents &&
      c.h2.cpm_cents >= c.h1.cpm_cents * T.cpm_jump;
    const absolute =
      !jump && c.window.cpm_cents != null && c.window.cpm_cents > T.cpm_absolute_cents;
    if (!jump && !absolute) continue;

    drafts.push({
      source: "heuristic",
      rule: "cpm_alert",
      severity: jump ? "warning" : "info",
      scope_level: "campaign",
      campaign_id: c.campaign_id,
      adset_id: null,
      ad_id: null,
      creative_id: null,
      title: jump
        ? `CPM is climbing on "${c.name}"`
        : `CPM is high on "${c.name}"`,
      body: jump
        ? `Cost per thousand impressions rose from ${formatMoney(c.h1.cpm_cents)} to ${formatMoney(c.h2.cpm_cents)} week over week (${formatPercent((c.h2.cpm_cents! - c.h1.cpm_cents!) / c.h1.cpm_cents!, 0)}). That usually means audience saturation or heavier auction competition — check frequency, broaden the audience, or refresh creative.`
        : `This campaign is paying ${formatMoney(c.window.cpm_cents)} per thousand impressions, which is unusually high. Review the audience size and placement mix.`,
      metrics: jump
        ? {
            "CPM (prior week)": formatMoney(c.h1.cpm_cents),
            "CPM (last week)": formatMoney(c.h2.cpm_cents),
          }
        : { CPM: formatMoney(c.window.cpm_cents) },
      fingerprint: fingerprint("cpm_alert", "campaign", c.campaign_id),
    });
  }
  return drafts;
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

export function runHeuristics(input: AnalysisInput): RecoDraft[] {
  return [
    ...pauseLoser(input),
    ...creativeFatigue(input),
    ...budgetReallocation(input),
    ...cpmAlert(input),
    ...scaleWinner(input),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

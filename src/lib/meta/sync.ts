// Meta Marketing API sync: entity metadata first (campaigns/ad sets/ads keyed
// by their Meta IDs), then daily ad-level insights upserted into metric_daily.
// The effective-level precedence query automatically supersedes any coarse
// CSV rows once ad-level API rows land for the same days.

import type { DB } from "@/lib/repo/util";
import type { MetricLevel } from "@/lib/types";
import {
  createCampaign,
  findCampaignByMetaId,
  findCampaignByName,
  updateCampaign,
} from "@/lib/repo/campaigns";
import {
  createAdSet,
  findAdSetByMetaId,
  findAdSetByName,
  updateAdSet,
} from "@/lib/repo/adsets";
import { createAd, findAdByMetaId, findAdByName, updateAd } from "@/lib/repo/ads";
import { upsertMetricDaily } from "@/lib/repo/metrics";
import { getSetting, setSetting } from "@/lib/repo/settings";
import { campaignCreate, adSetCreate, adCreate } from "@/lib/validation/schemas";
import { OBJECTIVE_VALUES, type EntityStatus, type Objective } from "@/lib/meta/enums";
import { addDays, isDateStr, todayStr } from "@/lib/dates";
import { fetchAllPages, graphConfig, type GraphFetcher } from "./graph";

// -- Remote payload shapes (the fields we request) ---------------------------

export interface RemoteCampaign {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface RemoteAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
}

export interface RemoteAd {
  id: string;
  name: string;
  adset_id: string;
  status?: string;
}

interface ActionEntry {
  action_type: string;
  value: string;
}

export interface RemoteInsightRow {
  date_start: string;
  date_stop?: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  spend?: string;
  actions?: ActionEntry[];
  action_values?: ActionEntry[];
}

// Preferred conversion events, most specific first. Exported so it is testable
// and easy to adjust for accounts optimizing on other events.
export const CONVERSION_ACTION_PRIORITY = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "offsite_conversion.fb_pixel_lead",
] as const;

export function pickAction(entries: ActionEntry[] | undefined): number {
  if (!entries || entries.length === 0) return 0;
  for (const type of CONVERSION_ACTION_PRIORITY) {
    const hit = entries.find((e) => e.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

export interface InsightDraft {
  date: string;
  meta_campaign_id: string;
  meta_adset_id: string;
  meta_ad_id: string;
  impressions: number;
  reach: number | null;
  clicks: number;
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
  frequency: number | null;
}

export function insightRowToDraft(row: RemoteInsightRow): InsightDraft | null {
  if (!isDateStr(row.date_start)) return null;
  const num = (v: string | undefined): number => (v == null ? 0 : Number(v) || 0);
  return {
    date: row.date_start,
    meta_campaign_id: row.campaign_id,
    meta_adset_id: row.adset_id,
    meta_ad_id: row.ad_id,
    impressions: Math.round(num(row.impressions)),
    reach: row.reach == null ? null : Math.round(num(row.reach)),
    // Link clicks when reported, otherwise all clicks — mirrors the CSV import.
    clicks: Math.round(row.inline_link_clicks != null ? num(row.inline_link_clicks) : num(row.clicks)),
    spend_cents: Math.round(num(row.spend) * 100),
    conversions: pickAction(row.actions),
    conversion_value_cents: Math.round(pickAction(row.action_values) * 100),
    frequency: row.frequency == null ? null : Number(row.frequency) || null,
  };
}

// -- Entity upserts ----------------------------------------------------------

const STATUS_MAP: Record<string, EntityStatus> = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  DELETED: "ARCHIVED",
  ARCHIVED: "ARCHIVED",
};

function mapStatus(s: string | undefined): EntityStatus | undefined {
  return s ? STATUS_MAP[s] : undefined;
}

function budgetOf(r: { daily_budget?: string; lifetime_budget?: string }): {
  budget_type: "daily" | "lifetime" | null;
  budget_cents: number | null;
} {
  // Graph budget fields are strings in the account currency's minor units.
  if (r.daily_budget) return { budget_type: "daily", budget_cents: Number(r.daily_budget) || null };
  if (r.lifetime_budget) {
    return { budget_type: "lifetime", budget_cents: Number(r.lifetime_budget) || null };
  }
  return { budget_type: null, budget_cents: null };
}

/**
 * Match by Meta ID, adopt an existing local entity by name (stamping its Meta
 * ID), or create. Returns the local id.
 */
export function upsertRemoteCampaign(db: DB, r: RemoteCampaign): number {
  const objective = (OBJECTIVE_VALUES as readonly string[]).includes(r.objective ?? "")
    ? (r.objective as Objective)
    : undefined;
  const budget = budgetOf(r);
  const existing = findCampaignByMetaId(db, r.id) ?? findCampaignByName(db, r.name);
  if (existing) {
    updateCampaign(db, existing.id, {
      name: r.name,
      status: mapStatus(r.status),
      objective,
      meta_campaign_id: r.id,
      ...(budget.budget_cents != null
        ? { is_cbo: true, budget_type: budget.budget_type, budget_cents: budget.budget_cents }
        : {}),
    });
    return existing.id;
  }
  return createCampaign(db, {
    ...campaignCreate.parse({
      name: r.name,
      objective: objective ?? "OUTCOME_TRAFFIC",
      status: mapStatus(r.status) ?? "PAUSED",
      is_cbo: budget.budget_cents != null,
      budget_type: budget.budget_type,
      budget_cents: budget.budget_cents,
    }),
    meta_campaign_id: r.id,
  }).id;
}

export function upsertRemoteAdSet(db: DB, r: RemoteAdSet, localCampaignId: number): number {
  const budget = budgetOf(r);
  const existing = findAdSetByMetaId(db, r.id) ?? findAdSetByName(db, localCampaignId, r.name);
  if (existing) {
    updateAdSet(db, existing.id, {
      name: r.name,
      status: mapStatus(r.status),
      budget_type: budget.budget_type ?? undefined,
      budget_cents: budget.budget_cents ?? undefined,
      meta_adset_id: r.id,
    });
    return existing.id;
  }
  return createAdSet(db, {
    ...adSetCreate.parse({
      campaign_id: localCampaignId,
      name: r.name,
      status: mapStatus(r.status) ?? "PAUSED",
      budget_type: budget.budget_type,
      budget_cents: budget.budget_cents,
    }),
    meta_adset_id: r.id,
  }).id;
}

export function upsertRemoteAd(db: DB, r: RemoteAd, localAdSetId: number): number {
  const existing = findAdByMetaId(db, r.id) ?? findAdByName(db, localAdSetId, r.name);
  if (existing) {
    updateAd(db, existing.id, {
      name: r.name,
      status: mapStatus(r.status),
      meta_ad_id: r.id,
    });
    return existing.id;
  }
  return createAd(db, {
    ...adCreate.parse({
      adset_id: localAdSetId,
      name: r.name,
      status: mapStatus(r.status) ?? "PAUSED",
    }),
    meta_ad_id: r.id,
  }).id;
}

// -- The sync run ------------------------------------------------------------

const LOOKBACK_DAYS = 2; // re-fetch recent days: Meta restates attribution
const FIRST_RUN_DAYS = 60;
const LAST_SYNC_KEY = "last_sync_until";

export interface SyncResult {
  runId: number;
  since: string;
  until: string;
  campaigns: number;
  adSets: number;
  ads: number;
  rowsUpserted: number;
}

export async function runSync(
  db: DB,
  opts: { since?: string; until?: string } = {},
  fetcher: GraphFetcher | undefined = undefined,
): Promise<SyncResult> {
  const config = graphConfig();
  if (!config && !fetcher) {
    throw new Error("Meta API sync is not configured");
  }
  const accountId = config?.accountId ?? "act_test";

  const until = opts.until ?? addDays(todayStr(), -1);
  const lastUntil = getSetting(db, LAST_SYNC_KEY);
  const since =
    opts.since ??
    (lastUntil && isDateStr(lastUntil)
      ? addDays(lastUntil, -LOOKBACK_DAYS)
      : addDays(until, -(FIRST_RUN_DAYS - 1)));

  const runId = Number(
    db
      .prepare(
        "INSERT INTO sync_runs (started_at, status, since, until) VALUES (datetime('now'), 'running', ?, ?)",
      )
      .run(since, until).lastInsertRowid,
  );

  try {
    const [campaigns, adSets, ads] = await Promise.all([
      fetchAllPages<RemoteCampaign>(
        `${accountId}/campaigns`,
        { fields: "id,name,objective,status,daily_budget,lifetime_budget", limit: "200" },
        fetcher,
      ),
      fetchAllPages<RemoteAdSet>(
        `${accountId}/adsets`,
        {
          fields: "id,name,campaign_id,status,daily_budget,lifetime_budget,optimization_goal,billing_event",
          limit: "200",
        },
        fetcher,
      ),
      fetchAllPages<RemoteAd>(
        `${accountId}/ads`,
        { fields: "id,name,adset_id,status", limit: "200" },
        fetcher,
      ),
    ]);

    const insights = await fetchAllPages<RemoteInsightRow>(
      `${accountId}/insights`,
      {
        level: "ad",
        fields:
          "campaign_id,adset_id,ad_id,impressions,reach,frequency,clicks,inline_link_clicks,spend,actions,action_values",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        limit: "500",
      },
      fetcher,
    );

    // All writes happen synchronously after the network work is done.
    const commit = db.transaction((): SyncResult => {
      const campaignIds = new Map<string, number>();
      for (const c of campaigns) campaignIds.set(c.id, upsertRemoteCampaign(db, c));

      const adSetIds = new Map<string, number>();
      for (const s of adSets) {
        const localCampaign = campaignIds.get(s.campaign_id);
        if (localCampaign == null) continue;
        adSetIds.set(s.id, upsertRemoteAdSet(db, s, localCampaign));
      }

      const adIds = new Map<string, number>();
      for (const a of ads) {
        const localAdSet = adSetIds.get(a.adset_id);
        if (localAdSet == null) continue;
        adIds.set(a.id, upsertRemoteAd(db, a, localAdSet));
      }

      let rowsUpserted = 0;
      for (const row of insights) {
        const draft = insightRowToDraft(row);
        if (!draft) continue;
        const campaignId = campaignIds.get(draft.meta_campaign_id);
        const adSetId = adSetIds.get(draft.meta_adset_id);
        const adId = adIds.get(draft.meta_ad_id);
        if (campaignId == null || adSetId == null || adId == null) continue;
        upsertMetricDaily(db, {
          date: draft.date,
          level: "ad" as MetricLevel,
          campaign_id: campaignId,
          adset_id: adSetId,
          ad_id: adId,
          impressions: draft.impressions,
          reach: draft.reach,
          clicks: draft.clicks,
          spend_cents: draft.spend_cents,
          conversions: draft.conversions,
          conversion_value_cents: draft.conversion_value_cents,
          frequency: draft.frequency,
          source: "api",
        });
        rowsUpserted += 1;
      }

      db.prepare(
        "UPDATE sync_runs SET finished_at = datetime('now'), status = 'ok', rows_upserted = ? WHERE id = ?",
      ).run(rowsUpserted, runId);
      setSetting(db, LAST_SYNC_KEY, until);

      return {
        runId,
        since,
        until,
        campaigns: campaigns.length,
        adSets: adSets.length,
        ads: ads.length,
        rowsUpserted,
      };
    });
    return commit();
  } catch (e) {
    db.prepare(
      "UPDATE sync_runs SET finished_at = datetime('now'), status = 'error', error = ? WHERE id = ?",
    ).run(e instanceof Error ? e.message : String(e), runId);
    throw e;
  }
}

export interface SyncStatus {
  configured: boolean;
  lastRun: {
    started_at: string;
    finished_at: string | null;
    status: string;
    since: string | null;
    until: string | null;
    rows_upserted: number;
    error: string | null;
  } | null;
}

export function syncStatus(db: DB): SyncStatus {
  const lastRun = db
    .prepare(
      "SELECT started_at, finished_at, status, since, until, rows_upserted, error FROM sync_runs ORDER BY id DESC LIMIT 1",
    )
    .get() as SyncStatus["lastRun"];
  return { configured: graphConfig() != null, lastRun: lastRun ?? null };
}

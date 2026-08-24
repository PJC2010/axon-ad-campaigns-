import type { MetricLevel } from "@/lib/types";
import type { DB } from "@/lib/repo/util";
import {
  createCampaign,
  findCampaignByMetaId,
  findCampaignByName,
} from "@/lib/repo/campaigns";
import { createAdSet, findAdSetByMetaId, findAdSetByName } from "@/lib/repo/adsets";
import { createAd, findAdByMetaId, findAdByName } from "@/lib/repo/ads";
import { upsertMetricDaily } from "@/lib/repo/metrics";
import { createImportJob, finishImportJob } from "@/lib/repo/jobs";
import { campaignCreate, adSetCreate, adCreate } from "@/lib/validation/schemas";
import type { MetricDraft, Mapping, RowError } from "./mapping";

export type MatchState = "matched" | "will_create" | "skipped";

export interface ResolvedDraft {
  draft: MetricDraft;
  state: MatchState;
  reason?: string;
  campaign_id: number | null;
  adset_id: number | null;
  ad_id: number | null;
}

const PENDING = -1;

/**
 * Resolve each draft's entities against the database. In dry mode nothing is
 * written — entities that would be created get the PENDING sentinel so later
 * rows referencing the same new name resolve consistently. In write mode
 * missing entities are created as paused shells (when allowed).
 */
export function resolveDrafts(
  db: DB,
  drafts: MetricDraft[],
  level: MetricLevel,
  createMissing: boolean,
  write: boolean,
): ResolvedDraft[] {
  // cache key -> id (or PENDING in dry mode)
  const campaignCache = new Map<string, number>();
  const adSetCache = new Map<string, number>();
  const adCache = new Map<string, number>();

  const resolveCampaign = (d: MetricDraft): { id: number | null; created: boolean; reason?: string } => {
    const key = (d.meta_campaign_id ?? d.campaign_name ?? "").toLowerCase();
    if (!key) return { id: null, created: false, reason: "No campaign name or ID" };
    const cached = campaignCache.get(key);
    if (cached != null) return { id: cached, created: cached === PENDING };
    const found =
      (d.meta_campaign_id ? findCampaignByMetaId(db, d.meta_campaign_id) : null) ??
      (d.campaign_name ? findCampaignByName(db, d.campaign_name) : null);
    if (found) {
      campaignCache.set(key, found.id);
      return { id: found.id, created: false };
    }
    if (!createMissing) return { id: null, created: false, reason: "Campaign not found" };
    if (!write) {
      campaignCache.set(key, PENDING);
      return { id: PENDING, created: true };
    }
    const created = createCampaign(db, {
      ...campaignCreate.parse({
        name: d.campaign_name ?? `Campaign ${d.meta_campaign_id}`,
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
      }),
      meta_campaign_id: d.meta_campaign_id,
    });
    campaignCache.set(key, created.id);
    return { id: created.id, created: true };
  };

  const resolveAdSet = (
    d: MetricDraft,
    campaignId: number,
  ): { id: number | null; created: boolean; reason?: string } => {
    const key = `${campaignId}:${(d.meta_adset_id ?? d.adset_name ?? "").toLowerCase()}`;
    if (!d.meta_adset_id && !d.adset_name) {
      return { id: null, created: false, reason: "No ad set name or ID" };
    }
    const cached = adSetCache.get(key);
    if (cached != null) return { id: cached, created: cached === PENDING };
    const found =
      (d.meta_adset_id ? findAdSetByMetaId(db, d.meta_adset_id) : null) ??
      (d.adset_name && campaignId !== PENDING
        ? findAdSetByName(db, campaignId, d.adset_name)
        : null);
    if (found) {
      adSetCache.set(key, found.id);
      return { id: found.id, created: false };
    }
    if (!createMissing) return { id: null, created: false, reason: "Ad set not found" };
    if (!write || campaignId === PENDING) {
      adSetCache.set(key, PENDING);
      return { id: PENDING, created: true };
    }
    const created = createAdSet(db, {
      ...adSetCreate.parse({
        campaign_id: campaignId,
        name: d.adset_name ?? `Ad set ${d.meta_adset_id}`,
        status: "PAUSED",
      }),
      meta_adset_id: d.meta_adset_id,
    });
    adSetCache.set(key, created.id);
    return { id: created.id, created: true };
  };

  const resolveAd = (
    d: MetricDraft,
    adsetId: number,
  ): { id: number | null; created: boolean; reason?: string } => {
    const key = `${adsetId}:${(d.meta_ad_id ?? d.ad_name ?? "").toLowerCase()}`;
    if (!d.meta_ad_id && !d.ad_name) return { id: null, created: false, reason: "No ad name or ID" };
    const cached = adCache.get(key);
    if (cached != null) return { id: cached, created: cached === PENDING };
    const found =
      (d.meta_ad_id ? findAdByMetaId(db, d.meta_ad_id) : null) ??
      (d.ad_name && adsetId !== PENDING ? findAdByName(db, adsetId, d.ad_name) : null);
    if (found) {
      adCache.set(key, found.id);
      return { id: found.id, created: false };
    }
    if (!createMissing) return { id: null, created: false, reason: "Ad not found" };
    if (!write || adsetId === PENDING) {
      adCache.set(key, PENDING);
      return { id: PENDING, created: true };
    }
    const created = createAd(db, {
      ...adCreate.parse({
        adset_id: adsetId,
        name: d.ad_name ?? `Ad ${d.meta_ad_id}`,
        status: "PAUSED",
      }),
      meta_ad_id: d.meta_ad_id,
    });
    adCache.set(key, created.id);
    return { id: created.id, created: true };
  };

  return drafts.map((draft) => {
    const campaign = resolveCampaign(draft);
    if (campaign.id == null) {
      return {
        draft,
        state: "skipped" as const,
        reason: campaign.reason,
        campaign_id: null,
        adset_id: null,
        ad_id: null,
      };
    }
    let created = campaign.created;
    let adsetId: number | null = null;
    let adId: number | null = null;

    if (level === "adset" || level === "ad") {
      // An ad found by Meta ID may live in an ad set/campaign we didn't resolve
      // by name; matching by ID takes precedence over the hierarchy walk.
      const adSet = resolveAdSet(draft, campaign.id);
      if (adSet.id == null) {
        return {
          draft,
          state: "skipped" as const,
          reason: adSet.reason,
          campaign_id: campaign.id,
          adset_id: null,
          ad_id: null,
        };
      }
      created = created || adSet.created;
      adsetId = adSet.id;

      if (level === "ad") {
        const ad = resolveAd(draft, adSet.id);
        if (ad.id == null) {
          return {
            draft,
            state: "skipped" as const,
            reason: ad.reason,
            campaign_id: campaign.id,
            adset_id: adsetId,
            ad_id: null,
          };
        }
        created = created || ad.created;
        adId = ad.id;
      }
    }

    return {
      draft,
      state: created ? ("will_create" as const) : ("matched" as const),
      campaign_id: campaign.id,
      adset_id: adsetId,
      ad_id: adId,
    };
  });
}

export interface ImportResult {
  jobId: number;
  imported: number;
  skipped: number;
  created: number;
  dateMin: string | null;
  dateMax: string | null;
  errors: RowError[];
}

export function commitImport(
  db: DB,
  args: {
    drafts: MetricDraft[];
    parseErrors: RowError[];
    level: MetricLevel;
    createMissing: boolean;
    collision: "overwrite" | "skip";
    filename: string;
    mapping: Mapping;
  },
): ImportResult {
  const run = db.transaction((): ImportResult => {
    const jobId = createImportJob(db, {
      filename: args.filename,
      level: args.level,
      mapping: args.mapping,
      rows_total: args.drafts.length + args.parseErrors.length,
    });

    const resolved = resolveDrafts(db, args.drafts, args.level, args.createMissing, true);
    let imported = 0;
    let skipped = args.parseErrors.length;
    let created = 0;
    let dateMin: string | null = null;
    let dateMax: string | null = null;
    const errors: RowError[] = [...args.parseErrors];

    resolved.forEach((r, i) => {
      if (r.state === "skipped" || r.campaign_id == null) {
        skipped += 1;
        errors.push({ row: i + 1, reason: r.reason ?? "Could not match entities" });
        return;
      }
      if (r.state === "will_create") created += 1;
      const outcome = upsertMetricDaily(
        db,
        {
          date: r.draft.date,
          level: args.level,
          campaign_id: r.campaign_id,
          adset_id: r.adset_id,
          ad_id: r.ad_id,
          impressions: r.draft.impressions,
          reach: r.draft.reach,
          clicks: r.draft.clicks,
          spend_cents: r.draft.spend_cents,
          conversions: r.draft.conversions,
          conversion_value_cents: r.draft.conversion_value_cents,
          frequency: r.draft.frequency,
          source: "csv",
          import_job_id: jobId,
        },
        args.collision,
      );
      if (outcome === "skipped") {
        skipped += 1;
        return;
      }
      imported += 1;
      if (dateMin == null || r.draft.date < dateMin) dateMin = r.draft.date;
      if (dateMax == null || r.draft.date > dateMax) dateMax = r.draft.date;
    });

    finishImportJob(db, jobId, {
      rows_imported: imported,
      rows_skipped: skipped,
      date_min: dateMin,
      date_max: dateMax,
      errors,
    });

    return { jobId, imported, skipped, created, dateMin, dateMax, errors: errors.slice(0, 50) };
  });
  return run();
}

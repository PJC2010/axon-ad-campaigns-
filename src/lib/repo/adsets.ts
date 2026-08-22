import type { AdSet } from "@/lib/types";
import type { AdSetCreateInput, AdSetPatchInput } from "@/lib/validation/schemas";
import { runUpdate, toJson, type DB } from "./util";

type AdSetRow = Omit<AdSet, "countries" | "interests" | "placements"> & {
  countries: string;
  interests: string;
  placements: string;
};

function toAdSet(r: AdSetRow): AdSet {
  return {
    ...r,
    countries: JSON.parse(r.countries),
    interests: JSON.parse(r.interests),
    placements: JSON.parse(r.placements),
  };
}

export function listAdSets(db: DB, campaignId: number): AdSet[] {
  return (
    db
      .prepare("SELECT * FROM ad_sets WHERE campaign_id = ? ORDER BY id")
      .all(campaignId) as AdSetRow[]
  ).map(toAdSet);
}

export function getAdSet(db: DB, id: number): AdSet | null {
  const row = db.prepare("SELECT * FROM ad_sets WHERE id = ?").get(id) as AdSetRow | undefined;
  return row ? toAdSet(row) : null;
}

export function findAdSetByName(db: DB, campaignId: number, name: string): AdSet | null {
  const row = db
    .prepare("SELECT * FROM ad_sets WHERE campaign_id = ? AND name = ?")
    .get(campaignId, name.trim()) as AdSetRow | undefined;
  return row ? toAdSet(row) : null;
}

export function findAdSetByMetaId(db: DB, metaId: string): AdSet | null {
  const row = db.prepare("SELECT * FROM ad_sets WHERE meta_adset_id = ?").get(metaId) as
    | AdSetRow
    | undefined;
  return row ? toAdSet(row) : null;
}

export function createAdSet(
  db: DB,
  input: AdSetCreateInput & { meta_adset_id?: string | null },
): AdSet {
  const info = db
    .prepare(
      `INSERT INTO ad_sets
        (campaign_id, name, status, budget_type, budget_cents, start_time, end_time,
         countries, age_min, age_max, genders, interests, placement_type, placements,
         optimization_goal, billing_event, bid_strategy, bid_amount_cents, meta_adset_id)
       VALUES (@campaign_id, @name, @status, @budget_type, @budget_cents, @start_time, @end_time,
         @countries, @age_min, @age_max, @genders, @interests, @placement_type, @placements,
         @optimization_goal, @billing_event, @bid_strategy, @bid_amount_cents, @meta_adset_id)`,
    )
    .run({
      campaign_id: input.campaign_id,
      name: input.name,
      status: input.status,
      budget_type: input.budget_type,
      budget_cents: input.budget_cents,
      start_time: input.start_time,
      end_time: input.end_time,
      countries: toJson(input.countries),
      age_min: input.age_min,
      age_max: input.age_max,
      genders: input.genders,
      interests: toJson(input.interests),
      placement_type: input.placement_type,
      placements: toJson(input.placements),
      optimization_goal: input.optimization_goal,
      billing_event: input.billing_event,
      bid_strategy: input.bid_strategy,
      bid_amount_cents: input.bid_amount_cents,
      meta_adset_id: input.meta_adset_id ?? null,
    });
  return getAdSet(db, Number(info.lastInsertRowid))!;
}

export function updateAdSet(
  db: DB,
  id: number,
  patch: AdSetPatchInput & { meta_adset_id?: string | null },
): AdSet | null {
  runUpdate(db, "ad_sets", id, {
    name: patch.name,
    status: patch.status,
    budget_type: patch.budget_type,
    budget_cents: patch.budget_cents,
    start_time: patch.start_time,
    end_time: patch.end_time,
    countries: patch.countries === undefined ? undefined : toJson(patch.countries),
    age_min: patch.age_min,
    age_max: patch.age_max,
    genders: patch.genders,
    interests: patch.interests === undefined ? undefined : toJson(patch.interests),
    placement_type: patch.placement_type,
    placements: patch.placements === undefined ? undefined : toJson(patch.placements),
    optimization_goal: patch.optimization_goal,
    billing_event: patch.billing_event,
    bid_strategy: patch.bid_strategy,
    bid_amount_cents: patch.bid_amount_cents,
    meta_adset_id: patch.meta_adset_id,
  });
  return getAdSet(db, id);
}

export function deleteAdSet(db: DB, id: number): boolean {
  return db.prepare("DELETE FROM ad_sets WHERE id = ?").run(id).changes > 0;
}

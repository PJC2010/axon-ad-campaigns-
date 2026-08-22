import type { Campaign } from "@/lib/types";
import type { CampaignCreateInput, CampaignPatchInput } from "@/lib/validation/schemas";
import { boolToInt, runUpdate, toJson, type DB } from "./util";

type CampaignRow = Omit<Campaign, "special_ad_categories" | "is_cbo"> & {
  special_ad_categories: string;
  is_cbo: number;
};

function toCampaign(r: CampaignRow): Campaign {
  return {
    ...r,
    special_ad_categories: JSON.parse(r.special_ad_categories),
    is_cbo: Boolean(r.is_cbo),
  };
}

export function listCampaigns(db: DB): Campaign[] {
  return (
    db.prepare("SELECT * FROM campaigns ORDER BY created_at DESC, id DESC").all() as CampaignRow[]
  ).map(toCampaign);
}

export function getCampaign(db: DB, id: number): Campaign | null {
  const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as
    | CampaignRow
    | undefined;
  return row ? toCampaign(row) : null;
}

export function findCampaignByName(db: DB, name: string): Campaign | null {
  const row = db.prepare("SELECT * FROM campaigns WHERE name = ?").get(name.trim()) as
    | CampaignRow
    | undefined;
  return row ? toCampaign(row) : null;
}

export function findCampaignByMetaId(db: DB, metaId: string): Campaign | null {
  const row = db
    .prepare("SELECT * FROM campaigns WHERE meta_campaign_id = ?")
    .get(metaId) as CampaignRow | undefined;
  return row ? toCampaign(row) : null;
}

export function createCampaign(
  db: DB,
  input: CampaignCreateInput & { meta_campaign_id?: string | null },
): Campaign {
  const info = db
    .prepare(
      `INSERT INTO campaigns
        (name, objective, status, special_ad_categories, is_cbo, budget_type, budget_cents, meta_campaign_id)
       VALUES (@name, @objective, @status, @special_ad_categories, @is_cbo, @budget_type, @budget_cents, @meta_campaign_id)`,
    )
    .run({
      name: input.name,
      objective: input.objective,
      status: input.status,
      special_ad_categories: toJson(input.special_ad_categories),
      is_cbo: input.is_cbo ? 1 : 0,
      budget_type: input.budget_type,
      budget_cents: input.budget_cents,
      meta_campaign_id: input.meta_campaign_id ?? null,
    });
  return getCampaign(db, Number(info.lastInsertRowid))!;
}

export function updateCampaign(
  db: DB,
  id: number,
  patch: CampaignPatchInput & { meta_campaign_id?: string | null },
): Campaign | null {
  runUpdate(db, "campaigns", id, {
    name: patch.name,
    objective: patch.objective,
    status: patch.status,
    special_ad_categories:
      patch.special_ad_categories === undefined
        ? undefined
        : toJson(patch.special_ad_categories),
    is_cbo: boolToInt(patch.is_cbo),
    budget_type: patch.budget_type,
    budget_cents: patch.budget_cents,
    meta_campaign_id: patch.meta_campaign_id,
  });
  return getCampaign(db, id);
}

export function deleteCampaign(db: DB, id: number): boolean {
  return db.prepare("DELETE FROM campaigns WHERE id = ?").run(id).changes > 0;
}

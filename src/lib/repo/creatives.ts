import type { Creative } from "@/lib/types";
import { toJson, type DB } from "./util";

type CreativeRow = Omit<Creative, "tags"> & { tags: string };

function toCreative(r: CreativeRow): Creative {
  return { ...r, tags: JSON.parse(r.tags) };
}

export function listCreatives(
  db: DB,
  filter: { kind?: "image" | "video"; tag?: string; q?: string } = {},
): Creative[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.kind) {
    clauses.push("kind = @kind");
    params.kind = filter.kind;
  }
  if (filter.q) {
    clauses.push("original_name LIKE @q");
    params.q = `%${filter.q}%`;
  }
  if (filter.tag) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value LIKE @tag)");
    params.tag = `%${filter.tag}%`;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return (
    db
      .prepare(`SELECT * FROM creatives ${where} ORDER BY created_at DESC, id DESC`)
      .all(params) as CreativeRow[]
  ).map(toCreative);
}

export function getCreative(db: DB, id: number): Creative | null {
  const row = db.prepare("SELECT * FROM creatives WHERE id = ?").get(id) as
    | CreativeRow
    | undefined;
  return row ? toCreative(row) : null;
}

export function createCreative(
  db: DB,
  input: Omit<Creative, "id" | "created_at">,
): Creative {
  const info = db
    .prepare(
      `INSERT INTO creatives (kind, filename, original_name, mime, size_bytes, width, height, duration_seconds, tags)
       VALUES (@kind, @filename, @original_name, @mime, @size_bytes, @width, @height, @duration_seconds, @tags)`,
    )
    .run({ ...input, tags: toJson(input.tags) });
  return getCreative(db, Number(info.lastInsertRowid))!;
}

export function updateCreative(
  db: DB,
  id: number,
  patch: { original_name?: string; tags?: string[] },
): Creative | null {
  // creatives has no updated_at column; write the fields directly.
  const fields: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.original_name !== undefined) {
    fields.push("original_name = @original_name");
    params.original_name = patch.original_name;
  }
  if (patch.tags !== undefined) {
    fields.push("tags = @tags");
    params.tags = toJson(patch.tags);
  }
  if (fields.length > 0) {
    db.prepare(`UPDATE creatives SET ${fields.join(", ")} WHERE id = @id`).run(params);
  }
  return getCreative(db, id);
}

export function deleteCreative(db: DB, id: number): Creative | null {
  const creative = getCreative(db, id);
  if (!creative) return null;
  db.prepare("DELETE FROM creatives WHERE id = ?").run(id);
  return creative;
}

export interface CreativeUsage {
  ad_id: number;
  ad_name: string;
  adset_id: number;
  campaign_id: number;
  campaign_name: string;
}

export function creativeUsage(db: DB, creativeId: number): CreativeUsage[] {
  return db
    .prepare(
      `SELECT DISTINCT a.id AS ad_id, a.name AS ad_name, a.adset_id,
              c.id AS campaign_id, c.name AS campaign_name
       FROM ad_creatives ac
       JOIN ads a ON a.id = ac.ad_id
       JOIN ad_sets s ON s.id = a.adset_id
       JOIN campaigns c ON c.id = s.campaign_id
       WHERE ac.creative_id = ?
       ORDER BY c.name, a.name`,
    )
    .all(creativeId) as CreativeUsage[];
}

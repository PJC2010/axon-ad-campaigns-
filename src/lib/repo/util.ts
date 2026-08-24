import type BetterSqlite3 from "better-sqlite3";

export type DB = BetterSqlite3.Database;

/**
 * Build a dynamic UPDATE for the provided (already-serialized) fields.
 * Returns false when there is nothing to update.
 */
export function runUpdate(
  db: DB,
  table: string,
  id: number,
  fields: Record<string, unknown>,
): boolean {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (keys.length === 0) return false;
  const set = keys.map((k) => `${k} = @${k}`).join(", ");
  const params: Record<string, unknown> = { id };
  for (const k of keys) params[k] = fields[k];
  db.prepare(
    `UPDATE ${table} SET ${set}, updated_at = datetime('now') WHERE id = @id`,
  ).run(params);
  return true;
}

export const toJson = (v: unknown): string => JSON.stringify(v ?? []);
export const boolToInt = (v: boolean | undefined): number | undefined =>
  v === undefined ? undefined : v ? 1 : 0;

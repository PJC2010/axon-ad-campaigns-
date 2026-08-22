import type { ImportJob, MetricLevel } from "@/lib/types";
import type { DB } from "./util";

type JobRow = Omit<ImportJob, "mapping_json" | "errors_json"> & {
  mapping_json: string;
  errors_json: string;
};

function toJob(r: JobRow): ImportJob {
  return {
    ...r,
    mapping_json: JSON.parse(r.mapping_json),
    errors_json: JSON.parse(r.errors_json),
  };
}

export function createImportJob(
  db: DB,
  input: { filename: string; level: MetricLevel; mapping: Record<string, string>; rows_total: number },
): number {
  const info = db
    .prepare(
      `INSERT INTO import_jobs (filename, level, mapping_json, rows_total, rows_imported, rows_skipped)
       VALUES (@filename, @level, @mapping_json, @rows_total, 0, 0)`,
    )
    .run({
      filename: input.filename,
      level: input.level,
      mapping_json: JSON.stringify(input.mapping),
      rows_total: input.rows_total,
    });
  return Number(info.lastInsertRowid);
}

export function finishImportJob(
  db: DB,
  id: number,
  fields: {
    rows_imported: number;
    rows_skipped: number;
    date_min: string | null;
    date_max: string | null;
    errors: { row: number; reason: string }[];
  },
): void {
  db.prepare(
    `UPDATE import_jobs SET rows_imported = @rows_imported, rows_skipped = @rows_skipped,
       date_min = @date_min, date_max = @date_max, errors_json = @errors_json
     WHERE id = @id`,
  ).run({
    id,
    rows_imported: fields.rows_imported,
    rows_skipped: fields.rows_skipped,
    date_min: fields.date_min,
    date_max: fields.date_max,
    errors_json: JSON.stringify(
      fields.errors.slice(0, 50).map((e) => `Row ${e.row}: ${e.reason}`),
    ),
  });
}

export function listImportJobs(db: DB): ImportJob[] {
  return (
    db.prepare("SELECT * FROM import_jobs ORDER BY created_at DESC, id DESC").all() as JobRow[]
  ).map(toJob);
}

/** Undo an import: remove the job's metric rows, then the job itself. */
export function deleteImportJob(db: DB, id: number): { metricsDeleted: number } | null {
  const exists = db.prepare("SELECT id FROM import_jobs WHERE id = ?").get(id);
  if (!exists) return null;
  const run = db.transaction(() => {
    const metricsDeleted = db
      .prepare("DELETE FROM metric_daily WHERE import_job_id = ?")
      .run(id).changes;
    db.prepare("DELETE FROM import_jobs WHERE id = ?").run(id);
    return { metricsDeleted };
  });
  return run();
}

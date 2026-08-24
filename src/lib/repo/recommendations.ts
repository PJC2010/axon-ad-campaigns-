import type { Recommendation, RecoStatus } from "@/lib/types";
import type { DB } from "./util";

type RecoRow = Omit<Recommendation, "metrics_json"> & { metrics_json: string };

export interface RecommendationWithNames extends Recommendation {
  campaign_name: string | null;
  ad_name: string | null;
  creative_name: string | null;
}

function toReco(r: RecoRow & { campaign_name?: string | null; ad_name?: string | null; creative_name?: string | null }): RecommendationWithNames {
  return {
    ...r,
    metrics_json: JSON.parse(r.metrics_json),
    campaign_name: r.campaign_name ?? null,
    ad_name: r.ad_name ?? null,
    creative_name: r.creative_name ?? null,
  };
}

const SELECT = `
  SELECT r.*, c.name AS campaign_name, a.name AS ad_name, cr.original_name AS creative_name
  FROM recommendations r
  LEFT JOIN campaigns c ON c.id = r.campaign_id
  LEFT JOIN ads a ON a.id = r.ad_id
  LEFT JOIN creatives cr ON cr.id = r.creative_id`;

export function listRecommendations(
  db: DB,
  filter: { status?: RecoStatus } = {},
): RecommendationWithNames[] {
  const rows = filter.status
    ? (db
        .prepare(
          `${SELECT} WHERE r.status = ? ORDER BY
             CASE r.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
             r.created_at DESC, r.id DESC`,
        )
        .all(filter.status) as RecoRow[])
    : (db
        .prepare(
          `${SELECT} ORDER BY
             CASE r.status WHEN 'new' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
             CASE r.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
             r.created_at DESC, r.id DESC`,
        )
        .all() as RecoRow[]);
  return rows.map(toReco);
}

export function setRecommendationStatus(
  db: DB,
  id: number,
  status: RecoStatus,
): RecommendationWithNames | null {
  const changed = db
    .prepare("UPDATE recommendations SET status = ? WHERE id = ?")
    .run(status, id).changes;
  if (changed === 0) return null;
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as RecoRow | undefined;
  return row ? toReco(row) : null;
}

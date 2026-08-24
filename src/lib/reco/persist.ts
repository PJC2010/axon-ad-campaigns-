import type { DB } from "@/lib/repo/util";
import { addDays, todayStr } from "@/lib/dates";
import type { RecoDraft } from "./types";

export interface PersistResult {
  created: number;
  updated: number;
  suppressed: number;
  resolved: number;
}

const SUPPRESS_DAYS = 7;

/**
 * Reconcile one generation run for a source:
 * - a draft matching an open rec's fingerprint updates it in place (created_at kept)
 * - a draft whose fingerprint was recently dismissed/done is suppressed
 * - anything else is inserted as new
 * - open recs of this source that no longer fire are removed (resolved)
 */
export function persistDrafts(
  db: DB,
  source: "heuristic" | "claude",
  drafts: RecoDraft[],
): PersistResult {
  const run = db.transaction((): PersistResult => {
    const open = new Map(
      (
        db
          .prepare("SELECT id, fingerprint FROM recommendations WHERE status = 'new' AND source = ?")
          .all(source) as { id: number; fingerprint: string }[]
      ).map((r) => [r.fingerprint, r.id]),
    );
    const suppressedSince = addDays(todayStr(), -SUPPRESS_DAYS);
    const recentlyClosed = new Set(
      (
        db
          .prepare(
            `SELECT fingerprint FROM recommendations
             WHERE source = ? AND status IN ('dismissed', 'done') AND created_at >= ?`,
          )
          .all(source, suppressedSince) as { fingerprint: string }[]
      ).map((r) => r.fingerprint),
    );

    let created = 0;
    let updated = 0;
    let suppressed = 0;
    const seen = new Set<string>();

    const update = db.prepare(
      `UPDATE recommendations SET severity = @severity, scope_level = @scope_level,
         campaign_id = @campaign_id, adset_id = @adset_id, ad_id = @ad_id,
         creative_id = @creative_id, title = @title, body = @body, metrics_json = @metrics_json,
         rule = @rule
       WHERE id = @id`,
    );
    const insert = db.prepare(
      `INSERT INTO recommendations
         (source, rule, severity, scope_level, campaign_id, adset_id, ad_id, creative_id,
          title, body, metrics_json, fingerprint, status)
       VALUES (@source, @rule, @severity, @scope_level, @campaign_id, @adset_id, @ad_id,
          @creative_id, @title, @body, @metrics_json, @fingerprint, 'new')`,
    );

    for (const d of drafts) {
      if (seen.has(d.fingerprint)) continue;
      seen.add(d.fingerprint);
      const params = {
        source,
        rule: d.rule,
        severity: d.severity,
        scope_level: d.scope_level,
        campaign_id: d.campaign_id,
        adset_id: d.adset_id,
        ad_id: d.ad_id,
        creative_id: d.creative_id,
        title: d.title,
        body: d.body,
        metrics_json: JSON.stringify(d.metrics),
        fingerprint: d.fingerprint,
      };
      const openId = open.get(d.fingerprint);
      if (openId != null) {
        update.run({ ...params, id: openId });
        updated += 1;
      } else if (recentlyClosed.has(d.fingerprint)) {
        suppressed += 1;
      } else {
        insert.run(params);
        created += 1;
      }
    }

    // Open recs that stopped firing resolved themselves — remove them.
    let resolved = 0;
    const remove = db.prepare("DELETE FROM recommendations WHERE id = ?");
    for (const [fp, id] of open) {
      if (!seen.has(fp)) {
        remove.run(id);
        resolved += 1;
      }
    }

    return { created, updated, suppressed, resolved };
  });
  return run();
}

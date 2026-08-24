import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getDb } from "@/lib/db";
import { jsonError } from "@/lib/api";
import {
  detectLevel,
  guessMapping,
  mappingIsUsable,
  rowsToMetricDrafts,
  type Mapping,
} from "@/lib/import/mapping";
import { resolveDrafts } from "@/lib/import/commit";
import { CANONICAL_FIELDS, type CanonicalField } from "@/lib/import/metaHeaders";
import type { MetricLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "bad_form", "Expected multipart form data with a 'file' field");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "no_file", "Attach a CSV under 'file'");
  if (file.size > MAX_CSV_BYTES) return jsonError(413, "too_large", "CSV is limited to 25 MB");

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0 || parsed.data.length === 0) {
    return jsonError(400, "empty_csv", "The file has no data rows");
  }

  // Optional caller-provided mapping/level override (re-preview after edits).
  let mapping: Mapping | null = null;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping.trim()) {
    try {
      const m = JSON.parse(rawMapping) as Record<string, string>;
      mapping = {};
      for (const h of headers) {
        const f = m[h];
        mapping[h] = (CANONICAL_FIELDS as readonly string[]).includes(f)
          ? (f as CanonicalField)
          : "ignore";
      }
    } catch {
      return jsonError(400, "bad_mapping", "Mapping must be valid JSON");
    }
  }
  if (!mapping) mapping = guessMapping(headers);

  const rawLevel = form.get("level");
  const level: MetricLevel | null =
    rawLevel === "campaign" || rawLevel === "adset" || rawLevel === "ad"
      ? rawLevel
      : detectLevel(mapping);

  const usable = mappingIsUsable(mapping);
  if (!usable.ok || !level) {
    return NextResponse.json({
      headers,
      mapping,
      level,
      usable: false,
      missing: usable.missing,
      counts: { total: parsed.data.length, valid: 0, matched: 0, willCreate: 0, skipped: 0 },
      sample: [],
      parseErrors: [],
    });
  }

  const { drafts, errors } = rowsToMetricDrafts(parsed.data, mapping, level);
  const resolved = resolveDrafts(getDb(), drafts, level, form.get("createMissing") === "1", false);

  const counts = {
    total: parsed.data.length,
    valid: drafts.length,
    matched: resolved.filter((r) => r.state === "matched").length,
    willCreate: resolved.filter((r) => r.state === "will_create").length,
    skipped: resolved.filter((r) => r.state === "skipped").length + errors.length,
  };

  const sample = resolved.slice(0, 8).map((r) => ({
    date: r.draft.date,
    entity:
      level === "ad"
        ? (r.draft.ad_name ?? r.draft.meta_ad_id)
        : level === "adset"
          ? (r.draft.adset_name ?? r.draft.meta_adset_id)
          : (r.draft.campaign_name ?? r.draft.meta_campaign_id),
    campaign: r.draft.campaign_name,
    impressions: r.draft.impressions,
    clicks: r.draft.clicks,
    spend_cents: r.draft.spend_cents,
    conversions: r.draft.conversions,
    state: r.state,
    reason: r.reason ?? null,
  }));

  return NextResponse.json({
    headers,
    mapping,
    level,
    usable: true,
    missing: [],
    counts,
    sample,
    parseErrors: errors.slice(0, 20).map((e) => `Row ${e.row}: ${e.reason}`),
  });
}

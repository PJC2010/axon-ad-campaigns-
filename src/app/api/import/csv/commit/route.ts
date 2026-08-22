import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getDb } from "@/lib/db";
import { jsonError } from "@/lib/api";
import {
  detectLevel,
  mappingIsUsable,
  rowsToMetricDrafts,
  type Mapping,
} from "@/lib/import/mapping";
import { commitImport } from "@/lib/import/commit";
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

  const rawMapping = form.get("mapping");
  if (typeof rawMapping !== "string" || !rawMapping.trim()) {
    return jsonError(400, "no_mapping", "Pass the confirmed column mapping");
  }

  // All async work happens before the synchronous import transaction.
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0 || parsed.data.length === 0) {
    return jsonError(400, "empty_csv", "The file has no data rows");
  }

  let mapping: Mapping;
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

  const usable = mappingIsUsable(mapping);
  if (!usable.ok) {
    return jsonError(400, "unusable_mapping", `The mapping still needs ${usable.missing.join(", ")}`);
  }
  const rawLevel = form.get("level");
  const level: MetricLevel | null =
    rawLevel === "campaign" || rawLevel === "adset" || rawLevel === "ad"
      ? rawLevel
      : detectLevel(mapping);
  if (!level) return jsonError(400, "no_level", "Could not determine the data level");

  const { drafts, errors } = rowsToMetricDrafts(parsed.data, mapping, level);
  const result = commitImport(getDb(), {
    drafts,
    parseErrors: errors,
    level,
    createMissing: form.get("createMissing") === "1",
    collision: form.get("collision") === "skip" ? "skip" : "overwrite",
    filename: file.name,
    mapping,
  });

  return NextResponse.json({ result }, { status: 201 });
}

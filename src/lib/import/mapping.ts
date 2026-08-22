import { isDateStr } from "@/lib/dates";
import type { MetricLevel } from "@/lib/types";
import {
  CLICK_PRIORITY,
  CONVERSION_PRIORITY,
  HEADER_DICT,
  VALUE_PRIORITY,
  normalizeHeader,
  type CanonicalField,
} from "./metaHeaders";

export type Mapping = Record<string, CanonicalField>;

/** Guess a mapping for a CSV's headers; unknown columns map to "ignore". */
export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));

  const pickPreferred = (priority: string[]): string | null => {
    for (const norm of priority) {
      const original = byNormalized.get(norm);
      if (original) return original;
    }
    return null;
  };
  const preferredClicks = pickPreferred(CLICK_PRIORITY);
  const preferredConversions = pickPreferred(CONVERSION_PRIORITY);
  const preferredValue = pickPreferred(VALUE_PRIORITY);
  const taken = new Set<CanonicalField>();

  for (const header of headers) {
    const norm = normalizeHeader(header);
    let field: CanonicalField = HEADER_DICT[norm] ?? "ignore";
    if (field === "clicks" && preferredClicks && header !== preferredClicks) field = "ignore";
    if (field === "conversions" && preferredConversions && header !== preferredConversions)
      field = "ignore";
    if (field === "conversion_value" && preferredValue && header !== preferredValue)
      field = "ignore";
    // one column per canonical field (except ignore)
    if (field !== "ignore" && taken.has(field)) field = "ignore";
    if (field !== "ignore") taken.add(field);
    mapping[header] = field;
  }
  return mapping;
}

/** The finest entity level the mapping identifies rows by. */
export function detectLevel(mapping: Mapping): MetricLevel | null {
  const fields = new Set(Object.values(mapping));
  if (fields.has("ad_name") || fields.has("meta_ad_id")) return "ad";
  if (fields.has("adset_name") || fields.has("meta_adset_id")) return "adset";
  if (fields.has("campaign_name") || fields.has("meta_campaign_id")) return "campaign";
  return null;
}

export function mappingIsUsable(mapping: Mapping): { ok: boolean; missing: string[] } {
  const fields = new Set(Object.values(mapping));
  const missing: string[] = [];
  if (!fields.has("date")) missing.push("a date column");
  if (detectLevel(mapping) == null) missing.push("a campaign, ad set, or ad name/ID column");
  if (
    !fields.has("impressions") &&
    !fields.has("clicks") &&
    !fields.has("spend") &&
    !fields.has("conversions")
  ) {
    missing.push("at least one metric column");
  }
  return { ok: missing.length === 0, missing };
}

/** "1,234.56", "$12.30", "3.1%", "" -> number | null. */
export function parseMetricNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$€£,%\s]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Accepts 'YYYY-MM-DD' and 'M/D/YYYY'; returns 'YYYY-MM-DD' or null. */
export function parseCsvDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (isDateStr(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const candidate = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    return isDateStr(candidate) ? candidate : null;
  }
  return null;
}

export interface MetricDraft {
  date: string;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  impressions: number;
  reach: number | null;
  clicks: number;
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
  frequency: number | null;
}

export interface RowError {
  row: number; // 1-based data row number
  reason: string;
}

export function rowsToMetricDrafts(
  rows: Record<string, string>[],
  mapping: Mapping,
  level: MetricLevel,
): { drafts: MetricDraft[]; errors: RowError[] } {
  const drafts: MetricDraft[] = [];
  const errors: RowError[] = [];

  const columnFor = (field: CanonicalField): string | null => {
    for (const [header, f] of Object.entries(mapping)) if (f === field) return header;
    return null;
  };
  const cols = {
    date: columnFor("date"),
    reporting_ends: columnFor("reporting_ends"),
    campaign_name: columnFor("campaign_name"),
    adset_name: columnFor("adset_name"),
    ad_name: columnFor("ad_name"),
    meta_campaign_id: columnFor("meta_campaign_id"),
    meta_adset_id: columnFor("meta_adset_id"),
    meta_ad_id: columnFor("meta_ad_id"),
    impressions: columnFor("impressions"),
    reach: columnFor("reach"),
    frequency: columnFor("frequency"),
    clicks: columnFor("clicks"),
    spend: columnFor("spend"),
    conversions: columnFor("conversions"),
    conversion_value: columnFor("conversion_value"),
  };

  rows.forEach((row, i) => {
    const rowNo = i + 1;
    const get = (col: string | null): string | null => (col ? (row[col] ?? null) : null);

    const date = parseCsvDate(get(cols.date));
    if (!date) {
      errors.push({ row: rowNo, reason: "Missing or unrecognized date" });
      return;
    }
    if (cols.reporting_ends) {
      const ends = parseCsvDate(get(cols.reporting_ends));
      if (ends && ends !== date) {
        errors.push({
          row: rowNo,
          reason: `Covers ${date} to ${ends} — export the report broken down by day`,
        });
        return;
      }
    }

    const nameFor = (col: string | null): string | null => {
      const v = get(col);
      return v && v.trim() ? v.trim() : null;
    };
    const campaign_name = nameFor(cols.campaign_name);
    const adset_name = nameFor(cols.adset_name);
    const ad_name = nameFor(cols.ad_name);
    const meta_campaign_id = nameFor(cols.meta_campaign_id);
    const meta_adset_id = nameFor(cols.meta_adset_id);
    const meta_ad_id = nameFor(cols.meta_ad_id);

    if (level === "ad" && !ad_name && !meta_ad_id) {
      errors.push({ row: rowNo, reason: "No ad name or ID" });
      return;
    }
    if (level === "adset" && !adset_name && !meta_adset_id) {
      errors.push({ row: rowNo, reason: "No ad set name or ID" });
      return;
    }
    if (level === "campaign" && !campaign_name && !meta_campaign_id) {
      errors.push({ row: rowNo, reason: "No campaign name or ID" });
      return;
    }

    const num = (col: string | null): number | null => parseMetricNumber(get(col));
    const spend = num(cols.spend);
    const conversionValue = num(cols.conversion_value);

    drafts.push({
      date,
      campaign_name,
      adset_name,
      ad_name,
      meta_campaign_id,
      meta_adset_id,
      meta_ad_id,
      impressions: Math.max(0, Math.round(num(cols.impressions) ?? 0)),
      reach: num(cols.reach) == null ? null : Math.max(0, Math.round(num(cols.reach)!)),
      clicks: Math.max(0, Math.round(num(cols.clicks) ?? 0)),
      spend_cents: Math.max(0, Math.round((spend ?? 0) * 100)),
      conversions: Math.max(0, num(cols.conversions) ?? 0),
      conversion_value_cents: Math.max(0, Math.round((conversionValue ?? 0) * 100)),
      frequency: num(cols.frequency),
    });
  });

  return { drafts, errors };
}

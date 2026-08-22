// Meta Ads Manager bulk-import sheet. One row per ad, campaign and ad-set
// values repeated; an ad set with no ads still emits a row with blank ad
// columns. All display formatting lives here so the sheet has a single point
// of adjustment if Meta's importer changes.

import Papa from "papaparse";
import type { AdSetTree, AdWithCreatives, CampaignTree } from "@/lib/types";
import { GENDERS, OBJECTIVES, countryName } from "@/lib/meta/enums";

export const META_BULK_COLUMNS = [
  "Campaign Name",
  "Campaign Objective",
  "Campaign Status",
  "Buying Type",
  "Campaign Daily Budget",
  "Campaign Lifetime Budget",
  "Ad Set Name",
  "Ad Set Daily Budget",
  "Ad Set Lifetime Budget",
  "Ad Set Time Start",
  "Ad Set Time Stop",
  "Countries",
  "Age Min",
  "Age Max",
  "Gender",
  "Optimization Goal",
  "Billing Event",
  "Bid Strategy",
  "Bid Amount",
  "Ad Name",
  "Title",
  "Body",
  "Link Description",
  "Link",
  "Display Link",
  "Call to Action",
  "Image File Name",
  "Video File Name",
  "URL Tags",
] as const;

// "OUTCOME_SALES" -> "Outcome Sales" (the display style Ads Manager exports use).
export const OBJECTIVE_EXPORT_MAP: Record<string, string> = Object.fromEntries(
  OBJECTIVES.map((o) => [
    o.value,
    o.value
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" "),
  ]),
);

const STATUS_EXPORT: Record<string, string> = {
  DRAFT: "PAUSED", // Meta has no draft state — export drafts paused
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ARCHIVED: "PAUSED",
};

function dollars(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

/** 'YYYY-MM-DDTHH:mm' (datetime-local) -> 'MM/DD/YYYY HH:mm'. */
function exportTime(local: string | null): string {
  if (!local) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]} ${m[4]}:${m[5]}`;
}

function genderLabel(value: string): string {
  return GENDERS.find((g) => g.value === value)?.label ?? "All";
}

function creativeFilenames(ad: AdWithCreatives, kind: "image" | "video"): string {
  // Carousel cards are joined with ';' — Ads Manager's import maps one file
  // column per ad, so multi-card carousels may need manual arrangement after
  // import (documented limitation in the README).
  return ad.creatives
    .filter((l) => l.creative?.kind === kind)
    .map((l) => l.creative!.original_name)
    .join(";");
}

function adSetColumns(tree: CampaignTree, s: AdSetTree): string[] {
  return [
    s.name,
    tree.is_cbo ? "" : s.budget_type === "daily" ? dollars(s.budget_cents) : "",
    tree.is_cbo ? "" : s.budget_type === "lifetime" ? dollars(s.budget_cents) : "",
    exportTime(s.start_time),
    exportTime(s.end_time),
    s.countries.map(countryName).join(", "),
    String(s.age_min),
    String(s.age_max),
    genderLabel(s.genders),
    s.optimization_goal,
    s.billing_event,
    s.bid_strategy,
    dollars(s.bid_amount_cents),
  ];
}

export function campaignToBulkRows(tree: CampaignTree): string[][] {
  const campaignColumns = [
    tree.name,
    OBJECTIVE_EXPORT_MAP[tree.objective] ?? tree.objective,
    STATUS_EXPORT[tree.status] ?? "PAUSED",
    tree.buying_type,
    tree.is_cbo && tree.budget_type === "daily" ? dollars(tree.budget_cents) : "",
    tree.is_cbo && tree.budget_type === "lifetime" ? dollars(tree.budget_cents) : "",
  ];

  const rows: string[][] = [];
  for (const s of tree.ad_sets) {
    if (s.ads.length === 0) {
      rows.push([
        ...campaignColumns,
        ...adSetColumns(tree, s),
        ...Array(META_BULK_COLUMNS.length - campaignColumns.length - 13).fill(""),
      ]);
      continue;
    }
    for (const ad of s.ads) {
      rows.push([
        ...campaignColumns,
        ...adSetColumns(tree, s),
        ad.name,
        ad.headline,
        ad.primary_text,
        ad.description,
        ad.destination_url,
        ad.display_link ?? "",
        ad.cta,
        creativeFilenames(ad, "image"),
        creativeFilenames(ad, "video"),
        ad.utm_params,
      ]);
    }
  }
  return rows;
}

/** Full sheet as CSV text with a UTF-8 BOM (Excel-friendly). */
export function campaignToBulkCsv(tree: CampaignTree): string {
  const csv = Papa.unparse(
    { fields: [...META_BULK_COLUMNS], data: campaignToBulkRows(tree) },
    { newline: "\r\n" },
  );
  return "\uFEFF" + csv;
}

export function exportSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "campaign"
  );
}

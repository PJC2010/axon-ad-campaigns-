// Known Meta Ads Manager export headers, matched after normalization
// (lowercase, strip non-alphanumerics) so "Amount spent (USD)" == "amountspentusd".

export const CANONICAL_FIELDS = [
  "date",
  "reporting_ends",
  "campaign_name",
  "adset_name",
  "ad_name",
  "meta_campaign_id",
  "meta_adset_id",
  "meta_ad_id",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "spend",
  "conversions",
  "conversion_value",
  "ignore",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export const FIELD_LABELS: Record<CanonicalField, string> = {
  date: "Date",
  reporting_ends: "Reporting ends (validation)",
  campaign_name: "Campaign name",
  adset_name: "Ad set name",
  ad_name: "Ad name",
  meta_campaign_id: "Campaign ID",
  meta_adset_id: "Ad set ID",
  meta_ad_id: "Ad ID",
  impressions: "Impressions",
  reach: "Reach",
  frequency: "Frequency",
  clicks: "Clicks",
  spend: "Spend",
  conversions: "Conversions / results",
  conversion_value: "Conversion value",
  ignore: "Ignore this column",
};

export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * normalized header -> canonical field. "linkclicks" is preferred over
 * "clicksall" and purchase columns over generic results — resolved in
 * guessMapping, which sees all headers together.
 */
export const HEADER_DICT: Record<string, CanonicalField> = {
  // dates
  day: "date",
  date: "date",
  reportingstarts: "date",
  reportingends: "reporting_ends",
  // entity names
  campaignname: "campaign_name",
  adsetname: "adset_name",
  adname: "ad_name",
  // entity ids
  campaignid: "meta_campaign_id",
  adsetid: "meta_adset_id",
  adid: "meta_ad_id",
  // volume
  impressions: "impressions",
  reach: "reach",
  frequency: "frequency",
  // clicks — preference handled in guessMapping
  linkclicks: "clicks",
  clicksall: "clicks",
  clicks: "clicks",
  uniquelinkclicks: "ignore",
  // spend
  amountspentusd: "spend",
  amountspent: "spend",
  spend: "spend",
  // results — preference handled in guessMapping
  purchases: "conversions",
  websitepurchases: "conversions",
  results: "conversions",
  leads: "conversions",
  websiteleads: "conversions",
  // value
  purchasesconversionvalue: "conversion_value",
  websitepurchasesconversionvalue: "conversion_value",
  conversionvalue: "conversion_value",
  purchaseroas: "ignore",
  // always derived locally
  ctr: "ignore",
  ctrall: "ignore",
  ctrlinkclickthroughrate: "ignore",
  cpc: "ignore",
  cpcall: "ignore",
  cpccostperlinkclick: "ignore",
  cpm: "ignore",
  cpmcostper1000impressions: "ignore",
  costperresult: "ignore",
  costperpurchase: "ignore",
  costperlead: "ignore",
  // common noise columns
  reportingendsdate: "ignore",
  delivery: "ignore",
  deliverystatus: "ignore",
  deliverylevel: "ignore",
  attributionsetting: "ignore",
  ends: "ignore",
  starts: "ignore",
  budget: "ignore",
  budgettype: "ignore",
  objective: "ignore",
  currency: "ignore",
};

/** Priority when several headers map to the same canonical field. */
export const CLICK_PRIORITY = ["linkclicks", "clicks", "clicksall"];
export const CONVERSION_PRIORITY = [
  "purchases",
  "websitepurchases",
  "leads",
  "websiteleads",
  "results",
];
export const VALUE_PRIORITY = [
  "purchasesconversionvalue",
  "websitepurchasesconversionvalue",
  "conversionvalue",
];

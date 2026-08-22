import type { RecoScope, RecoSeverity } from "@/lib/types";

export interface WindowStats {
  impressions: number;
  clicks: number;
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
  reach: number | null;
  ctr: number | null;
  cpm_cents: number | null;
  cpa_cents: number | null;
  roas: number | null;
  /** Impression-weighted reported frequency, else impressions / reach. */
  frequency: number | null;
}

export interface CampaignAnalysis {
  campaign_id: number;
  name: string;
  status: string;
  objective: string;
  is_cbo: boolean;
  budget_type: "daily" | "lifetime" | null;
  budget_cents: number | null;
  window: WindowStats;
  h1: WindowStats;
  h2: WindowStats;
}

export interface AdAnalysis {
  ad_id: number;
  ad_name: string;
  adset_id: number;
  adset_name: string;
  campaign_id: number;
  campaign_name: string;
  creative_ids: number[];
  creative_names: string[];
  window: WindowStats;
  h1: WindowStats;
  h2: WindowStats;
}

export interface AnalysisInput {
  from: string;
  to: string;
  /** Boundary: h1 covers [from, mid], h2 covers (mid, to]. */
  h1_to: string;
  account: {
    window: WindowStats;
    h1: WindowStats;
    h2: WindowStats;
    /** Median campaign CPA across campaigns that have one. */
    median_cpa_cents: number | null;
    avg_cpa_cents: number | null;
  };
  campaigns: CampaignAnalysis[];
  ads: AdAnalysis[];
}

export interface RecoDraft {
  source: "heuristic" | "claude";
  rule: string | null;
  severity: RecoSeverity;
  scope_level: RecoScope;
  campaign_id: number | null;
  adset_id: number | null;
  ad_id: number | null;
  creative_id: number | null;
  title: string;
  body: string;
  metrics: Record<string, number | string>;
  fingerprint: string;
}

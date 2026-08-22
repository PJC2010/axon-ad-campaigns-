import type {
  AdFormat,
  BidStrategy,
  BillingEvent,
  Cta,
  EntityStatus,
  Gender,
  Objective,
  OptimizationGoal,
  Placement,
  PlacementType,
  SpecialAdCategory,
} from "@/lib/meta/enums";

export type BudgetType = "daily" | "lifetime";

export interface Campaign {
  id: number;
  name: string;
  objective: Objective;
  status: EntityStatus;
  buying_type: string;
  special_ad_categories: SpecialAdCategory[];
  is_cbo: boolean;
  budget_type: BudgetType | null;
  budget_cents: number | null;
  meta_campaign_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AdSet {
  id: number;
  campaign_id: number;
  name: string;
  status: EntityStatus;
  budget_type: BudgetType | null;
  budget_cents: number | null;
  start_time: string | null;
  end_time: string | null;
  countries: string[];
  age_min: number;
  age_max: number;
  genders: Gender;
  interests: string[];
  placement_type: PlacementType;
  placements: Placement[];
  optimization_goal: OptimizationGoal;
  billing_event: BillingEvent;
  bid_strategy: BidStrategy;
  bid_amount_cents: number | null;
  meta_adset_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Ad {
  id: number;
  adset_id: number;
  name: string;
  status: EntityStatus;
  identity_page: string | null;
  identity_instagram: string | null;
  format: AdFormat;
  primary_text: string;
  headline: string;
  description: string;
  destination_url: string;
  display_link: string | null;
  cta: Cta;
  utm_params: string;
  meta_ad_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Creative {
  id: number;
  kind: "image" | "video";
  filename: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  tags: string[];
  created_at: string;
}

export interface AdCreativeLink {
  ad_id: number;
  creative_id: number;
  position: number;
  card_headline: string | null;
  card_url: string | null;
  creative?: Creative;
}

export interface AdWithCreatives extends Ad {
  creatives: AdCreativeLink[];
}

export interface AdSetTree extends AdSet {
  ads: AdWithCreatives[];
}

export interface CampaignTree extends Campaign {
  ad_sets: AdSetTree[];
}

export type MetricLevel = "campaign" | "adset" | "ad";
export type MetricSource = "csv" | "manual" | "api" | "seed";

export interface MetricDaily {
  id: number;
  date: string;
  level: MetricLevel;
  campaign_id: number;
  adset_id: number | null;
  ad_id: number | null;
  impressions: number;
  reach: number | null;
  clicks: number;
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
  frequency: number | null;
  source: MetricSource;
  import_job_id: number | null;
}

export type RecoSeverity = "info" | "warning" | "critical";
export type RecoScope = "account" | "campaign" | "adset" | "ad" | "creative";
export type RecoStatus = "new" | "dismissed" | "done";

export interface Recommendation {
  id: number;
  created_at: string;
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
  metrics_json: Record<string, number | string>;
  fingerprint: string;
  status: RecoStatus;
}

export interface ImportJob {
  id: number;
  created_at: string;
  filename: string;
  level: MetricLevel;
  mapping_json: Record<string, string>;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  date_min: string | null;
  date_max: string | null;
  errors_json: string[];
}

-- Axon ad campaigns — initial schema.
-- Money is integer cents; dates are 'YYYY-MM-DD' TEXT; timestamps ISO-8601 UTC TEXT.

CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  objective TEXT NOT NULL CHECK (objective IN ('OUTCOME_AWARENESS','OUTCOME_TRAFFIC',
    'OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_APP_PROMOTION','OUTCOME_SALES')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
  buying_type TEXT NOT NULL DEFAULT 'AUCTION',
  special_ad_categories TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(special_ad_categories)),
  is_cbo INTEGER NOT NULL DEFAULT 0,
  budget_type TEXT CHECK (budget_type IN ('daily','lifetime')),
  budget_cents INTEGER,
  meta_campaign_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE ad_sets (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
  budget_type TEXT CHECK (budget_type IN ('daily','lifetime')),
  budget_cents INTEGER,
  start_time TEXT,
  end_time TEXT,
  countries TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(countries)),
  age_min INTEGER NOT NULL DEFAULT 18 CHECK (age_min BETWEEN 18 AND 65),
  age_max INTEGER NOT NULL DEFAULT 65 CHECK (age_max BETWEEN 18 AND 65),
  genders TEXT NOT NULL DEFAULT 'all' CHECK (genders IN ('all','men','women')),
  interests TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(interests)),
  placement_type TEXT NOT NULL DEFAULT 'advantage_plus'
    CHECK (placement_type IN ('advantage_plus','manual')),
  placements TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(placements)),
  optimization_goal TEXT NOT NULL DEFAULT 'LINK_CLICKS' CHECK (optimization_goal IN
    ('LINK_CLICKS','LANDING_PAGE_VIEWS','IMPRESSIONS','REACH','OFFSITE_CONVERSIONS',
     'LEAD_GENERATION','THRUPLAY','POST_ENGAGEMENT','APP_INSTALLS','VALUE')),
  billing_event TEXT NOT NULL DEFAULT 'IMPRESSIONS'
    CHECK (billing_event IN ('IMPRESSIONS','LINK_CLICKS','THRUPLAY')),
  bid_strategy TEXT NOT NULL DEFAULT 'LOWEST_COST_WITHOUT_CAP' CHECK (bid_strategy IN
    ('LOWEST_COST_WITHOUT_CAP','COST_CAP','BID_CAP','LOWEST_COST_WITH_MIN_ROAS')),
  bid_amount_cents INTEGER,
  meta_adset_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  CHECK (age_max >= age_min),
  UNIQUE (campaign_id, name)
);

CREATE TABLE ads (
  id INTEGER PRIMARY KEY,
  adset_id INTEGER NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
  identity_page TEXT,
  identity_instagram TEXT,
  format TEXT NOT NULL DEFAULT 'single_image'
    CHECK (format IN ('single_image','single_video','carousel')),
  primary_text TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  destination_url TEXT NOT NULL DEFAULT '',
  display_link TEXT,
  cta TEXT NOT NULL DEFAULT 'LEARN_MORE',
  utm_params TEXT NOT NULL DEFAULT '',
  meta_ad_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE (adset_id, name)
);

CREATE TABLE creatives (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ad_creatives (
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  creative_id INTEGER NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  card_headline TEXT,
  card_url TEXT,
  PRIMARY KEY (ad_id, position)
);
CREATE INDEX ix_ad_creatives_creative ON ad_creatives(creative_id);

CREATE TABLE import_jobs (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  filename TEXT NOT NULL,
  level TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  rows_total INTEGER NOT NULL,
  rows_imported INTEGER NOT NULL,
  rows_skipped INTEGER NOT NULL,
  date_min TEXT,
  date_max TEXT,
  errors_json TEXT NOT NULL DEFAULT '[]'
);

-- Daily metrics can arrive at campaign, ad-set, or ad grain. Rollups must never
-- double-count: reads go through the effective-level query, which keeps only the
-- finest grain present per (campaign, day). See src/lib/metrics/effective.ts.
CREATE TABLE metric_daily (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('campaign','adset','ad')),
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  adset_id INTEGER REFERENCES ad_sets(id) ON DELETE CASCADE,
  ad_id INTEGER REFERENCES ads(id) ON DELETE CASCADE,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  conversion_value_cents INTEGER NOT NULL DEFAULT 0,
  frequency REAL,
  source TEXT NOT NULL CHECK (source IN ('csv','manual','api','seed')),
  import_job_id INTEGER REFERENCES import_jobs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  CHECK (
    (level = 'campaign' AND adset_id IS NULL AND ad_id IS NULL) OR
    (level = 'adset' AND adset_id IS NOT NULL AND ad_id IS NULL) OR
    (level = 'ad' AND adset_id IS NOT NULL AND ad_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX ux_metric_entity_day
  ON metric_daily(date, level, campaign_id, ifnull(adset_id, 0), ifnull(ad_id, 0));
CREATE INDEX ix_metric_campaign_date ON metric_daily(campaign_id, date);
CREATE INDEX ix_metric_ad_date ON metric_daily(ad_id, date) WHERE ad_id IS NOT NULL;
CREATE INDEX ix_metric_date ON metric_daily(date);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','ok','error')),
  since TEXT,
  until TEXT,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE recommendations (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL CHECK (source IN ('heuristic','claude')),
  rule TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  scope_level TEXT NOT NULL CHECK (scope_level IN ('account','campaign','adset','ad','creative')),
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  adset_id INTEGER REFERENCES ad_sets(id) ON DELETE SET NULL,
  ad_id INTEGER REFERENCES ads(id) ON DELETE SET NULL,
  creative_id INTEGER REFERENCES creatives(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metrics_json)),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','dismissed','done'))
);
CREATE UNIQUE INDEX ux_reco_open_fp ON recommendations(fingerprint) WHERE status = 'new';
CREATE INDEX ix_reco_status ON recommendations(status);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

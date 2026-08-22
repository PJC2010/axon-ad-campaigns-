// Meta's field vocabulary, with plain-language labels for the builder UI.

export const OBJECTIVES = [
  { value: "OUTCOME_AWARENESS", label: "Awareness", help: "Reach the most people likely to remember your ads" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic", help: "Send people to your website or app" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement", help: "Get more messages, video views, and interactions" },
  { value: "OUTCOME_LEADS", label: "Leads", help: "Collect leads through forms, calls, or signups" },
  { value: "OUTCOME_APP_PROMOTION", label: "App promotion", help: "Get installs and in-app actions" },
  { value: "OUTCOME_SALES", label: "Sales", help: "Drive purchases and conversions" },
] as const;
export const OBJECTIVE_VALUES = OBJECTIVES.map((o) => o.value);
export type Objective = (typeof OBJECTIVES)[number]["value"];

export const STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type EntityStatus = (typeof STATUSES)[number];

export const SPECIAL_AD_CATEGORIES = [
  { value: "HOUSING", label: "Housing" },
  { value: "EMPLOYMENT", label: "Employment" },
  { value: "CREDIT", label: "Credit" },
  { value: "ISSUES_ELECTIONS_POLITICS", label: "Social issues, elections or politics" },
  { value: "FINANCIAL_PRODUCTS_SERVICES", label: "Financial products and services" },
] as const;
export const SPECIAL_AD_CATEGORY_VALUES = SPECIAL_AD_CATEGORIES.map((c) => c.value);
export type SpecialAdCategory = (typeof SPECIAL_AD_CATEGORIES)[number]["value"];

export const OPTIMIZATION_GOALS = [
  { value: "LINK_CLICKS", label: "Link clicks" },
  { value: "LANDING_PAGE_VIEWS", label: "Landing page views" },
  { value: "IMPRESSIONS", label: "Impressions" },
  { value: "REACH", label: "Daily unique reach" },
  { value: "OFFSITE_CONVERSIONS", label: "Conversions" },
  { value: "LEAD_GENERATION", label: "Leads" },
  { value: "THRUPLAY", label: "ThruPlay video views" },
  { value: "POST_ENGAGEMENT", label: "Post engagement" },
  { value: "APP_INSTALLS", label: "App installs" },
  { value: "VALUE", label: "Purchase value" },
] as const;
export const OPTIMIZATION_GOAL_VALUES = OPTIMIZATION_GOALS.map((g) => g.value);
export type OptimizationGoal = (typeof OPTIMIZATION_GOALS)[number]["value"];

export const BILLING_EVENTS = [
  { value: "IMPRESSIONS", label: "Impressions" },
  { value: "LINK_CLICKS", label: "Link clicks" },
  { value: "THRUPLAY", label: "ThruPlay" },
] as const;
export const BILLING_EVENT_VALUES = BILLING_EVENTS.map((b) => b.value);
export type BillingEvent = (typeof BILLING_EVENTS)[number]["value"];

export const BID_STRATEGIES = [
  { value: "LOWEST_COST_WITHOUT_CAP", label: "Highest volume", help: "Spend the budget for the most results" },
  { value: "COST_CAP", label: "Cost per result goal", help: "Hold average cost per result near a target" },
  { value: "BID_CAP", label: "Bid cap", help: "Cap the bid in each auction" },
  { value: "LOWEST_COST_WITH_MIN_ROAS", label: "ROAS goal", help: "Aim for a minimum return on ad spend" },
] as const;
export const BID_STRATEGY_VALUES = BID_STRATEGIES.map((b) => b.value);
export type BidStrategy = (typeof BID_STRATEGIES)[number]["value"];

export const AD_FORMATS = [
  { value: "single_image", label: "Single image" },
  { value: "single_video", label: "Single video" },
  { value: "carousel", label: "Carousel" },
] as const;
export const AD_FORMAT_VALUES = AD_FORMATS.map((f) => f.value);
export type AdFormat = (typeof AD_FORMATS)[number]["value"];

export const CTAS = [
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "SHOP_NOW", label: "Shop now" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "GET_OFFER", label: "Get offer" },
  { value: "CONTACT_US", label: "Contact us" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "BOOK_NOW", label: "Book now" },
  { value: "APPLY_NOW", label: "Apply now" },
  { value: "GET_QUOTE", label: "Get quote" },
  { value: "ORDER_NOW", label: "Order now" },
  { value: "DONATE_NOW", label: "Donate now" },
  { value: "WATCH_MORE", label: "Watch more" },
  { value: "SEND_MESSAGE", label: "Send message" },
  { value: "WHATSAPP_MESSAGE", label: "WhatsApp message" },
  { value: "CALL_NOW", label: "Call now" },
  { value: "PLAY_GAME", label: "Play game" },
  { value: "INSTALL_APP", label: "Install app" },
  { value: "USE_APP", label: "Use app" },
  { value: "LISTEN_NOW", label: "Listen now" },
  { value: "REQUEST_TIME", label: "Request time" },
  { value: "SEE_MENU", label: "See menu" },
] as const;
export const CTA_VALUES = CTAS.map((c) => c.value);
export type Cta = (typeof CTAS)[number]["value"];

export const PLACEMENT_TYPES = [
  { value: "advantage_plus", label: "Advantage+ placements", help: "Let Meta place ads wherever they are likely to perform best" },
  { value: "manual", label: "Manual placements", help: "Choose exactly where ads appear" },
] as const;
export type PlacementType = (typeof PLACEMENT_TYPES)[number]["value"];

export const PLACEMENTS = [
  { value: "facebook_feed", label: "Facebook feed", platform: "Facebook" },
  { value: "facebook_video_feeds", label: "Facebook video feeds", platform: "Facebook" },
  { value: "facebook_stories", label: "Facebook stories", platform: "Facebook" },
  { value: "facebook_reels", label: "Facebook reels", platform: "Facebook" },
  { value: "facebook_marketplace", label: "Facebook marketplace", platform: "Facebook" },
  { value: "facebook_right_column", label: "Facebook right column", platform: "Facebook" },
  { value: "facebook_search", label: "Facebook search results", platform: "Facebook" },
  { value: "instagram_feed", label: "Instagram feed", platform: "Instagram" },
  { value: "instagram_stories", label: "Instagram stories", platform: "Instagram" },
  { value: "instagram_reels", label: "Instagram reels", platform: "Instagram" },
  { value: "instagram_explore", label: "Instagram explore", platform: "Instagram" },
  { value: "audience_network", label: "Native, banner and interstitial", platform: "Audience network" },
  { value: "audience_network_rewarded", label: "Rewarded video", platform: "Audience network" },
  { value: "messenger_inbox", label: "Messenger inbox", platform: "Messenger" },
  { value: "messenger_stories", label: "Messenger stories", platform: "Messenger" },
] as const;
export const PLACEMENT_VALUES = PLACEMENTS.map((p) => p.value);
export type Placement = (typeof PLACEMENTS)[number]["value"];

export const GENDERS = [
  { value: "all", label: "All" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
] as const;
export type Gender = (typeof GENDERS)[number]["value"];

// Meta's recommended text lengths (soft limits — warnings only, not blockers).
export const TEXT_LIMITS = {
  primary_text: 125,
  headline: 40,
  description: 30,
} as const;

// Curated common ad markets for the targeting picker.
export const COUNTRIES = [
  ["US", "United States"], ["CA", "Canada"], ["MX", "Mexico"], ["BR", "Brazil"],
  ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"], ["PE", "Peru"],
  ["GB", "United Kingdom"], ["IE", "Ireland"], ["FR", "France"], ["DE", "Germany"],
  ["NL", "Netherlands"], ["BE", "Belgium"], ["ES", "Spain"], ["PT", "Portugal"],
  ["IT", "Italy"], ["CH", "Switzerland"], ["AT", "Austria"], ["SE", "Sweden"],
  ["NO", "Norway"], ["DK", "Denmark"], ["FI", "Finland"], ["PL", "Poland"],
  ["CZ", "Czechia"], ["RO", "Romania"], ["GR", "Greece"], ["TR", "Türkiye"],
  ["UA", "Ukraine"], ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"],
  ["IL", "Israel"], ["EG", "Egypt"], ["ZA", "South Africa"], ["NG", "Nigeria"],
  ["KE", "Kenya"], ["IN", "India"], ["PK", "Pakistan"], ["BD", "Bangladesh"],
  ["ID", "Indonesia"], ["PH", "Philippines"], ["VN", "Vietnam"], ["TH", "Thailand"],
  ["MY", "Malaysia"], ["SG", "Singapore"], ["HK", "Hong Kong"], ["TW", "Taiwan"],
  ["JP", "Japan"], ["KR", "South Korea"], ["AU", "Australia"], ["NZ", "New Zealand"],
] as const;
export const COUNTRY_CODES = COUNTRIES.map(([code]) => code);
export function countryName(code: string): string {
  return COUNTRIES.find(([c]) => c === code)?.[1] ?? code;
}

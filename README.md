# Axon ad campaigns

A local-first Meta (Facebook/Instagram) ad campaign manager and performance dashboard. Plan campaigns with Meta's real structure, attach the actual creative files, track performance per campaign and per creative, and get recommendations — from a deterministic rules engine, plus Claude when you add an API key.

Everything runs on your machine: Next.js + SQLite, no hosted services required.

## What it does

- **Campaign builder** — guided campaign → ad set → ad forms using Meta's field vocabulary: objectives, special ad categories, Advantage campaign budget (CBO) or per-ad-set budgets, audience targeting (locations, age, gender, interests), Advantage+ or manual placements, optimization goals, billing events, bid strategies, CTAs, UTM parameters. Ad copy fields show Meta's recommended character limits (125/40/30) as soft warnings.
- **Creative library** — upload images and videos, tag them, see where each is used, and attach them to ads (carousels keep card order). Files are served with HTTP Range support so video previews seek properly.
- **Performance tracking** — daily-grain metrics per campaign, ad set, or ad, from three sources:
  - **CSV import** of Meta Ads Manager exports, with automatic column mapping you can adjust, a per-row match preview, optional shell-entity creation, and one-click undo per import
  - **Manual entry** for quick one-day records
  - **API sync** from the Meta Marketing API (set `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID`) — pulls campaigns/ad sets/ads and daily ad-level insights incrementally
- **Analytics** — dashboard with KPI cards (spend, impressions, clicks, CTR, CPC, CPM, conversions, ROAS) and deltas vs the previous period, daily trend charts, a campaign leaderboard, per-creative performance comparison, and a per-campaign performance tab with ad set and ad breakdowns.
- **Recommendations** — a rules engine that always works (pause zero-conversion spenders, refresh fatigued creatives, scale winners, shift budget between comparable campaigns, CPM alerts), layered with Claude-written narrative recommendations when `ANTHROPIC_API_KEY` is set. Recommendations persist with done/dismissed states and don't nag about things you dismissed.
- **Meta export** — download any campaign as an Ads Manager bulk-import CSV, or a zip that bundles the sheet with every attached creative file.

## Getting started

```bash
npm install
npm run seed     # optional: 3 sample campaigns with 60 days of data
npm run dev      # http://localhost:3000
```

Optional integrations go in `.env` (copy `.env.example`):

| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | Claude narrative recommendations (default model `claude-opus-5`; override with `ANTHROPIC_MODEL` or in Settings) |
| `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` | One-click Marketing API sync on the Import page |
| `META_API_VERSION` | Graph API version (default `v23.0`) |
| `DATA_DIR` | Where the SQLite file and uploads live (default `./data`) |

Your data stays in `data/` (gitignored): the database at `data/app.db`, uploaded creatives under `data/uploads/`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | The usual Next.js trio |
| `npm run seed` | Deterministic sample data (refuses to run over existing data without `--force`) |
| `npm test` | Vitest suite (~70 tests: schema, precedence, import mapping, heuristics, export, sync transforms) |
| `npm run lint` | ESLint |
| `npm run screenshot` | Captures every page against a running server into `.screenshots/` |

## How the numbers work

**One row per entity per day.** Metrics live in `metric_daily` at campaign, ad set, or ad grain, whichever your source provides. Money is integer cents; CTR/CPC/CPM/CPA/ROAS are always derived at read time, never stored.

**No double counting.** When the same campaign-day has rows at several grains (say, an early campaign-level CSV and later ad-level API rows), every rollup uses only the finest grain present for that day — ad beats ad set beats campaign. Coarse rows are superseded, never summed. The one caveat: reach isn't additive, so reach and frequency rolled up from finer grains are approximations and are labeled as such.

**Creative performance is derived.** Ad-level rows join through each ad's attached creatives; a creative used by several ads sums across them, and each card of a carousel is attributed the full ad's metrics.

**Conversions from imports.** CSV import prefers link clicks over all clicks, and purchase columns over generic results. API sync mirrors this (`inline_link_clicks` first, and conversions picked by a priority list: `omni_purchase` → `purchase` → pixel purchase → `lead`) — the list is exported from `src/lib/meta/sync.ts` if your account optimizes on something else.

## Known limitations

- Single user, one workspace, USD display.
- Carousel export lists card files semicolon-joined in one column; Ads Manager may ask you to arrange cards after import. Interest targeting stays in the workspace (Meta's importer has no clean column for it).
- Video creatives don't get automatic dimensions/duration (no native media probing); images do.
- The Meta sync pulls entity names, statuses, budgets, and daily ad-level insights; it doesn't download creative files or detailed targeting.
- Behind a corporate proxy, Node's `fetch` ignores `HTTPS_PROXY` — API sync and Claude calls need an [`EnvHttpProxyAgent` dispatcher](https://nodejs.org/api/globals.html#environmenthttpproxyagent) if that's your setup.

## Stack

Next.js 16 (App Router) · TypeScript · SQLite via better-sqlite3 (WAL, file-based migrations in `db/migrations/`) · Tailwind CSS 4 with the Axon design tokens · Recharts · papaparse · jszip · `@anthropic-ai/sdk` · Vitest.

Project layout: API route handlers under `src/app/api/**`, pages under `src/app/(app)/**`, domain logic in `src/lib/**` (repos, metrics engine, import/export, sync, recommendations), UI in `src/components/**`, tests in `tests/`.

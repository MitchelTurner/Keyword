# Prospector

Internal research tool that mines Google Ads keyword data to find underserved software niches.

**Core loop:** seed niche → expand keywords (DataForSEO) → enrich volume/CPC/competition → classify into product clusters (Claude) → score & rank → review in dashboard.

## Stack

- `apps/api` — NestJS HTTP API + in-process BullMQ workers
- `apps/web` — React + Vite + Tailwind dashboard
- `packages/shared` — zod schemas + scoring pure functions
- PostgreSQL (Prisma) + Redis (BullMQ)

## Quick start

```bash
cp .env.example .env
# fill DATAFORSEO_* and ANTHROPIC_API_KEY

pnpm install
pnpm --filter @prospector/shared build
pnpm db:generate
pnpm db:migrate
pnpm dev:api   # :3000  (HTTP + workers)
pnpm dev:web   # :5173
```

CLI trigger (API must be running to process the queue):

```bash
pnpm cli:niche -- --seed "invoice software" --wait
```

## Environment

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | DataForSEO HTTP Basic auth |
| `ANTHROPIC_API_KEY` | Claude API key |
| `DEFAULT_LOCATION_CODE` | default `2840` (US) |
| `DEFAULT_LANGUAGE_CODE` | default `en` |
| `PORT` | API port (default `3000`) |
| `CORS_ORIGIN` | dashboard origin |

## API

```
GET    /niches/cost-estimate
POST   /niches
GET    /niches
GET    /portfolio                         # pinned / watching / building rollup
GET    /niches/:id
GET    /niches/:id/export.csv
GET    /niches/:id/opportunities/:oppId
PATCH  /niches/:id/opportunities/:oppId   { pinned?, notes?, reviewStatus? }
PATCH  /niches/:id                        { convRate?, ltvCacRatio? }
POST   /niches/:id/reclassify             # Claude only — uses stored Keyword.raw
POST   /niches/:id/retry
DELETE /niches/:id
GET    /health
GET    /health/ready
```

### Operator quick wins
- **Cost estimate** shown before Run (planning range for expand/enrich/classify)
- **Cross-niche keyword cache** — enrich skips DataForSEO for terms already fetched
- **Re-classify** from stored metrics (no Ads re-fetch); pins/notes preserved on label match
- **CSV export** of opportunities + member keywords
- **Pin / notes / review status** (`watching` | `building` | `passed`) on opportunities

### Decision support
- **Demand breakdown** — volume × CPC × competition × buyer-weight drivers
- **Build brief** — one-line summary, why it ranks vs niche median, suggested next step
- **Pass/fail rubric** — editable thresholds + preferred buyers; badge on tables
- **Buyer weights** — per-niche overrides of sales-strength weighting (triggers re-score)

## Tests

```bash
pnpm test
```

## Railway

1. Create a service from this repo (root directory).
2. Add **Postgres** and **Redis** plugins — Railway injects `DATABASE_URL` and `REDIS_URL`.
3. Set secrets: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ANTHROPIC_API_KEY`.
4. Deploy. Start script migrates then binds `0.0.0.0:$PORT`.
5. Health check: `GET /health` (liveness, no DB). Readiness: `GET /health/ready`.
6. In Railway **Settings → Networking**, leave the domain target port empty / default so it uses `$PORT` (do not hardcode `3000`).

If you see “upstream error” / 502:
- Confirm deploy logs include `Prospector API listening on http://0.0.0.0:...`
- Confirm Postgres + Redis plugins are linked to **this** service
- Confirm public domain target port matches `$PORT` (or is unset)

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
GET    /niches/:id
GET    /niches/:id/export.csv
GET    /niches/:id/opportunities/:oppId
PATCH  /niches/:id/opportunities/:oppId   { pinned?, notes?, reviewStatus? }
PATCH  /niches/:id                        { convRate?, ltvCacRatio? }
POST   /niches/:id/reclassify             # Claude only — uses stored Keyword.raw
POST   /niches/:id/retry
DELETE /niches/:id
GET    /health
```

### Operator quick wins
- **Cost estimate** shown before Run (planning range for expand/enrich/classify)
- **Cross-niche keyword cache** — enrich skips DataForSEO for terms already fetched
- **Re-classify** from stored metrics (no Ads re-fetch); pins/notes preserved on label match
- **CSV export** of opportunities + member keywords
- **Pin / notes / review status** (`watching` | `building` | `passed`) on opportunities

## Tests

```bash
pnpm test
```

## Railway

1. Create a service from this repo (root directory).
2. Add **Postgres** and **Redis** plugins — Railway injects `DATABASE_URL` and `REDIS_URL`.
3. Set secrets: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ANTHROPIC_API_KEY`.
4. Deploy. Start command runs migrations then `node apps/api/dist/main.js` on `0.0.0.0:$PORT`.
5. Health check: `GET /health`. The API also serves the web UI from `apps/web/dist`.

If you see “Application failed to respond”, check deploy logs for missing `DATABASE_URL` / `REDIS_URL` or a failed `prisma migrate deploy`.

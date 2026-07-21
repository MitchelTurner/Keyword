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
POST   /niches
GET    /niches
GET    /niches/:id
GET    /niches/:id/opportunities/:oppId
PATCH  /niches/:id          { convRate?, ltvCacRatio? }
POST   /niches/:id/retry
DELETE /niches/:id
GET    /health
```

## Tests

```bash
pnpm test
```

## Railway

Provision Postgres + Redis plugins, set the env vars above, and deploy. The API process runs BullMQ workers in-process (v1). Serve the web build from Railway static hosting or a second service pointed at `apps/web`.

FROM node:22-bookworm-slim AS base
RUN corepack enable && apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN corepack prepare pnpm@10.33.3 --activate \
 && pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @prospector/shared build \
 && pnpm --filter @prospector/api prisma:generate \
 && pnpm --filter @prospector/api build \
 && pnpm --filter @prospector/web build \
 && test -f apps/api/dist/main.js \
 && test -f apps/web/dist/index.html

FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app /app
RUN chmod +x scripts/start.sh
EXPOSE 3000
CMD ["sh", "-c", "sh scripts/migrate.sh && SKIP_MIGRATE=1 sh scripts/start.sh"]

FROM node:22-bookworm-slim AS base
RUN corepack enable && apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @prospector/shared build \
 && pnpm --filter @prospector/api prisma:generate \
 && pnpm --filter @prospector/api build \
 && pnpm --filter @prospector/web build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @prospector/api prisma:deploy && pnpm --filter @prospector/api start:prod"]

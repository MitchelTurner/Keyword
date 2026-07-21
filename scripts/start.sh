#!/usr/bin/env sh
set -eu

echo "[start] node=$(node -v) cwd=$(pwd)"
echo "[start] DATABASE_URL set: $([ -n "${DATABASE_URL:-}" ] && echo yes || echo no)"
echo "[start] REDIS_URL set: $([ -n "${REDIS_URL:-}" ] && echo yes || echo no)"
echo "[start] REDISHOST set: $([ -n "${REDISHOST:-}" ] && echo yes || echo no)"

if [ ! -f apps/api/dist/main.js ]; then
  echo "[start] ERROR: apps/api/dist/main.js missing — build phase did not produce the API bundle"
  ls -la apps/api || true
  exit 1
fi

cd apps/api

echo "[start] prisma migrate deploy"
if command -v pnpm >/dev/null 2>&1; then
  pnpm exec prisma migrate deploy
else
  npx prisma migrate deploy
fi

echo "[start] launching API on HOST=${HOST:-0.0.0.0} PORT=${PORT:-3000}"
export HOST="${HOST:-0.0.0.0}"
exec node dist/main.js

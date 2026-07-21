#!/usr/bin/env sh
set -eu

echo "[start] node=$(node -v) cwd=$(pwd)"

# Prefer Railway private networking when available.
if [ -n "${DATABASE_PRIVATE_URL:-}" ]; then
  export DATABASE_URL="$DATABASE_PRIVATE_URL"
  echo "[start] using DATABASE_PRIVATE_URL"
fi
if [ -n "${REDIS_PRIVATE_URL:-}" ]; then
  export REDIS_URL="$REDIS_PRIVATE_URL"
  echo "[start] using REDIS_PRIVATE_URL"
fi

echo "[start] DATABASE_URL set: $([ -n "${DATABASE_URL:-}" ] && echo yes || echo no)"
echo "[start] REDIS_URL set: $([ -n "${REDIS_URL:-}" ] && echo yes || echo no)"
echo "[start] PORT=${PORT:-unset} HOST=${HOST:-0.0.0.0}"

if [ ! -f apps/api/dist/main.js ]; then
  echo "[start] ERROR: apps/api/dist/main.js missing"
  find apps/api -maxdepth 3 -type f -name '*.js' 2>/dev/null | head -50 || true
  exit 1
fi

export HOST="${HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"

cd apps/api

echo "[start] prisma migrate deploy"
# Use the local prisma binary (no pnpm required at runtime).
if [ -x "./node_modules/.bin/prisma" ]; then
  ./node_modules/.bin/prisma migrate deploy
elif [ -x "../../node_modules/.bin/prisma" ]; then
  ../../node_modules/.bin/prisma migrate deploy
else
  npx prisma migrate deploy
fi

echo "[start] launching node dist/main.js"
exec node dist/main.js

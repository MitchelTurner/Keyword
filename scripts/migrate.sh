#!/usr/bin/env sh
set -eu
cd apps/api
if command -v pnpm >/dev/null 2>&1; then
  pnpm exec prisma migrate deploy
else
  npx prisma migrate deploy
fi

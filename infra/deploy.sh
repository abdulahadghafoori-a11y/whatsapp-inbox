#!/usr/bin/env bash
# Simple deploy script for the single-instance Hetzner box.
# Usage: run on the server inside the repo root.
set -euo pipefail

cd "$(dirname "$0")/../backend"

echo "==> Pulling latest"
git -C .. pull --ff-only

echo "==> Capturing rollback point"
git -C .. rev-parse HEAD > .deploy-prev-sha || true

echo "==> Installing deps"
npm ci

echo "==> Typecheck + tests (deploy gate)"
npm run typecheck
npm test

echo "==> Building"
npm run build

echo "==> Running migrations"
npm run db:migrate

echo "==> Reloading PM2"
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs

echo "==> Smoke test (/health/ready)"
PORT="${PORT:-3001}"
ok=0
for i in $(seq 1 10); do
  if curl -fsS "http://localhost:${PORT}/health/ready" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  echo "!! Smoke test failed: /health/ready not green. Consider infra/rollback.sh"
  pm2 status
  exit 1
fi

echo "==> Done"
pm2 status

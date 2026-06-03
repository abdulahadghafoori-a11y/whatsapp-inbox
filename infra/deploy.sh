#!/usr/bin/env bash
# Simple deploy script for the single-instance Hetzner box.
# Usage: run on the server inside the repo root.
set -euo pipefail

cd "$(dirname "$0")/../backend"

echo "==> Pulling latest"
git -C .. pull --ff-only

echo "==> Installing deps"
npm ci

echo "==> Building"
npm run build

echo "==> Running migrations"
npm run db:migrate

echo "==> Reloading PM2"
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs

echo "==> Done"
pm2 status

#!/usr/bin/env bash
# Roll the backend back to a previous commit and reload PM2.
# Usage:
#   infra/rollback.sh            # roll back to the SHA captured by the last deploy
#   infra/rollback.sh <git-sha>  # roll back to a specific commit
#
# NOTE: This reverts code only. It does NOT undo database migrations. Write
# migrations to be backward compatible (expand/contract) so the previous release
# can run against the migrated schema. For destructive schema changes, restore
# the database from a Neon point-in-time backup (see infra/RUNBOOK.md).
set -euo pipefail

cd "$(dirname "$0")/../backend"

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  if [ -f .deploy-prev-sha ]; then
    TARGET="$(cat .deploy-prev-sha)"
  else
    echo "No target SHA given and no .deploy-prev-sha found." >&2
    exit 1
  fi
fi

echo "==> Rolling back to ${TARGET}"
git -C .. fetch --all --tags
git -C .. checkout "$TARGET"

echo "==> Installing deps"
npm ci

echo "==> Building"
npm run build

echo "==> Reloading PM2"
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs

echo "==> Smoke test (/health/ready)"
PORT="${PORT:-3001}"
for i in $(seq 1 10); do
  if curl -fsS "http://localhost:${PORT}/health/ready" >/dev/null 2>&1; then
    echo "==> Rollback healthy"
    pm2 status
    exit 0
  fi
  sleep 2
done
echo "!! Rollback smoke test failed; investigate manually." >&2
pm2 status
exit 1

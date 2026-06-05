#!/bin/sh
# Run pending DB migrations before starting the app so container deploys match
# the PM2 deploy path (infra/deploy.sh). Set RUN_MIGRATIONS=false to skip (e.g.
# when migrations are run by a separate init job).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> Running migrations"
  npm run db:migrate
fi

exec "$@"

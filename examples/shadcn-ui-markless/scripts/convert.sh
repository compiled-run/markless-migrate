#!/usr/bin/env bash
# Converts the old site (deploy/shadcn-ui: fetch-old.sh, then serve-old.sh on :4000) into this app with markless-migrate:
# plan, usage, convert, cache apply. ONLY=<file of routes> converts those routes; FALLTHROUGH=<old deployment> sends every
# other page there (a preview).
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$APP/../.."
OLD="${OLD:-http://localhost:4000}"
SOURCE="$ROOT/deploy/shadcn-ui/old/apps/v4"
cd "$APP"
[ -f .migrate/inventory.json ] || node "$ROOT/src/cli.ts" plan --old "$OLD" --source "$SOURCE" --limit 5000
[ -f .migrate/usage.json ] || node "$ROOT/src/cli.ts" usage --old "$OLD" --source "$SOURCE"
node "$ROOT/src/cli.ts" convert --old "$OLD" --source "$SOURCE" ${ONLY:+--only "$ONLY"} ${FALLTHROUGH:+--fallthrough "$FALLTHROUGH"}
[ -f .migrate/caching.json ] || node "$ROOT/src/cli.ts" cache plan --old "$OLD"
node "$ROOT/src/cli.ts" cache apply

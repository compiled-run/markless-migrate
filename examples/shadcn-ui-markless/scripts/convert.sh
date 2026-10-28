#!/usr/bin/env bash
# Converts the old site (deploy/shadcn-ui: fetch-old.sh, then serve-old.sh on :4000) into this app with markless-migrate:
# plan, usage, convert, cache apply. ONLY=<file of routes> converts those routes; FALLTHROUGH=<old deployment> sends every
# other page there (a preview); CONCURRENCY=<n> pages at once; PLAN_ONLY=1 stops after plan and usage, CAPTURE_ONLY=1
# after the captures (the convert workflow's prepare and shard jobs).
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$APP/../.."
OLD="${OLD:-http://localhost:4000}"
SOURCE="$ROOT/deploy/shadcn-ui/old/apps/v4"
cd "$APP"
[ -f .migrate/inventory.json ] || node "$ROOT/src/cli.ts" plan --old "$OLD" --source "$SOURCE" --limit 5000
[ -f .migrate/usage.json ] || node "$ROOT/src/cli.ts" usage --old "$OLD" --source "$SOURCE"
[ -z "${PLAN_ONLY:-}" ] || exit 0
node "$ROOT/src/cli.ts" convert --old "$OLD" --source "$SOURCE" ${ONLY:+--only "$ONLY"} ${FALLTHROUGH:+--fallthrough "$FALLTHROUGH"} ${CAPTURE_ONLY:+--capture-only} ${CONCURRENCY:+--concurrency "$CONCURRENCY"}
[ -z "${CAPTURE_ONLY:-}" ] || exit 0
[ -f .migrate/caching.json ] || node "$ROOT/src/cli.ts" cache plan --old "$OLD"
# cache apply reads the installed @markless/router; before the install (the convert workflow's emit) it is left to the build.
if [ -d node_modules/@markless/router ]; then node "$ROOT/src/cli.ts" cache apply --prerender; else echo 'cache apply: skipped until the dependencies are installed (the deploy script and the workflow build run it)' >&2; fi

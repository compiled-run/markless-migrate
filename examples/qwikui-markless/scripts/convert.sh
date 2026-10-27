#!/usr/bin/env bash
# Converts the old site (deploy/qwikui: fetch-old.sh, then serve-old.mjs on :4610) into this app with markless-migrate:
# plan, usage, convert, cache apply. ONLY=<file of routes> converts those routes; CONCURRENCY=<n> pages at once;
# PLAN_ONLY=1 stops after plan and usage, CAPTURE_ONLY=1 after the captures (the convert workflow's prepare and shard jobs).
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$APP/../.."
# On a CI runner the old site is served where check.yml looks for it (deploy/qwikui/ci-serve.sh).
if [ -n "${CI:-}" ]; then OLD="${OLD:-http://localhost:4000}"; else OLD="${OLD:-http://127.0.0.1:4610}"; fi
SOURCE="$ROOT/deploy/qwikui/old/apps/website"
cd "$APP"
[ -f .migrate/inventory.json ] || node "$ROOT/src/cli.ts" plan --old "$OLD" --source "$SOURCE" --limit 500
[ -f .migrate/usage.json ] || node "$ROOT/src/cli.ts" usage --old "$OLD" --source "$SOURCE"
[ -z "${PLAN_ONLY:-}" ] || exit 0
node "$ROOT/src/cli.ts" convert --old "$OLD" --source "$SOURCE" ${ONLY:+--only "$ONLY"} ${CAPTURE_ONLY:+--capture-only} ${CONCURRENCY:+--concurrency "$CONCURRENCY"}
[ -z "${CAPTURE_ONLY:-}" ] || exit 0
[ -f .migrate/caching.json ] || node "$ROOT/src/cli.ts" cache plan --old "$OLD"
node "$ROOT/src/cli.ts" cache apply --prerender

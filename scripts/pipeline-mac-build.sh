#!/usr/bin/env bash
# The pipeline's build on this Mac, for a port too big for a 16 GB runner: pipeline-mac-build.sh <pipeline run id> [<markless ref>]
# takes that run's converted app, builds it through ~/.claude/bin/heavy against Markless at the ref (main by default), puts
# the output on a <site>-build-<key> release, and runs the pipeline again with build-url set. Its plan, recordings and emit are
# read back by key, so the second run starts at the check. Set SITE, APP_REL, PRESET (vercel), APP_URL and PRIORITY (deploy) as the first run had them.
set -euo pipefail
RUN="${1:?usage: pipeline-mac-build.sh <pipeline run id> [<markless ref>]}"
REF="${2:-main}"
REPO=compiled-run/markless-migrate
HEAVY="${HEAVY:-$HOME/.claude/bin/heavy}"
WORK="${WORK:-/private/tmp/pipeline-mac-build-$RUN}"
SHA=$(gh api "repos/$REPO/actions/runs/$RUN" --jq .head_sha)
SITE="${SITE:-shadcn-ui}"
APP_REL="${APP_REL:-examples/shadcn-ui-markless}"
mkdir -p "$WORK"
[ -d "$WORK/migrate" ] || git -C "$(dirname "$0")/.." worktree add --detach "$WORK/migrate" "$SHA"
[ -d "$WORK/markless" ] || git clone -q --filter=blob:none https://github.com/compiled-run/markless "$WORK/markless"
git -C "$WORK/markless" fetch -q origin "$REF" && git -C "$WORK/markless" checkout -q --detach FETCH_HEAD
APP="$WORK/migrate/$APP_REL"
gh run download "$RUN" -R "$REPO" -p "pl-$SITE-converted-*" -D "$WORK/converted"
tar -xzf "$(find "$WORK/converted" -name app.tar.gz | head -n 1)" -C "$APP"
# Released as <site>-build-<key>, the content key of what is built (scripts/pipeline.ts), which check.yml's default build reads.
key=$(cd "$WORK/migrate" && node scripts/pipeline.ts key build "$SITE" "$APP_REL" markless="$(git -C "$WORK/markless" rev-parse HEAD)" preset="${PRESET:-vercel}" app-url="${APP_URL:-}" node="$(node -v)")
(cd "$WORK/migrate" && "$HEAVY" pnpm install --frozen-lockfile)
(cd "$APP" && MARKLESS="$WORK/markless" HEAVY_GB=10 "$HEAVY" bash scripts/link-markless.sh)
(cd "$APP" && node "$WORK/migrate/src/cli.ts" cache apply --prerender)
# One compile worker by default: each holds 1 to 1.5 GB through chunk rendering, and the client build alone peaks at 22 to 24 GB.
(cd "$APP" && HEAVY_GB="${HEAVY_GB:-26}" MARKLESS_COMPILE_WORKERS="${MARKLESS_COMPILE_WORKERS:-1}" NITRO_PRESET="${PRESET:-vercel}" VITE_APP_URL="${APP_URL:-}" NODE_OPTIONS=--max-old-space-size=20000 "$HEAVY" npm run build)
if [ -n "${APP_URL:-}" ] && grep -rlq --include='*.html' 'chat/api/open?url=/' "$APP/.vercel/output" "$APP/.output/public" 2>/dev/null; then echo 'FAIL: pages link v0 to a hostless URL' >&2; exit 1; fi
if [ -d "$APP/.vercel/output" ]; then tar -czf "$WORK/output.tar.gz" -C "$APP" .vercel/output .migrate/caching.json; else tar -czf "$WORK/output.tar.gz" -C "$APP" .output .migrate/caching.json; fi
TAG="$SITE-$([ "${PRESET:-vercel}" = cloudflare-module ] && echo cf-)build-$key"
asset="$SITE-output.tar.gz"
cp "$WORK/output.tar.gz" "$WORK/$asset"
gh release view "$TAG" -R "$REPO" > /dev/null 2>&1 || gh release create "$TAG" -R "$REPO" --prerelease --title "$SITE build $key (pipeline run $RUN, built on the Mac)" --notes "Converted app of pipeline run $RUN, Markless $(git -C "$WORK/markless" rev-parse --short=9 HEAD), preset ${PRESET:-vercel}."
gh release upload "$TAG" "$WORK/$asset" -R "$REPO" --clobber
URL="https://github.com/$REPO/releases/download/$TAG/$asset"
echo "build: $URL"
gh workflow run pipeline.yml -R "$REPO" --ref "$(gh api "repos/$REPO/actions/runs/$RUN" --jq .head_branch)" -f site="$SITE" -f app="$APP_REL" -f markless="$REF" -f build-url="$URL" -f preset="${PRESET:-vercel}" -f app-url="${APP_URL:-}" ${PRIORITY:+-f "priority=$PRIORITY"}

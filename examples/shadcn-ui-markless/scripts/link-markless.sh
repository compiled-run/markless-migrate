#!/usr/bin/env bash
# Links this app against a local build of Markless main until a release carries the fixes it needs (54263729 render data
# for addressed elements only, 268501cd template content, 5021709d attach imports, 859663a3 static @if arms).
# MARKLESS=<checkout of compiled-run/markless at main>. The packed tarballs go in .markless-local/ (gitignored) and every
# @markless/* package resolves to them through npm overrides; run it again after pulling main. Drop it at the next release.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKLESS="${MARKLESS:?set MARKLESS to a Markless checkout}"
OUT="$APP/.markless-local"
(cd "$MARKLESS" && pnpm install --frozen-lockfile && pnpm run build)
rm -rf "$OUT" && mkdir -p "$OUT"
for p in core router runtime compiler bundler serializer web analyzer typescript-plugin; do (cd "$MARKLESS/packages/$p" && pnpm pack --pack-destination "$OUT" > /dev/null); done
node "$APP/scripts/link-markless.mjs" "$APP" "$OUT"
(cd "$APP" && rm -rf node_modules/@markless && npm install --no-audit --no-fund)

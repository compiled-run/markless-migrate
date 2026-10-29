#!/usr/bin/env bash
# Builds the old site, vitejs/vite's VitePress docs (MIT), at the commit this migration was made against, with production's two
# Netlify variables (without them the footer reads "(dev)"), into old/public, and writes old/vercel.json from its _redirects and _headers.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT=df7503cc499e0b49e45701e3be7546918ee9d322
SRC="${VITE_SRC:-${RUNNER_TEMP:-/tmp}/vite}"
[ -d "$SRC/.git" ] || git init --quiet "$SRC"
git -C "$SRC" fetch --quiet --depth 1 https://github.com/vitejs/vite.git "$COMMIT" && git -C "$SRC" checkout --quiet "$COMMIT"
(cd "$SRC" && pnpm install --frozen-lockfile && pnpm --filter vite run build && DEPLOY_PRIME_URL=https://vite.dev COMMIT_REF=b6c20f6a pnpm docs-build)
rm -rf "$DIR/old/public" && cp -R "$SRC/docs/.vitepress/dist" "$DIR/old/public"
node "$DIR/old/vercel-config.mjs" "$DIR/old/public"
rm -f "$DIR/old/public/_redirects" "$DIR/old/public/_headers"

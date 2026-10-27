#!/usr/bin/env bash
# Fetches the old site, qwikifiers/qwik-ui (MIT) apps/website, the source of qwikui.com, at the commit this migration was made
# against, and builds it as qwikui.com is deployed: Qwik City's static adapter (`nx run website:build:production`), 55 pages
# in dist/apps/website/client. That commit pins Qwik 1.17.0, the version qwikui.com serves.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT=bea80eb1dc2857fc7a76d1291915c507de1f7361
OLD="$DIR/old"
[ -d "$OLD/.git" ] || git clone --quiet --filter=blob:none https://github.com/qwikifiers/qwik-ui.git "$OLD"
git -C "$OLD" fetch --quiet origin "$COMMIT" && git -C "$OLD" checkout --quiet "$COMMIT"
# The repository's pre-commit hook setup is the upstream's own; nothing here commits to it.
(cd "$OLD" && SKIP_SIMPLE_GIT_HOOKS=1 npx --yes pnpm@10.15.0 install --frozen-lockfile && NX_DAEMON=false npx nx run website:build:production --skip-nx-cache)
test -f "$OLD/dist/apps/website/client/docs/styled/tabs/index.html"

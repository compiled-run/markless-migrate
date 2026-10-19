#!/usr/bin/env bash
# Fetches the old site, shadcn-ui/ui (MIT) apps/v4, the source of ui.shadcn.com, at the commit this migration was made
# against, and builds it with the registry. ORIGIN is the address the build embeds in the registry and the docs
# (NEXT_PUBLIC_APP_URL): http://localhost:4000 to check locally, the deployment's URL to deploy.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT=ba1503c64472b82256d9de95e2e62c5901a38e8b
ORIGIN="${ORIGIN:-http://localhost:4000}"
[ -d "$DIR/old/.git" ] || git clone --quiet https://github.com/shadcn-ui/ui.git "$DIR/old"
git -C "$DIR/old" fetch --quiet --depth 1 origin "$COMMIT" && git -C "$DIR/old" checkout --quiet "$COMMIT"
printf 'NEXT_PUBLIC_V0_URL=https://v0.dev\nNEXT_PUBLIC_APP_URL=%s\n' "$ORIGIN" > "$DIR/old/apps/v4/.env.local"
(cd "$DIR/old" && pnpm install --frozen-lockfile && pnpm --filter=v4 build)

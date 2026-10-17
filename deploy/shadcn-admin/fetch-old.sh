#!/usr/bin/env bash
# Fetches the old app, satnaing/shadcn-admin (MIT), at the commit this migration was made against, and builds it.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT=e16c87f213a5ba5e45964e9b67c792105ec74d26
[ -d "$DIR/old/.git" ] || git clone --quiet https://github.com/satnaing/shadcn-admin.git "$DIR/old"
git -C "$DIR/old" fetch --quiet --depth 1 origin "$COMMIT" && git -C "$DIR/old" checkout --quiet "$COMMIT"
(cd "$DIR/old" && pnpm install --ignore-workspace --frozen-lockfile && ./node_modules/.bin/vite build)

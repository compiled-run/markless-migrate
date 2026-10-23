#!/usr/bin/env bash
# Serves the old site's production build (fetch-old.sh) on http://localhost:4000, as `next start` does.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/old/apps/v4" && exec ./node_modules/.bin/next start --port "${PORT:-4000}"

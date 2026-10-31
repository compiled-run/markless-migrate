#!/usr/bin/env bash
# Serves the old site's production build (fetch-old.sh) on http://localhost:4000, as `next start` does. With OLD_WORKERS=n
# (n > 1), n copies of `next start` answer on the next n ports, each request to the next copy in turn (round-robin.ts).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-4000}"
WORKERS="${OLD_WORKERS:-1}"
cd "$DIR/old/apps/v4"
# A build made before freeze-old.mjs existed is frozen here; a page rendered on request reads the same fixtures as the build.
node "$DIR/freeze-old.mjs" .
export NODE_OPTIONS="--import $DIR/old-fixtures.mjs${NODE_OPTIONS:+ $NODE_OPTIONS}"
if [ "$WORKERS" -le 1 ]; then exec ./node_modules/.bin/next start --port "$PORT"; fi
origins=()
for i in $(seq 1 "$WORKERS"); do
	./node_modules/.bin/next start --port $((PORT + i)) &
	origins+=("http://127.0.0.1:$((PORT + i))")
done
for o in "${origins[@]}"; do for _ in $(seq 1 240); do curl -s -o /dev/null "$o/" && break; sleep 0.5; done; done
exec node "$DIR/round-robin.ts" "$PORT" "${origins[@]}"

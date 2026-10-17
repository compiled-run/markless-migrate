#!/usr/bin/env bash
# Local servers for the Remix notes migration: deploy/remix-notes/local.sh reset|old|new|stop
# Each app has its own copy of the seeded SQLite file, so one app's journeys never write to the other's pages.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
DATA="$HOME/.mm-pg/remix-notes"
NEW="$ROOT/examples/remix-notes-markless"
export NODE_ENV=production SESSION_SECRET=super-duper-s3cret
export NODE_OPTIONS="--import=file://$ROOT/src/check/record-server.mjs"
stop() { [ -f "$DATA/$1.pid" ] && kill -9 "$(cat "$DATA/$1.pid")" 2>/dev/null || true; rm -f "$DATA/$1.pid"; sleep 0.3; }
wait_for() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
case "${1:-}" in
	reset) cp "$DATA/seed.db" "$DIR/old-app/prisma/data.db"; cp "$DATA/seed.db" "$NEW/data/notes.db" ;;
	old) stop old; (cd "$DIR/old-app"; DATABASE_URL="file:./data.db?connection_limit=1" PORT=47320 nohup node node_modules/@remix-run/serve/dist/cli.js ./build/index.js > "$DATA/old.log" 2>&1 & echo $! > "$DATA/old.pid"); wait_for http://localhost:47320/ ;;
	new) stop new; (cd "$NEW"; DATABASE_PATH="$NEW/data/notes.db" PORT=47330 nohup node .output/server/index.mjs > "$DATA/new.log" 2>&1 & echo $! > "$DATA/new.pid"); wait_for http://localhost:47330/ ;;
	stop) stop old; stop new ;;
	*) echo "usage: $0 reset|old|new|stop" >&2; exit 1 ;;
esac

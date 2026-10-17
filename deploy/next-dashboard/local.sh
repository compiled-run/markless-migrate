#!/usr/bin/env bash
# Local servers for the Next dashboard migration: deploy/next-dashboard/local.sh db|reset|old|new|stop
# Each app has its own copy of the seeded database, so writes one app's journeys make never reach the other's pages.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
PG=/opt/homebrew/opt/postgresql@17/bin
DATA="$HOME/.mm-pg/next-dashboard"
export POSTGRES_URL=postgres://postgres:postgres@localhost:55432/dashboard
export AUTH_SECRET=local-dev-secret-for-markless-migrate-0123456789
export AUTH_TRUST_HOST=true
export NODE_OPTIONS="--import=file://$ROOT/src/check/record-server.mjs"
stop() { [ -f "$DATA/$1.pid" ] && kill "$(cat "$DATA/$1.pid")" 2>/dev/null || true; rm -f "$DATA/$1.pid"; }
wait_for() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
case "${1:-}" in
	db) "$PG/pg_ctl" -D "$DATA/data" -l "$DATA/log.txt" status >/dev/null || "$PG/pg_ctl" -D "$DATA/data" -l "$DATA/log.txt" start ;;
	reset) for db in dashboard dashboard_new; do "$PG/pg_restore" -h localhost -p 55432 -U postgres -d $db --clean --if-exists "$DATA/seed.dump"; done ;;
	old) stop old; (cd "$DIR/old-app"; nohup node node_modules/next/dist/bin/next start -p 3100 > "$DATA/old.log" 2>&1 & echo $! > "$DATA/old.pid"); wait_for http://localhost:3100/ ;;
	new) stop new; (cd "$ROOT/examples/next-dashboard-markless"; POSTGRES_URL=${POSTGRES_URL}_new PORT=47310 nohup node .output/server/index.mjs > "$DATA/new.log" 2>&1 & echo $! > "$DATA/new.pid"); wait_for http://localhost:47310/ ;;
	stop) stop old; stop new ;;
	*) echo "usage: $0 db|reset|old|new|stop" >&2; exit 1 ;;
esac

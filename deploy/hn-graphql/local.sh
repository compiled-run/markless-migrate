#!/usr/bin/env bash
# (Re)starts the snapshot API, the old app, the new app's backend and the new app, each fresh, all with the request recorder: deploy/hn-graphql/local.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MM="${MM:-$DIR/../..}"
NEW="$DIR/../../examples/hn-graphql-markless"
API=${API_PORT:-4870} OLD=${OLD_PORT:-4871} NEWP=${NEW_PORT:-4872} BACKEND=${BACKEND_PORT:-4874}
RECORDER="$(node "$MM/src/cli.ts" recorder | sed -n "s/^ *export NODE_OPTIONS='\(.*\)'$/\1/p")"
for port in $API $OLD $NEWP $BACKEND; do lsof -tiTCP:$port -sTCP:LISTEN | xargs kill 2>/dev/null || true; done
sleep 0.5
nohup node "$DIR/hn-api.mjs" "$API" > /tmp/hn-graphql-api.log 2>&1 &
NODE_OPTIONS="$RECORDER" DB_URI="http://127.0.0.1:$API" nohup "$DIR/old.sh" "$OLD" > /tmp/hn-graphql-old.log 2>&1 &
DB_URI="http://127.0.0.1:$API" nohup "$DIR/old.sh" "$BACKEND" > /tmp/hn-graphql-backend.log 2>&1 &
(cd "$NEW" && PORT=$NEWP HOST=127.0.0.1 HN_GRAPHQL_BACKEND="http://127.0.0.1:$BACKEND" NODE_OPTIONS="$RECORDER" nohup node .output/server/index.mjs > /tmp/hn-graphql-new.log 2>&1 &)
for port in $API $OLD $BACKEND $NEWP; do for _ in $(seq 60); do curl -s -m 5 -o /dev/null "http://127.0.0.1:$port/" && break; sleep 0.5; done; done
echo "snapshot $(node -p "JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync('$DIR/hn-snapshot.json.gz'))).at"): api :$API, old :$OLD, backend :$BACKEND, new :$NEWP"

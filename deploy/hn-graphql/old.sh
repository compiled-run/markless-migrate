#!/usr/bin/env bash
# Runs the unchanged old app on Node 16 against the HN snapshot: deploy/hn-graphql/old.sh [port]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLD="${OLD_APP:-$DIR/../../../mm-upstreams/hackernews-react-graphql}"
cd "$OLD"
NODE_ENV=production DB_URI="${DB_URI:-http://127.0.0.1:4870}" APP_PORT="${1:-4871}" \
	NODE_OPTIONS="${NODE_OPTIONS:-} -r $DIR/firebase-rest.cjs" \
	exec fnm exec --using=16 node dist/server/server.js

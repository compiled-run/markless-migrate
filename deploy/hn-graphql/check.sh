#!/usr/bin/env bash
# Fresh apps, a fresh account on each, then plan and check every route: deploy/hn-graphql/check.sh [check options...]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MM="${MM:-$DIR/../..}"
NEW="$DIR/../../examples/hn-graphql-markless"
OLD_SRC="${OLD_APP:-$DIR/../../../mm-upstreams/hackernews-react-graphql}"
OLD=http://127.0.0.1:${OLD_PORT:-4871} NEWO=http://127.0.0.1:${NEW_PORT:-4872}
AT="$(node -p "JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync('$DIR/hn-snapshot.json.gz'))).at")"
MM="$MM" "$DIR/local.sh"
cd "$NEW"
mkdir -p .migrate
cp "$DIR/auth.json" .migrate/auth.json
node "$DIR/signin.mjs" "$OLD" "$NEWO" .migrate/auth
[ -f .migrate/inventory.json ] && [ -z "${REPLAN:-}" ] || node "$MM/src/cli.ts" plan --old "$OLD" --source "$OLD_SRC"
exec node "$MM/src/cli.ts" check --old "$OLD" --new "$NEWO" --source "$OLD_SRC" --new-source . --time "$AT" --server-clock --auth .migrate/auth.json "$@"

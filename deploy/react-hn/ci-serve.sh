#!/usr/bin/env bash
# Serves one side of the react-hn check on a CI runner:
#   ci-serve.sh old          builds insin/react-hn at its pinned commit with Node 10 and serves dist/ on http://localhost:4000
#   ci-serve.sh new source   builds examples/react-hn-markless from this checkout and serves it, with the request recorder, on http://127.0.0.1:3000
# Both also copy the recorded data (deploy/react-hn/data) where check --data replay reads it.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/react-hn-markless"
COMMIT=7c5a7802109b1d2bae5c8493dd1fecf5bfe823a9
NODE10=v10.24.1
wait_for() { for _ in $(seq 1 240); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
mkdir -p "$APP/.migrate/data" && cp "$DIR"/data/*.json "$APP/.migrate/data/"
case "${1:-}" in
	old)
		{
			curl -fsSL "https://nodejs.org/dist/$NODE10/node-$NODE10-linux-x64.tar.xz" | tar -xJ -C "$RUNNER_TEMP"
			export PATH="$RUNNER_TEMP/node-$NODE10-linux-x64/bin:$PATH"
			git clone -q https://github.com/insin/react-hn "$RUNNER_TEMP/react-hn"
			cd "$RUNNER_TEMP/react-hn" && git checkout -q "$COMMIT"
			cp "$DIR/old-package-lock.json" package-lock.json
			npm ci --no-audit --no-fund && npm run build
		} > "$RUNNER_TEMP/old-build.log" 2>&1 || { tail -n 60 "$RUNNER_TEMP/old-build.log"; exit 1; }
		(cd "$RUNNER_TEMP/react-hn/dist" && nohup python3 -m http.server 4000 --bind 127.0.0.1 > "$RUNNER_TEMP/old-serve.log" 2>&1 &)
		wait_for http://localhost:4000/
		;;
	new)
		(cd "$APP" && npm ci --no-audit --no-fund && npm run build) > "$RUNNER_TEMP/new-build.log" 2>&1 || { tail -n 60 "$RUNNER_TEMP/new-build.log"; exit 1; }
		(cd "$APP" && NODE_OPTIONS="--require $(cd "$ROOT" && pwd)/src/check/record-server.cjs" PORT=3000 HOST=127.0.0.1 nohup node .output/server/index.mjs > "$RUNNER_TEMP/new-serve.log" 2>&1 &)
		wait_for http://127.0.0.1:3000/
		;;
	*) echo "usage: $0 old | new source" >&2; exit 1 ;;
esac

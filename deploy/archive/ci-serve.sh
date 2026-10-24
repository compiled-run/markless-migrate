#!/usr/bin/env bash
# Serves a check's side on a runner from a build archive, never a deployment:
#   ci-serve.sh static <url> <port>           a static build (dist/ or build/) with clean URLs
#   ci-serve.sh mirror <url> <origin> <port>  a read-only caching mirror's cache of <origin>
#   ci-serve.sh node <url> <port>             a Markless app's .output (node-server preset)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wait_for() { for _ in $(seq 1 240); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
kind=$1; url=$2
dest="$RUNNER_TEMP/$kind-$RANDOM"
mkdir -p "$dest"
curl -fsSL "$url" | tar -xz -C "$dest"
case "$kind" in
	static) port=$3; root=$(find "$dest" -mindepth 1 -maxdepth 1 -type d | head -1); nohup node "$DIR/static-serve.mjs" "$root" "$port" > "$RUNNER_TEMP/static-$port.log" 2>&1 & ;;
	mirror) port=$4; root=$(find "$dest" -mindepth 1 -maxdepth 1 -type d | head -1); nohup node "$DIR/../htmx-org/mirror.ts" "$3" "$port" "$root" > "$RUNNER_TEMP/mirror-$port.log" 2>&1 & ;;
	node) port=$3; (cd "$dest" && PORT=$port HOST=127.0.0.1 nohup node .output/server/index.mjs > "$RUNNER_TEMP/node-$port.log" 2>&1 &) ;;
	*) echo "usage: $0 static|mirror|node <url> ..." >&2; exit 1 ;;
esac
wait_for "http://127.0.0.1:$port/"

#!/usr/bin/env bash
# Restarts the Markless app's production server on 127.0.0.1:${PORT:-4472} after a build.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../examples/shadcn-admin-markless" && pwd)"
PORT="${PORT:-4472}"
for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do kill "$pid"; done
sleep 0.3
cd "$APP" && PORT="$PORT" HOST=127.0.0.1 nohup node .output/server/index.mjs > /tmp/shadcn-admin-new.log 2>&1 &
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && exit 0; sleep 0.1; done
echo "new app did not start; see /tmp/shadcn-admin-new.log" >&2; exit 1

#!/usr/bin/env bash
# Serves one side of the qwikui.com check on a CI runner, never a deployment:
#   ci-serve.sh old          builds the old site (fetch-old.sh) and serves it on http://localhost:4000 (serve-old.mjs), the old origin check.yml names
#   ci-serve.sh new <url>    serves a built port (a .tar.gz of the app's .output, node-server preset) on http://127.0.0.1:3000
# Both start in the background and return once the site answers.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="${RUNNER_TEMP:-/tmp}"
wait_for() { for _ in $(seq 1 240); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
case "${1:-}" in
	old)
		# A build restored from an earlier job (the workflows cache deploy/qwikui/old) is served as it is, so every shard serves
		# the same build and the old side's cached captures stay valid between runs.
		built="$(sha256sum "$DIR/fetch-old.sh" | cut -d' ' -f1)"
		if [ "$(cat "$DIR/old/.ci-built" 2>/dev/null)" != "$built" ]; then
			"$DIR/fetch-old.sh" > "$LOGS/old-build.log" 2>&1 || { tail -n 60 "$LOGS/old-build.log"; exit 1; }
			echo "$built" > "$DIR/old/.ci-built"
			# Serving needs only the static build and the source --source reads: the dependencies stay out of the workflows' cache.
			rm -rf "$DIR/old/node_modules" "$DIR"/old/*/*/node_modules "$DIR/old/.nx"
		fi
		HOST=:: nohup node "$DIR/serve-old.mjs" 4000 > "$LOGS/old-serve.log" 2>&1 &
		wait_for http://localhost:4000/
		for path in / /docs/styled/tabs/ /docs/headless/select/; do curl -s -o /dev/null -w "old $path: %{http_code} in %{time_total} s\n" "http://localhost:4000$path"; done
		;;
	new)
		dest="$LOGS/new"
		mkdir -p "$dest"
		curl -fsSL "${2:?usage: ci-serve.sh new URL}" | tar -xz -C "$dest"
		(cd "$dest" && PORT=3000 HOST=127.0.0.1 nohup node .output/server/index.mjs > "$LOGS/new-serve.log" 2>&1 &)
		wait_for http://127.0.0.1:3000/
		;;
	*) echo "usage: $0 old | new <url of the built port's .tar.gz>" >&2; exit 1 ;;
esac

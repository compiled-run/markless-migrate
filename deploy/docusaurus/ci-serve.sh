#!/usr/bin/env bash
# Serves one side of the docusaurus.io check on a CI runner, never a deployment:
#   ci-serve.sh old         the old site's build (fetch-old.sh), routed as its Vercel deployment was, on http://localhost:4000
#   ci-serve.sh new <url>   a built port (a .tar.gz of examples/docusaurus-markless/.vercel/output) on http://127.0.0.1:3000
# The port's 484-page build needs about 30 GB of heap, more than a runner has, so it is built elsewhere and passed by URL.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
wait_for() { for _ in $(seq 1 240); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
case "${1:-}" in
	old)
		built="$(sha256sum "$DIR/fetch-old.sh" | cut -d' ' -f1)"
		if [ "$(cat "$DIR/old/.ci-built" 2>/dev/null)" != "$built" ]; then
			"$DIR/fetch-old.sh"
			echo "$built" > "$DIR/old/.ci-built"
		fi
		nohup node "$DIR/serve-old.mjs" 4000 > "$RUNNER_TEMP/old-serve.log" 2>&1 &
		wait_for http://localhost:4000/
		for path in / /docs /docs/installation; do curl -s -o /dev/null -w "old $path: %{http_code} in %{time_total} s\n" "http://localhost:4000$path"; done
		;;
	new)
		spec="${2:?usage: ci-serve.sh new <url of the built port's .tar.gz>}"
		dest="$RUNNER_TEMP/new"
		mkdir -p "$dest"
		curl -fsSL "$spec" | tar -xz -C "$dest"
		if [ -d "$dest/.vercel/output" ]; then vercel="$dest/.vercel/output"; else vercel="$dest"; fi
		(cd "$vercel/.." && nohup node "$ROOT/deploy/shadcn-ui/serve-vercel-output.mjs" "$vercel" 3000 > "$RUNNER_TEMP/new-serve.log" 2>&1 &)
		wait_for http://127.0.0.1:3000/
		for path in / /docs /docs/installation; do curl -s -o /dev/null -w "new $path: %{http_code} in %{time_total} s\n" "http://127.0.0.1:3000$path"; done
		;;
	*) echo "usage: $0 old | new <url of the built port's .tar.gz>" >&2; exit 1 ;;
esac

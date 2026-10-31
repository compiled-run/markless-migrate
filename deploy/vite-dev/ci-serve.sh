#!/usr/bin/env bash
# Serves one side of the vite.dev check on a CI runner, never a deployment:
#   ci-serve.sh old                 builds vitejs/vite's docs (fetch-old.sh) and serves them as Vercel did on http://localhost:4000
#   ci-serve.sh new markless@<ref>  builds examples/vite-dev-markless on compiled-run/markless at <ref> (pass a commit, so every shard builds the same)
#   ci-serve.sh new <url>           serves a built port (a .tar.gz of its .vercel/output)
# Both serve on the runner and return once the site answers; the port at http://127.0.0.1:3000.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
APP="$ROOT/examples/vite-dev-markless"
wait_for() { for _ in $(seq 1 240); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
case "${1:-}" in
	old)
		built="$(sha256sum "$DIR/fetch-old.sh" | cut -d' ' -f1)"
		if [ "$(cat "$DIR/old/.ci-built" 2>/dev/null)" != "$built" ]; then
			"$DIR/fetch-old.sh" > "$RUNNER_TEMP/old-build.log" 2>&1 || { tail -n 60 "$RUNNER_TEMP/old-build.log"; exit 1; }
			echo "$built" > "$DIR/old/.ci-built"
		fi
		nohup node "$DIR/serve-old.mjs" 4000 > "$RUNNER_TEMP/old-serve.log" 2>&1 &
		wait_for http://localhost:4000/
		for path in / /guide/ /blog; do curl -s -o /dev/null -w "old $path: %{http_code} in %{time_total} s\n" "http://localhost:4000$path"; done
		;;
	new)
		spec="${2:?usage: ci-serve.sh new markless@<ref> | <url>}"
		# Measurement only: markless@<ref>+<mode> serves the port with MARKLESS_FIRST_CLICK_EXPERIMENT=<mode>.
		if [[ "$spec" == *+* ]]; then export MARKLESS_FIRST_CLICK_EXPERIMENT="${spec##*+}"; spec="${spec%+*}"; fi
		if [[ "$spec" == markless@* ]]; then
			{
				git init --quiet "$RUNNER_TEMP/markless"
				git -C "$RUNNER_TEMP/markless" fetch --quiet --depth 1 https://github.com/compiled-run/markless.git "${spec#markless@}"
				git -C "$RUNNER_TEMP/markless" checkout --quiet FETCH_HEAD
				echo "markless $(git -C "$RUNNER_TEMP/markless" rev-parse HEAD)"
				MARKLESS="$RUNNER_TEMP/markless" bash "$APP/scripts/link-markless.sh"
				cd "$APP" && NITRO_PRESET=vercel npm run build
			} > "$RUNNER_TEMP/new-build.log" 2>&1 || { tail -n 80 "$RUNNER_TEMP/new-build.log"; exit 1; }
			grep '^markless ' "$RUNNER_TEMP/new-build.log"
			vercel="$APP/.vercel/output"
		else
			dest="$RUNNER_TEMP/new"
			mkdir -p "$dest"
			curl -fsSL "$spec" | tar -xz -C "$dest"
			if [ -d "$dest/.vercel/output" ]; then vercel="$dest/.vercel/output"; else vercel="$dest"; fi
		fi
		(cd "$vercel/.." && nohup node "$ROOT/deploy/shadcn-ui/serve-vercel-output.mjs" "$vercel" 3000 > "$RUNNER_TEMP/new-serve.log" 2>&1 &)
		wait_for http://127.0.0.1:3000/
		for path in / /guide/ /blog; do curl -s -o /dev/null -w "new $path: %{http_code} in %{time_total} s\n" "http://127.0.0.1:3000$path"; done
		;;
	*) echo "usage: $0 old | new markless@<ref> | new <url of the built port's .tar.gz>" >&2; exit 1 ;;
esac

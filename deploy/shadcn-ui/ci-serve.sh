#!/usr/bin/env bash
# Serves one side of the ui.shadcn.com check on a CI runner, never a Vercel deployment:
#   ci-serve.sh old          builds the old site (fetch-old.sh) and serves it on http://localhost:4000
#   ci-serve.sh new <url>    serves a built port (a .tar.gz of the app's .output, node-server preset) on http://127.0.0.1:3000
# Both start in the background and return once the site answers.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wait_for() { for _ in $(seq 1 240); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "no answer from $1" >&2; return 1; }
case "${1:-}" in
	old)
		ORIGIN=http://localhost:4000 "$DIR/fetch-old.sh" > "$RUNNER_TEMP/old-build.log" 2>&1 || { tail -n 60 "$RUNNER_TEMP/old-build.log"; exit 1; }
		nohup "$DIR/serve-old.sh" > "$RUNNER_TEMP/old-serve.log" 2>&1 &
		wait_for http://localhost:4000/
		for path in / /blocks /view/new-york-v4/dashboard-01; do curl -s -o /dev/null -w "old $path: %{http_code} in %{time_total} s\n" "http://localhost:4000$path"; done
		;;
	new)
		dest="$RUNNER_TEMP/new"
		mkdir -p "$dest"
		curl -fsSL "${2:?usage: ci-serve.sh new URL}" | tar -xz -C "$dest"
		# A Vercel build (.vercel/output, what the deployment serves) runs through serve-vercel-output.mjs; a node-server build runs itself.
		# The archive holds .vercel/output, or that folder's contents at its root.
		vercel=""
		if [ -d "$dest/.vercel/output" ]; then vercel="$dest/.vercel/output"; elif [ -f "$dest/config.json" ] && [ -d "$dest/functions" ]; then vercel="$dest"; fi
		if [ -n "$vercel" ]; then
			server="$vercel/functions/__server.func"
		else
			server="$dest/.output/server"
		fi
		# Built on macOS: the traced sharp (for @vercel/og) gets its Linux binaries beside the macOS ones.
		if [ -d "$server/node_modules/sharp" ]; then
			version=$(node -p "require('$server/node_modules/sharp/package.json').version")
			libvips=$(node -p "require('$server/node_modules/sharp/package.json').optionalDependencies['@img/sharp-libvips-linux-x64']")
			npm install --prefix "$RUNNER_TEMP/sharp" --no-audit --no-fund "@img/sharp-linux-x64@$version" "@img/sharp-libvips-linux-x64@$libvips" > /dev/null
			cp -R "$RUNNER_TEMP/sharp/node_modules/@img/." "$server/node_modules/@img/"
		fi
		if [ -n "$vercel" ]; then
			(cd "$dest" && nohup node "$DIR/serve-vercel-output.mjs" "$vercel" 3000 > "$RUNNER_TEMP/new-serve.log" 2>&1 &)
		else
			(cd "$dest" && PORT=3000 HOST=127.0.0.1 nohup node .output/server/index.mjs > "$RUNNER_TEMP/new-serve.log" 2>&1 &)
		fi
		wait_for http://127.0.0.1:3000/
		;;
	*) echo "usage: $0 old | new <url of the built port's .tar.gz>" >&2; exit 1 ;;
esac

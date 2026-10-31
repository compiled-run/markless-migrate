#!/usr/bin/env bash
# Uploads a built Markless port to Cloudflare Workers and promotes it only after its checks pass:
#   deploy/cloudflare.sh port <app dir> <worker> <route>...      the app's .output (built with NITRO_PRESET=cloudflare-module)
#   deploy/cloudflare.sh static <dir> <worker>                    a folder of static files (an original), no Worker code; its 404.html answers unknown paths
# port: the build output check (every cached page and fragment a file at its URL, the Workers limits), a version upload with
# its preview URL, the live check of that preview (the routes given), then the version deployed to 100%. PREVIEW=1 stops
# before the deploy and prints the preview URL. A Worker's first upload has no live version to protect and deploys at once.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/.."
WRANGLER="${WRANGLER:-npx --yes wrangler@4.156.0}"
COMPATIBILITY_DATE=2026-10-27

exists() { $WRANGLER deployments status --name "$1" > /dev/null 2>&1; }

# The worker's name and its workers.dev preview URLs go into the wrangler.json Nitro wrote (or one written for static files).
configure() {
	node -e '
		const fs = require("fs");
		const [file, name] = process.argv.slice(1);
		const config = JSON.parse(fs.readFileSync(file, "utf8"));
		Object.assign(config, { name, workers_dev: true, preview_urls: true });
		fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
	' "$1" "$2"
}

upload() {
	local config="$1" name="$2"
	if ! exists "$name"; then
		local out
		out=$($WRANGLER deploy --config "$config" 2>&1 | tee /dev/stderr)
		URL=$(grep -o "https://$name\.[a-z0-9-]*\.workers\.dev" <<< "$out" | head -1)
		VERSION=""
		# A new workers.dev name answers 404 for a few seconds after its first deploy.
		for _ in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" != 404 ] && break; sleep 1; done
		return
	fi
	local out
	out=$($WRANGLER versions upload --config "$config" 2>&1 | tee /dev/stderr)
	VERSION=$(grep -o 'Worker Version ID: [0-9a-f-]*' <<< "$out" | awk '{print $4}')
	URL=$(grep -o 'Version Preview URL: https://[a-z0-9.-]*' <<< "$out" | awk '{print $4}')
	[ -n "$VERSION" ] && [ -n "$URL" ] || { echo "no version or preview URL in the upload output" >&2; exit 1; }
}

promote() {
	local config="$1" name="$2"
	if [ -n "$VERSION" ]; then
		if [ "${PREVIEW:-}" = 1 ]; then echo "preview: $URL (version $VERSION)"; return; fi
		$WRANGLER versions deploy "$VERSION@100%" --name "$name" --yes
	fi
	echo "live: $(sed -E 's#//[0-9a-f]{8}-#//#' <<< "$URL")"
}

case "${1:-}" in
	port)
		APP="$(cd "$2" && pwd)" NAME="$3"
		shift 3
		CONFIG="$APP/.output/server/wrangler.json"
		[ -f "$CONFIG" ] || { echo "no $CONFIG: build the app with NITRO_PRESET=cloudflare-module first" >&2; exit 1; }
		# Vercel serves its analytics scripts itself; elsewhere a page's request for one 404s through the Worker on every view.
		for script in /_vercel/insights/script.js /_vercel/speed-insights/script.js; do
			if grep -rqlF --include='*.html' "$script" "$APP/.output/public"; then mkdir -p "$(dirname "$APP/.output/public$script")" && : > "$APP/.output/public$script"; fi
		done
		# A cached page or fragment URL that is not a file runs the Worker on every request: refuse before uploading.
		(cd "$APP" && node "$ROOT/src/cli.ts" cache output --cloudflare)
		configure "$CONFIG" "$NAME"
		upload "$CONFIG" "$NAME"
		ROUTES=()
		for route in "$@"; do ROUTES+=(--route "$route"); done
		# The preview is deployed only when its pages and fragment URLs come from the uploaded files.
		(cd "$APP" && node "$ROOT/src/cli.ts" cache check --cloudflare --new "$URL" "${ROUTES[@]}")
		promote "$CONFIG" "$NAME"
		;;
	static)
		STATIC="$(cd "$2" && pwd)" NAME="$3"
		WORK="$(mktemp -d)"
		trap 'rm -rf "$WORK"' EXIT
		node -e '
			const fs = require("fs");
			const [file, directory, date] = process.argv.slice(1);
			const assets = { directory, html_handling: "auto-trailing-slash", not_found_handling: fs.existsSync(directory + "/404.html") ? "404-page" : "none" };
			fs.writeFileSync(file, JSON.stringify({ compatibility_date: date, assets }, null, 2) + "\n");
		' "$WORK/wrangler.json" "$STATIC" "$COMPATIBILITY_DATE"
		configure "$WORK/wrangler.json" "$NAME"
		upload "$WORK/wrangler.json" "$NAME"
		code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/")
		[ "$code" = 200 ] || { echo "FAIL $URL/ answered $code" >&2; exit 1; }
		promote "$WORK/wrangler.json" "$NAME"
		;;
	*) echo "usage: $0 port <app dir> <worker> <route>... | static <dir> <worker>" >&2; exit 1 ;;
esac

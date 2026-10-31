#!/usr/bin/env bash
# Builds and deploys the ui.shadcn.com migration to Vercel production: deploy/shadcn-ui/deploy.sh old|new|preview|front
# old:   the old site (fetch-old.sh's checkout of shadcn-ui/ui at the pinned commit), built by Vercel itself from
#        apps/v4 as ui.shadcn.com is, with its own URL as NEXT_PUBLIC_APP_URL, as mm-shadcn-ui-old.
# new:   examples/shadcn-ui-markless with the Vercel preset, as mm-shadcn-ui-new; the build output and the preview's caching
#        are checked before the preview is promoted. Requires VITE_APP_URL, the public origin "Open in v0" links name.
# preview: new without the promote; prints the checked preview URL.
# front: the vercel.json `markless-migrate config --vercel` writes plus the check report at /_migrate/, as mm-shadcn-ui.
# cf-new, cf-preview: the port to Cloudflare Workers through deploy/cloudflare.sh, as mm-shadcn-ui-new (BUILT=1 uploads the
#        cloudflare-module build already in the app's .output).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/shadcn-ui-markless"
SCOPE=jack-shelton
OLD_URL=https://mm-shadcn-ui-old.long-wildflower-ecf7.workers.dev
NEW_URL=https://mm-shadcn-ui-new.vercel.app
# A concurrent CLI process refreshing the shared login leaves this one's token stale for a moment; Vercel answers that as
# "no access to the specified account" before doing anything, so the same command is safe to run again.
vercel() {
	local err code=0 try
	err=$(mktemp)
	for try in 1 2 3; do
		code=0
		command vercel "$@" 2> "$err" || code=$?
		[ "$code" -ne 0 ] && [ "$try" -lt 3 ] && grep -q 'do not have access to the specified account' "$err" || break
		echo "vercel: stale login (try $try), retrying" >&2
		sleep $((try * 15))
	done
	cat "$err" >&2
	rm -f "$err"
	return "$code"
}
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }

CF_NEW_URL=https://mm-shadcn-ui-new.long-wildflower-ecf7.workers.dev

case "${1:-}" in
	cf-new|cf-preview)
		if [ "${BUILT:-}" != 1 ]; then
			rm -rf "$APP/.output"
			(cd "$APP" && node "$ROOT/src/cli.ts" cache apply --prerender)
			(cd "$APP" && NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=12288}" NITRO_PRESET=cloudflare-module VITE_APP_URL="${VITE_APP_URL:-$CF_NEW_URL}" npm run build)
		fi
		if grep -rlq --include='*.html' 'chat/api/open?url=/' "$APP/.output/public"; then echo 'FAIL: pages link v0 to a hostless URL: build with VITE_APP_URL set' >&2; exit 1; fi
		# Optimized images are answered per query, and the header's /docs/directory reads the query: both render in the Worker.
		ALLOW_WORKER="${ALLOW_WORKER:-/_next/image /_markless/fragment/docs/directory}" PREVIEW=$([ "$1" = cf-preview ] && echo 1 || true) exec bash "$DIR/../cloudflare.sh" port "$APP" mm-shadcn-ui-new \
			/ /docs /docs/components/radix/button /examples/dashboard /blocks /charts/area
		;;
	old)
		OLD="$DIR/old"
		[ -d "$OLD/.git" ] || ORIGIN="$OLD_URL" "$DIR/fetch-old.sh"
		[ -f "$OLD/.vercel/project.json" ] || (cd "$OLD" && vercel link --yes --project mm-shadcn-ui-old --scope "$SCOPE" >/dev/null)
		vercel api "/v9/projects/mm-shadcn-ui-old?teamId=$SCOPE" -X PATCH -F rootDirectory=apps/v4 -F framework=nextjs --silent
		# The local build's output, generated styles and dependencies stay behind; Vercel installs and builds from source.
		printf '**/node_modules\n**/.next\napps/v4/styles/*/\napps/v4/.env.local\n.turbo\n' > "$OLD/.vercelignore"
		(cd "$OLD" && vercel deploy --prod --yes --scope "$SCOPE" --build-env NEXT_PUBLIC_APP_URL="$OLD_URL" --build-env NEXT_PUBLIC_V0_URL=https://v0.dev)
		;;
	new|preview)
		# The pages name the site's own origin where the old ones printed NEXT_PUBLIC_APP_URL (a v0 link's url).
		[[ "${VITE_APP_URL:-}" =~ ^https?://[^/]+$ ]] || { echo "FAIL: set VITE_APP_URL to the public origin, e.g. VITE_APP_URL=$NEW_URL $0 $1" >&2; exit 1; }
		link "$APP" mm-shadcn-ui-new
		rm -rf "$APP/.vercel/output"
		(cd "$APP" && node "$ROOT/src/cli.ts" cache apply --prerender)
		# The build passes Node's default 4 GB heap (out of memory on 2026-10-28); the convert workflow's build gives it 13 GB.
		(cd "$APP" && NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=12288}" NITRO_PRESET=vercel VITE_APP_URL="$VITE_APP_URL" npm run build)
		# Built without VITE_APP_URL, "Open in v0" hands v0 a path with no host.
		if grep -rlq --include='*.html' 'chat/api/open?url=/' "$APP/.vercel/output"; then echo 'FAIL: pages link v0 to a hostless URL: build with VITE_APP_URL set' >&2; exit 1; fi
		# A cached page or fragment URL without its ISR function runs the server function on every click: refuse before uploading.
		(cd "$APP" && node "$ROOT/src/cli.ts" cache output)
		# Over Vercel's 15,000-file upload limit (one prerendered fallback per page and fragment): send one archive.
		URL=$(cd "$APP" && vercel deploy --prebuilt --archive=tgz --yes --scope "$SCOPE")
		BYPASS=$(vercel api "/v9/projects/mm-shadcn-ui-new?teamId=$SCOPE" --silent | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8")).protectionBypass??{};process.stdout.write(Object.keys(p).find((k)=>p[k].scope==="automation-bypass")??"")')
		# The preview is promoted only when the CDN keeps its pages and their fragment URLs.
		(cd "$APP" && node "$ROOT/src/cli.ts" cache check --new "$URL" --no-psi --expiry-wait 0 ${BYPASS:+--header "x-vercel-protection-bypass:$BYPASS"} \
			--route / --route /docs --route /docs/components/radix/button --route /blocks --route /charts/area)
		if [ "$1" = preview ]; then echo "$URL"; else vercel promote "$URL" --yes --scope "$SCOPE"; fi
		;;
	front)
		FRONT="$DIR/front"
		mkdir -p "$FRONT/public/_migrate"
		link "$FRONT" mm-shadcn-ui
		rm -rf "$FRONT/public/_migrate/shots" && mkdir -p "$FRONT/public/_migrate/shots"
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		(cd "$APP" && node "$ROOT/src/cli.ts" config --old "$OLD_URL" --new "$NEW_URL" --vercel "$FRONT/vercel.json" --new-build .vercel/output/static)
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new|preview|front|cf-new|cf-preview" >&2; exit 1 ;;
esac

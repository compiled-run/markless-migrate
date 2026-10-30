#!/usr/bin/env bash
# Build and deploy one Docusaurus demo project to Vercel production: deploy/docusaurus/deploy.sh old|new|preview|front
# new:     the port, built by build.ts (BUILT=1 deploys the build already in examples/docusaurus-markless/.vercel/output); its build
#          output and its preview's caching are checked before the preview is promoted.
# preview: new without the promote; prints the checked preview URL.
# cf-old, cf-new, cf-preview: the same to Cloudflare Workers through deploy/cloudflare.sh, as mm-docusaurus-old and mm-docusaurus-new.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
SCOPE=jack-shelton
case "${1:-}" in
	cf-old)
		node "$DIR/build.ts" cf-old
		# docusaurus.io's Netlify _redirects and _headers were never applied on Vercel either (and Cloudflare rejects its absolute targets).
		rm -f "$DIR/old/.vercel/output/static/_redirects" "$DIR/old/.vercel/output/static/_headers"
		exec bash "$DIR/../cloudflare.sh" static "$DIR/old/.vercel/output/static" mm-docusaurus-old
		;;
	cf-new|cf-preview)
		[ "${BUILT:-}" = 1 ] || node "$DIR/build.ts" cf-new
		PREVIEW=$([ "$1" = cf-preview ] && echo 1 || true) exec bash "$DIR/../cloudflare.sh" port "$ROOT/examples/docusaurus-markless" mm-docusaurus-new \
			/ /docs /docs/installation /blog /showcase
		;;
	old) PROJECT=mm-docusaurus-old; CWD="$DIR/old" ;;
	front) PROJECT=mm-docusaurus; CWD="$DIR/front" ;;
	new|preview) PROJECT=mm-docusaurus-new; CWD="$ROOT/examples/docusaurus-markless" ;;
	*) echo "usage: $0 old|new|preview|front|cf-old|cf-new|cf-preview" >&2; exit 1 ;;
esac
mkdir -p "$CWD"
[ -f "$CWD/.vercel/project.json" ] || (cd "$CWD" && vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null && rm -f .env.local; git checkout -q -- .gitignore 2>/dev/null || rm -f .gitignore)
[ "$1" = front ] && (cd "$CWD" && vercel pull --yes --environment production --scope "$SCOPE" >/dev/null && rm -f .env.local .gitignore)
case "$1" in
	new|preview)
		[ "${BUILT:-}" = 1 ] || node "$DIR/build.ts" new
		# A cached page or fragment URL without its ISR function runs the server function on every click: refuse before uploading.
		(cd "$CWD" && node "$ROOT/src/cli.ts" cache output)
		URL=$(cd "$CWD" && vercel deploy --prebuilt --archive=tgz --yes --scope "$SCOPE" | grep -o "https://[^ ]*\.vercel\.app" | tail -1)
		BYPASS=$(vercel api "/v9/projects/$PROJECT?teamId=$SCOPE" 2>/dev/null | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8")).protectionBypass??{};process.stdout.write(Object.keys(p).find((k)=>p[k].scope==="automation-bypass")??"")')
		# The preview is promoted only when the CDN keeps its pages and their fragment URLs.
		(cd "$CWD" && node "$ROOT/src/cli.ts" cache check --new "$URL" --no-psi --expiry-wait 0 ${BYPASS:+--header "x-vercel-protection-bypass:$BYPASS"} \
			--route / --route /docs --route /docs/installation --route /blog --route /showcase)
		if [ "$1" = preview ]; then echo "$URL"; else vercel promote "$URL" --yes --scope "$SCOPE"; fi
		;;
	*)
		node "$DIR/build.ts" "$1"
		(cd "$CWD" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
esac

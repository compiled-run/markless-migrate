#!/usr/bin/env bash
# Builds and deploys the qwikui.com migration to Vercel production: deploy/qwikui/deploy.sh old|new
# old: qwik-ui's static build at the pinned commit (fetch-old.sh), as mm-qwikui-old: the files as they are, with the
#      Cloudflare Pages _headers and _redirects written as vercel.json rules, folders served with a trailing slash.
# new: examples/qwikui-markless with the Vercel preset, as mm-qwikui-markless. .output, .vercel/output and
#      node_modules/.vite are deleted before every build, and the public URL must serve the new build's chunks afterwards.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/qwikui-markless"
SCOPE=jack-shelton
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }

case "${1:-}" in
	old)
		[ -f "$DIR/old/dist/apps/website/client/index.html" ] || "$DIR/fetch-old.sh"
		OUT="$DIR/old-deploy"
		rm -rf "$OUT" && mkdir -p "$OUT"
		cp -R "$DIR/old/dist/apps/website/client" "$OUT/public"
		node "$DIR/vercel-old.mjs" "$OUT/public" > "$OUT/vercel.json"
		link "$OUT" mm-qwikui-old
		(cd "$OUT" && vercel deploy --prod --yes --scope "$SCOPE")
		;;
	new)
		link "$APP" mm-qwikui-markless
		rm -rf "$APP/.output" "$APP/.vercel/output" "$APP/node_modules/.vite"
		(cd "$APP" && NITRO_PRESET=vercel npm run build)
		(cd "$APP" && vercel deploy --prebuilt --prod --archive=tgz --yes --scope "$SCOPE")
		# The deployment answers at its production URL only once the build's own chunks are what that URL serves.
		chunk=$(cd "$APP/.vercel/output/static" && ls build/*.js 2>/dev/null | head -n 1)
		curl -fsS "https://mm-qwikui-markless.vercel.app/" | grep -q "${chunk:?no chunk in the build}" || { echo "https://mm-qwikui-markless.vercel.app/ does not serve this build's chunks yet" >&2; exit 1; }
		echo "https://mm-qwikui-markless.vercel.app/ serves $chunk"
		;;
	*) echo "usage: $0 old|new" >&2; exit 1 ;;
esac

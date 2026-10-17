#!/usr/bin/env bash
# Builds and deploys the vite.dev homepage migration to Vercel production: deploy/vite-dev/deploy.sh old|new|front
# old:   the VitePress build of vitejs/vite's docs (DOCS, default ~/dev/scratch/vite/docs), static, as project vite-dev-old.
# new:   examples/vite-dev-markless, built with the Vercel preset and every other route proxied to the old app, as vite-dev-markless.
# front: the vercel.json `markless-migrate config --vercel` writes (switched routes to the new app, the rest to the old one)
#        plus the check report at /_migrate/, as project migrate-demo (https://markless-migrate-demo.vercel.app).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/vite-dev-markless"
DOCS="${DOCS:-$HOME/dev/scratch/vite/docs}"
SCOPE=jack-shelton
OLD_URL=https://vite-dev-old.vercel.app
NEW_URL=https://vite-dev-markless.vercel.app
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }
case "${1:-}" in
	old)
		rm -rf "$DIR/old/public" && cp -R "$DOCS/.vitepress/dist" "$DIR/old/public" && rm -f "$DIR/old/public/_redirects" "$DIR/old/public/_headers"
		node "$DIR/old/vercel-config.mjs" "$DOCS/.vitepress/dist"
		link "$DIR/old" vite-dev-old
		(cd "$DIR/old" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	new)
		link "$APP" vite-dev-markless
		(cd "$APP" && OLD_ORIGIN="$OLD_URL" NITRO_PRESET=vercel npm run build && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	front)
		FRONT="$DIR/front"
		link "$FRONT" migrate-demo
		(cd "$FRONT" && vercel pull --yes --environment production --scope "$SCOPE" >/dev/null && rm -f .env.local .gitignore)
		rm -rf "$FRONT/public/_migrate/shots" && mkdir -p "$FRONT/public/_migrate/shots"
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		(cd "$APP" && node "$ROOT/src/cli.ts" config --old "$OLD_URL" --new "$NEW_URL" --vercel "$FRONT/vercel.json")
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac

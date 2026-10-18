#!/usr/bin/env bash
# Builds and deploys a URL-only migration to Vercel production:
#   deploy/htmx-org/deploy.sh new|front                      (htmx.org)
#   deploy/htmx-org/deploy.sh new|front <slug> <old-origin>   (another site, e.g. alpinejs-dev https://alpinejs.dev)
# new:   examples/<slug>-markless, built with the Vercel preset, as project mm-<slug>-new.
# front: deploy/<slug>/front, the vercel.json `markless-migrate config --vercel` writes (switched routes to the new app,
#        everything else to the live site) plus the check report at /_migrate/, as project mm-<slug>.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE=jack-shelton
WHAT="${1:-}"; SLUG="${2:-htmx-org}"; OLD="${3:-https://htmx.org}"
APP="$DIR/../examples/$SLUG-markless"
NEW_URL="https://mm-$SLUG-new.vercel.app"
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }
case "$WHAT" in
	new)
		link "$APP" "mm-$SLUG-new"
		(cd "$APP" && NITRO_PRESET=vercel npm run build && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	front)
		FRONT="$DIR/$SLUG/front"
		mkdir -p "$FRONT/public/_migrate/shots"
		link "$FRONT" "mm-$SLUG"
		(cd "$FRONT" && vercel pull --yes --environment production --scope "$SCOPE" >/dev/null && rm -f .env.local .gitignore)
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		rm -f "$FRONT/public/_migrate/shots/"*.png
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		(cd "$APP" && node "$DIR/../src/cli.ts" config --old "$OLD" --new "$NEW_URL" --vercel "$FRONT/vercel.json" --new-build .vercel/output/static)
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 new|front [slug old-origin]" >&2; exit 1 ;;
esac

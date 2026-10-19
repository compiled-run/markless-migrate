#!/usr/bin/env bash
# Builds and deploys the ui.shadcn.com migration to Vercel production: deploy/shadcn-ui/deploy.sh old|new|front
# old:   the old site (fetch-old.sh's checkout of shadcn-ui/ui at the pinned commit), built by Vercel itself from
#        apps/v4 as ui.shadcn.com is, with its own URL as NEXT_PUBLIC_APP_URL, as mm-shadcn-ui-old.
# new:   examples/shadcn-ui-markless with the Vercel preset, as mm-shadcn-ui-new.
# front: the vercel.json `markless-migrate config --vercel` writes plus the check report at /_migrate/, as mm-shadcn-ui.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/shadcn-ui-markless"
SCOPE=jack-shelton
OLD_URL=https://mm-shadcn-ui-old.vercel.app
NEW_URL=https://mm-shadcn-ui-new.vercel.app
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }

case "${1:-}" in
	old)
		OLD="$DIR/old"
		[ -d "$OLD/.git" ] || ORIGIN="$OLD_URL" "$DIR/fetch-old.sh"
		[ -f "$OLD/.vercel/project.json" ] || (cd "$OLD" && vercel link --yes --project mm-shadcn-ui-old --scope "$SCOPE" >/dev/null)
		vercel api "/v9/projects/mm-shadcn-ui-old?teamId=$SCOPE" -X PATCH -F rootDirectory=apps/v4 -F framework=nextjs --silent
		# The local build's output, generated styles and dependencies stay behind; Vercel installs and builds from source.
		printf '**/node_modules\n**/.next\napps/v4/styles/*/\napps/v4/.env.local\n.turbo\n' > "$OLD/.vercelignore"
		(cd "$OLD" && vercel deploy --prod --yes --scope "$SCOPE" --build-env NEXT_PUBLIC_APP_URL="$OLD_URL" --build-env NEXT_PUBLIC_V0_URL=https://v0.dev)
		;;
	new)
		link "$APP" mm-shadcn-ui-new
		rm -rf "$APP/.vercel/output"
		(cd "$APP" && NITRO_PRESET=vercel npm run build)
		(cd "$APP" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
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
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac

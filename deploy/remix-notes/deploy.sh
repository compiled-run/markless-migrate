#!/usr/bin/env bash
# Builds and deploys the Remix notes migration to Vercel production: deploy/remix-notes/deploy.sh old|new|front
# old:   old-app's own Remix build as one function (build-old.mjs), seeded SQLite in /tmp, as mm-remix-notes-old.
# new:   examples/remix-notes-markless with the Vercel preset, seeded SQLite in /tmp, as mm-remix-notes-new.
# front: the vercel.json `markless-migrate config --vercel` writes plus the report and demo index at /_migrate/, as mm-remix-notes.
# Not hosted since 2026-10-30: the mm-remix-notes-old and mm-remix-notes projects were deleted. Run `old` then `front` to bring them back; checks serve the old app locally (local.sh old).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/remix-notes-markless"
SCOPE=jack-shelton
OLD_URL=https://mm-remix-notes-old.vercel.app
NEW_URL=https://mm-remix-notes-new.vercel.app
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }
case "${1:-}" in
	old)
		node "$DIR/build-old.mjs"
		link "$DIR/.vercel-old" mm-remix-notes-old
		(cd "$DIR/.vercel-old" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	new)
		link "$APP" mm-remix-notes-new
		(cd "$APP" && NITRO_PRESET=vercel npm run build)
		(cd "$APP" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE" --env SESSION_SECRET=super-duper-s3cret --env NODE_ENV=production --env SEED_DATABASE=1 --env DATABASE_PATH=/tmp/notes.db)
		;;
	front)
		FRONT="$DIR/front"
		mkdir -p "$FRONT/public/_migrate"
		link "$FRONT" mm-remix-notes
		rm -rf "$FRONT/public/_migrate/shots" && mkdir -p "$FRONT/public/_migrate/shots"
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		cp "$DIR/front-index.html" "$FRONT/public/_migrate/index.html"
		(cd "$APP" && node "$ROOT/src/cli.ts" config --old "$OLD_URL" --new "$NEW_URL" --vercel "$FRONT/vercel.json" --new-build .vercel/output/static)
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac

#!/usr/bin/env bash
# Builds and deploys the Hacker News (Next.js App Router + RSC) migration to Vercel production: deploy/hn-rsc/deploy.sh old|new|front
# old:   nextjs/next-react-server-components at e5cdd85, source unchanged, built on Vercel, as mm-hn-rsc-old.
# new:   examples/hn-rsc-markless with the Vercel preset, as mm-hn-rsc-new.
# front: the vercel.json `markless-migrate config --vercel` writes plus the report at /_migrate/, as mm-hn-rsc.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/hn-rsc-markless"
SCOPE=jack-shelton
OLD_URL=https://mm-hn-rsc-old.vercel.app
NEW_URL=https://mm-hn-rsc-new.vercel.app
COMMIT=e5cdd85
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }
case "${1:-}" in
	old)
		BUILD="$DIR/.build-old"
		[ -d "$BUILD/.git" ] || git clone -q https://github.com/nextjs/next-react-server-components "$BUILD"
		(cd "$BUILD" && git fetch -q origin && git checkout -q "$COMMIT")
		link "$BUILD" mm-hn-rsc-old
		(cd "$BUILD" && vercel deploy --prod --yes --scope "$SCOPE")
		;;
	new)
		# Built in a copy, so a local server running the app's .output for a check is not changed under it.
		BUILD="$DIR/.build-new"
		mkdir -p "$BUILD"
		rsync -a --delete --exclude node_modules --exclude .output --exclude .migrate --exclude .vercel --exclude repros "$APP/" "$BUILD/"
		ln -sfn "$APP/node_modules" "$BUILD/node_modules"
		link "$BUILD" mm-hn-rsc-new
		(cd "$BUILD" && NITRO_PRESET=vercel npm run build)
		(cd "$BUILD" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	front)
		FRONT="$DIR/front"
		mkdir -p "$FRONT/public/_migrate"
		link "$FRONT" mm-hn-rsc
		rm -rf "$FRONT/public/_migrate/shots" && mkdir -p "$FRONT/public/_migrate/shots"
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		(cd "$APP" && node "$ROOT/src/cli.ts" config --old "$OLD_URL" --new "$NEW_URL" --vercel "$FRONT/vercel.json" --new-build .vercel/output/static)
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac

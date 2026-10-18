#!/usr/bin/env bash
# Builds and deploys the AG Grid (Devtron panel) migration to Vercel production: deploy/ag-grid/deploy.sh old|new|front
# old:   Devtron's built panel (fetch-old.sh) as a static site, with the devtools host stub loaded first, as mm-ag-grid-old.
# new:   examples/ag-grid-markless with the Vercel preset, as mm-ag-grid-new.
# front: the vercel.json `markless-migrate config --vercel` writes for .migrate/switched.json, plus the check report
#        at /_migrate/, as mm-ag-grid.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/ag-grid-markless"
SCOPE=jack-shelton
OLD_URL=https://mm-ag-grid-old.vercel.app
NEW_URL=https://mm-ag-grid-new.vercel.app
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }

case "${1:-}" in
	old)
		OUT="$DIR/.vercel-old"
		rm -rf "$OUT" && mkdir -p "$OUT"
		cp -R "$DIR/old/dist/extension/." "$OUT/"
		cp "$APP/public/devtools-host.js" "$OUT/devtools-host.js"
		node -e "const fs=require('fs');const f='$OUT/index.html';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('<script src=\"./react.js\"></script>','<script src=\"/devtools-host.js\"></script><script src=\"./react.js\"></script>'))"
		printf '{\n\t"cleanUrls": false\n}\n' > "$OUT/vercel.json"
		link "$OUT" mm-ag-grid-old
		(cd "$OUT" && vercel deploy --prod --yes --scope "$SCOPE")
		;;
	new)
		link "$APP" mm-ag-grid-new
		rm -rf "$APP/.vercel/output"
		(cd "$APP" && NITRO_PRESET=vercel npm run build)
		(cd "$APP" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	front)
		FRONT="$DIR/front"
		mkdir -p "$FRONT/public/_migrate"
		link "$FRONT" mm-ag-grid
		rm -rf "$FRONT/public/_migrate/shots" && mkdir -p "$FRONT/public/_migrate/shots"
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		(cd "$APP" && node "$ROOT/src/cli.ts" config --old "$OLD_URL" --new "$NEW_URL" --vercel "$FRONT/vercel.json" --new-build .vercel/output/static --index "$FRONT/public/_migrate/index.html")
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac

#!/usr/bin/env bash
# Builds and deploys the Next.js Learn dashboard migration to Vercel production: deploy/next-dashboard/deploy.sh old|new|front
# old:   a copy of old-app (source unchanged) plus a seeded in-function Postgres, built on Vercel, as mm-next-dashboard-old.
# new:   examples/next-dashboard-markless with the Vercel preset and the same in-function Postgres, as mm-next-dashboard-new.
# front: the vercel.json `markless-migrate config --vercel` writes plus the report and demo index at /_migrate/, as mm-next-dashboard.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/next-dashboard-markless"
SCOPE=jack-shelton
OLD_URL=https://mm-next-dashboard-old.vercel.app
NEW_URL=https://mm-next-dashboard-new.vercel.app
# The demo's session secret: sessions are interchangeable between the two apps, as they share a domain behind the front door.
AUTH_SECRET=markless-migrate-next-dashboard-demo-secret-0001
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }
envs=(--env AUTH_SECRET="$AUTH_SECRET" --env AUTH_TRUST_HOST=true --env EMBEDDED_POSTGRES=1)
case "${1:-}" in
	old)
		BUILD="$DIR/.build-old"
		mkdir -p "$BUILD"
		rsync -a --delete --exclude node_modules --exclude .next --exclude .env --exclude .vercel "$DIR/old-app/" "$BUILD/"
		cp "$DIR/vercel-old/instrumentation.ts" "$DIR/vercel-old/instrumentation-node.ts" "$DIR/vercel-old/build-with-seed.mjs" "$BUILD/"
		rsync -a --delete --exclude node_modules --exclude package-lock.json "$DIR/embedded-postgres/" "$BUILD/embedded-postgres/"
		node -e "const f='$BUILD/package.json';const p=require(f);p.dependencies['@electric-sql/pglite']='0.5.10';p.dependencies['@electric-sql/pglite-socket']='0.2.13';p.scripts.build='node build-with-seed.mjs';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
		(cd "$BUILD" && rm -f pnpm-lock.yaml && pnpm install --ignore-workspace --lockfile-only >/dev/null)
		link "$BUILD" mm-next-dashboard-old
		(cd "$BUILD" && vercel deploy --prod --yes --scope "$SCOPE" "${envs[@]}")
		;;
	new)
		"$DIR/local.sh" reset >/dev/null 2>&1
		link "$APP" mm-next-dashboard-new
		(cd "$APP" && POSTGRES_URL=postgres://postgres:postgres@localhost:55432/dashboard NITRO_PRESET=vercel npm run build)
		node "$DIR/one-function.mjs" "$APP/.vercel/output/functions/__server.func" "$APP/.vercel/output"
		(cd "$APP" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE" "${envs[@]}")
		;;
	front)
		FRONT="$DIR/front"
		mkdir -p "$FRONT/public/_migrate"
		link "$FRONT" mm-next-dashboard
		rm -rf "$FRONT/public/_migrate/shots" && mkdir -p "$FRONT/public/_migrate/shots"
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		cp "$DIR/front-index.html" "$FRONT/public/_migrate/index.html"
		(cd "$APP" && node "$ROOT/src/cli.ts" config --old "$OLD_URL" --new "$NEW_URL" --vercel "$FRONT/vercel.json")
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac

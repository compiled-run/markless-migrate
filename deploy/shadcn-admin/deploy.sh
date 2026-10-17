#!/usr/bin/env bash
# Builds and deploys the shadcn-admin migration to Vercel production: deploy/shadcn-admin/deploy.sh old|new|front
# old:   the old app's own Vite build (fetch-old.sh) as a static site with its SPA fallback, as mm-shadcn-admin-old.
# new:   examples/shadcn-admin-markless with the Vercel preset, as mm-shadcn-admin-new.
# front: the vercel.json `markless-migrate config --vercel` writes plus the check report at /_migrate/, as mm-shadcn-admin.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/shadcn-admin-markless"
SCOPE=jack-shelton
OLD_URL=https://mm-shadcn-admin-old.vercel.app
NEW_URL=https://mm-shadcn-admin-new.vercel.app
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }

# vite-plus 0.1.20 sometimes deadlocks building this app (the bundler process sits at 0% CPU inside a native
# call); a build that accrues no CPU for 45s is killed and started again.
build_new() {
	for attempt in 1 2 3 4 5; do
		(cd "$APP" && NITRO_PRESET=vercel npm run build > "$DIR/.build.log" 2>&1) &
		local pid=$! last="" idle=0
		while kill -0 "$pid" 2>/dev/null; do
			sleep 5
			local b t
			b=$(pgrep -f "shadcn-admin-markless/node_modules/@voidzero-dev/vite-plus-core/dist/vite/node/cli.js build" | head -1 || true)
			[ -z "$b" ] && continue
			t=$(ps -o time= -p "$b" || true)
			if [ "$t" == "$last" ]; then idle=$((idle + 5)); else idle=0; fi
			last="$t"
			if [ "$idle" -ge 45 ]; then kill -9 "$b"; echo "build stalled (attempt $attempt), retrying" >&2; break; fi
		done
		wait "$pid" 2>/dev/null || true
		[ -f "$APP/.vercel/output/config.json" ] && return 0
		[ "$idle" -ge 45 ] || { cat "$DIR/.build.log" >&2; return 1; }
	done
	return 1
}

case "${1:-}" in
	old)
		OUT="$DIR/.vercel-old"
		rm -rf "$OUT" && mkdir -p "$OUT"
		cp -R "$DIR/old/dist/." "$OUT/"
		printf '{\n\t"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]\n}\n' > "$OUT/vercel.json"
		link "$OUT" mm-shadcn-admin-old
		(cd "$OUT" && vercel deploy --prod --yes --scope "$SCOPE")
		;;
	new)
		link "$APP" mm-shadcn-admin-new
		rm -rf "$APP/.vercel/output"
		build_new
		(cd "$APP" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	front)
		FRONT="$DIR/front"
		mkdir -p "$FRONT/public/_migrate"
		link "$FRONT" mm-shadcn-admin
		rm -rf "$FRONT/public/_migrate/shots" && mkdir -p "$FRONT/public/_migrate/shots"
		cp "$APP/.migrate/report.html" "$APP/.migrate/report.json" "$FRONT/public/_migrate/"
		for shot in $(grep -o 'shots/[a-f0-9]*\.png' "$APP/.migrate/report.html" | sort -u); do cp "$APP/.migrate/$shot" "$FRONT/public/_migrate/$shot"; done
		(cd "$APP" && node "$ROOT/src/cli.ts" config --old "$OLD_URL" --new "$NEW_URL" --vercel "$FRONT/vercel.json")
		node "$DIR/scripts/front-assets.mjs" "$FRONT/vercel.json" "$OLD_URL" "$NEW_URL" / /users /sign-in
		(cd "$FRONT" && vercel build --prod --yes && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac

#!/usr/bin/env bash
# Deploys the react-hn migration to Vercel production: deploy/react-hn/deploy.sh old|new
# old: insin/react-hn's own build (dist/ of the pinned commit, built with Node 10 as the log says) as static files, as mm-react-hn-old.
# new: examples/react-hn-markless with the Vercel preset, as mm-react-hn-new.
# Not hosted since 2026-10-30: the mm-react-hn-old project were deleted. Run `old` to bring them back; checks serve the old app locally (ci-serve.sh old).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR/../.."
APP="$ROOT/examples/react-hn-markless"
OLD_SRC="${OLD_SRC:-$ROOT/../mm-upstreams/react-hn}"
COMMIT=7c5a7802109b1d2bae5c8493dd1fecf5bfe823a9
SCOPE=jack-shelton
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }
case "${1:-}" in
	old)
		[ "$(git -C "$OLD_SRC" rev-parse HEAD)" = "$COMMIT" ] || { echo "$OLD_SRC is not at $COMMIT" >&2; exit 1; }
		[ -f "$OLD_SRC/dist/index.html" ] || { echo "build $OLD_SRC first (see examples/react-hn-LOG.md)" >&2; exit 1; }
		OUT="$DIR/.vercel-old"
		mkdir -p "$OUT"
		link "$OUT" mm-react-hn-old
		rm -rf "$OUT/.vercel/output" && mkdir -p "$OUT/.vercel/output"
		cp -R "$OLD_SRC/dist" "$OUT/.vercel/output/static"
		echo '{"version":3}' > "$OUT/.vercel/output/config.json"
		(cd "$OUT" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	new)
		link "$APP" mm-react-hn-new
		(cd "$APP" && NITRO_PRESET=vercel npm run build)
		(cd "$APP" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
		;;
	*) echo "usage: $0 old|new" >&2; exit 1 ;;
esac

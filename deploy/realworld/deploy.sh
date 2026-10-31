#!/usr/bin/env bash
# Build and deploy one RealWorld demo project to Vercel production: deploy/realworld/deploy.sh api|old|new|front
# Not hosted since 2026-10-30: the mm-realworld-api, mm-realworld-old and mm-realworld projects were deleted. Run `api`, `old`, then `front` to bring them back; checks serve the old app locally (serve-old.ts).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE=jack-shelton
case "${1:-}" in
	api) PROJECT=mm-realworld-api; CWD="$DIR/api" ;;
	old) PROJECT=mm-realworld-old; CWD="$DIR/old" ;;
	front) PROJECT=mm-realworld; CWD="$DIR/front" ;;
	new) PROJECT=mm-realworld-new; CWD="$DIR/../../examples/realworld-markless" ;;
	*) echo "usage: $0 api|old|new|front" >&2; exit 1 ;;
esac
mkdir -p "$CWD"
[ -f "$CWD/.vercel/project.json" ] || (cd "$CWD" && vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null && rm -f .env.local; git checkout -q -- .gitignore 2>/dev/null || rm -f .gitignore)
[ "$1" = front ] && (cd "$CWD" && vercel pull --yes --environment production --scope "$SCOPE" >/dev/null && rm -f .env.local .gitignore)
node "$DIR/build.ts" "$1"
(cd "$CWD" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")

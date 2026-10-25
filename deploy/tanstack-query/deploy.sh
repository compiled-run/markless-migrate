#!/usr/bin/env bash
# Build and deploy one kitchen-sink demo project to Vercel production: deploy/tanstack-query/deploy.sh old|new|front
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE=jack-shelton
case "${1:-}" in
	old) PROJECT=mm-tanstack-query-old; CWD="$DIR/old" ;;
	front) PROJECT=mm-tanstack-query; CWD="$DIR/front" ;;
	new) PROJECT=mm-tanstack-query-new; CWD="$DIR/../../examples/tanstack-query-markless" ;;
	*) echo "usage: $0 old|new|front" >&2; exit 1 ;;
esac
mkdir -p "$CWD"
[ -f "$CWD/.vercel/project.json" ] || (cd "$CWD" && vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null && rm -f .env.local; git checkout -q -- .gitignore 2>/dev/null || rm -f .gitignore)
[ "$1" = front ] && (cd "$CWD" && vercel pull --yes --environment production --scope "$SCOPE" >/dev/null && rm -f .env.local .gitignore)
node "$DIR/build.ts" "$1"
(cd "$CWD" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")

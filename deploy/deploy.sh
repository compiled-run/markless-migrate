#!/usr/bin/env bash
# Build and deploy one demo project to Vercel production: deploy/deploy.sh cms|old|new|front
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE=jack-shelton
case "${1:-}" in
	cms) PROJECT=migrate-demo-cms; CWD="$DIR/cms" ;;
	old) PROJECT=migrate-demo-old; CWD="$DIR/old" ;;
	front) PROJECT=migrate-demo; CWD="$DIR/front" ;;
	new) PROJECT=migrate-demo-new; CWD="$DIR/../examples/vite-site-markless" ;;
	*) echo "usage: $0 cms|old|new|front" >&2; exit 1 ;;
esac
mkdir -p "$CWD"
[ -f "$CWD/.vercel/project.json" ] || (cd "$CWD" && vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null && rm -f .env.local; git checkout -q -- .gitignore 2>/dev/null || rm -f .gitignore)
[ "$1" = front ] && (cd "$CWD" && vercel pull --yes --environment production --scope "$SCOPE" >/dev/null && rm -f .env.local .gitignore)
if [ "$1" = new ]; then
	(cd "$CWD" && NITRO_PRESET=vercel npm run build)
	if [ -f "$CWD/.migrate/caching.json" ]; then (cd "$CWD" && node "$DIR/../src/cli.ts" cache output); fi
else
	node "$DIR/build.ts" "$1"
fi
(cd "$CWD" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")

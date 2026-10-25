#!/usr/bin/env bash
# Fetches the old app, TanStack Router's examples/react/kitchen-sink-react-query-file-based (MIT), at the commit this migration was made against, copies it out standalone and builds it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLD="${MM_UPSTREAMS:-$HERE/../../../mm-upstreams}/kitchen-sink-react-query"
COMMIT=da2adec76dbe6c0da6d6a0d5640f7b9388217f45
EXAMPLE=examples/react/kitchen-sink-react-query-file-based
if [ ! -d "$OLD/src" ]; then
	TMP="$(mktemp -d)"
	git clone --quiet --filter=blob:none --no-checkout https://github.com/TanStack/router.git "$TMP/router"
	git -C "$TMP/router" sparse-checkout set "$EXAMPLE"
	git -C "$TMP/router" checkout --quiet "$COMMIT"
	cp -R "$TMP/router/$EXAMPLE" "$OLD"
	cp "$TMP/router/LICENSE" "$OLD/LICENSE"
	echo "$COMMIT" > "$OLD/UPSTREAM_COMMIT"
	rm -rf "$TMP"
fi
(cd "$OLD" && npm install --no-audit --no-fund && ./node_modules/.bin/vite build)

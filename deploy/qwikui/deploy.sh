#!/usr/bin/env bash
# Deploys the qwikui.com migration to Vercel: deploy/qwikui/deploy.sh old | new <release tag> [--preview]
# old: qwik-ui's static build at the pinned commit (fetch-old.sh), as mm-qwikui-old: the files as they are, with the
#      Cloudflare Pages _headers and _redirects written as vercel.json rules, folders served with a trailing slash.
# new: the Vercel build a Convert run released (preset vercel): the same files the Check workflow checked, uploaded as built
#      to mm-qwikui-markless. Production only when that release's Check run is green on every route (release-gate.mjs) and
#      every file current production's pages load is kept in it (keep-files.mjs); then the public root must load this
#      build's chunks. --preview uploads to a preview URL, never the production alias, without the gate.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE=jack-shelton
PUBLIC=https://mm-qwikui-markless.vercel.app
link() { [ -f "$1/.vercel/project.json" ] || (cd "$1" && vercel link --yes --project "$2" --scope "$SCOPE" >/dev/null && rm -f .env.local); }

case "${1:-}" in
	old)
		[ -f "$DIR/old/dist/apps/website/client/index.html" ] || "$DIR/fetch-old.sh"
		OUT="$DIR/old-deploy"
		rm -rf "$OUT" && mkdir -p "$OUT"
		cp -R "$DIR/old/dist/apps/website/client" "$OUT/public"
		node "$DIR/vercel-old.mjs" "$OUT/public" > "$OUT/vercel.json"
		link "$OUT" mm-qwikui-old
		(cd "$OUT" && vercel deploy --prod --yes --scope "$SCOPE")
		;;
	new)
		TAG="${2:?usage: $0 new <release tag> [--preview]}"
		PREVIEW="${3:-}"
		if [ "$PREVIEW" != "--preview" ]; then
			node "$DIR/release-gate.mjs" "$TAG" || { echo "refusing production: the Check of $TAG is not green on every route (--preview deploys to a preview URL)" >&2; exit 1; }
		fi
		OUT="$DIR/new-deploy"
		rm -rf "$OUT" && mkdir -p "$OUT"
		curl -fsSL "https://github.com/compiled-run/markless-migrate/releases/download/$TAG/qwikui-markless-output.tar.gz" | tar -xz -C "$OUT"
		[ -d "$OUT/.vercel/output" ] || { echo "$TAG is not a Vercel build: run the Convert workflow with preset vercel" >&2; exit 1; }
		link "$OUT" mm-qwikui-markless
		if [ "$PREVIEW" = "--preview" ]; then
			(cd "$OUT" && vercel deploy --prebuilt --archive=tgz --yes --scope "$SCOPE")
			exit 0
		fi
		node "$DIR/keep-files.mjs" "$OUT/.vercel/output/static" "$PUBLIC" "$DIR/check-targets.json"
		(cd "$OUT" && vercel deploy --prebuilt --prod --archive=tgz --yes --scope "$SCOPE")
		# The public root must load chunks this build has, and only those; the alias takes a moment to move.
		for _ in $(seq 1 30); do
			served=$(curl -fsS "$PUBLIC/" | grep -o '/build/[A-Za-z0-9_.-]*\.js' | sort -u)
			missing=0
			for c in $served; do [ -f "$OUT/.vercel/output/static$c" ] || missing=1; done
			if [ -n "$served" ] && [ "$missing" = 0 ]; then
				echo "$PUBLIC/ serves $TAG: $(echo "$served" | wc -l | tr -d ' ') chunks, all in it"
				exit 0
			fi
			sleep 10
		done
		echo "$PUBLIC/ still does not serve $TAG" >&2
		exit 1
		;;
	*) echo "usage: $0 old | new <release tag> [--preview]" >&2; exit 1 ;;
esac

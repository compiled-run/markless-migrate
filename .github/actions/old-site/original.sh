#!/usr/bin/env bash
# The original's release (action.yml): resolve | publish | restore, with SITE, RECIPE, FIXTURES and ID from the action.
# A release is readable once its manifest.json is up: the manifest is uploaded last, after every part of the archive.
set -euo pipefail
REPO="${GITHUB_REPOSITORY:?}"
OUT="${GITHUB_OUTPUT:-/dev/stdout}"
TMP="${RUNNER_TEMP:-/tmp}/original-$$"

# Every published original of this site and recipe as "<manifest time> <originalId>", earliest first.
published() {
	gh api "repos/$REPO/releases?per_page=100" --paginate \
		--jq ".[] | select(.tag_name | startswith(\"original-$SITE-\")) | select(.body | contains(\"recipe: $RECIPE\")) | ([.assets[] | select(.name == \"manifest.json\") | .created_at] | first) as \$done | select(\$done != null) | \"\(\$done) \(.body | capture(\"originalId: (?<id>[0-9a-f]{64})\").id)\"" |
		sort
}

case "${1:-}" in
	resolve)
		id=$(published | head -n 1 | cut -d' ' -f2)
		if [ -n "$id" ]; then echo "original $id (recipe $RECIPE)"; else echo "no original published for recipe $RECIPE"; fi
		echo "id=$id" >> "$OUT"
		;;
	publish)
		[ -f "deploy/$SITE/old/.ci-built" ] || { echo "::error::deploy/$SITE/old was not built (no .ci-built)"; exit 1; }
		rm -rf "$TMP" && mkdir -p "$TMP"
		tar -C "deploy/$SITE" --exclude='*/.next/cache' -cf - old | zstd -T0 -3 -q -o "$TMP/old-site.tar.zst"
		archive=$(sha256sum "$TMP/old-site.tar.zst" | cut -c1-64)
		id=$(printf '%s %s' "$archive" "$FIXTURES" | sha256sum | cut -c1-64)
		tag="original-$SITE-${id:0:12}"
		# Release assets stop at 2 GiB each.
		split -b 1900m -d -a 2 "$TMP/old-site.tar.zst" "$TMP/old-site.tar.zst."
		rm "$TMP/old-site.tar.zst"
		parts=$(cd "$TMP" && printf "%s " old-site.tar.zst.*)
		printf '{"originalId":"%s","site":"%s","recipe":"%s","archive":"%s","fixtures":"%s","parts":"%s","run":"%s"}\n' "$id" "$SITE" "$RECIPE" "$archive" "$FIXTURES" "${parts% }" "${GITHUB_RUN_ID:-local}" > "$TMP/manifest.json"
		notes="deploy/$SITE/fetch-old.sh's build, frozen: every check and pipeline job serves it (.github/actions/old-site).

originalId: $id
recipe: $RECIPE
archive: $archive
fixtures: $FIXTURES"
		gh release create "$tag" -R "$REPO" --prerelease --latest=false --title "$SITE: the original $(echo "$id" | cut -c1-12)" --notes "$notes" > /dev/null
		# shellcheck disable=SC2086
		(cd "$TMP" && gh release upload "$tag" -R "$REPO" $parts && gh release upload "$tag" -R "$REPO" manifest.json)
		first=$(published | head -n 1 | cut -d' ' -f2)
		if [ "$first" != "$id" ]; then
			echo "another job published the original $first first: every run serves that one, so $id is removed"
			gh release delete "$tag" -R "$REPO" --yes --cleanup-tag || true
			id="$first"
		else
			echo "published the original $id as $tag"
		fi
		rm -rf "$TMP"
		echo "id=$id" >> "$OUT"
		;;
	restore)
		[[ "${ID:-}" =~ ^[0-9a-f]{64}$ ]] || { echo "::error::restore needs the originalId, got '${ID:-}'"; exit 1; }
		tag="original-$SITE-${ID:0:12}"
		rm -rf "$TMP" && mkdir -p "$TMP" "deploy/$SITE"
		gh release download "$tag" -R "$REPO" -p manifest.json -p 'old-site.tar.zst.*' -D "$TMP" || { echo "::error::the original $ID is not published ($tag)"; exit 1; }
		manifest() { node -p "JSON.parse(require('fs').readFileSync('$TMP/manifest.json','utf8'))['$1']"; }
		[ "$(manifest originalId)" = "$ID" ] || { echo "::error::$tag's manifest names another original"; exit 1; }
		# The fixtures are read when the old site serves, from this checkout: they are part of the original.
		[ "$(manifest fixtures)" = "$FIXTURES" ] || { echo "::error::the original $ID was published with other fixtures than deploy/$SITE/old-fixtures.json"; exit 1; }
		# shellcheck disable=SC2046
		archive=$(cat $(find "$TMP" -name 'old-site.tar.zst.*' | sort) | sha256sum | cut -c1-64)
		[ "$archive" = "$(manifest archive)" ] || { echo "::error::the original $ID's archive does not match its digest"; exit 1; }
		rm -rf "deploy/$SITE/old"
		# shellcheck disable=SC2046
		cat $(find "$TMP" -name 'old-site.tar.zst.*' | sort) | zstd -d -q | tar -x -C "deploy/$SITE"
		rm -rf "$TMP"
		echo "restored the original $ID"
		echo "id=$ID" >> "$OUT"
		;;
	*) echo "usage: original.sh resolve | publish | restore" >&2; exit 2 ;;
esac

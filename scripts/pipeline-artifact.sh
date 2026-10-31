#!/usr/bin/env bash
# The pipeline's store of finished work: Actions artifacts named by the content key of what made them (pipeline.yml).
#   pipeline-artifact.sh find <name>                                prints the run id of the newest unexpired artifact so named
#   pipeline-artifact.sh build <artifact> <url> <dest dir>          puts a build's output.tar.gz in <dest dir>: from <url> when
#                                                                   given, else from the newest artifact so named
# Needs GH_TOKEN (actions: read) and GITHUB_REPOSITORY.
set -euo pipefail
newest() { gh api "repos/$GITHUB_REPOSITORY/actions/artifacts?name=$1&per_page=20" --jq "[.artifacts[] | select(.expired | not)] | sort_by(.created_at) | reverse | .[0] | $2 // empty"; }
case "${1:-}" in
	find)
		newest "${2:?name}" .workflow_run.id
		;;
	build)
		name="${2:?artifact}" url="${3:-}" dest="${4:?dest}"
		mkdir -p "$dest"
		if [ -n "$url" ]; then
			curl -fsSL "$url" -o "$dest/output.tar.gz"
		else
			id=$(newest "$name" .id)
			[ -n "$id" ] || { echo "no artifact $name" >&2; exit 1; }
			gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$id/zip" > "$dest/build.zip"
			unzip -q -o "$dest/build.zip" -d "$dest" && rm "$dest/build.zip"
		fi
		[ -f "$dest/output.tar.gz" ] || { echo "no output.tar.gz in the build" >&2; exit 1; }
		;;
	*) echo "usage: $0 find <name> | build <artifact> <url> <dest dir>" >&2; exit 2 ;;
esac

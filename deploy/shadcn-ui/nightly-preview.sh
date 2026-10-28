#!/usr/bin/env bash
# A gated preview of the ui.shadcn.com port from the latest markless-migrate main and Markless main, never promoted.
# The convert workflow converts on GitHub (fresh captures and reveals, 24 runners); this machine links Markless, builds and
# runs `deploy.sh preview` (Vercel's login lives here), then writes the URL, both SHAs and the gates' result into the
# body of the pinned issue titled "Nightly shadcn preview" and adds a comment.
# `nightly-preview.sh install` schedules it at 01:00 every night with launchd, running main's copy of this script.
# WORK=<scratch dir> holds the two clones between nights (default ~/.cache/shadcn-nightly).
set -euo pipefail
REPO=compiled-run/markless-migrate
MARKLESS_REPO=compiled-run/markless
WORK="${WORK:-$HOME/.cache/shadcn-nightly}"
if [ "${1:-}" = install ]; then
	LABEL=dev.markless-migrate.shadcn-nightly
	PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
	mkdir -p "$WORK"
	# The night's script comes from main, copied out of the clone it checks out again mid-run.
	# launchd keeps no shell PATH, and fnm's per-shell node directory vanishes with its shell: name the real one.
	path="$(dirname "$(realpath "$(command -v node)")"):$(dirname "$(command -v vercel)"):$(dirname "$(command -v gh)"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
	xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<< "$1"; }
	boot="[ -d '$WORK/migrate/.git' ] || git clone -q https://github.com/$REPO.git '$WORK/migrate'; git -C '$WORK/migrate' fetch -q origin && git -C '$WORK/migrate' show origin/main:deploy/shadcn-ui/nightly-preview.sh > '$WORK/run.sh' && WORK='$WORK' bash '$WORK/run.sh'"
	cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
	<key>Label</key><string>$LABEL</string>
	<key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string><string>$(xml "$boot")</string></array>
	<key>EnvironmentVariables</key><dict><key>PATH</key><string>$(xml "$path")</string><key>HOME</key><string>$HOME</string></dict>
	<key>StartCalendarInterval</key><dict><key>Hour</key><integer>1</integer><key>Minute</key><integer>0</integer></dict>
	<key>StandardOutPath</key><string>$WORK/launchd.log</string>
	<key>StandardErrorPath</key><string>$WORK/launchd.log</string>
</dict></plist>
PLIST
	launchctl bootout "gui/$(id -u)/$LABEL" 2> /dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$PLIST"
	echo "scheduled $LABEL at 01:00: $PLIST"
	exit 0
fi
TITLE='Nightly shadcn preview'
LOG="$WORK/$(date +%Y-%m-%d).log"
mkdir -p "$WORK"
exec > >(tee -a "$LOG") 2>&1
HEAVY=()
[ -x "$HOME/.claude/bin/heavy" ] && HEAVY=("$HOME/.claude/bin/heavy")

issue=$(gh issue list -R "$REPO" --state open --search "\"$TITLE\" in:title" --json number,title --jq ".[] | select(.title == \"$TITLE\") | .number" | head -n 1)
if [ -z "$issue" ]; then
	issue=$(gh issue create -R "$REPO" --title "$TITLE" --body 'Written each night by deploy/shadcn-ui/nightly-preview.sh.' | grep -o '[0-9]*$')
	gh issue pin "$issue" -R "$REPO" > /dev/null
fi
report() { gh issue comment "$issue" -R "$REPO" --body "$1" > /dev/null; }
trap 'report "Nightly preview $(date +%Y-%m-%d) failed at line $LINENO; log: $LOG on the build machine."' ERR

started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run convert.yml -R "$REPO" --ref main -f build=false
run=""
for _ in $(seq 1 30); do
	run=$(gh run list -R "$REPO" --workflow convert.yml --branch main --event workflow_dispatch -L 5 --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$started\")][-1].databaseId // empty")
	[ -n "$run" ] && break
	sleep 10
done
[ -n "$run" ]
gh run watch "$run" -R "$REPO" --interval 120 --exit-status > /dev/null
MIGRATE_SHA=$(gh run view "$run" -R "$REPO" --json headSha --jq .headSha)

clone() { [ -d "$WORK/$1/.git" ] || git clone -q "https://github.com/$2.git" "$WORK/$1"; git -C "$WORK/$1" fetch -q origin; }
clone migrate "$REPO"
clone markless "$MARKLESS_REPO"
git -C "$WORK/migrate" checkout -q --detach -f "$MIGRATE_SHA"
git -C "$WORK/migrate" clean -qfdx -e node_modules -e .vercel
git -C "$WORK/markless" checkout -q --detach -f origin/main
MARKLESS_SHA=$(git -C "$WORK/markless" rev-parse HEAD)
APP="$WORK/migrate/examples/shadcn-ui-markless"
rm -rf "$WORK/converted" && gh run download "$run" -R "$REPO" -n converted-app -D "$WORK/converted"
tar -xzf "$(find "$WORK/converted" -name app.tar.gz | head -n 1)" -C "$APP"
(cd "$WORK/migrate" && pnpm install --frozen-lockfile)
out="$WORK/deploy-$(date +%Y-%m-%d).txt"
started="$WORK/build-started"
rm -f "$started" "$out"
# One admission for the whole local build: it peaks at 23-41 GB, so it waits for that much free memory.
# link-markless installs the app's dependencies, which deploy.sh's cache apply reads.
HEAVY_GB=32 VITE_APP_URL=https://mm-shadcn-ui-new.vercel.app MARKLESS="$WORK/markless" \
	${HEAVY[@]+"${HEAVY[@]}"} bash -c "touch '$started' && bash '$APP/scripts/link-markless.sh' && bash '$WORK/migrate/deploy/shadcn-ui/deploy.sh' preview" > "$out" 2>&1 &
build=$!
# A build still waiting for memory at DEADLINE (default 06:00) gives up its place in the queue, and the night is skipped.
deadline=$(date -j -f %H:%M "${DEADLINE:-06:00}" +%s)
[ "$deadline" -gt "$(date +%s)" ] || deadline=$((deadline + 86400))
while kill -0 "$build" 2> /dev/null && [ ! -e "$started" ]; do
	if [ "$(date +%s)" -ge "$deadline" ]; then
		kill "$build"
		wait "$build" 2> /dev/null || true
		trap - ERR
		report "Nightly preview $(date +%Y-%m-%d) skipped: the build was still waiting for memory at ${DEADLINE:-06:00} (convert run https://github.com/$REPO/actions/runs/$run)."
		echo 'skipped: no memory for the build before the deadline'
		exit 0
	fi
	sleep 60
done
wait "$build"
cat "$out"
URL=$(grep -o 'https://mm-shadcn-ui-[a-z0-9]*-jack-shelton\.vercel\.app' "$out" | tail -n 1)
[ -n "$URL" ]
checks=$(grep -A3 '^Caching on ' "$out" || true)
body="Latest gated preview ($(date +%Y-%m-%d)), not promoted: $URL
Needs the protection bypass header (secret SHADCN_BYPASS).

- markless-migrate: $MIGRATE_SHA (convert run https://github.com/$REPO/actions/runs/$run, fresh captures and reveals)
- Markless: $MARKLESS_SHA
- Gates passed: cache output (every cached page and fragment has an ISR function), hostless v0 links, cache check:
\`\`\`
$checks
\`\`\`"
gh issue edit "$issue" -R "$REPO" --body "$body" > /dev/null
report "$body"
echo "$URL"

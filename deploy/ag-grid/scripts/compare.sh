#!/usr/bin/env bash
# Runs the same lab steps on the old and new app and shows where what they display differs: compare.sh '<steps json>'
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLD="${OLD:-http://127.0.0.1:4480/}"
NEW="${NEW:-http://localhost:4481/}"
node "$DIR/lab.mjs" "$OLD" "$1" --shot /tmp/cmp-old > /tmp/cmp-old.txt 2>&1 &
node "$DIR/lab.mjs" "$NEW" "$1" --shot /tmp/cmp-new > /tmp/cmp-new.txt 2>&1
wait
diff <(sed 's/,"/,\n  "/g' /tmp/cmp-old.txt) <(sed 's/,"/,\n  "/g' /tmp/cmp-new.txt) && echo SAME

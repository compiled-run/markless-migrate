#!/bin/bash
# Runs a command; still running after $WATCHDOG_SECONDS, every Node process under it is asked for a diagnostic report,
# each one's command line, JavaScript stack, live handles and thread states are printed, and the command fails.
set -u
seconds=${WATCHDOG_SECONDS:-1200}
reports=$(mktemp -d)
export NODE_OPTIONS="${NODE_OPTIONS:-} --report-on-signal --report-signal=SIGUSR2 --report-directory=$reports"
setsid "$@" &
leader=$!
for _ in $(seq 1 "$seconds"); do
	kill -0 "$leader" 2>/dev/null || { wait "$leader"; exit $?; }
	sleep 1
done
echo "::error::still running after $seconds s: $*"
# Node names its main thread MainThread, so processes are told by their executable, not their name.
sid=$(ps -o sid= -p "$leader" | tr -d ' ')
pids=$(ps -eo pid=,sid= | awk -v sid="$sid" '$2 == sid { print $1 }' | while read -r pid; do [ "$(readlink "/proc/$pid/exe" 2>/dev/null)" = "$(readlink -f "$(command -v node)")" ] && echo "$pid"; done)
for pid in $pids; do kill -USR2 "$pid" 2>/dev/null; done
sleep 5
for pid in $pids; do
	echo "--- node process $pid: $(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null | cut -c1-300)"
	for t in /proc/$pid/task/*; do echo "    thread $(cat "$t/comm" 2>/dev/null) state $(cut -d' ' -f3 "$t/stat" 2>/dev/null) waiting in $(cat "$t/wchan" 2>/dev/null)"; done
	report=$(ls "$reports"/report.*."$pid".*.json 2>/dev/null | head -1)
	if [ -n "$report" ]; then
		node -e 'const r = require(process.argv[1]); console.log("    JavaScript at: " + (r.javascriptStack.stack || []).slice(0, 8).join(" < ")); console.log("    live handles: " + (r.libuv.filter((h) => h.is_active && h.is_referenced !== false).map((h) => h.type + (h.remoteEndpoint ? " to " + JSON.stringify(h.remoteEndpoint) : h.localEndpoint ? " on " + JSON.stringify(h.localEndpoint) : "")).join(", ") || "none"));' "$report"
	else
		echo "    no diagnostic report: its JavaScript is blocked (a synchronous call such as spawnSync, or native code)"
	fi
done
kill -KILL -- "-$leader" 2>/dev/null
exit 1

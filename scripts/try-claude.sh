#!/usr/bin/env bash
# One-route trial of Claude Code on your own login: fixes a changed heading via the markless-migrate MCP tools.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$REPO/src/cli.ts"
NODE="$(node -p process.execPath)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mm-try-claude-XXXX")"
TRIAL_PID=""
cleanup() { [ -n "$TRIAL_PID" ] && kill "$TRIAL_PID" 2>/dev/null || true; }
trap cleanup EXIT

command -v claude >/dev/null || { echo "claude is not on PATH" >&2; exit 1; }

echo "Building the old app and the changed new app in $WORK ..."
"$NODE" "$REPO/scripts/trial.ts" "$WORK" > "$WORK/trial.out" 2>&1 &
TRIAL_PID=$!
for _ in $(seq 1 120); do [ -s "$WORK/trial.json" ] && break; sleep 0.5; done
[ -s "$WORK/trial.json" ] || { cat "$WORK/trial.out" >&2; exit 1; }
field() { "$NODE" -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$WORK/trial.json','utf8'))['$1'])"; }
OLD="$(field old)"; NEW="$(field new)"; ROUTE="$(field route)"; PROJECT="$(field project)"
echo "old $OLD   new $NEW   route $ROUTE"

cat > "$PROJECT/.mcp.json" <<JSON
{
  "mcpServers": {
    "markless-migrate": { "type": "stdio", "command": "$NODE", "args": ["$CLI", "mcp"], "env": {} }
  }
}
JSON
mkdir -p "$PROJECT/.claude/skills/markless-migrate"
"$NODE" --input-type=module -e "import { managedSkill } from '$REPO/src/agents/skill.ts'; process.stdout.write(managedSkill())" > "$PROJECT/.claude/skills/markless-migrate/SKILL.md"

PROMPT="This directory is a \"new\" app being migrated; the old app is the reference. Old app: $OLD . New app (served from ./dist, rebuild with node_modules/.bin/vite build): $NEW . Use the markless-migrate MCP tools: call plan with the old origin, then check_route for route $ROUTE with both origins. Fix every difference it reports in this directory (never touch the old app), rebuild, and call check_route again until it is green. Finish with one line: the final check result."

echo "Running claude -p (this uses your Claude login) ..."
(cd "$PROJECT" && claude -p "$PROMPT" \
	--mcp-config "$PROJECT/.mcp.json" --strict-mcp-config \
	--permission-mode acceptEdits \
	--allowedTools "mcp__markless-migrate,Bash,Read,Edit,Write,Glob,Grep" \
	--output-format stream-json --verbose > "$WORK/claude.jsonl") || echo "claude exited with $?"

"$NODE" -e '
const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const init = lines.find((e) => e.type === "system" && e.subtype === "init");
if (init) console.log("MCP servers:", (init.mcp_servers || []).map((s) => `${s.name} (${s.status})`).join(", ") || "none");
const tools = {};
for (const e of lines) for (const c of (e.message && e.message.content) || []) if (c.type === "tool_use") tools[c.name] = (tools[c.name] || 0) + 1;
console.log("Tool calls:", JSON.stringify(tools));
const r = lines.find((e) => e.type === "result");
if (r) console.log(`Turns: ${r.num_turns}  cost: $${r.total_cost_usd}  usage: ${JSON.stringify(r.usage)}\nFinal message: ${r.result}`);
' "$WORK/claude.jsonl"

echo
echo "Independent check after Claude finished:"
(cd "$PROJECT" && "$NODE" "$CLI" check --old "$OLD" --new "$NEW" --route "$ROUTE") && echo "GREEN" || echo "RED"
echo "Transcript: $WORK/claude.jsonl"

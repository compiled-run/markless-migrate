# Agent config paths (checked 2026-10-16)

What `setup` writes and what `run` invokes, against each agent's current official docs. "Live" means it was proven on this machine with a real login, not just read from the docs.

## Supported by setup and run

| Agent | MCP server entry | Skill | Headless (`run`) | Evidence | Docs |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `~/.claude.json` `mcpServers.<name>` `{type: "stdio", command, args, env}` (user scope); `$CLAUDE_CONFIG_DIR/.claude.json` when set; project scope is `.mcp.json` | `~/.claude/skills/<name>/SKILL.md`, frontmatter `name` + `description` | `claude -p <prompt> --permission-mode acceptEdits --allowedTools mcp__markless-migrate,Bash,Read,Edit,Write,Glob,Grep` | docs; `scripts/try-claude.sh` for the owner to run | https://code.claude.com/docs/en/mcp, https://code.claude.com/docs/en/skills, https://code.claude.com/docs/en/cli-reference, https://code.claude.com/docs/en/env-vars |
| Codex | `$CODEX_HOME/config.toml` (default `~/.codex`) `[mcp_servers.<name>]` `command`, `args` | `$CODEX_HOME/skills/<name>/SKILL.md`; the docs now name `~/.agents/skills` as the user location, but Codex 0.159.0 loaded the skill from `$CODEX_HOME/skills` in the live trial | `codex exec --skip-git-repo-check --sandbox workspace-write -c mcp_servers.markless-migrate.default_tools_approval_mode="approve" <prompt>` | live: `codex mcp list` shows the server; without the approval override every MCP call fails with "requires approval, but approval policy is never" | https://learn.chatgpt.com/docs/extend/mcp, https://learn.chatgpt.com/docs/build-skills, https://learn.chatgpt.com/docs/developer-commands |
| Cursor | `~/.cursor/mcp.json` `mcpServers.<name>` `{command, args}`; project `.cursor/mcp.json` | `~/.cursor/skills/<name>/SKILL.md` (Cursor 2.4+; rules stay in `.cursor/rules/*.mdc`) | `cursor-agent -p --force --approve-mcps --output-format text <prompt>`; the CLI binary is being renamed `agent` | docs | https://cursor.com/help/customization/mcp, https://cursor.com/docs/skills, https://cursor.com/docs/cli/reference/parameters |
| Gemini CLI | `~/.gemini/settings.json` `mcpServers.<name>` `{command, args}`; `GEMINI_CLI_HOME` moves the root | `~/.gemini/skills/<name>/SKILL.md` | `gemini --approval-mode yolo -p <prompt>` (`--yolo` is deprecated) | docs | https://geminicli.com/docs/tools/mcp-server, https://geminicli.com/docs/reference/configuration/, https://geminicli.com/docs/cli/skills |
| GitHub Copilot CLI | `$COPILOT_HOME/mcp-config.json` (default `~/.copilot`) `mcpServers.<name>` `{type: "local", command, args, tools: ["*"]}` | `~/.copilot/skills/<name>/SKILL.md` | `copilot -p <prompt> --allow-all-tools` | docs | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers, https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills, https://docs.github.com/en/copilot/reference/cli-command-reference |
| VS Code (Copilot agent mode) | user profile `mcp.json`, key `servers` (not `mcpServers`), `{type: "stdio", command, args}`: macOS `~/Library/Application Support/Code/User/mcp.json`, Linux `$XDG_CONFIG_HOME/Code/User/mcp.json` (default `~/.config`), Windows `%APPDATA%\Code\User\mcp.json`; workspace `.vscode/mcp.json` | `~/.copilot/skills/<name>/SKILL.md`, shared with Copilot CLI, so setup writes it once | none (editor only) | docs; the per-OS user folder comes from the settings docs, the MCP page only says "user profile" | https://code.visualstudio.com/docs/agents/reference/mcp-configuration, https://code.visualstudio.com/docs/configure/settings#_settings-json-file, https://code.visualstudio.com/docs/agent-customization/agent-skills |
| opencode | `$OPENCODE_CONFIG_DIR` or `~/.config/opencode/opencode.json`, key `mcp` (not `mcpServers`), `{type: "local", command: [cmd, ...args], enabled: true}` | `~/.config/opencode/skills/<name>/SKILL.md` | `opencode run <prompt>`; `--dangerously-skip-permissions` exists (opencode 1.x) but is not passed | docs; `opencode run --help` | https://opencode.ai/docs/mcp-servers, https://opencode.ai/docs/skills, https://opencode.ai/docs/cli |

## Checked, not supported yet

| Agent | MCP server entry | Skill or rules | Headless | Docs |
| --- | --- | --- | --- | --- |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` `mcpServers`; the docs may be moving under a Devin Desktop rebrand, so re-check before adding | rules `.windsurf/rules/*.md`, global `~/.codeium/windsurf/memories/global_rules.md`; SKILL.md support unconfirmed | none found | https://docs.windsurf.com/windsurf/cascade/mcp |
| Zed | `~/.config/zed/settings.json` (Windows `%APPDATA%\Zed\settings.json`), key `context_servers`; settings files allow comments | `~/.agents/skills/<name>/SKILL.md` | none; Zed hosts other agents over ACP | https://zed.dev/docs/ai/mcp, https://zed.dev/docs/ai/skills |
| Amp | `~/.config/amp/settings.json`, key `amp.mcpServers` `{command, args, env}` | `~/.agents/skills/<name>/SKILL.md` | `amp -x <prompt> --dangerously-allow-all` | https://ampcode.com/docs/customize/mcp, https://ampcode.com/docs/customize/skills, https://ampcode.com/news/amp-x |
| Kiro | `~/.kiro/settings/mcp.json` `mcpServers`, plus `autoApprove` | `~/.kiro/skills/<name>/SKILL.md`; steering `~/.kiro/steering/*.md` | `kiro-cli chat --no-interactive --trust-all-tools <prompt>` | https://kiro.dev/docs/mcp/configuration, https://kiro.dev/docs/skills, https://kiro.dev/docs/cli/headless |
| Cline | VS Code globalStorage `saoudrizwan.claude-dev/settings/cline_mcp_settings.json` `mcpServers` | `~/.cline/skills/<name>/SKILL.md`; rules `.clinerules/` | Cline CLI 2.0: `cline -y <prompt>` | https://docs.cline.bot/mcp/configuring-mcp-servers, https://docs.cline.bot/customization/skills |
| Roo Code | VS Code globalStorage `rooveterinaryinc.roo-cline/settings/mcp_settings.json` `mcpServers`; project `.roo/mcp.json` | `~/.roo/skills/` then `~/.agents/skills/`; rules `.roo/rules/` | `roo --print <prompt>` (approval off by default) | https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo, https://docs.roocode.com/features/skills |

## Corrections and findings

| Finding | Effect |
| --- | --- |
| Codex `exec` rejects every MCP tool call unless the server's tools are approved, because exec runs with approval policy `never` | `run --agent codex` passes `-c mcp_servers.markless-migrate.default_tools_approval_mode="approve"`; `setup` leaves interactive approval to the user |
| Codex docs moved user skills to `~/.agents/skills` | kept `$CODEX_HOME/skills`: it follows `CODEX_HOME` and loaded in the live trial |
| VS Code agent mode uses `servers`, not `mcpServers`, in its own `mcp.json` | added as agent `vscode` |
| VS Code and Copilot CLI share `~/.copilot/skills` | setup plans each skill path once |
| Cursor's CLI binary is being renamed from `cursor-agent` to `agent` | `run --agent cursor` still calls `cursor-agent` |
| No existing path in the registry was wrong against the docs | none |

## Live trial: Codex, 2026-10-16

`scripts/trial.ts` serves the Vite fixture as the old app and a copy whose `/about/` heading reads "Meet the guides" as the new app. Codex 0.159.0, model gpt-6.1-sol, signed in with the owner's ChatGPT plan through a temporary `CODEX_HOME` that held only a copy of `auth.json` and what `setup --agent codex` wrote.

Do not repeat that set-up. ChatGPT refresh tokens are single-use: once the copied access token expired,
the copy refreshed, which spent the refresh token in `~/.codex/auth.json`, and the new tokens were deleted
with the temporary home. The owner's real login stopped working ("your refresh token was already used").
`run` now passes the Markless Migrate MCP server to `codex exec` with `-c mcp_servers.markless-migrate.command=...`
and `args=...` (and to `claude -p` with `--mcp-config`), so it works with the agent's real home and changes
nothing in it, and it refuses to start when `CODEX_HOME` is another directory holding its own copy of
`auth.json`. To isolate configuration, use `-c` overrides or a home that ran `codex login` itself, never a
copied `auth.json`. `scripts/trial.ts` only builds and serves the two apps; it never touches an agent home.

| Run | Agent actions | Result |
| --- | --- | --- |
| `codex exec` with a hand-written prompt, reasoning low | 1 `plan` and 3 `check_route` calls, 5 shell commands, 1 file edit; the first `vite build` failed in the sandbox because the trial's `node_modules` is a symlink outside the workspace, and Codex retried with `--configLoader native` | green; 1 turn, 33 s, 126,236 input tokens (109,056 cached), 686 output |
| `markless-migrate run --agent codex --route /about/ --attempts 2` | attempt 1: 2 `check_route` and 2 `status` calls, 5 shell commands, 1 file edit; same sandbox retry (`--configLoader runner`) | green after 1 attempt, 24 s; Codex reported 9,599 tokens used; `run`'s own re-check was green |

`scripts/try-claude.sh` runs the same trial through `claude -p`; it has not been run yet.

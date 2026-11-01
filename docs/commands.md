# Command reference

The command-line reference for Markless Migrate. Back to the [overview](../README.md).

The full option list for each command is printed by `markless-migrate help` (the `USAGE` text in `src/cli.ts`).

```bash
markless-migrate plan --old http://localhost:3000 [--source ../old-app] [--built ../old-app/dist] [--auth .migrate/auth.json] [--limit 100] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>] [--no-caching]
markless-migrate check --old http://localhost:3000 --new http://localhost:5173 [--route /about]... [--open]
    [--source ../old-app] [--old-hash-routes] [--data record|replay] [--live-window <seconds>] [--staging] [--block <host>]... [--allow <host>]...
    [--no-freeze] [--time <iso>] [--seed <n>] [--timezone <tz>] [--locale <tag>]
    [--auth .migrate/auth.json] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>]
    [--all] [--allow-unchecked] [--new-source ../markless-app] [--concurrency 4] [--changed]
    [--journey-budget <seconds>] [--max-journeys <n>] [--journey-depth 4] [--timeout 1800]
    [--no-responsiveness] [--interaction-budget 200] [--cpu-throttle 4] [--interaction-controls 16] [--no-motion] [--no-cache]
    [--no-navigation] [--nav-entries 2] [--nav-destinations 40]
markless-migrate convert --old http://localhost:3000 [--source ../old-app] [--only <file of routes>] [--fallthrough <old deployment>] [--capture-only] [--reuse] [--ledger fail|report|off] [--record-keys <file>]
markless-migrate ledger --source ../old-app [--json]
markless-migrate fix (--route <path>... | --routes <glob> | --part <module>) [dev's options] [--site-targets <file>]
markless-migrate parity <library> [--route <path>]... [--new-source <path>]
markless-migrate embeds [study | install <adapter>]
markless-migrate upgrade --new <origin> [--route <path>]... [--ui <dir>] [--no-load]
markless-migrate upgrade accept <id> [--baseline <origin>]
markless-migrate network <url>... [--profile <name>]... [--browser <name>]... [--runs <n>]
markless-migrate waste <url>... [--profile <name>] [--control <selector>] [--maps <build output>] [--budget <kB>]
markless-migrate dev (--route <path>... | --routes <glob> | --part <module>) [--control <regex>] [--watch] [--build] [--old <origin>]   # see "How to iterate on a port" in docs/convert.md
markless-migrate usage [--old <origin>] [--built <dir>] [--source <path>] [--new-source <path>] [--json]
markless-migrate guard build [--dir .output]
markless-migrate guard page --old http://localhost:3000 --new http://localhost:5173 [--route /about]...
markless-migrate cache plan|apply|output|check [--old <origin>] [--app <dir>] [--new <origin>] [--previous <origin>] [--route <path>]...
markless-migrate switch <route> [--force --by <name> --reason <why>]
markless-migrate unswitch <route>
markless-migrate proxy --old http://localhost:3000 --new http://localhost:5173 [--port 4300] [--host 127.0.0.1]
markless-migrate config --old https://old.example.com --new https://new.example.com [--vercel vercel.json] [--nitro nitro.ts] [--new-build .output/public] [--index public/_migrate/index.html]
markless-migrate cli [--config .migrate/cli.json] [--case <name>]... [--record] [--json]
markless-migrate accept <failure-id> --reason "why" [--by <name>]
markless-migrate recorder
markless-migrate status
markless-migrate setup [--agent claude-code]... [--dry-run] [--undo]
markless-migrate mcp
markless-migrate run --agent codex --old http://localhost:3000 --new http://localhost:5173 [--route /about]... [--all] [--attempts 3] [--model <name>]
    [--source ../old-app] [--new-source .] [--auth .migrate/auth.json] [--header <name:value>]... [--cookie <name=value>]...
    [--serve "node .output/server/index.mjs"] [--build "npm run build"] [--restart-on .output/nitro.json] [--agent-timeout 30]
```

`plan` writes `.migrate/inventory.json`, including the locale prefixes in use and where `/` sends each
Accept-Language. `check` checks the routes you name, or every route in the inventory, and exits 1 when a
route is red. It writes `.migrate/report.json`, `.migrate/report.html` (one page: old, new and diff
screenshots per route, viewport and failing state, side by side or as a slider or blink toggle, with the
differing regions boxed and every failure listed with its fix; `--open` opens it; the screenshots are
PNG files in `.migrate/shots/`, each stored once and loaded lazily, so publish that folder with the page),
screenshot diffs in `.migrate/diffs/`, and the interactions it explored in `.migrate/journeys/`.
Each route's screenshots, motion frames and journeys are written there as soon as that route is checked, and
only their paths stay in memory, so a run of hundreds of routes holds about as much memory as a run of ten.
Without `--route` it also measures route coverage: every route of the old site must exist on the new
app (same status class and redirect target), and an HTML page counts as ported only when the new app's
own Markless code renders it, which Markless's route marker (the page file the router names) shows. A
page without it is listed as "served by the old app" (a copied file, a proxy or a rewrite passing the old
HTML through), apart from missing routes; neither counts toward done, and `switch` refuses both.
`check --all` also takes every route the source scan knows (see [Which routes](check.md#which-routes-and-where-a-failure-comes-from)) and the old app's non-page
endpoints. Routes are checked `--concurrency` at a time (default half the cores, at most 4: the
Vite fixture's ten routes take 39 s one at a time and 18 s four at a time on an 18-core machine,
`scripts/bench-check.ts`). `--changed` checks only routes that were not green last time, were never
checked, or whose files in the new app (`--new-source`, else the current directory) changed since the
commit recorded with their last check (committed, staged, unstaged or new files, by git); a changed file
that no route is known to be rendered from re-checks every route. `plan` prints the migration order and `status` shows progress in that order. `setup` registers the `markless-migrate mcp` server and installs a migration skill for
Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI, VS Code (Copilot agent mode) and opencode. It
applies straight away (running it is the request; it never asks), keeps a backup of every file it
changes, prints what changed, and ends with the one command that undoes it, `setup --undo`, which puts
every file setup changed back as it was before setup first changed it (a file edited since is left
alone and named). `--dry-run` only
shows what it would change. Paths and their sources: [docs/notes/agents.md](notes/agents.md).

`run` drives your agent's own CLI headless (`codex exec`, `claude -p`, `gemini -p`, `cursor-agent -p`,
`copilot -p`, `opencode run`) on whatever login it already has, one route at a time: it checks the route,
gives the agent the migration skill and the failing report, checks again after the agent finishes, and
leaves the route red after `--attempts` tries and goes on with the next one. Nothing in a run waits for
an answer: the skill and the prompt tell the agent never to ask, and the run ends with one report (green
routes, how each library that draws its own UI was handled, what was accepted automatically, and "What to
look at if you care": each route still red with its open failure ids, and routes that need a sample). Every attempt, with the agent's output, is
appended to `.migrate/run.log`. Each route is checked with the same `--source`, `--new-source`, `--auth`,
`--header` and `--cookie` as `check` (and `--all` takes the same routes and endpoints), and is also red when
the port's own server code makes a page uncacheable that the old site let a CDN keep (a theme or sidebar cookie
read from the request where the old app read it in the browser: `.migrate/caching.json`), and the prompt
names the old source, the roles and the exact check command. A sandboxed agent cannot keep a server
running, so `--serve <command>` makes `run` own the new app's server: it runs `--build`, restarts the
server after every attempt and waits until `--new` answers before checking (a failed build becomes the
next prompt); with `--restart-on <file>` it also restarts whenever the agent's own build rewrites that file.
`run` passes the MCP server to `codex` and `claude` on the command line, so `setup` is optional for them,
and it refuses a `CODEX_HOME` holding a copy of `~/.codex/auth.json`: refresh tokens are single-use, and a
copy that refreshes spends the real login (see [docs/notes/agents.md](notes/agents.md)).

## PageSpeed Insights key (optional)

Page load is verified on Google's own PageSpeed Insights when there is an API key, and with real users' field data;
without one, a calibrated lab run stands in, labelled as such. Getting a key is free and takes about a minute:

1. Open https://developers.google.com/speed/docs/insights/v5/get-started#APIKey and click **Get a Key**.
2. Pick or create a Google Cloud project; the key is shown at once.
3. Run `markless-migrate setup --psi-key <key>`. It is saved to `~/.config/markless-migrate/env` (readable by you
   alone), outside every repository; `--project` saves it to the project's `.env` instead and adds `.env` to its
   `.gitignore`. `PSI_API_KEY` in the environment takes precedence, which is how CI passes it (a repository secret).

How close the lab comes to PageSpeed Insights, measured on ten old and new pairs of sites (twenty pages; PageSpeed
Insights mobile, its cached repeats left out, against 5 to 15 lab runs a page on an Apple-silicon laptop):

| Lab CPU slowdown | Score within 5 points | FCP within 10% | LCP within 10% | Speed Index within 10% | TBT within 10% or 50 ms | Says the same of old against new |
| --- | --- | --- | --- | --- | --- | --- |
| 4x (the default) | 12 of 20 | 8 of 20 | 9 of 20 | 3 of 20 | 18 of 20 | 26 of 40 |
| calibrated from benchmarkIndex (about 16x here) | 11 of 20 | 8 of 20 | 9 of 20 | 2 of 20 | 12 of 20 | 22 of 40 |

So the lab is a guide, not PageSpeed: expect scores 10 points or more apart on some pages. Most of the gap is
PageSpeed's own environment. In its runs the first paint is often held back by about two seconds after the page has
loaded (the main thread idle, no request pending), which a lab run does not reproduce, and how often depends on the page and
on where it is hosted: vite.dev's own homepage, byte for byte, scored 78 from its host and 72 from a Vercel deployment
(six PageSpeed runs each, the held first paint in 3 of 10 against 6 of 10). PageSpeed also answers a URL from its cache
for about a minute; check counts only new reports.

`.github/workflows/page-load.yml` runs the same measurement on a GitHub Actions runner (`workflow_dispatch` with the
old and new origins, the routes and the number of runs; 9 by default) and posts the summary to the run.


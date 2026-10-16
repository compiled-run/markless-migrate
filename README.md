# @markless/migrate

Move an existing app to [Markless](https://markless.dev) with your own coding agent, and prove every route still works before it switches over.

Your agent (Claude Code, Codex, Cursor...) does the converting. This tool does the rest:

- **plan** takes stock of the old app: routes, SEO metadata, assets and locales.
- **check** compares the old route and the new one in a real browser and reports every difference in a form your agent can fix.
- **switch** (not built yet) moves a route to Markless only when its check is green.

Every report also shows how much JavaScript runs at load on each route, before and after.

Status: early. `plan`, `check`, `status`, `setup` and the MCP server work; `switch` and `run` do not exist yet. See [docs/plan.md](docs/plan.md).

## Commands

```bash
markless-migrate plan --old http://localhost:3000 [--source ../old-app] [--limit 100]
markless-migrate check --old http://localhost:3000 --new http://localhost:5173 [--route /about]...
markless-migrate status
markless-migrate setup [--agent claude-code]... [--yes] [--dry-run]
markless-migrate mcp
```

`plan` writes `.migrate/inventory.json`. `check` checks the routes you name, or every route in the
inventory, writes `.migrate/report.json` (plus screenshot diffs in `.migrate/diffs/`) and exits 1 when a
route is red. `setup` registers the `markless-migrate mcp` server and installs a migration skill for
Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI and opencode. It shows every file it will
change and keeps a backup of each.

## What check compares

Each route is loaded twice on the old app and once on the new one, at a desktop (1280x800) and a
mobile (390x844) viewport. Anything that differs between the two old loads is treated as noise and
ignored in the comparison.

| Dimension | Compared |
| --- | --- |
| `http` | status code, redirect chain, content type |
| `rendered` | accessibility tree and visible text |
| `visual` | full-page screenshots, outside the noise mask |
| `seo` | title, description, robots, canonical, Open Graph, Twitter, hreflang, JSON-LD (as data), `lang`, `dir` |
| `assets` | images, fonts, stylesheets and scripts still served at the same URL with the same type; images at each position decode to the same size; the same web fonts load |
| `css` | computed styles of every visible element, paired by accessibility role, name and landmark path |
| `weight` | JavaScript on the wire and run at load (Chromium coverage); red when the new route is heavier |

## Development

```bash
pnpm install
pnpm browsers      # once: downloads Chromium for Playwright
pnpm typecheck
pnpm test          # unit tests and both fixture suites, about a minute
pnpm test:unit     # unit tests only, a few seconds
pnpm test:e2e      # fixture suites only
```

`fixtures/` holds a Next.js App Router app and a Vite multi-page site. The fixture suites build each
one, check it against a separate build of the same source (must be green), and then against eight
mutated copies (changed title, missing hreflang, changed heading, removed alt text, changed font size,
missing image, wrong status code, extra JavaScript). Each mutation must turn red exactly the
dimensions it affects, with the expected message. Mutated copies are built in `.mutants/`.

## License

MIT. The fixtures include the Inter font under the SIL Open Font License (`fixtures/INTER-LICENSE.txt`).

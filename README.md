# @markless/migrate

Move an existing app to [Markless](https://markless.dev) with your own coding agent, and prove every route still works before it switches over.

Your agent (Claude Code, Codex, Cursor...) does the converting. This tool does the rest:

- **plan** takes stock of the old app: routes, SEO metadata, assets and locales.
- **check** compares the old route and the new one in a real browser and reports every difference in a form your agent can fix.
- **switch** (not built yet) moves a route to Markless only when its check is green.

Every report also shows how much JavaScript runs at load on each route, before and after.

Status: early. `plan`, `check`, `status`, `setup`, `run` and the MCP server work; `switch` does not exist yet. See [docs/plan.md](docs/plan.md).

## Commands

```bash
markless-migrate plan --old http://localhost:3000 [--source ../old-app] [--limit 100]
markless-migrate check --old http://localhost:3000 --new http://localhost:5173 [--route /about]... [--open]
markless-migrate status
markless-migrate setup [--agent claude-code]... [--yes] [--dry-run]
markless-migrate mcp
markless-migrate run --agent codex --old http://localhost:3000 --new http://localhost:5173 [--route /about]... [--attempts 3] [--model <name>]
```

`plan` writes `.migrate/inventory.json`, including the locale prefixes in use and where `/` sends each
Accept-Language. `check` checks the routes you name, or every route in the inventory, and exits 1 when a
route is red. It writes `.migrate/report.json`, `.migrate/report.html` (one self-contained page: old, new
and diff screenshots per route, viewport and failing state, side by side or as a slider or blink
toggle, with the differing regions boxed and every failure listed with its fix; `--open` opens it),
screenshot diffs in `.migrate/diffs/`, and the interactions it explored in `.migrate/journeys/`. `setup` registers the `markless-migrate mcp` server and installs a migration skill for
Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI, VS Code (Copilot agent mode) and opencode. It
shows every file it will change and keeps a backup of each. Paths and their sources: [docs/notes/agents.md](docs/notes/agents.md).

`run` drives your agent's own CLI headless (`codex exec`, `claude -p`, `gemini -p`, `cursor-agent -p`,
`copilot -p`, `opencode run`) on whatever login it already has, one route at a time: it checks the route,
gives the agent the migration skill and the failing report, checks again after the agent finishes, and
stops the route as "needs a human" after `--attempts` tries. Every attempt, with the agent's output, is
appended to `.migrate/run.log`. Run `setup` first so the agent has the MCP tools.

## What check compares

Each route is loaded twice on the old app and once on the new one, at a desktop (1280x800) and a
mobile (390x844) viewport. When the two old loads differ, a third old load is taken after the new one.
A text line that differed between old loads may vary only in the characters that varied there, and
only within the same kind of character (digits stay digits); everything else must match.

| Dimension | Compared |
| --- | --- |
| `http` | status code, redirect chain, content type |
| `rendered` | accessibility tree and visible text |
| `visual` | full-page screenshots, outside the noise mask, and screenshots in every forced CSS state |
| `seo` | title, description, robots, canonical, Open Graph, Twitter, hreflang, JSON-LD (as data) |
| `assets` | public files still served at the same URL with the same type (a file counts as build output only if its name carries a content hash that the built HTML, JS or CSS refers to); images at each position decode to the same size; the font file that renders each element's text, by content hash, so a renamed family is not a difference and a swapped file is |
| `css` | computed styles of every visible element, paired by accessibility role, name and landmark path, in the default state and in every state the old stylesheets style (`:hover`, `:focus-visible`, `:checked`, `[open]`, each viewport and container width edge, `prefers-color-scheme`, `prefers-reduced-motion`), each difference traced to the old rule's selector, file, line and column |
| `a11y` | axe-core violations (the new page may not add any), landmarks, focus order by Tab, animations under reduced motion, and every keyboard path (Enter and Space on controls, Escape and ArrowDown in what they open) |
| `i18n` | `lang`, `dir` and text direction, the formats of dates and numbers in the text, and the page each Accept-Language lands on |
| `behaviour` | interactions explored on the old page and replayed on the new one: the URL, what appears and disappears, app requests (method, path, body shape), console errors, live-region announcements and focus after each step |
| `weight` | JavaScript on the wire and run at load (Chromium coverage); red when the new route is heavier |

## Development

```bash
pnpm install
pnpm browsers      # once: downloads Chromium for Playwright
pnpm typecheck
pnpm test          # unit tests and both fixture suites, about five minutes
pnpm test:unit     # unit tests only, a few seconds
pnpm test:e2e      # fixture suites only
```

CSS is parsed with [yuku-css](https://github.com/thejackshelton/yuku-css), which is not on npm yet:
`package.json` links it from a checkout at `../yuku-css` (build it there with `bun run build`).

`fixtures/` holds a Next.js App Router app and a Vite multi-page site, each with an Arabic (RTL) locale,
Accept-Language negotiation at `/`, a menu, a counter and a form. The fixture suites build each one,
check it against a separate build of the same source (must be green), and then against 27 mutated
copies each: one per check, from a changed title to a hover colour, a breakpoint moved by 40px, a font
file swapped under the same name (and a font renamed, which must stay green), a removed label, a
positive tabindex, a counter that adds 2 and a form that posts elsewhere. Each mutation must turn red
exactly the dimensions it affects, with the expected message. Mutated copies are built in `.mutants/`.

## License

MIT. The fixtures include the Inter font under the SIL Open Font License (`fixtures/INTER-LICENSE.txt`).

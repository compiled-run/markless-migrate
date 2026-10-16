# @markless/migrate

Move an existing app to [Markless](https://markless.dev) with your own coding agent, and prove every route still works before it switches over.

Your agent (Claude Code, Codex, Cursor...) does the converting. This tool does the rest:

- **plan** takes stock of the old app: routes, SEO metadata, assets and locales.
- **check** compares the old route and the new one in a real browser and reports every difference in a form your agent can fix.
- **switch** moves a route to Markless only when its check is green, behind a proxy (local) or
  generated Vercel and Nitro routing (production) that sends every other route to the old app.

Every report also shows how much JavaScript runs at load on each route, before and after.

Status: early. `plan`, `check`, `status`, `switch`, `proxy`, `config`, `setup`, `run` and the MCP server work. See [docs/plan.md](docs/plan.md).

## Commands

```bash
markless-migrate plan --old http://localhost:3000 [--source ../old-app] [--limit 100]
markless-migrate check --old http://localhost:3000 --new http://localhost:5173 [--route /about]... [--open]
    [--source ../old-app] [--data record|replay] [--staging] [--block <host>]... [--allow <host>]...
    [--no-freeze] [--time <iso>] [--seed <n>] [--timezone <tz>] [--locale <tag>]
    [--auth .migrate/auth.json] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>]
    [--all] [--new-source ../markless-app]
markless-migrate switch <route> [--force <reason>]
markless-migrate unswitch <route>
markless-migrate proxy --old http://localhost:3000 --new http://localhost:5173 [--port 4300] [--host 127.0.0.1]
markless-migrate config --old https://old.example.com --new https://new.example.com [--vercel vercel.json] [--nitro nitro.ts]
markless-migrate accept <failure-id> --reason "why" [--by <name>]
markless-migrate recorder
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
screenshot diffs in `.migrate/diffs/`, and the interactions it explored in `.migrate/journeys/`.
`check --all` also takes every route the source scan knows (see below) and the old app's non-page
endpoints. `plan` prints the migration order and `status` shows progress in that order. `setup` registers the `markless-migrate mcp` server and installs a migration skill for
Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI, VS Code (Copilot agent mode) and opencode. It
shows every file it will change and keeps a backup of each. Paths and their sources: [docs/notes/agents.md](docs/notes/agents.md).

`run` drives your agent's own CLI headless (`codex exec`, `claude -p`, `gemini -p`, `cursor-agent -p`,
`copilot -p`, `opencode run`) on whatever login it already has, one route at a time: it checks the route,
gives the agent the migration skill and the failing report, checks again after the agent finishes, and
stops the route as "needs a human" after `--attempts` tries. Every attempt, with the agent's output, is
appended to `.migrate/run.log`. Run `setup` first so the agent has the MCP tools.

## What check compares

Every page loads frozen: `Date` and `Date.now` start at a fixed instant and move only when a timer
fires (to the time it was due), `performance.timeOrigin` is that instant, `Math.random`,
`crypto.getRandomValues` and `crypto.randomUUID` are seeded, the timezone and locale are fixed
(UTC and en-US unless `--timezone`/`--locale`), screenshots finish or cancel CSS animations and
transitions (the reduced-motion check still sees them run), and requests to known ad, analytics,
tag-manager, session-replay and client-side experiment hosts are blocked (`src/check/trackers.ts`;
`--block` adds a host, `--allow` lets one load). `--no-freeze` turns freezing off. The server's own
clock cannot be frozen from the browser, so the repeated old loads below still catch it, and the report
lists every element that still varied and why. With `--source`, the old app's code is scanned for
sources of variation, each reported as pinned, blocked or left to the noise baseline.

Each route is loaded twice on the old app and once on the new one, at a desktop (1280x800) and a
mobile (390x844) viewport. When the two old loads differ, a third old load is taken after the new one.
A text line that differed between old loads may vary only in the characters that varied there, and
only within the same kind of character (digits stay digits); everything else must match.

| Dimension | Compared |
| --- | --- |
| `http` | status code, redirect chain, content type |
| `auth` | with `--auth`: whether each role is let in or turned away, and where to; the cookies signing in sets, by name and attributes |
| `rendered` | accessibility tree and visible text |
| `visual` | full-page screenshots, outside the noise mask, and screenshots in every forced CSS state |
| `seo` | title, description, robots, canonical, Open Graph, Twitter, hreflang, JSON-LD (as data) |
| `assets` | public files still served at the same URL with the same type (a file counts as build output only if its name carries a content hash that the built HTML, JS or CSS refers to); images at each position decode to the same size; the font file that renders each element's text, by content hash, so a renamed family is not a difference and a swapped file is |
| `css` | computed styles of every visible element, paired by accessibility role, name and landmark path, in the default state and in every state the old stylesheets style (`:hover`, `:focus-visible`, `:checked`, `[open]`, each viewport and container width edge, `prefers-color-scheme`, `prefers-reduced-motion`), each difference traced to the old rule's selector, file, line and column |
| `a11y` | axe-core violations (the new page may not add any), landmarks, focus order by Tab, animations under reduced motion, and every keyboard path (Enter and Space on controls, Escape and ArrowDown in what they open) |
| `i18n` | `lang`, `dir` and text direction, the formats of dates and numbers in the text, and the page each Accept-Language lands on |
| `behaviour` | interactions explored on the old page and replayed on the new one: the URL, what appears and disappears, app requests (method, path, body shape), console errors, live-region announcements and focus after each step |
| `network` | every request the page makes, in the browser and, when the server runs the request recorder, while the server renders it: method, URL (the app's own origin, ids, timestamps and cache-busters normalised, query keys and values kept), body shape, how many times, and which response fields the page shows |
| `data` | non-page endpoints as data, with the same noise rules as pages: feeds item by item (keyed by guid, id or link), JSON field by field, `/.well-known` files, the manifest; robots.txt lines and sitemap entries count as `seo` |
| `weight` | JavaScript on the wire and run at load (Chromium coverage); red when the new route is heavier |

### Which routes, and where a failure comes from

`check --all` needs `plan --source`. It checks every crawled path, and every route only the source knows:
a dynamic segment takes a value seen in a crawled path for a segment of the same name, or one from
`.migrate/samples.json` (`{ "slug": "first-post" }` by name, or `{ "/blog/:slug": "/blog/hello" }` by
pattern); a route nothing gives a value is reported as "needs a sample". It also checks the source's GET
route handlers, `robots.txt`, sitemaps (including those robots.txt names), feeds and the manifest the
pages link to, and common `/.well-known` files, whenever the old app serves them as something other than
HTML. Any `--route` whose old response is not HTML is compared the same way.

With `--source` (old) and `--new-source` (the Markless app), each failure about an element carries a
`where` line, for example `old app/[lang]/tip.tsx:10 renders paragraph "Barista’s tip:"; new
pages/index.tsrx:12 renders paragraph "Baristas’ tip:"`, and report.html links both to the editor
(`vscode://file/...`). The old side is found, in order, from data attributes (`data-source`,
`data-inspector-*`, `data-sentry-source-file`), Svelte's `__svelte_meta`, Vue's `__file`, React's
`_debugSource` or owner stack in development builds, and in production builds the React component
function behind the element, located through the debugger and the build's source maps, then the element
inside it; failing that, the element is found in the source by tag, written text and accessible name, and
text that comes from a dictionary or constant is named too. A CSS failure names the source rule, through
the stylesheet's source map or, without one, by selector in the source stylesheets. Markless builds carry
no source locations yet, so the new side is found in the `.tsrx` source the same way, preferring the
page file Markless names for the route and what it imports; when the new page lacks the element the
failure names that page file.

### Logged-in pages and bot protection

`plan --source` reads the old app's auth guards and writes a starter `.migrate/auth.json`: the roles they
check and the login route, with login steps read from the login form. Put each role's credentials in the
environment it names, then pass the file to `check --auth` (or `auth` to `check_route`):

```json
{
	"loginRoute": "/login",
	"roles": {
		"member": { "login": [{ "goto": "/login" }, { "fill": { "label": "Email" }, "value": "${MEMBER_EMAIL}" }, { "fill": { "label": "Password" }, "value": "${MEMBER_PASSWORD}" }, { "click": { "role": "button", "name": "Sign in" } }, { "wait": "/account" }] },
		"admin": { "storageState": "admin.json" }
	}
}
```

A role signs in by its login steps (`goto`, `fill`, `click`, `press`, `wait` for a path or a selector)
once per app per run, or uses a Playwright storage state file (`{ "old": ..., "new": ... }` when the apps
are on different hosts). Every route is then checked anonymous and once per role, and the report, the
summary and report.html group the routes by role. `auth` goes red when the new app lets a role see a page
the old app kept from it (or the reverse), sends a turned-away visitor somewhere else, or sets the
session cookie with different attributes. When the two apps let a role in differently, that page is not
compared further for that role.

When a route is answered by a bot wall (Cloudflare, Akamai, DataDome, PerimeterX, Imperva, AWS WAF,
Vercel, hCaptcha, reCAPTCHA or Turnstile challenge pages, or a 403/429 that asks if you are a robot) on
either app, check stops that route as blocked, with the vendor and what gave it away, instead of
reporting every check red. Point check at a staging URL, or pass the bypass token: `--header
'x-bypass-token: ...'` (sent only to the apps' own origins), `--cookie name=value`, and `--user-agent`
when the wall allows a known agent.

### Server requests, recorded data and writes

`markless-migrate recorder` prints the `NODE_OPTIONS` that load the request recorder into a Node server
(Next.js, Nuxt, Remix, Express, Nitro...). Start both apps with it. While `check` loads a page, the
recorder files every request the server makes for it: `fetch` with method, URL, body and response,
and `node:http`/`node:https` (axios, got, most SDKs) with method, URL and status only. Requests from
other runtimes (Python, Ruby, PHP, Go, edge workers) are not recorded; for those, only browser requests
are compared. The recorder answers the checker on the app's own origin under `/__markless-migrate/`,
to loopback callers only, or to callers sending `MARKLESS_MIGRATE_TOKEN` when it is set.

`--data record` saves what the old app fetched for each route (server and browser responses) in
`.migrate/data/<route>.json`. `--data replay` serves those responses to both apps: in the browser
for requests to other origins, and on the server through the recorder, so both render the same data
even when they are pointed at different backends. A request is answered from the recording by its
exact URL, or else by the same path and query on any host; the app's own API routes still run.

Writes are classified before they are sent: form posts, non-GET requests, Next.js server actions,
and any request a handler the source scan marks as writing. They are sent only when both origins are
on this machine or `--staging` marks them as staging apps with test data. Otherwise each write is
answered by the checker without reaching the app, and compared old vs new as `would POST /path {shape}`.
Server-side writes the app makes while handling a request cannot be held back.

## Intended differences

Every failure carries an id (in `[brackets]` in the summary, `id` in report.json) that stays the same
across runs while the same difference is seen on the same route, role and viewport (the two origins are
replaced by `OLD` and `NEW` before hashing, so other ports do not change it). `accept <id> --reason ...`
adds it to `.migrate/accepted.json`:

```json
{ "accepted": [{ "route": "/about/", "dimension": "seo", "check": "title", "match": { "expected": "\"About | Lighthouse Walks\"", "actual": "\"About us | Lighthouse Walks\"" }, "reason": "Marketing renamed the page", "by": "Jack", "date": "2026-10-16", "id": "3f2a9c01de" }] }
```

Entries may be edited by hand: `route` is a glob (`*` within a segment, `**` across), `role` and
`viewport` narrow it, `dimension` may be `*`, `check` is a glob, and `match` takes `expected`/`actual`
(exact, or `/regex/flags`) or `element: { role, name }` (a failure about that element). A failure an
entry matches is shown as accepted, with the reason, in the summary, report.html and `status`, and does
not turn its route red; a route that was not fully compared (blocked, or let in differently) stays red.
An entry for a route checked in this run that matched nothing is listed as stale. The skill tells
agents to propose an accept to the user and never write the file themselves; the MCP server has no
accept tool.

## Switching routes over

`switch <route>` adds the route (a path, or a pattern like `/blog/:slug`) to `.migrate/switched.json`.
It refuses unless the route's last check is green for every role it was checked as; `--force <reason>`
switches it anyway and records the reason and the checks it overrode. `unswitch` sends it back. The
MCP server's `switch_route` never forces. `status` marks switched routes.

`proxy` serves both apps on one origin while you migrate: page loads of switched routes go to NEW,
every other page load to OLD. Everything else (scripts, styles, images, fonts, fetches, form posts) goes
first to the app that served the page it came from (by `Referer`), then to the other app when that one
answers 404, 405, 410 or 501. Method, body, headers and cookies pass through (Host, Origin and Referer
are pointed at the upstream, `X-Forwarded-*` added). A redirect to either app's own absolute URL is
pointed back at the proxy, and a `Set-Cookie` Domain that would not apply to the proxy's host is
dropped, so a cookie one app sets (consent, cart, session) reaches the other: the cookie and asset
breakage Shopify Hydrogen's proxy hit. Each response carries `x-markless-migrate-side: old|new`.
`switched.json` is read on every request, so `switch` takes effect without a restart.

`config` writes production routing for the same list. `--vercel` writes a `vercel.json` for a project in
front of both deployments: a rewrite per switched route (with and without the trailing slash) and per
asset its NEW page loads that OLD does not serve (a whole directory when OLD has nothing in it), then
`/:path*` to OLD. `--nitro` writes `routeRules` for a Markless app in front: a `proxy` rule per
inventoried route and endpoint not switched yet, and per asset OLD's pages load that NEW does not serve.

## Demo

A real migration you can open: the Vite fixture deployed as the old app, its Markless port as the new
one, and the report between them.

- Front door: https://markless-migrate-demo.vercel.app, switched routes from the new app and the rest from the old
  one (`markless-migrate config --vercel`); the demo's index is `/_migrate/`, the report `/_migrate/report.html`
- Old app: https://migrate-demo-old.vercel.app, new app: https://migrate-demo-new.vercel.app, CMS: https://migrate-demo-cms.vercel.app

`examples/` holds both apps and the CMS; `deploy/deploy.sh cms|old|new|front` builds and deploys each.
`examples/MIGRATION-LOG.md` records every agent attempt and every problem found on the way.

## Development

```bash
pnpm install
pnpm browsers      # once: downloads Chromium for Playwright
pnpm typecheck
pnpm test          # unit tests and the three fixture suites, about five minutes
pnpm test:unit     # unit tests only, a few seconds
pnpm test:e2e      # fixture suites only
```

CSS is parsed with [yuku-css](https://github.com/thejackshelton/yuku-css), which is not on npm yet:
`package.json` links it from a checkout at `../yuku-css` (build it there with `bun run build`).

`fixtures/` holds a Next.js App Router app and a Vite multi-page site, each with an Arabic (RTL) locale,
Accept-Language negotiation at `/`, a menu, a counter and a form. The fixture suites build each one,
check it against a separate build of the same source (must be green), and then against 35 mutated
copies each: one per check, from a changed title to a hover colour, a breakpoint moved by 40px, a font
file swapped under the same name (and a font renamed, which must stay green), a removed label, a
positive tabindex, a counter that adds 2, a form that posts elsewhere, a changed label next to a
`Math.random()` tip, and four network contracts: a query field dropped, another endpoint, a second
fetch, and a server request replaced by hardcoded text, and three non-page endpoints: a feed item
removed, a robots.txt line changed and a JSON field renamed. Both fixtures render from a small JSON CMS
(`fixtures/cms/server.ts`) on the server and in the browser, and run with the request recorder. The
suites also replay recorded data to an app on a second CMS with different content (must be green), and
check writes through a guard on a non-loopback address that fails the test if any write reaches it. Each mutation must turn red
exactly the dimensions it affects, with the expected message, and the failures that concern an element
must name its old and new source line. `fixtures/markless-site` ports two routes of the Vite site to
Markless with the published `@markless` packages; its suite checks the Vite site against it and
requires each failure to name the `.tsrx` file and line. Mutated copies are built in `.mutants/`.

Both fixtures also sign in with a cookie session: a member and an admin, a members-only page, an
admin-only page, and a redirect to the login page for anonymous visitors. Their suites check each role
against a rebuild (green, from the starter auth file `plan` writes), against four auth mutations (the
members page shown to anonymous visitors, the admin page shown to members, a different login redirect
target, a session cookie without HttpOnly and with SameSite=Strict), each red only as the role it
affects, and against a copy behind a Cloudflare-style challenge, which must stop as blocked until the
staging pass is sent as a header or cookie.

## License

MIT. The fixtures include the Inter font under the SIL Open Font License (`fixtures/INTER-LICENSE.txt`).

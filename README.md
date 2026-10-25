<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-on-dark.svg">
  <img src="docs/assets/logo-on-light.svg" width="96" height="96" alt="">
</picture>

# Markless Migrate

Markless Migrate (`@markless/migrate`) moves an existing app to [Markless](https://markless.dev) with your own coding agent, and proves every route still works before it switches over.

Your agent (Claude Code, Codex, Cursor...) does the converting. This tool does the rest:

- **plan** takes stock of the old app: routes, SEO metadata, assets and locales.
- **check** compares the old route and the new one in a real browser and reports every difference in a form your agent can fix.
- **switch** moves a route to Markless only when its check is green, behind a proxy (local) or
  generated Vercel and Nitro routing (production) that sends every other route to the old app.

Every report also shows how much JavaScript runs at load on each route, before and after, and how soon
each control answers its first use and each link shows the next page, on a desktop and on a phone with
the CPU slowed 4x: `First interaction: old 40 ms → new 230 ms (4x CPU)`.

Status: early. `plan`, `check`, `cli`, `status`, `switch`, `proxy`, `config`, `setup`, `run` and the MCP server work. See [docs/plan.md](docs/plan.md).

## Commands

```bash
markless-migrate plan --old http://localhost:3000 [--source ../old-app] [--built ../old-app/dist] [--auth .migrate/auth.json] [--limit 100] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>] [--no-caching]
markless-migrate check --old http://localhost:3000 --new http://localhost:5173 [--route /about]... [--open]
    [--source ../old-app] [--data record|replay] [--live-window <seconds>] [--staging] [--block <host>]... [--allow <host>]...
    [--no-freeze] [--time <iso>] [--seed <n>] [--timezone <tz>] [--locale <tag>]
    [--auth .migrate/auth.json] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>]
    [--all] [--allow-unchecked] [--new-source ../markless-app] [--concurrency 4] [--changed]
    [--journey-budget <seconds>] [--max-journeys <n>] [--journey-depth 4] [--timeout 1800]
    [--no-responsiveness] [--interaction-budget 200] [--cpu-throttle 4] [--interaction-controls 16] [--no-motion] [--no-cache]
    [--no-navigation] [--nav-entries 2] [--nav-destinations 40]
markless-migrate usage [--old <origin>] [--built <dir>] [--source <path>] [--new-source <path>] [--json]
markless-migrate guard build [--dir .output]
markless-migrate guard page --old http://localhost:3000 --new http://localhost:5173 [--route /about]...
markless-migrate cache plan|apply|check [--old <origin>] [--app <dir>] [--new <origin>] [--route <path>]...
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
`check --all` also takes every route the source scan knows (see below) and the old app's non-page
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
shows what it would change. Paths and their sources: [docs/notes/agents.md](docs/notes/agents.md).

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
copy that refreshes spends the real login (see [docs/notes/agents.md](docs/notes/agents.md)).

## What the old site uses, and what the port may ship

`plan` also writes `.migrate/usage.json`, the semantic usage inventory: every behaviour the old pages use in the
browser, read from each page's markup (served, or the old build output with `--built`), the syntax tree of every
script the pages run (oxc), the theme config and the library scan, each with the routes that use it and where it
lives (a source file and line, or a page and element). For example, from htmx.org's own pages: `hx-post` on an
input with `keyup changed delay:500ms` swapping `outerHTML` into `#search-results`; `on click toggle .show on
#nav` (a _hyperscript feature); `classes="add appear:100ms"` (class-tools); the GitHub star button that
`buttons.js` frames; and every fake endpoint `/js/demo.js` serves (`onGet("/contact/1/edit")`). From a Docusaurus
site: the colour-mode toggle with `respectPrefersColorScheme: true` from `docusaurus.config.ts`, the DocSearch
dialog, the docs sidebar, tabs and the inline script that sets `data-theme` before the page paints.

`.migrate/obligations.json` lists the checks each behaviour must pass, with steps a checker can run ("theme toggle:
click it 3 times (system → light → dark → system) with the OS in light mode, then in dark mode", "search: close by
Escape, by clicking the backdrop and by its close button, during and after the open animation", "GitHub button:
the frame's box and inline style equal the old page's"). Each obligation names the mechanism that performs it;
those this checker does not have yet (sequences, pinned animation frames, in-place navigation against a fresh
load, loads with stored state preset) are counted as unchecked, never as passed. `usage` prints used /
implemented / checked: a behaviour is implemented when `.migrate/usage-map.json` names the file (or the
`@markless/ui` family) that implements it and the new app has it.

No other framework's runtime is kept: React, Vue, Svelte, htmx, Alpine, _hyperscript, jQuery or a framework's
component bundle never ships in the port; what the pages use of it is implemented in Markless. JavaScript-only
libraries (Chart.js, Leaflet, Monaco, Sortable, Rive...) are kept as they are during the migration and listed as
kept libraries; `upgrade` measures them afterwards (below). Only
static assets (CSS and the pages' own `<style>` blocks, fonts, images, SVG, media) are copied byte for byte. Two
guards hold this, and `run` applies both to every route it checks:

- `guard build` reads every script and inline script of the new app's build output and fails when one defines
  another framework's runtime (recognised by what its code defines, so a page whose text talks about htmx is not
  one). `foreignRuntimeGuard()` in `src/client/guard.ts` does the same inside `vite build`.
- `guard page` loads each route on the old app twice and on the new one once, and fails when a static asset the
  old page loads is missing or has other bytes, a `<style>` the old page is served with is gone, an inline style
  differs, a frame or a sized element has another box (beyond 1 px), or the new page runs another framework's
  runtime. What differs between the two old loads is left out and listed. An intended addition (the licence badge
  on a demo copy) goes in `.migrate/guard-allow.json` with its reason (`{ "allow": [{ "subject":
  "div.port-attribution*", "reason": "licence badge for this demo copy" }] }`) and is then listed, not red; a
  foreign runtime is never allowed.

`guard build` tells a runtime a page loads from a file that is only served: a file counts as loaded when the
app's bundles or built pages name its URL (or a file they load does). htmx.org serves htmx.js, its source and
its test suite as downloads; those pass, listed as allowed, while a page that loads htmx fails.

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

## Third-party embeds

A YouTube or Vimeo player, an X, Bluesky or Mastodon post, a GitHub star button or gist, a link card, or any
other site's iframe or widget becomes a Markless component in real markup: the embed's real text, images and CSS,
fed by its real data, with nothing loaded from the provider until a visitor activates it. Activation loads the
original embed unchanged in its place, or leads where the embed leads. Each embed goes through the same loop as a
page:

- **Detect.** `plan` (and `usage`) write `.migrate/embeds.json`: every embed on every page, by provider, read
  from frames by address (`youtube.com/embed/<id>`, `iframe.mediadelivery.net/embed/...`, any other site's
  frame by its host), loader scripts (`platform.twitter.com/widgets.js`, `buttons.github.io/buttons.js`, the
  YouTube iframe API), provider markup (`blockquote.twitter-tweet`, `a.github-button`,
  `blockquote[data-bluesky-uri]`) and click-to-load facades the old site already uses (lite-youtube-embed,
  react-lite-youtube-embed). `markless-migrate embeds` prints them by route.
- **Keep, with the reason.** An embed stays exactly as it is when it must be live at load (chat widgets, live
  streams, timelines), plays at load (`autoplay`), is driven by the page's own code (`enablejsapi=1`, a loader with
  no placeholder), shows the signed-in visitor's own state (comments, sign-in, captchas, payments), is an ad, or
  its provider's terms forbid recreating it (Spotify, Google Maps). `upgrade` measures what each kept embed costs:
  bytes, requests, FCP and LCP on a phone with the CPU slowed 4x, with it and with its hosts blocked.
- **Study.** `markless-migrate embeds study` loads each old page, lets the embed settle and writes
  `.migrate/embeds/<id>/`: pictures at rest, hovered and focused, at desktop and mobile in light and dark; the
  settled markup and every visible element with its box and styles (only where the provider's terms allow reading
  it: X forbids scraping, so an X post is rebuilt from its oEmbed answer alone); what a click does; and its data from
  the provider's oEmbed endpoint or official API (YouTube oEmbed, Vimeo oEmbed, X oEmbed, Bluesky's public AppView,
  a Mastodon server's statuses API, GitHub's REST API, a page's Open Graph tags where its robots.txt allows),
  cached for a day.
- **Write.** `run` gives the agent each embed's study and plan. A provider with a pre-built adapter (the result of
  this loop, kept for every site) is installed with `markless-migrate embeds install <adapter>`, which copies a
  certified component into `lib/embeds/` and its data into `lib/embeds/data.json`. Any other provider (Bunny
  Stream, a GitHub Sponsors button) gets a component the agent writes from the study. `run --only embeds` (and
  `check --only embeds`) compares the embeds alone and asks the agent for changes to them and what puts them in
  place alone, so a site's other differences cannot pull it off course.
- **Check.** The embed step of `check` (on by default; `--no-embeds` leaves it out) compares every old embed
  with what the new page has in its place, a component marked `data-markless-embed="<id>"` or the same embed kept:
  pixel for pixel at rest, hovered and focused, at desktop and mobile in light and dark, with two old loads giving
  the noise; then it activates both by a click on the middle and by Enter on the first control, and compares what
  loads in its place, whether media plays, and where it leads. The old, new and diff images go to
  `.migrate/embeds/<id>/check/` and into the report. A value a component shows that the provider has moved since
  (a star count) is accepted automatically only when every other pixel matches. An embed shared by many pages is
  checked once per run.

Adapters: `github-button` (buttons.js's star, fork, watch and follow buttons, in light and dark) and `youtube`
(YouTube's player before it plays, promoted from the component `run` wrote for vite.dev; activation loads the page's
own frame, playing). Vimeo, X, Bluesky, Mastodon, gists and link cards have their detection, keep rules and data
sources in place and go through the same loop until an adapter is promoted. The provider catalog is
`src/embed/providers.ts`.

## After the migration: upgrade

Once the routes are green, `markless-migrate upgrade --new <origin>` measures what the port kept and what it
ported, and suggests what to change; nothing is applied.

- **Kept libraries.** For each JavaScript-only library the new app imports, per route at 4x CPU on a
  phone-sized page: bytes downloaded, JS run at load (V8 coverage), main-thread time at load (a CPU profile),
  and the first use of its own controls (elements whose listeners run its code), or, when the page loads it
  only on demand, the first use of the control that loads it. Its code is found in Markless chunks by the
  build's `byte-attribution.json`, in other scripts by the string literals and property names they share with
  the library's installed code, and in other files (a `.wasm`) by content hash. Each entry gives the measured
  cost, what the app uses of it, the expected saving against a port of the used names (about 1 KB each), the
  risk (a library that draws into a canvas or WebGL is high: check sees only its pixels) and the size.
- **Headless swaps.** For each headless library the old site used (Radix, Reka/Radix Vue, Headless UI, Base UI,
  React Aria, Ark, Melt, Bits...) that the migration ported (`lib/parity/<library>`), the parts, props, states
  (the exact `data-*` values and `--radix-*` properties the old CSS reads), keys, ARIA and behaviours the site
  uses are compared with the matching `@markless/ui` family, read from its API manifest and its own source
  (`--ui <dir>`, or the app's installed package). A swap is suggested only when every row is covered; otherwise
  it is "not yet: missing ...", which is also the list of what the family lacks.

- **Font preloads.** When a page's largest text (its LCP element) paints with a web font the page finds only
  once its stylesheet has arrived and been parsed, and nothing preloads it, `upgrade` measures the page with
  Lighthouse mobile as it is and with `<link rel="preload" as="font" crossorigin>` added after its charset,
  both through the same local proxy so only the preload differs (`--load-runs` a side, as in check's `load`).
  It is suggested only when the LCP comes sooner beyond noise, with the measured saving; `--no-load` leaves it out.

`upgrade accept <id>` writes `.migrate/upgrades/<id>.md`, the agent's task. An accepted entry goes through the
same pipeline: `check --old <pre-upgrade build> --new <upgraded build> --all` must be green on every route.

## What check compares

Every page loads frozen: `Date` and `Date.now` start at a fixed instant and move only when a timer
fires (to the time it was due), `performance.timeOrigin` is that instant, `Math.random`,
`crypto.getRandomValues` and `crypto.randomUUID` are seeded (all but the names Playwright gives the sockets it routes,
which would otherwise be the same in two pages open at once and cross their traffic), the timezone and locale are fixed
(UTC and en-US unless `--timezone`/`--locale`), a capture first waits (at most 3 s) for what the page
load started to settle (a timeout due within that time, such as a loading bar's fade or a demo's fake
server answering after 2 s, and transitions running; a loop does not hold it up), then finishes or cancels CSS animations and transitions (the reduced-motion check
still sees every one that ran since the page started), loops (a live `setInterval`, or a
timeout or animation frame that schedules itself again: a fading demo box, a ticking clock, a
carousel) are held at their start for screenshots and styles on both sides, with what each loop
changed undone and infinite animations paused at time 0, and requests to known ad, analytics,
tag-manager, session-replay and client-side experiment hosts are blocked (`src/check/trackers.ts`;
`--block` adds a host, `--allow` lets one load). `--no-freeze` turns freezing off. With `--server-clock`, a
server started with the request recorder (below) renders each page load check makes at that same instant
(`Date` and `Date.now` read the frozen time while it handles that load; its other requests keep the real
clock), so a server-rendered "posted 3 hours ago" reads the clock the page reads. It is off by default:
a cookie or token the server issues then expires by the frozen clock, so pair it with a `--time` near now.
Otherwise the server's own clock cannot be frozen from the browser, so the repeated old loads below still catch it, and the report
lists every element that still varied and why. With `--source`, the old app's code is scanned for
sources of variation, each reported as pinned, blocked or left to the noise baseline.

Each route is loaded twice on the old app and once on the new one, at a desktop (1280x800) and a
mobile (390x844) viewport. When the two old loads differ, a third old load is taken after the new one.
The old loads and the old page's journeys are kept in `.migrate/cache/` and reused by the next check
while nothing the old page loaded has changed: each response it loaded (the page, its scripts, styles,
fonts and images, on any origin) is asked for again, with its ETag or Last-Modified when it had one, and
must come back 304 or with the same status and content hash; the checker's own code and the options
that shape a capture must be the same too. Journeys are reused only when they made no request to an app
and wrote nothing. `--no-cache` loads every old page again.

A live embed (an iframe or plugin from another origin, or a video) is compared by what the page
controls of it: the element, its address (origin and path), its attributes (size, `loading`, `allow`,
`sandbox`, `title`, `autoplay`, `controls`...), its size and its place; what plays inside it is masked
in every screenshot on both sides (a video is also not painted while the screenshot is taken: a full-page
capture can draw its frame a few pixels off its box, outside the mask), and the requests, frames and scripts its own document makes are the
third party's, left out of `network` and `weight`. A port that drops, swaps, resizes or moves an embed
is red in `rendered` (`embed #1 <iframe>`). What a page's own code fetches from other origins with a GET (a widget's script and
the API it reads, such as the GitHub star button and api.github.com) is fetched once per run and every
load, old and new, gets that answer, so a rate limit that starts part way through a run cannot make one
side differ; an old side from the cache hands the new side the answers it read. Journeys and the timed loads fetch
nothing new from other origins, but a data call the page's load already made, or one to a host the old source's API clients
name (with `--source`), gets the run's one copy of that answer there too: a single-page app reading its own API on another
host is explored as the app, not as its error screen.
A text line that differed between old loads may vary only in the characters that varied there, and
only within the same kind of character (digits stay digits); everything else must match.

| Dimension | Compared |
| --- | --- |
| `http` | status code, redirect chain, content type (an old single-page app that moves to another address in the browser as it loads, and a new server that redirects to that same address, give the same answer, on the route, its other trailing-slash form and in the route list); and that the new page carries none of the markers an old framework's runtime writes for itself (hydration flags such as `data-has-hydrated`, `data-reactroot` or `data-server-rendered`, head-manager attributes such as `data-rh`, data scripts such as `__NEXT_DATA__`, Astro's component wrapper elements, a `<meta name="generator">` naming the old framework), in the served HTML or once loaded, unless the new page runs that framework itself (a rebuild, not a port); the old page carrying them is never a difference (the list is `RUNTIME_MARKERS` in `src/check/residue.ts`) |
| `auth` | with `--auth`: whether each role is let in or turned away, and where to; the cookies signing in sets, by name and attributes, and the local storage keys it leaves |
| `rendered` | accessibility tree and visible text |
| `visual` | full-page screenshots, outside the noise mask, and screenshots in every forced CSS state |
| `seo` | title, description, robots, canonical, Open Graph, Twitter, hreflang, JSON-LD (as data) |
| `assets` | public files still served at the same URL with the same type (a file counts as build output only if its name carries a content hash that the built HTML, JS or CSS refers to); images at each position decode to the same size; the font file that renders each element's text, by content hash, so a renamed family is not a difference and a swapped file is |
| `css` | computed styles of every visible element, paired by accessibility role, name and landmark path, in the default state and in every state the old stylesheets style (`:hover`, `:focus-visible`, `:checked`, `[open]`, each viewport and container width edge, `prefers-color-scheme`, `prefers-reduced-motion`), each difference traced to the old rule's selector, file, line and column |
| `a11y` | axe-core violations (the new page may not add any), landmarks, focus order by Tab (a frame is one stop, however many stops its own document has), animations under reduced motion, and every keyboard path (Enter and Space on controls, Escape and ArrowDown in what they open). Each pop-up or composite widget (combobox and select, menu button, dialog and popover trigger, tooltip, disclosure, tabs, listbox, menu, menubar, radio group, slider, tree, grid) also runs its WAI-ARIA keyboard sequences: opened, moved through, chosen from, closed by Escape and by a click outside, and reopened, with the focused element, the value and the highlighted and selected items compared after every key (the first 2 widgets of each kind, at most 12 a route) |
| `i18n` | `lang`, `dir` and text direction, the formats of dates and numbers in the text, and the page each Accept-Language lands on |
| `behaviour` | interactions explored on the old page and replayed on the new one: the URL, what appears and disappears, app requests (method, path, body shape; on a step that navigates in place, the reads one side made in the browser are left out when the other fetched the next page from its server, a router fragment or an RSC payload, as what that page reads is its own route's check), console errors, live-region announcements, focus and what the page keeps in the browser (localStorage, sessionStorage and IndexedDB keys, cookies with their attributes) after each step and after the page loads, how the page answered each step where a visitor sees it (the viewport's pixels before and after the step, outside the used control's own box, and its widgets' state: ARIA values and selections such as `aria-valuenow`, `aria-expanded` and `aria-selected`, `open`, and a track or list that moved by its transform or position or scrolled), red when every old run answered and the new page did not (`answers with: region (carousel) "Gallery" moved | the view changes at (0, 96) 320x96`), red when the new page shows views no old run showed between the step and its result (the painted text read once a frame: a loading placeholder, a list emptied and filled again) for 100 ms or more; how long a placeholder both show stays up is the server's speed, left to `responsiveness`, also red when the new page shifts its layout more during the step (layout-shift entries, Chromium run with scrollbars shown so scroll-lock padding counts) or shows its first change more than 100 ms and 1.5x later after the input; a page with a contents list (in-page links in a nav or aside) is scrolled to each linked section and what marks the current one is compared; a surface that answers the pointer moving over it (a chart) is pointed at across its width; up to 30 journeys run again after arriving at the route in place from another page (a sibling page first); and what each step changed on `<html>` and `<body>` (attributes, class names), in the page's background, text colour and colour scheme, and in stored values (`html data-theme: light → dark`, `localStorage theme: "light" → "dark"`); a control a click uses that stays on the page is used three times in a row (a dialog it opened closed with Escape in between), and when the journey stored something the page is reloaded and the control used once more, every step compared, so a toggle whose second use differs is red at `(step 2 of 5: use 2)` with what each side changed step by step; what a control opens (a dialog, menu, listbox or popover) is also closed by Escape, by a click outside it and by Back when opening it added a history entry, then opened again, and what a close button closed is opened again; a control that stored something is used, then a link is followed (to a page the new app serves, else to this page again) and the page reloaded there, comparing only what the control changed (how the new page loads is the navigation check's); a cycle that changed how the page looks (its background, text colour or colour scheme: a theme or mode) is run again with the OS in dark mode, where a three-way light, dark, system toggle starts from dark, and is reported as `..., with the OS in dark mode`; what a step changed on `<html>` and `<body>` attributes and class names is shown but not compared, since a library's own markers are among them; a step that only reorders nodes (a sorted table) reports which nodes moved; and coverage: every interactive element of the old page, including what a click reveals, is used by at least one journey. Interactive means a native control, an ARIA widget (tab, option, menuitem, switch, checkbox, slider, treeitem; a column header that sorts or takes focus; a row or cell of a `grid` that takes focus or is selectable, the first two of each grid exercised and the rest counted as covered by them) or any element that listens for clicks or keys itself (Chromium's `DOMDebugger.getEventListeners`, or the handler props React, Vue, Svelte and Solid keep on the element when they delegate to the root), found again on the new page by its exact text or label, or, with neither (a chart's bar, a grid's icon button), by its structure and position: its tag, the roles and landmarks around it and its place among the shown elements of that tag there, which its name in the report says (`clickable <rect> #2 in main>figure>svg (no name: matched by structure and position)`). Headers are clicked and pressed Enter on, rows pressed Space, Enter and ArrowDown, cells arrowed through, sliders moved by key, and filter boxes a click reveals are typed into (main content, tables and forms first, until `--journey-budget` runs out), and one that is not keeps the route red until a person accepts it; keyboard journeys and repeated-use or closing sequences the budget left out are red too (`not exercised: 3 keyboard journeys`), so a short budget never passes for a match. A control the pointer cannot reach is scrolled to the middle of the viewport, focused, its holder hovered (a menu that opens on hover, a button that takes the pointer only then) and what covers it dismissed (Escape, then the covering layer's Accept, Close or Dismiss button); one still unreachable is reported with why (`occluded: covered by div.banner "We use cookies"`, `hidden: inside ul.sub: display: none`, `offscreen`) and is accepted automatically when the new page refuses it for the same reason. A control the old page lists but check could not find again or that never settled is tried once more with more patience (6 s instead of 1.5 s per step, on both sides), and stays red when it still cannot be driven: what it does was compared nowhere. Every page gets these journeys, whatever its template group. Controls that end the session or delete (Sign out, Log out, Delete, Remove) are used too, after every other journey, each in a session of its own, and count as exercised: see Writes below; a shared header or sidebar control is exercised by the first route of the run that has it, and every route sharing it carries its result. On the new app a journey that reaches a page not switched yet (`.migrate/switched.json`) is sent to that page on the old app's own origin, as the front door would send it, and runs there exactly as on its own host (with the old side's sign-in), not as the new app's 404; what that page keeps in the browser is the old app's, on another origin, so it is not compared there, and a console error it logs that the old app also logs on a plain load of that page is the old page's own, not the port's |
| `network` | every request the page makes, in the browser and, when the server runs the request recorder, while the server renders it: method, URL (the app's own origin, ids, timestamps and cache-busters normalised, query keys and values kept), body shape (a GraphQL query by its text, without the `__typename` fields Apollo Client adds below the root), how many times, and which response fields the page shows; a request an old single-page app makes in the browser that the new app's server makes while it renders the page (the recorder on the new server, a static host for the old) is the same request, moved, compared by count and fields there |
| `data` | non-page endpoints as data, with the same noise rules as pages: feeds item by item (keyed by guid, id or link), JSON field by field, `/.well-known` files, the manifest; robots.txt lines and sitemap entries count as `seo` |
| `weight` | JavaScript on the wire and run at load (Chromium coverage), not counting what a third-party embed's own document loads; red when the new route is heavier |
| `load` | page load as PageSpeed Insights measures it, after every other check, on one page per template group, as the anonymous visitor. **PageSpeed Insights** (mobile and desktop, `--psi-runs` a side, default 5, old and new in turn) on the deployed URLs, with the key from `PSI_API_KEY`, the project's `.env` or `setup --psi-key`: when it answers, its verdicts gate the route and real users' field data (Chrome UX Report p75) is shown. Without a key it runs on the shared keyless quota, best effort, retrying a 429 with backoff, and when Google still refuses it says `PSI unavailable (quota), using PageSpeed-equivalent (lab)`; it never fails silently and never blocks on a key. **PageSpeed-equivalent (lab)**: Lighthouse mobile here with PageSpeed's settings (Moto G Power emulation, simulated 150 ms RTT and 1.6 Mbps, 4x CPU; `--load-cpu calibrated` derives the slowdown from this machine's benchmarkIndex by Lighthouse's calculator instead, `--load-cpu <n>` fixes it), `--load-runs` a side (default 5, at least 4; as many again when a metric is worse than its floor but not yet beyond noise). It runs in the installed Chrome stable when there is one, else Playwright's Chromium (`MARKLESS_MIGRATE_CHROME` names another), and gates the route when PageSpeed Insights cannot. Each metric (FCP, LCP, Speed Index, TBT, CLS, score) is compared by its median: red when the new median is worse by more than max(100 ms, 5%) (TBT 50 ms, CLS 0.02, 3 score points) and a one-sided exact Mann-Whitney test puts the two sides' runs apart (p < 0.05). The failure names each side's LCP element, its breakdown, the requests that began before the LCP, the HTML size, render-blocking files and the scripts that ran longest; report.html shows the median run's filmstrip. Image loading is checked on every route, from where each image was drawn at each viewport once the page settled: an image no first screen (desktop or phone) shows that still loads with the page (not `loading="lazy"`, or preloaded in the head), a first-screen image held back by `loading="lazy"` (unless a head preload fetches it where it shows), and a phone first-screen image whose one file is more than twice the width a 2x phone needs for its box (no `w` srcset) are each red when the file is 10 kB or more and the old page does not load that image the same way (one it loads the same way is listed as an improvement, not red), with the fix: every request that starts before the largest paint shares the phone's bandwidth with it. A check with `--header` or `--cookie` reports page load as not measured, since Lighthouse would send them to every host it loads. `--no-load` leaves it out, `--no-psi` leaves PageSpeed Insights out; `--only load` (on `check` and `run`) measures it alone, a partial run where every other dimension is not compared |
| `responsiveness` | the first use of every control the journeys exercised, and every internal link they followed, timed on a fresh page load, old then new, at desktop speed and on a 412x823 touch page with the CPU slowed 4x (`--cpu-throttle`). See below |
| `motion` | the transitions and animations each interaction starts, old vs new, with motion allowed and the clock running in real time: the last step of every journey that stays on the page, hovering and keyboard-focusing each control a journey used, and scrolling down one screen. Each transition, CSS animation, Web Animation and style a script writes frame by frame is recorded with its element (paired as the other dimensions pair them), properties, duration, delay, easing and iterations, and media an interaction plays. Red when the old page animates and the new one jumps, when duration or delay differ by more than max(20 ms, 10%) or the easing differs, or when only the new page animates. Every animation an interaction starts is also held at the same moments on both sides (0, a quarter, half and three quarters into the old page's longest animation, and each old animation's last frame and the frame just after it ends, where each page's own end handlers have run), and each element that animates is compared there: shown or not (transparent counts as not shown), its opacity within 0.1, and how far it has moved or grown since the first moment within 2 px (`frame of generic (body/div)`: `old at 150 ms, just after animation exit of generic (body/div) ends: not shown`, `new: shown at opacity 1` is a dialog's backdrop that pops back after its own fade because the new page hides it only when the dialog's longer exit ends). After every journey that opened a dialog, menu or popup (once per alike opener), Escape is pressed and recorded too, so each one's exit is compared whatever the per-route cap leaves out (`maxDismissals`, 16). A canvas on the old page's first screen (a Rive or WebGL hero, which runs no CSS animation, writes nothing to the DOM and is masked as noise in screenshots) is recorded from the start of the document for 6 s, about 30 times a second, twice on the old side and once on the new, and each new frame is matched with the old frame it looks most like: the lag that lines them up is reported as the start-time gap, with how far it spreads, and the canvas is red (`canvas frames from load`) only when the best-matching frames differ by more than twice what the old page differs from a second load of itself (at least 0.5% of the canvas), so a drawing that only starts at another time is reported in `motion.canvases` and not flagged. An interaction that differs is recorded again on both sides, and stays red only if the new page's second recording differs too; every interaction that moved is replayed with `prefers-reduced-motion: reduce` too, where both must agree. report.html shows a filmstrip of each interaction that differs: five frames, old above new, at the same offsets into the old page's longest animation (held and stepped, so frames do not depend on timing). An interaction whose write the checker held back is left out (listed under skipped): what a page animates after a write follows the server's answer, and each app reacts to the checker's empty 204 in its own way (an optimistic toggle undone, a toggle that waits for success), so its motion is compared only when writes are sent; its hover and focus still are. Before an interaction is recorded the page settles (timers due within 3 s fire, finite animations end), then every loop, including one that has scheduled itself only once by then, is held with the timers it scheduled (a poll's fake server answer), and what those changed is undone with it, so both sides are held at the same phase whatever their load times; loops are held at their start while interactions are recorded, so what a loop keeps doing is not counted as an interaction's motion, and are compared on their own: each attribute, text or child list a loop kept changing, on the same element, at its period within max(20 ms, 10%) (`loop on generic "Toggle Demo"`), red when the new page lacks the loop or adds one. `--no-motion` leaves the interactions out |
| `navigation` | the new app alone: a page reached by an in-place navigation must be the page a fresh load of its URL shows. One page per page shape (its layout, external scripts and number of inline scripts, from the served HTML; at most `--nav-destinations`, 40, layouts taken in turn) is reached by clicking a real link (one the checker adds when no page links there) on `--nav-entries` (2) other pages, other layouts first, and once more after using the entry page's control that keeps its state in the browser (a theme switch: a button whose click changes localStorage or a cookie); then the destination's own controls are used (that switch twice, then one control in the content), then back and forward. Each moment is compared with a fresh load of the same URL with the same kept state: `<html>` and `<body>` attributes, the head, the stylesheets that apply, the DOM, key computed styles, a screenshot (canvases, videos and embeds masked; what changed on its own within a second of the fresh load left out), the script files that ran, the globals the page's scripts define, and console errors. A link that loads a whole new document is a fresh load already and is not compared, nor is a swap the page's own code (htmx's `hx-boost`) made instead of the router. A difference the old app shows too when reached the same way is its own and not reported; `<html>` class and data-* attributes are also compared with the old app's, fresh (`rendered`) and reached in place. Catches what Markless 25196c52 (a swapped-in page's scripts not run: `htmx is not defined`) and 8d7669f8 (the homepage's `data-theme` kept on the next page, so turning the theme back to light left it dark) fixed. `--no-navigation` leaves it out |

### Responsiveness: the first interaction and the next page

Owners feel a slow first click on a phone, not on a fast laptop, and in resumable frameworks the handler
runs after the event, so Event Timing alone under-reports. For each control, check loads the page fresh,
waits until it is quiet, watches 300 ms for nodes that change on their own (a clock, a carousel), then
uses the control with real input (Playwright mouse or touch, keystrokes for a text box) and times the
trusted `pointerdown` (or first `keydown`) to the next frame after the first DOM change it causes, or
Event Timing's `duration` when that is longer. It also records what the interaction fetched (code, data
and other files, with bytes; a fetch is code when it is a script or JavaScript or WebAssembly), scripts
first evaluated (a runtime starting) and long animation frames with their longest script, then uses the
control again on the same page for a warm figure. A link that navigates in the page is timed to the
frame after the main content changes; a link that loads a new document, to that document's first
contentful paint (both clocks are the documents' own `timeOrigin`), with the document's server time
(the checker's first fetch of it, the whole answer, network included), the same document fetched again
straight after (a cold server function shows as a big gap; an idle function cannot be forced cold from
here), its HTML bytes, what the host says about it
(`x-vercel-cache`, `age`, `cache-control`) and the prefetch hints the old and new page had when the
pointer went down.

The network is the same on both sides while timing, so an old app on this machine (a mirror answering in
1 ms) and a new one on a CDN (40 ms away) compare as apps, not as hosts: every GET a timed page makes is
fetched from its app once per route (`route.fetch`, cookies and all), and every load then gets that copy
`--network-latency` (40 ms) after asking, on both sides; other origins' files get the same delay. A run
whose interaction had to fetch a copy first waited on the real network, so the pair is measured again.
After a write reaches an app (writes are sent only to staging or this machine), its data GETs are fetched
again each time. Server time is reported beside the timings (`Network while timing: ...` under the
headline, and in each navigation's likely cause), not counted in them: a slow server alone does not make
a link red. Responses reach the page whole, so a streamed page gets no head start from streaming.

The new app is timed on its own, not through the front door; a link into a page it
answers with 404 is reported, not timed.

A first interaction is red when it is slower than the old app's slower run by more than max(16 ms, 10%,
how much the old runs differed) at either
speed, over `--interaction-budget` (200 ms) at 4x, or fetches code (an interaction never fetches code in
Markless), unless the old app fetches code on the same interaction in every run and the new one fetches
no more (VitePress loads its search box and index when search opens). A link is red when the next page shows later than on the old app by the same margin at 4x;
its desktop figure is reported. A control that exceeds once is measured again, old and new,
and is red only when both runs exceed (the slower is then kept); the slowest control at each speed is
always measured twice so the report states how much runs vary. Up to `--interaction-controls` (16)
controls per route are timed, in-page ones first and at most 6 links; what was left out, and controls
reached only by keyboard or by choosing an option, are listed, and so is a control the phone layout
hides. Writes stay held back, so the time of an interaction that writes is reported but not judged (code
it fetches still counts). Whether a control's result is right is the `behaviour` dimension's business: a
text box whose typing changes no DOM on the new page is not red here. The summary, report.html and `status` lead with the slowest
figure on each side, `First interaction: old X ms → new Y ms (4x CPU)` and `Navigation: ...`, with each
route's slowest control and a table per route; `report.json` carries the same as `responsiveness`
(`interaction` and `navigation`, each `desktop` and `throttled` with `old`, `new`, `oldAt`, `newAt`, and
`routes`), and each route's full timings under its own `responsiveness`. `--no-responsiveness` leaves it out.

### Widget probes: what a library's widgets do between the clicks

Journeys compare what one use of a control changes. A library's widget also has behaviour between and
around the uses, and a port can lose it while every journey still matches. So each page route also gets
widget probes: one control of each kind (its region and component slot, else its tag and role) is driven
through its class's sequence on the old and the new page at once, each from a fresh load, and after
every step check reads what a visitor meets: where focus is and whether its ring shows (`:focus-visible`
and `data-focus-visible`), the state attributes of the control and of its widget (`aria-expanded`,
`aria-selected`, `aria-valuenow`, `data-state`, `data-highlighted`, `data-pressed`, `data-hovered`,
`data-separator`...), what is open (with its highlighted and chosen items), the toasts shown (with
`data-front` and `data-expanded`), the widget's tab stops, whether scrolling is locked and the page
behind is hidden or inert, the offsets a drag moves, what the control's form would send (a hidden
input that follows a select's visible value), and how many lines each open pop-up shows (a layer
whose content is rendered twice shows twice as many).

| Class | Which controls | Sequence |
| --- | --- | --- |
| `modality` | every focusable control | a click, then Escape, Tab and Shift+Tab (in a text field: a click, typing, then the same keys); Tab to it, Escape, the pointer moving, Tab, Shift+Tab |
| `popup` | a button that says it opens something (`aria-haspopup`, or `aria-expanded` with `aria-controls`), a combobox, and a button whose click on the old page opened something (React Aria's dialog trigger says nothing) | open by a click, point at its first two items and away, a click outside, open again, choose its first item by pointer, open again, Escape, open again, its close button, Escape; then a list (menu, listbox) is opened by a click, moved in with ArrowDown twice, typed into with the first letter of each item, closed, opened again and left with Tab, and anything else (a dialog, a popover) is tabbed through both ways |
| `hover` | a button, tab, toggle or link that listens for the pointer passing over it (a link only when it also carries `data-state`, `aria-describedby`, `aria-haspopup` or `aria-expanded`: Next's links listen to prefetch) | point at it, move away, point again, click, move away; Tab to it, Escape, Tab. Each step waits out timeouts due within a second, so a hover card's open delay is seen |
| `drag` | a slider, a focusable separator (a resize handle), a carousel (`aria-roledescription="carousel"`) | dragged by the pointer one way and back |
| `repeat` | a button whose click showed a toast or announced something in a journey or a probe | three clicks in a row, then the pointer on the toasts and away |
| `tab stops` | a tablist, radiogroup, toolbar, menubar, grid, tree, or a group of toggle buttons | Tab in, each arrow, Space, Tab out and Shift+Tab back |
| `context menu` | an element with no role that answers a right click (a React or Vue `onContextMenu`, or its own `oncontextmenu`), counted among the innermost role-less elements of its text on both pages, so a port that answers it from a delegated handler still has it | right-click it, point at an item and away, Escape, right-click again, a click outside, right-click again, choose an item, right-click again and type the first letters of its items |
| `toggle` | a checkbox, a switch, a button with `aria-pressed` | Tab to it, Enter, Space, a click, Enter again, Tab; a click on its label (by `for`, by wrapping it, or by `aria-labelledby`), Space, Tab |

A step that differs is red (`a11y` for focus rings and tab stops, `behaviour` otherwise) with the
control, the class, the sequence, the step and what each side showed there, and the converter parts
whose selectors match the control or what it opened (`Likely part: parts/resizable.ts`). A difference
the two pages already had at load in a library's markup is the rendered check's, unless a step changes
it on one side only; when the first old and new runs differ, the old side runs again, and what differs
between its two runs is noise there (a line may then vary only in its digits); offsets a drag leaves
agree within 2 px or 2%, scroll positions within 40 px, and fractional values (a panel at 65.7%) are
read to the whole unit. A control in a shared header, nav, sidebar or footer is probed on the first
route of the run that has it. Up to 40 controls a route are probed, within max(60 s, 30 s a control
divided by the pairs probed at once, 2), at most 10 minutes, counted from the end of discovery; one left out, and one check could not
find again on the old page, is red as `not exercised`; the controls an alike one stood for are listed in the report (`widget probes: 13
controls driven (205 alike stood for by one of their kind)`). The probes take about a minute a route
on a docs page with a dozen kinds of widget.

The route is also loaded with the frozen clock moved 40 days and 7 hours on, in `Pacific/Auckland`:
text the old page changes with the clock (a date, a relative time, a chart axis) must change on the new
page too, and a new page still showing what the old page shows at the usual frozen instant is red in
`rendered` (`new still shows "January 17, 2026", what the old page shows at 2026-01-15 12:00 UTC, the
instant check freezes the clock to`): the converter wrote check's clock into the page.

`--no-probes` leaves both out; `--only probes` runs them alone (a partial run).

### Which routes, and where a failure comes from

`check --all` needs `plan --source`. It checks every crawled path, and every route only the source knows:
a dynamic segment takes a value seen in a crawled path for a segment of the same name, or one from
`.migrate/samples.json` (`{ "slug": "first-post" }` by name, or `{ "/blog/:slug": "/blog/hello" }` by
pattern); a route nothing gives a value is reported as "needs a sample". It also checks the source's GET
route handlers, `robots.txt`, sitemaps (including those robots.txt names), feeds and the manifest the
pages link to, and common `/.well-known` files, whenever the old app serves them as something other than
HTML. Any `--route` whose old response is not HTML is compared the same way.

`plan`'s link crawl follows pagination until nothing new turns up. Pagination that runs on past its last
page (a "More" link on an empty list, `/news/18` linking to `/news/19` forever) ends where a page shows
what an earlier page of the same route shows apart from its numbers and links on to the next one: that
page is listed, its links are not followed, and plan says so.

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
compared further for that role. With `--source`, a 404 or a page titled "Access denied" (or forbidden,
not authorised, members only, sign in required) on a route behind an auth guard counts as turned away.

When a route is answered by a bot wall (Cloudflare, Akamai, DataDome, PerimeterX, Imperva, AWS WAF,
Vercel, hCaptcha, reCAPTCHA or Turnstile challenge pages, or a 403/429 that asks if you are a robot) on
either app, check stops that route as blocked, with the vendor and what gave it away, instead of
reporting every check red; a wall that only answers the assets, a journey's form post or a forced state
part way through stops it the same way. `plan` takes the same `--header`, `--cookie` and `--user-agent`. Point check at a staging URL, or pass the bypass token: `--header
'x-bypass-token: ...'` (sent only to the apps' own origins), `--cookie name=value`, and `--user-agent`
when the wall allows a known agent.

### Server requests, recorded data and writes

`markless-migrate recorder` prints the `NODE_OPTIONS` that load the request recorder into a Node server
(Next.js, Nuxt, Remix, Express, Nitro...), on any Node from 16 (it loads with `--require`, which older Node
accepts in `NODE_OPTIONS` where it refuses `--import`, and gives a server without `fetch` none). Start both apps with it. While `check` loads a page, the
recorder renders it at the page's frozen time (with `--server-clock`) and files every request the server makes for it: `fetch` with method, URL, body and response,
and `node:http`/`node:https` (axios, got, node-fetch, most SDKs) with method, URL, request body and status (not the response, which is the app's to read). Requests from
other runtimes (Python, Ruby, PHP, Go, edge workers) are not recorded; for those, only browser requests
are compared. The recorder answers the checker on the app's own origin under `/__markless-migrate/`,
to loopback callers only, or to callers sending `MARKLESS_MIGRATE_TOKEN` when it is set.

`--data record` saves what the old app fetched for each route (server and browser responses) in
`.migrate/data/<route>.json`. `--data replay` serves those responses to both apps: in the browser
for requests to other origins, and on the server through the recorder, so both render the same data
even when they are pointed at different backends. A request is answered from the recording by its
exact URL, or else by the same path and query on any host; the app's own API routes still run. A
request the route's own recording lacks is answered from the other routes' recordings (newest first), so
the other pages a journey passes through, such as the page it arrives from, show recorded data too.
With `--data`, every page is rendered on demand rather than from the server's page cache, so what it
fetches is seen: a Next.js build answers a prerendered or revalidated page (`x-nextjs-cache: HIT` or
`STALE`) and a cached `fetch` without running them, so the recorder adds the build's own draft-mode
cookie (from `.next/prerender-manifest.json` in the server's working directory) to each tagged request.
The old app's page loads are then as slow as an uncached render.

Live data from a Firebase Realtime Database (`*.firebaseio.com`, `*.firebasedatabase.app`), which a page reads over a
WebSocket rather than by request, is recorded and replayed too. While recording, every frame of the old page's
database sockets is kept: the first value the server sent for each path the page listened to is the snapshot, and
every value it pushed after that is an update, in order. `--live-window <seconds>` keeps a page of each such route open
that long while recording, so the updates of a busy page (new comments on a story) are heard too. On replay a fake
database answers every socket of both apps from the snapshot (the handshake, each listen with its value, ok to the
rest; writes change nothing), REST reads of the same database (`<path>.json`) get the same values in the browser and,
through the recorder, on the server, and a journey `receive the N updates the old page heard ..., then reload` sends
the recorded updates in at most six steps to whatever each page is listening to, compares each step like any other,
and reloads the page with the updated data still served: how a page shows a live update while it is open, and what it
remembers about it on the next visit, are compared old against new.

Writes are classified before they are sent: form posts, non-GET requests, Next.js server actions,
and any request a handler the source scan marks as writing. They are sent only when both origins are
on this machine or `--staging` marks them as staging apps with test data. Otherwise each write is
answered by the checker without reaching the app, and compared old vs new as `would POST /path {shape}`.
Server-side writes the app makes while handling a request cannot be held back.

Controls that end the session or delete (by name or address: sign out, log out, delete, remove, destroy,
unsubscribe, deactivate) run after every other journey of the route, each in a fresh browser session, and
their dialogs (`confirm: Delete this note?`) are accepted and compared. Where writes are sent, a signed-in
role signs in again from its login steps for each of them, so ending that session spends no other
journey's; a role that has only a saved storage state has their requests held back instead. Where writes
are held back, every request such a control makes to the app is held back too, page loads and GETs
included (`would GET /logout`). Either way the control counts as exercised, with what it sent or would
have sent. The login steps of the `--auth` file are the person's own sign-in for this check: they are
always sent, on any origin, and a login the network fails (a deployment's cold start) is run again once.

A page load that times out or cannot connect is tried again once, 2 s later; when it fails again, and
when one route's check passes `--timeout` (default 600 s, or five journey budgets when that is more),
the route is reported as not checked for an infrastructure failure, naming DNS (`ERR_NAME_NOT_RESOLVED`),
connection (`ECONNREFUSED`) or the timeout (and the request that waited), rather than as red. A route
whose check passes `--timeout` while both apps were still answering, with no request waiting, is not a
network failure: it is red, "ran out of time", and a bigger `--timeout` or `--journey-budget` is the fix
(a page with hundreds of controls, such as a long comment thread). The checker's own requests are retried
the same way. `check` exits 3 when nothing is red but such a route was not checked.

## Converting pages

`convert` writes the Markless app from the old site instead of leaving every page to the agent. Each HTML
route is loaded the way `check` loads it, and the document a visitor's browser ends up with becomes the page's
`.tsrx`: the old framework's runtime is left out (its scripts, its server state and streaming scripts, its
marker attributes and elements), plain scripts and every other tag stay as they were, and inline `<style>`
blocks become stylesheet files. Regions several pages render alike (a header, a docs sidebar) are written once
as components that take the page's path; the current page's link and per-page values are expressions.
Every control ARIA marks as holding content back (`aria-expanded="false"`, an unselected tab, a tooltip
trigger) is used on the old page, and what it shows is kept in an inert `<template>` next to it.

Images load the way a visitor's first screen needs them, from where the old page drew each one at the desktop and
phone captures (and at 767, 768, 1279 and 1920 px, the desktop page resized). An image no first screen shows (below
the fold, or not drawn at all, as a dark-mode twin) becomes `loading="lazy"` and loses the head preload that fetched
it at once; one a first screen shows is never lazy; one drawn in only one range of widths (a desktop banner a phone
hides) is lazy with its preload scoped to that range by `media`. A fixed-width next/image (one file of up to 3840
px for every device) lists the old optimizer's own widths, from the narrowest box it is drawn in up to its file, with
the `sizes` its measured boxes call for, and its head preload follows; those answers are files written at convert
time, so the CDN keeps them for the deployment (`s-maxage`). `check` accepts the smaller rendition as the same
picture (the `responsive-image` rule below).

Which library part each element is comes from the old source, not the markup: the usage inventory names
the export that renders each `data-slot`, and the markup only tells which of the source's candidates an
element is when a site renders several (Radix's, Base UI's and React Aria's tabs). Each part is then driven by
a Markless port of that library (`parts/`: Radix Dialog on the shared dialog engine, Popover, DropdownMenu,
Tabs, Collapsible and Accordion on Floating UI as Radix uses it; Base UI Popover, Menu, Tooltip and Select),
written once and used on every site, delegated from each page's root element. The site's own client
components go in `lib/site/parts.ts` (and `lib/site/mounts.json` for elements a part starts on when shown). A web font a first screen draws that only a stylesheet names is preloaded right after the charset (same-origin woff2, at most four per page with the page's own preloads), so it is fetched with the stylesheet rather than after it. A web font that only text below every first screen uses (a script's face for an RTL demo far down the page) is fetched after the load: capture finds the faces the page loaded without preloading them and the blocks whose text each one draws, and when none of that text is in the desktop or the phone first screen, convert marks those blocks `data-mm-late-font` and an inline script keeps them unrendered (`content-visibility: hidden`) until the load event, so the font no longer competes with the first screen. A theme toggle the site names in `lib/site/controls.json` (`{ "action": "theme", "name": "Toggle theme", "key": "d" }`) answers from the first paint: on a next-themes site, an inline script in the head reads ThemeProvider's options from next-themes' own script, switches the theme in the click's frame before the page's code arrives, and marks the event, so the site's part (`handledEarly`) does only what else its toggle does.
With `--source`, the old config's redirects and rewrites and each route handler answer through a generated
Nitro middleware: a handler runs as the old app's own server code (its local imports copied, JSX data
dropped, `next/server` on the Fetch API); one that needs the old framework is served from the old build and
reported as not ported. `.migrate/convert/report.json` lists what was left out, the endpoints and how each is
answered, and the library parts no port implements yet. `--only <file>` converts the routes listed;
`--fallthrough <old deployment>` makes a preview answer every other page from there, marked
`x-markless-migrate-side: old`.

## Command-line tools

When the product includes a command-line tool (a scaffolder, a code generator, shadcn's `shadcn add`),
`markless-migrate cli` checks the new tool against the old one the way `check` checks pages. Cases live in
`.migrate/cli.json`:

```json
{
	"old": { "command": ["node", "../old-app/packages/cli/dist/index.js"] },
	"new": { "command": ["node", "./bin/cli.js"] },
	"ignore": ["node_modules/", "pnpm-lock.yaml"],
	"replace": [{ "pattern": "id-[a-f0-9]{8}", "with": "id-<hex>" }],
	"cases": [
		{ "name": "init with answers", "args": ["init"], "env": { "REGISTRY_URL": "https://registry.example" },
		  "files": { "package.json": "{\"name\":\"app\"}" },
		  "stdin": [{ "expect": "Which style", "send": "\r" }, { "expect": "Base colour", "send": "\u001b[B\r" }] },
		{ "name": "add a component", "args": ["add", "button", "--yes"], "files": { "components.json": "{}" } }
	]
}
```

Each case runs the old tool twice and the new tool once, each in its own temporary working directory with
the case's `files` written first, a temporary HOME, a clean environment (PATH, TZ=UTC, LANG=en_US.UTF-8,
NO_COLOR=1, then the case's `env` and the side's own `env`) and the case's stdin: plain text, or answers
each sent once its `expect` pattern shows in the output since the last answer (a prompt that never shows
is reported). Compared, with the run's directories, colours, durations, versions and ISO timestamps
normalised in output and file contents (and `replace` applied after), and with whatever differed between
the two old runs allowed to vary: the exit code, stdout and stderr line by line, every file the run left in
the working directory and in `~/` (text contents line by line, binary and large files by hash; `ignore`
leaves paths out), and every request made (method, URL and text body, as a set). A Node tool is started
with `--import` of a network shim that logs `fetch`, `node:http` and `node:https` requests and, by default,
answers `fetch` from `.migrate/cli-network/<case>.json` and refuses the rest, so both tools see the same
registry; `--record` first runs the old tool against the real network and writes that file, and
`"network": "live"` lets every request through. The report is `.migrate/cli-report.json`; `cli` exits 1
when a case differs. Limits: requests a non-Node tool makes are not seen; `node:http` responses are not
replayed (only logged, and refused under replay); prompts read stdin as a pipe, so a tool that needs a TTY
(raw-mode key handling) has to be driven with its own non-interactive flags for now.

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
An entry for a route checked in this run that matched nothing is listed as stale. `accept` is an
expert's tool, never needed to finish a migration: the skill tells agents never to write the file or
run `accept`, and to list a difference they believe is intended in their final report instead; the MCP
server has no accept tool, and an agent `run` drives is refused.

Some differences are accepted automatically, because the check has evidence that no visitor can see
them. Each is labelled `accepted automatically: <rule>` with its evidence in the summary, report.html
and `status`, and carries `accepted.automatic` (the rule) and `by: "markless-migrate"` in report.json and
results.json, apart from differences a person accepted:

| Rule | Accepted when |
| --- | --- |
| the old framework's own code, which the new page no longer loads | an `assets` failure for a script the old page loaded and the new page does not request, whose code carries a UI framework's runtime (React, Next.js, Vue, Svelte, Angular, Solid, Preact, htmx, Alpine.js, by markers only that runtime has). A script the new page requests and does not get is still red, and so is one without a runtime, which another site may embed |
| markup the old framework adds for itself, with the accessibility tree and announcements otherwise the same | a missing accessibility tree line that is exactly the role and text of a framework's own markup the old page has and the new page lacks (Next.js's `next-route-announcer`, Gatsby's, SvelteKit's and Nuxt's announcers), and only while no other line of that route's tree and no announcement after an interaction differs |
| live content inside a third-party embed that both pages show | screenshot differences that all lie inside iframes or images from another origin that both pages load from the same address at the same place, or a third-party image at the same address that came back a different size |
| the same image at another resolution, which the new page lists in a srcset | an `assets` image-size failure or screenshot differences that all lie inside images the new page draws from another width of the old page's file (the same image optimizer source, such as next/image's `url`, or the same path), with the same aspect ratio and at least as many pixels as the box it fills, whose 8 px blocks average to nearly the same colour on both screenshots (resampling moves single pixels, another picture moves the blocks), in the page's screenshots and in every state's; `convert` writes these srcsets so each device downloads the width its box needs |
| an image the page does not draw at this viewport, which the new page loads only once it is drawn | an `assets` image-size failure for an image neither page draws at that viewport (a dark-mode twin, a banner a phone hides) that the old page fetched anyway and the new page marks `loading="lazy"`, so it was never fetched |
| an element neither page lets a visitor use, for the same reason | a "not exercised" control the old page would not let the pointer reach even after the remedies above, which the new page refuses for the same reason (covered, hidden or outside the page); a control missing from the new page, or one the new page lets a visitor use, is still red |
| framework internal: browser storage only the old framework's own code writes | storage keys, after the page loads or after a step, that the old page keeps and the new page does not, each written by the old framework: htmx's `htmx-history-cache` and `htmx-current-path-for-history` when the old page loads htmx's runtime and the new page does not, or a cookie whose value is in a server framework's own sealed format (Laravel's encrypted `XSRF-TOKEN` and session cookie) that the new page does not set; a key the app writes (a theme, a cart, a preference) among them keeps them all red |

Anything else stays red until it is fixed or a person accepts it. An expert may turn a rule off in
`.migrate/overrides.json` (`{ "automatic": { "live-embed": false } }`); the file is optional.

## Libraries that draw their own UI

`plan --source` decides, for every library that draws its own UI into the page (AG Grid, Handsontable,
Chart.js, ECharts, Monaco, Leaflet, Three.js, or an installed package found writing DOM), whether the new
app ports the parts the app uses or uses the library directly, and prints the decision with its reason in
the plan output, `libraries.json` (`decision`), `behaviour.md` and the run report. A framework wrapper
(ag-grid-react, react-chartjs-2, @monaco-editor/react) is always replaced by a Markless port of what the
app uses: React or another UI framework never ships in the Markless app. The library underneath (decided
together with its wrappers, from their combined use) follows the first rule that applies:

1. Set in `.migrate/overrides.json` (`{ "libraries": { "chart.js": "port" } }`, `"port"` or `"direct"`).
2. It draws into a canvas or WebGL (from the catalog, or its code: a WebGL context, or a 2D canvas painted
   20 times or more, not one only measuring text): used directly, because check sees only its pixels.
3. Its behaviour is text editing, or dragging, panning and zooming (editors, maps, carousels): used
   directly, because check's journeys do not perform it.
4. The app uses more than 120 of its names (exports, props, options, keys of the data passed, members and
   fields read; AG Grid in the Devtron panel uses 74): used directly.
5. Its main entry is no bigger than about 1 KB per used name: used directly, since a port would not run
   less code.
6. Otherwise the used parts are ported (`markless-migrate parity`).

A library used directly is created from an `onVisible` handler (or `onIdle`) on the element it draws
into, imported there with `import()`, so it never loads with the page.

## Caching on the CDN

Every migrated site is cached from evidence, not guesses. `plan` ends by asking the old app for every
route twice and once more with a cookie, and writes `.migrate/caching.json`: each route's class, the
reason with its evidence, and the evidence itself (status, Cache-Control, ETag, Last-Modified, Vary,
the cookies set, Age, and `x-vercel-cache`, `cf-cache-status`, Netlify's `Cache-Status` or `x-cache`).
With `--source`, the old route's file and what it imports are read too: auth guards, server reads of
cookies, headers and the session, query keys read, server-side personalisation and flags, data fetched
while rendering. `cache plan` runs the same step on its own.

| Class | When | Generated rule (Vercel through Nitro) |
| --- | --- | --- |
| prerender | the same body and ETag on every request, nothing reads the request | `isr: { expiration: false }`: rendered once per deploy, then the CDN |
| CDN with revalidation | its data changes (the body or ETag moved between requests, the old headers ask for `s-maxage` or `stale-while-revalidate`, the server fetches data or reads the clock) | `isr: { expiration: <old TTL, else 60 s> }`; a page that reads the query gets `s-maxage` and `stale-while-revalidate` instead (Vercel's ISR hands the page no query) |
| never cached | it sets a cookie, is `private`/`no-store`, varies on `Cookie` or `Authorization`, changes when a cookie is sent, sits behind an auth guard, is reached only signed in, or its server code reads cookies, headers or the session | `isr: false` and `Cache-Control: private, no-cache` (`private, no-store` when sign-in, a session or a set cookie is involved) |

`cache apply` (run by `run` before every build and by the deploy scripts) writes the plan into the
Markless app as `migrate-cache.ts` and adds `migrateCache()` to its `vite.config.ts` plugins: a Nitro
module that sets the rules once Nitro's options are resolved, replacing any caching the app set for
the same path and leaving proxied paths alone. Only routes a page of the app renders get a rule. The
app's own pages are read again first: a page that reads cookies or `http.request` headers, or renders
`storage()`, is never cached, whatever the old page was. Because Vercel's ISR cache ignores `Vary`, a
request carrying Markless's fragment header (read from the app's own `@markless/router`) is routed to the
page's ISR function with a query key of its own, so a fragment and a document of one URL never share an
entry. A router that fetches fragments from their own path instead (Markless 0.7: `/_markless/fragment/<page>`,
the prefix read from the app's `@markless/router`) gets each cached page's fragment URL cached the same way
as the page. Content-hashed files in `public/` are marked immutable (a directory holding only hashed files as
one rule); Markless's `/build/` and Nitro's `/assets/` already are.

`cache check --new <deployment>` reads the deployment route by route: three GETs (a miss, then hits),
a fragment request and the document straight after it, and a new visitor's page view in Chromium. It
writes `.migrate/caching-report.json` with each route's answers and exits 1 when a page the plan never
caches, or a response setting a cookie, is answered from or offered to a shared cache; when a fragment
and a document share an entry or a page answering the fragment header differently lacks it in `Vary`;
when HTML is kept by browsers (immutable, `max-age` of a day or more) or a changing page is kept until
the next deploy; when a static page is not kept, or a page the old site's CDN kept is not (including one
the port made personal); when a cached page's fragment URL is not kept (every prefetch and in-place
navigation would run a function); and when a content-hashed file the page loads is not kept by browsers. It
reports the CDN hit rate on the second pass, function invocations per page view and TTFB. Platform
facts behind the rules: [docs/notes/caching.md](docs/notes/caching.md).

## Certified library ports

Some libraries are ported once in Markless Migrate rather than once per site: `src/library/ports/<library>/`
holds a Markless port (no React and no copy of the library) that renders the library's own markup and
attributes, so the old classes and selectors work unchanged. Today that is `@radix-ui/react-dialog` and
`@radix-ui/react-alert-dialog` 1.1.15, which shadcn/ui's dialog, sheet, alert dialog and command dialog wrap.
`plan --source` classes such a library `ported` and maps each export the app uses, directly or through a
local kit, to the port's component; a prop the port does not cover is named with the site that passes it.
`parity <library>` copies the port into the new app's `lib/ports/<library>/` with a `<module>.behaviour.md`
listing every export, the props each component covers and what the app uses. A copied file carries the
hash of what was copied, so the next `parity` upgrades an untouched copy and keeps an edited one.
`src/library/ports/index.ts` (`PORTS`) is the machine-readable list of parts and props each port covers.

`test/e2e/radix-dialog-port.test.ts` certifies the port against the real library: the same page is built
with both (`fixtures/radix-dialog-react`, `fixtures/radix-dialog-markless`) and driven through generated
action sequences (clicks on the trigger and the close controls, clicks inside and outside, Escape, Tab,
Shift+Tab, reopening from script during the exit animation), with the animation clock stopped between
actions and moved one animation end at a time. After each action, halfway through the wait after it, at
the end of the wait and in the two frames after each element's own animation ends, both pages must show
the same elements, attributes, opacity and transforms, exposure to assistive technology, body attributes,
focus guards, scroll lock and focus. `DIALOG_SEQUENCES` sets how many sequences run (100 by default).

## Switching routes over

`switch <route>` adds the route (a path, or a pattern like `/blog/:slug`) to `.migrate/switched.json`.
It refuses unless the route's last check is green for every role it was checked as. Forcing a route
that is not green is an expert override, like `accept`: `--force --by <name> --reason <why>`, or
`--force` alone at a terminal, which asks for both and for the route typed back. It records who forced
it, why, and the checks it overrode. The MCP server's `switch_route` never forces, and an agent driven
by `run` cannot force or accept (`run` marks its environment and the CLI refuses). `unswitch` sends a
route back. A route must be a path or a `:param` / `*rest` pattern; Vercel's `/docs/:path*` is refused
with the pattern to write instead (`/docs/*rest`).

`status` lists every planned route as green, red, not ported (the old app serves it and the new one
answers 404) or not checked, marks switched routes, and shows forced ones in red as "forced, not
proven". The migration is done only when every planned route is green and switched without force.
`report.html` carries the same table, and `config --index <file>` writes it as the front door's index
page, with the routes not ported yet listed first.

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
asset its NEW page loads, and per file of the new build (`--new-build`, default `.output/public`), that
OLD does not serve (a whole directory when OLD has nothing in it), then `/:path*` to OLD. A file path
OLD answers with an HTML page is not served by OLD: that is an SPA's `index.html` fallback, which would
otherwise keep the new app's scripts on the old deployment. `--nitro` writes the top-level
`nitro.routeRules` of the Markless app's `vite.config.ts` (which `router()` passes to Nitro): a `proxy`
rule per inventoried route and endpoint not switched yet, and per asset OLD's pages load that NEW does
not serve.

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
pnpm test          # unit tests and every fixture suite
pnpm test:unit     # unit tests only (they drive Chromium too)
pnpm test:e2e      # fixture suites only
```

CSS is parsed with [yuku-css](https://github.com/thejackshelton/yuku-css), from npm.

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
requires each failure to name the `.tsrx` file and line. `fixtures/react-dev`, `fixtures/vue-dev` and
`fixtures/svelte-dev` are one page each, run on Vite's dev server; their suite changes the heading and
requires the old side to be named from React's owner stack (through the dev server's source map), Vue's
`__file` and Svelte's `__svelte_meta`. Mutated copies are built in `.mutants/`.

Both fixtures also sign in with a cookie session: a member and an admin, a members-only page, an
admin-only page, and a redirect to the login page for anonymous visitors. Their suites check each role
against a rebuild (green, from the starter auth file `plan` writes), against four auth mutations (the
members page shown to anonymous visitors, the admin page shown to members, a different login redirect
target, a session cookie without HttpOnly and with SameSite=Strict), each red only as the role it
affects, and against a copy behind a Cloudflare-style challenge, which must stop as blocked until the
staging pass is sent as a header or cookie.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

- `Typecheck`: `pnpm typecheck`.
- `Unit tests (1/3)` to `(3/3)`: `test/*.test.ts` split in three with `node --test --test-shard`, since
  the unit tests drive Chromium.
- `E2E <suite>`: one job per file in `test/e2e/`, each building its own fixtures. The two largest
  suites are split across runners with `E2E_SHARD=i/n` (six for `next-app`, four for `vite-site`): a
  shard registers every n-th test and builds only the mutants its tests use. Without `E2E_SHARD`
  every test runs, as `pnpm test:e2e` does locally.
- `CI passed`: green only when every job above passed. This is the one check to require.

A fixture suite runs a quarter of the machine's cores' tests at once (one on a 4-vCPU runner), since
each check already drives several Chromium pages. A whole run takes about 9 minutes, bounded by the
slowest unit test shard and `next-app` shard (about 8 to 9 minutes each).

Every suite runs against servers the tests start on `127.0.0.1`, and fixture data uses `.example`
hosts. The unit tests and every fixture suite pass with outbound network denied except loopback, so
no test needs a live external site and nothing is skipped in CI.

### Branch protection

The workflow does not change repository settings. To make a red `main` impossible, enable under
Settings, Branches, a branch protection rule (or a ruleset) for `main` with:

- Require a pull request before merging.
- Require status checks to pass before merging, with `CI passed` as the required check.
- Require branches to be up to date before merging.
- Do not allow bypassing the above settings.

## License

MIT. The fixtures include the Inter font under the SIL Open Font License (`fixtures/INTER-LICENSE.txt`).

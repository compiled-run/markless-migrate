# Converting pages

How `plan`, `usage` and `convert` read the old site and write the Markless app, and what happens after. Back to the [overview](../README.md).

## What the old site uses, and what the port may ship

`plan` also writes `.migrate/usage.json`, the semantic usage inventory: every behaviour the old pages use in the
browser, read from each page's markup (served, or the old build output with `--built`), the syntax tree of every
script the pages run (yuku), the theme config and the library scan, each with the routes that use it and where it
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

No other framework's runtime is kept: React, Vue, Svelte, Qwik, htmx, Alpine, _hyperscript, jQuery or a framework's
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
picture (the `responsive-image` rule in [Intended differences](check.md#intended-differences)).

Which library part each element is comes from the old source, not the markup: the usage inventory names
the export that renders each `data-slot`, and the markup only tells which of the source's candidates an
element is when a site renders several (Radix's, Base UI's and React Aria's tabs). Each part is then driven by
a Markless port of that library (`parts/`: Radix Dialog on the shared dialog engine, Popover, DropdownMenu,
Tabs, Collapsible and Accordion on Floating UI as Radix uses it; Base UI Popover, Menu, Tooltip and Select),
written once and used on every site, delegated from each page's root element. The site's own client
components go in `lib/site/parts.ts` (and `lib/site/mounts.json` for elements a part starts on when shown). A web font a first screen draws that only a stylesheet names is preloaded right after the charset (same-origin woff2, at most four per page with the page's own preloads), so it is fetched with the stylesheet rather than after it. A font every face of which is `font-display: swap` paints its text in a fallback first, so its preload (the old page's own or one convert adds) goes after the last stylesheet with `fetchpriority="low"` instead of competing with the stylesheets the first paint waits for; a `block`, `auto`, `fallback` or `optional` face, such as an icon font, keeps its preload where it was. A web font that only text below every first screen uses (a script's face for an RTL demo far down the page) waits for the page's scripts: capture finds the faces the page fetched and the blocks whose text each one draws (by the family the browser picks for each character, spaces included), and when none of that text is in the desktop or the phone first screen, convert leaves that face's `@font-face` out of the page's cut stylesheets, names it in a JSON list in the head and marks those blocks `data-mm-late-font`. An inline script adds the listed faces once every script and module preload of the page has arrived, or when a marked block comes within a screen of the viewport, so the font no longer competes with the first screen or the first click's code in any browser. A theme toggle the site names in `lib/site/controls.json` (`{ "action": "theme", "name": "Toggle theme", "key": "d" }`) answers from the first paint: on a next-themes site, an inline script in the head reads ThemeProvider's options from next-themes' own script, switches the theme in the click's frame before the page's code arrives, and marks the event, so the site's part (`handledEarly`) does only what else its toggle does.
With `--source`, the old config's redirects and rewrites and each route handler answer through a generated
Nitro middleware: a handler runs as the old app's own server code (its local imports copied, JSX data
dropped, `next/server` on the Fetch API); one that needs the old framework is served from the old build and
reported as not ported. `.migrate/convert/report.json` lists what was left out, the endpoints and how each is
answered, and the library parts no port implements yet. `--only <file>` converts the routes listed;
`--fallthrough <old deployment>` makes a preview answer every other page from there, marked
`x-markless-migrate-side: old`.

### How to iterate on a port

Fixing a route does not need a full convert, a full build, a deploy or a site-wide check. `fix` converts only the
routes you name, builds just them for production, and gives the answer the full check would give for them:

```bash
cd examples/shadcn-ui-markless            # the app; or pass --app <dir>
~/.claude/bin/heavy node ../../src/cli.ts fix --route /examples/dashboard
```

- It converts the routes from the cached captures (`.migrate/convert`) into an app of their own,
  `.migrate/dev/app`, and leaves the app's full convert alone. A capture is taken again only when a change
  invalidates it or none was kept. It converts with the inputs the last whole convert had (`.migrate/convert/inputs.json`,
  for example `--page-order-from`), so the route is the one the whole convert makes.
- It builds those routes for production (a few seconds) and serves the build. A route's checks leave it: a link, a
  search result, a journey that follows a link, the navigation check's entry pages. Those pages land on the original
  unless the build holds them, so `fix` records every page a browser visits that the build lacks, builds those pages
  too and checks again once (still leaving after that is a FAIL that names the pages). It keeps what it
  learned in `.migrate/dev/app/.migrate/dev/destinations.json`, so the next run builds them from the start.
- It runs `check` on them as each CI shard of `check.yml` does: every dimension, the three engines, template groups
  made over every page of the site (`--site-targets`, default `deploy/<site>/check-targets.json`), and the shard
  flags in `src/check/ci-settings.ts`, which the workflow reads too. Then it runs the dead-controls probe in Chromium and
  WebKit with `probe-dead-controls.yml`'s budgets (the same file). Both compare with the original (`--old`, default
  the plan's origin: a local build such as `deploy/shadcn-ui/serve-old.sh` on :4000, never a bulk run against a
  deployment). What each side's original did is kept between runs (`.migrate/cache`, `.migrate/slow-network`,
  `.migrate/probe-reuse`).
- It prints `PASS` or `FAIL` for each route with the reasons, then one line, `verdict: PASS` or `verdict: FAIL`, and
  exits 0 or 1. A route check could not finish for an infrastructure failure, or a probe that stopped, is taken once
  more; if it still has no result it is a FAIL. There is no third outcome.
- A route that is not its template group's representative gets visual, responsiveness, motion and page load on the
  representative, as in the full check; the verdict says which page that is, so name it too when the fix changes the
  layout.
- `--watch` answers again on every save: a part under `parts/` is copied in and the build redone, a converter file
  under `src/convert/` converts again first.
- `--routes '/docs/components/*/combobox'` (a glob) or `--part base-ui/combobox` takes several routes at once, to
  check that a part fix broke no other page. `--part` reads which pages load each part from the last full convert's
  report.

Run the site-wide check (`check.yml` on GitHub) only before a deploy.

`dev` is the quicker, looser loop under `fix`: Markless's dev server and the dead-controls probe alone, in Chromium
at one width (`--control <regex>` for one control, `--widths`, `--full` for the probe's whole sweep, `--build` for a
production build, `--check` to add `check --only probes`). Use it while you look for the cause; use `fix` for the answer.

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
  both through the same local proxy so only the preload differs (`--load-runs` a side, as in check's `load`),
  with slow 4G and the CPU slowdown applied for real. It is suggested only when the LCP comes sooner beyond noise
  for that real load, with the measured saving. PageSpeed Insights' simulated score of the same pair is measured
  too and shown beside it, but never decides: a preload the simulation credits can still delay the stylesheet the
  first paint waits for. `--no-load` leaves it out.

`upgrade accept <id>` writes `.migrate/upgrades/<id>.md`, the agent's task. An accepted entry goes through the
same pipeline: `check --old <pre-upgrade build> --new <upgraded build> --all` must be green on every route.


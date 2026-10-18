# Migration log: docusaurus.io (home and two docs pages) to Markless

The docusaurus.io website (`facebook/docusaurus`, `website/`), its home page, `/docs` (Introduction) and
`/docs/installation`, ported to Markless 0.4.0 (the published packages) by Claude Code and checked against the
unchanged site with `markless-migrate`. Every other route stays on the old site behind the front door.

## What was migrated

| Part | Upstream | Commit | Licence |
| --- | --- | --- | --- |
| Site | [facebook/docusaurus](https://github.com/facebook/docusaurus) `website/`, Docusaurus 4.0.0 (canary) | `7b6826b` | MIT (`LICENSE-docusaurus`), docs content CC BY 4.0 (`LICENSE-docusaurus-docs`) |
| Search | DocSearch 4.7.0 (`@docsearch/js`, the build of the same version the site uses through `@docsearch/react`) | | MIT |

The old site is built as its own `build:fast` script does (`BUILD_FAST=true docusaurus build --locale en`, Node
24.22 and pnpm 12.3.4 as the repo pins): one locale and only the current docs version, so the build takes about
two minutes instead of an hour. That is the reference both apps are compared to; the version dropdown it shows
(only "Canary") and the English-only locale come from that, not from the port.

## Running it locally

```bash
cd ../mm-upstreams/docusaurus && pnpm install && pnpm build:packages
cd website && BUILD_FAST=true pnpm build --locale en
pnpm docusaurus serve --port 4201 --host 127.0.0.1       # old site
cd examples/docusaurus-markless && node tooling/import.mjs http://127.0.0.1:4201   # re-import (only when the old site changes)
npm run build && PORT=4202 node .output/server/index.mjs # new app
node ../../src/cli.ts plan --old http://127.0.0.1:4201 --source ../../../mm-upstreams/docusaurus/website --limit 20
node ../../src/cli.ts check --old http://127.0.0.1:4201 --new http://127.0.0.1:4202 --route / --route /docs \
  --route /docs/installation --source ../../../mm-upstreams/docusaurus/website --new-source .
```

No roles: the site has no sign-in.

## How the port is built, and why

The old pages are what Docusaurus's React theme renders from MDX once its scripts have run: CSS-module class names
(`codeBlockContainer_jDV4`), Prism token spans with inline colours per colour mode, a sidebar whose collapsed
categories have no items in the DOM until opened, a navbar drawer that exists only below 997px, and so on. The
check compares that DOM, its computed styles and its screenshots, so the port has to produce the same DOM.

- `tooling/import.mjs` loads each old route in a browser (light and dark, desktop and mobile), and writes the
  rendered `#__docusaurus` subtree as TSRX (`components/generated/*.tsrx`), every route's `<head>`
  (`lib/head-slots.json`, rendered by `document.tsrx`), the dark-mode Prism styles (`lib/code-themes.json`), the
  lazily rendered sidebar categories (`lib/sidebar-categories.json`), the mobile-only drawer and the lazy images'
  loaded markup (`lib/responsive.json`), and copies the images and fonts the pages load into `public/`.
- `lib/site.ts` is what the theme does in the browser, read from the theme's source and checked against the old
  site click by click: the three-way colour mode toggle (with the code blocks' Prism colours), npm2yarn tabs that
  stay in step and persist (`docusaurus.tab.npm2yarn-189`), copy and word-wrap buttons, sidebar categories with
  `autoCollapseCategories`, the collapsible sidebar, `<details>`, navbar dropdowns (Enter and Space), skip to
  content, the announcement bar (dismissal persisted as the old site does), the hideable navbar, the TOC
  highlight, back to top, the window-size switch at 996px, and the home page's ideal-image avatars (a Waypoint
  that starts an XHR on enter and cancels it on leave).
- `lib/search.ts` loads DocSearch's vanilla build only when search is opened (click, Ctrl/Cmd+K), with the old
  site's Algolia app, index, Ask AI assistant, facet filters and translations, and moves the modal to the
  body's first child where Docusaurus puts it.

So the page markup is static TSRX that Markless renders on the server and ships no code for; one boot handler
(`onBoot`, fired on `load`) installs the behaviour. Markless MDX could not be used for the doc content (see the
limitations), which is why the content arrives through the importer rather than as `.mdx` pages.

## Iterations

| # | Result (3 routes) | What it caught |
| --- | --- | --- |
| 1 | 0 green | `/img/*` and `/assets/ideal-img/*` not served; lazy avatars captured before loading; dropdowns navigated on Enter; skip link followed the hash; sidebar categories empty when opened; JSON-LD unparseable |
| 2 | 0 green | JSON-LD text entity-escaped by Markless (fixed in a Nitro plugin); mobile-only navbar drawer and desktop-only sidebar/TOC missing; word-wrap button exists only while code overflows; sidebar's announcement-bar margin on scroll |
| 3-6 | 0-1 green | lazy avatars loaded differently on each side (old: Waypoint + XHR + cancel on leave); TOC highlight; search modal missing |
| 7 | 0 green | DocSearch modal in place; placeholder, labels and its position in the body differ |
| 8-9 | 2 green | fonts attributed to the wrong elements and computed styles read mid-animation (tool bugs, fixed); Algolia's shuffled host order compared in order (tool, fixed) |
| 10-12 | 2 green, home red only on a link into an unported route | DocSearch (500 kB) module-preloaded on every page; now imported by URL on demand |
| 13 | 3 of 3 green, 2 accepted | |

## Results

`check --route / --route /docs --route /docs/installation`: **3 of 3 routes green**, two accepted differences, all
three switched to the new app on the front door.

| Route | Result |
| --- | --- |
| `/` | green, 2 accepted (the `Showcase` link, below) |
| `/docs` | green |
| `/docs/installation` | green |

## Accepted differences

| Failure | Why it cannot match |
| --- | --- |
| `/` behaviour `click link "Showcase"` and a11y `press Enter on link "Showcase"` (`0a17e5ace4`, `e07cf60dbf`) | `/showcase` is not part of this migration, so in the check the link lands on the new app's 404; through the front door it reaches the old site, whose showcase page makes the same image requests |

Kept in `deploy/docusaurus/accepted.json` (a copy of `.migrate/accepted.json`, which is not committed).

## Deployed

| What | URL |
| --- | --- |
| Front door (index and report at `/_migrate/`) | https://mm-docusaurus.vercel.app |
| Old site | https://mm-docusaurus-old.vercel.app |
| New app | https://mm-docusaurus-new.vercel.app |

`deploy/docusaurus/deploy.sh old|new|front` builds and deploys each. The deployed old site is the same build with
its two Google Analytics `<script>` tags removed (so this copy does not report to docusaurus.io's analytics); the
check ran against the local build, where `check` blocks those requests anyway.

## Weight

JavaScript per route, uncompressed (old Docusaurus/React -> new Markless):

| Route | On the wire | Run at load |
| --- | --- | --- |
| `/` | 1267.6 kB -> 366 kB | 565 kB -> 92 kB |
| `/docs` | 1573.9 kB -> 551 kB | 705 kB -> 83 kB |
| `/docs/installation` | 1594.3 kB -> 791 kB | 697 kB -> 83 kB |

What runs at load drops by 84-88%. Most of what is still downloaded is each page's "render data", its static
markup as a JavaScript module (200 kB for the home page, 390 kB for `/docs`, 640 kB for `/docs/installation`),
which Markless module-preloads although nothing runs it at load; DocSearch is fetched only when search opens.

## Markless limitations hit (0.4.0, the published packages)

1. **MDX cannot reproduce a Docusaurus page.** The router's MDX supports only top-level default imports from
   `.tsrx` files and static markdown children: no component mapping for headings or code blocks (so no anchors,
   ids, Prism tokens or copy buttons), no raw HTML, no nested components (a code block inside an admonition or a
   tab stays a plain `<pre>`), and comment expressions like `{/* #requirements */}` (Docusaurus's explicit heading
   ids) are dropped. The Markless website gets highlighting by rewriting the router's emitted module after the
   fact (`website/tooling/highlight-mdx.ts`).
2. **The `docs` starter does not build**: `create-markless --starter docs` writes
   `pages/docs/[...slug].mdx` with named imports (`import { Sidebar } from ...`), which the MDX transform rejects
   ("default imports from .tsrx files only").
3. **`document.tsrx` cannot render a child component or use control flow**: a component in the document fails at
   render (`MARKLESS_SSR_DATA_CHILD_RENDER_MISSING: component-edge:1`), and the router reads `document.tsrx` as
   plain JSX, so `@switch`/`@if` fail to parse. A per-route `<head>` is a fixed list of elements whose attributes
   come from data; a route without an element renders it empty.
4. **`<br />` is written `<br></br>`** and **script text is entity-escaped**, as in the RealWorld log. Here both
   are repaired in the HTML response by a Nitro plugin (`server/void-elements.ts`), because every code line ends
   in `<br>` and the JSON-LD must parse.
5. **Event handlers cannot call `preventDefault()` conditionally on the target** (the sync policy may read only
   graph state, constants and simple event fields), so a delegated handler cannot cancel a dropdown's Enter or a
   skip link; the behaviour is installed as native listeners from one boot handler.
6. **`onVisible` needs the runtime awake first**, the `<Html>` attributes are ignored, and the page is wrapped in
   `<div data-async-container>` (as in the RealWorld log).
7. **Every lazy chunk is module-preloaded on every page**: a dynamic `import('@docsearch/js')` behind a click
   still put its 500 kB on every page's wire (it is now imported by URL from `public/vendor/`), and each page's
   render data (its whole static markup as a module) is preloaded though it does not run.
8. **The client bundle embeds the build machine's absolute paths**: the render-data chunks carry
   `filename:"/Users/<you>/.../components/generated/installation.tsrx"`, so a production build publishes local paths.

## Tool bugs found and fixed

See the RealWorld log: the fixes to font attribution, animation timing, lazy-loader settling, request order and
webpack chunk hashes came from this site.

## Tool problems not fixed

- `config --vercel` reads asset paths out of page text too: the installation page's inline code
  `/docusaurus.config.js` and `/sidebars.js` became rewrites to the new app (harmless, nothing serves them).

- `plan --source` does not recognise Docusaurus (`framework not recognised`), so routes come from the crawl only
  and the 289 crawled pages include no docs page in the first 20; the routes were named with `--route`. Fixed in dd2be12.
- A journey that follows a link to a page the new app does not have (`Showcase`) is compared against the new
  app's 404; through the front door that link reaches the old site. Fixed in 70ef676.

## Markless 0.5.0 (2026-10-17)

Rebuilt on the published 0.5.0 packages (`@markless/*` 0.5.0, `vite-plus` 0.3.1).

### Workarounds removed

| Workaround (0.4.0 limitation) | Now |
| --- | --- |
| 4: `server/void-elements.ts`, a Nitro plugin that deleted `</br>` and un-escaped `<script>` text (JSON-LD) in every response | removed: void elements have no closing tag and script text is written as is |
| 6: `<Html>` attributes ignored, so `public/mm-init.js` set `dir` and `class` (and two Docusaurus runtime markers, since removed) from a per-route table | `document.tsrx` writes them on `<Html>` from `lib/document-init.json`; the theme script is inline again, as on the old site (one request fewer) |
| 6: `onVisible` needed the runtime awake, so `public/mm-boot.js` dispatched a `boot` event on `load` to a `data-boot` element | `onIdle={() => siteBoot()}`; `mm-boot.js` and the `data-boot` attribute are gone |
| every link a document load | links between the three ported pages swap in place through the router, as Docusaurus's React Router does; the per-route set-up (window-size parking, tabs, colour mode, lazy avatars, TOC) reruns on the router's `marklessrouterrendered` event |

`tooling/import.mjs` writes the new `document.tsrx` and `lib/document-init.json`. New behaviour found by the stricter checks: the version dropdown's "Canary" link (to the page already shown) keeps the page as React Router does instead of reloading it; DocSearch's code loads at idle, so opening search fetches no code (Docusaurus loads it when the pointer reaches the button); the navbar and footer logos follow the colour mode (ThemedImage); clicking the npm2yarn tab already selected no longer saves it; DocSearch shows Docusaurus's "See all N results" footer.

The three pages are kept on Vercel's CDN (`isr: true`: rendered once per deploy, served as `x-vercel-cache: HIT`). Nitro's `prerender: true` was tried first: it renders every Markless page as a 404 at build time (Markless finding).

### Check (against the deployments)

`check --concurrency 1 --route / --route /docs --route /docs/installation`, old https://mm-docusaurus-old.vercel.app, new https://mm-docusaurus-new.vercel.app. With the default concurrency the journeys' page loads timed out after 30 s on this machine (both apps); one route at a time they did not.

| Route | Result | Interactions exercised | JS on the wire (uncompressed) | JS run at load |
| --- | --- | --- | --- | --- |
| `/` | red: visual, assets, a11y, behaviour, responsiveness | 55 of 62 | 357.6 → 188.6 kB | 564.5 → 196.2 kB |
| `/docs` | red: a11y, behaviour, responsiveness | 169 of 174 | 433.5 → 187.5 kB | 699.3 → 187.7 kB |
| `/docs/installation` | red: a11y, behaviour, responsiveness | 131 of 133 | 438.3 → 187.6 kB | 704.0 → 187.7 kB |

(0.4.0 downloaded 366 / 551 / 791 kB on these pages: packing and the smaller render data roughly halve it.)

Responsiveness (slowest each side): first interaction old 64 ms → new 120 ms at 4x CPU (desktop 64 → 64 ms); navigation old 121 ms → new 164 ms at 4x CPU (desktop 48 → 61 ms).

What keeps the routes red:

1. Journeys into pages that are not ported (the sidebar's other docs, blog, community): the checker serves the old page to the new side as the front door would, but there the old page logs `registerSW failed ... reading 'waiting'` where on its own host it logs `window.gtag is not a function`, and some of those links cannot be clicked within the step's 3 s. These differences come from the checker's front-door emulation, not from the port; through the real front door those links reach the old site.
2. Responsiveness: navigation between the ported pages at 4x CPU is 105-164 ms against 59-80 ms (the router's link script spends one 58-109 ms task swapping in a docs page); the sidebar's first category toggle is 40-48 ms against 16 ms on desktop.
3. Search: the results footer reads "See all 0 results" in the check, where the old one shows the count.
4. One external avatar (unavatar.io) did not load on the new side in one run.

Routes switched: none (they had been switched under 0.4.0). The front door (https://mm-docusaurus.vercel.app) serves the old site everywhere; checked in a browser: styles load and the sidebar navigates in place.

## Old-framework markers removed (2026-10-18)

The port no longer carries what Docusaurus writes into its pages for itself: `data-has-hydrated` on `<html>`, react-helmet's
`data-rh` attributes on `<html>` and the head tags, and `<meta name="generator" content="Docusaurus ...">`.
`tooling/import.mjs` leaves them out of the imported heads (using the checker's own list), and `lib/site.ts` no longer
sets the flag after load. Nothing in the port read them: no rule in the copied stylesheet
(`public/assets/css/styles.73b9aeb138.css`) or in `public/mm-site.css`, and no script in `lib/` or `public/vendor/`
selects on the flag or on `data-rh`. Upstream, no theme stylesheet reads the flag either; Docusaurus's own blog uses
it to tell a visual-regression tool the page has finished starting up. The checker now fails a port that serves one of these markers.

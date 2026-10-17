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

The old pages are what Docusaurus's React theme renders from MDX after hydration: CSS-module class names
(`codeBlockContainer_jDV4`), Prism token spans with inline colours per colour mode, a sidebar whose collapsed
categories have no items in the DOM until opened, a navbar drawer that exists only below 997px, and so on. The
check compares that DOM, its computed styles and its screenshots, so the port has to produce the same DOM.

- `tooling/import.mjs` loads each old route in a browser (light and dark, desktop and mobile), and writes the
  hydrated `#__docusaurus` subtree as TSRX (`components/generated/*.tsrx`), every route's `<head>`
  (`lib/head-slots.json`, rendered by `document.tsrx`), the dark-mode Prism styles (`lib/code-themes.json`), the
  lazily rendered sidebar categories (`lib/sidebar-categories.json`), the mobile-only drawer and the lazy images'
  loaded markup (`lib/responsive.json`), and copies the images and fonts the pages load into `public/`.
- `lib/site.ts` is what the theme does after hydration, read from the theme's source and checked against the old
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
| 10-11 | 2 green, home red only on a link into an unported route | |

## Results

(see the end of this file)

## Weight

JavaScript per route, uncompressed (old Docusaurus/React -> new Markless):

| Route | On the wire | Run at load |
| --- | --- | --- |
| `/` | 1267.6 kB -> 846 kB | 570 kB -> 92 kB |
| `/docs` | 1573.9 kB -> 1031 kB | 699 kB -> 83 kB |
| `/docs/installation` | 1594.3 kB -> 1271 kB | 697 kB -> 83 kB |

What runs at load drops by about 85%. What is still downloaded is mostly the DocSearch chunk Markless
module-preloads although it runs only when search opens (about 500 kB), and Markless's runtime.

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
7. **Lazy chunks are module-preloaded on every page**, so DocSearch (about 500 kB, run only on demand) is
   downloaded on every load; that is the gap between "on the wire" and "run at load" above.

## Tool bugs found and fixed

See the RealWorld log: the fixes to font attribution, animation timing, lazy-loader settling, request order and
webpack chunk hashes came from this site.

## Tool problems not fixed

- `plan --source` does not recognise Docusaurus (`framework not recognised`), so routes come from the crawl only
  and the 289 crawled pages include no docs page in the first 20; the routes were named with `--route`.
- A journey that follows a link to a page the new app does not have (`Showcase`) is compared against the new
  app's 404; through the front door that link reaches the old site.

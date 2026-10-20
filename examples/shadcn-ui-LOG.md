# Migration log: ui.shadcn.com (Next.js 16 + React 19) to Markless

[shadcn-ui/ui](https://github.com/shadcn-ui/ui) (MIT), `apps/v4`, at commit `ba1503c6` (2026-10-19), moved to
`examples/shadcn-ui-markless` through the pipeline: `plan`, `usage`, `convert` (new), `cache apply`, `check` and
`cli`. Nothing in the app's pages, shared components, copied assets or server handlers is written by hand: it is
`convert`'s output (`scripts/convert.sh`), gitignored and regenerated. What is written by hand is the site's own
client components ported to Markless (`lib/site/`), the part an agent writes in `run`.

## Old site

- `deploy/shadcn-ui/fetch-old.sh` clones the pinned commit and runs `pnpm --filter=v4 build` (registry build, then
  `next build`: 812 prerendered pages, about 6 minutes on an M-series Mac); `serve-old.sh` serves it on :4000.
- Deployed as https://mm-shadcn-ui-old.vercel.app. Vercel's own build of `apps/v4` hits the 45-minute limit
  (the Turbopack compile alone takes 17 minutes there), so `deploy.sh old` deploys a local `vercel build`
  (`--prebuilt`, 1.2 GB). One local prerender failed once on a reset connection to the GitHub API (the star count
  in the header) and passed on the retry.

## Plan

`plan --old http://localhost:4000 --source .../apps/v4 --limit 5000` (18 minutes):

- 521 routes to port: 498 HTML pages, 24 redirects, 5 links the old site answers 404 (left out), and the
  endpoints `/r/registries.json`, `/init`, `/init/md`, `/init/v0`, `/llm/*`, `/api/search`, `/og`, `/rss.xml`,
  `/typeset.css`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`.
- 6,607 registry JSON files under `/r/` are static files of the old build.
- 67 libraries. Rendering ones the pages use: radix-ui (89 parts with a data-slot), @base-ui/react (104),
  react-aria-components (only on routes no page renders by data-slot), cmdk, vaul, sonner, input-otp,
  react-day-picker, recharts, embla-carousel.

Shared parts, by how many of the 500 HTML routes render them (settled DOM, `data-slot` and the library's own
markup): Radix Popover 468, Radix Dialog 468 (the search palette), Radix DropdownMenu 446, Radix Tabs 325,
Base UI Select 173, Base UI Popover 169, Base UI Menu 35, Radix Collapsible 27, Radix ScrollArea 20,
Radix Select 16, Base UI Dialog 14, Tooltip (Radix 14, Base UI 11), Radix ToggleGroup 11, Radix Sheet 10,
vaul Drawer 8, Radix RadioGroup 7, Radix Slider 5.

## Pipeline changes (markless-migrate)

- `convert` (src/convert/, `markless-migrate convert`): every HTML route as a visitor's browser holds it (captured
  with check's frozen environment), the old framework's runtime left out (Next's chunks, `self.__next_f`, React's
  streaming `$RC`, `data-precedence`, `next-route-announcer`, streamed `<template>`s), shared regions as
  components (a link's attributes beside its href are left out when matching, so a nav is one component across
  pages), what controls show on use captured from the old page and rendered by Markless (tab panels and accordion
  items on state() with bound attributes, portaled layers hidden in the Document's extras), and assets copied byte
  for byte. Markless owns every node: parts switch attributes, measure, place and move focus, and a guard test
  fails on a part that inserts or removes nodes.
- The library part an element gets comes from the usage inventory (`PartResolver`, usage.json): the export the
  source renders with that `data-slot`. The markup only tells Radix's, Base UI's and cmdk's candidates apart.
  Prop defaults the source passes through (`sideOffset = 4`) are read from the component's parameters.
- `parts/`: Markless ports of library behaviour, each written once, delegated from the page root: Radix Dialog
  (driving the shared dialog engine from `library-port-radix-dialog`, vendored unchanged), Popover, DropdownMenu,
  Tabs and Collapsible/Accordion (convert's state plans, with roving focus and content measurement), Popper on @floating-ui/dom as Radix configures it, Presence, aria-hidden's
  hideOthers; Base UI Popover, Menu, Tooltip and Select (its anchor positioning, transition status, and
  `alignItemWithTrigger`); cmdk 1.1; next-themes.
- Revealed content a control replaces itself with (View Code) and what a control copies (Copy Page) are captured
  from the old page for controls the site lists (`lib/site/controls.json`); options without a link (the search
  palette's 450 items) get where choosing each went.
- Routing: a generated Nitro middleware answers the old config's redirects (308/307) and rewrites, runs each
  route handler as the old app's own server code (its local import closure, JSX data dropped, `next/server` on
  the Fetch API), and serves outputs only the old build can make. Markless's own middleware cannot answer a
  request (a returned Response is ignored), so this is Nitro middleware.
- `usage`: Next's build chunks are Next's (they were read as plain scripts, 1,499 "jQuery" uses from minified
  `$`), and a name a script binds is not the library global.
- `check`: scroll-driven animations are neither paused, seeked nor finished (seeking one in milliseconds threw
  and stopped every docs route's check).
- `cli`: a package manager the tool starts is not watched by the network shim (npm's registry traffic varies
  with its cache).
- The source scan tells redirects from rewrites and keeps `permanent`.

## Markless framework bugs found

1. Build memory and shipped JavaScript grow with static element count: render data has a host record for every
   static element. A page of 12,000 `<i>N</i>` (145 KB of .tsrx, no state) peaks at 2.54 GB (empty page 0.51 GB)
   and ships a 3.4 MB client chunk of `hosts: [{hostNodeId, tagName, coordinate}]`. About 170 KB of build memory
   per element, mostly retained across modules; ui.shadcn.com is 256,732 elements, about 45 GB. This blocks
   building all routes at once.
2. Event handlers in `document.tsrx` are dropped without a diagnostic (`<body onClick>`, or on any element of the
   Document); the same handler on a page's element works.
3. Resume locator errors (`Resume locator h1889 expected <div> at DOM order index 1890`). Two causes: the first
   ports inserted nodes inside the page (fixed in the pipeline: parts now only switch attributes on nodes Markless
   renders, and a guard test fails on any part that inserts or removes nodes), and bug 5.
4. `attach={(el) => watch(el)}` with `watch` imported from a .ts module stops the build with
   MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE (the diagnostic calls it a compiler gap); a handler calling the
   same import compiles.
5. A `<template>` with element children breaks every later handler of the page without an error: `let count =
   state(0); <main><template><div><span>a</span></div></template><button onClick={() => count++}>{count}</button></main>`
   stays at 0 after clicks, and counts without the template. Template content seems to be counted in Markless's
   element census, which the browser keeps out of the document. The converter now writes no `<template>`.
6. Captured content cannot sit in an `@if` arm (MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED), because literal text
   containers (`{"  "}`) count as bindings. Inactive tab panels and closed accordion items are therefore rendered,
   hidden by their bound `hidden`, where Radix unmounts them; switch back to `@if` once that is fixed.

## Status (2026-10-20)

Preview: https://mm-shadcn-ui-new.vercel.app renders `/`, `/docs/cli`, `/docs/components/radix/accordion` and
`/blocks` with Markless; every other page is answered from https://mm-shadcn-ui-old.vercel.app, marked
`x-markless-migrate-side: old` (a preview-only convert option). Building all 498 pages at once needs about 45 GB
(bug 1): the four take 5.9 GB.

`check` of the four (old and new served locally): 0 green, 4 red.
- `/docs/cli`: behaviour only. Choosing a search palette option: the old page's Next route announcer (an alert)
  disappears and its notification regions move after the navigation; the port has no announcer (framework markup).
  Options whose page is not in the preview land on the old app. Install tabs beyond the journey budget.
- `/docs/components/radix/accordion`: the same, plus accordion content motion and one visual difference.
- `/`: the same palette results, Base UI radio and the cards' controls not ported.
- `/blocks`: every block preview is an iframe of `/view/...`, which the preview answers from the old app.

Endpoints: the 24 redirects and the rewrites answer as the old config does (spot-checked `/charts`, `/cli`,
`/docs/components/button`, `/docs/components/accordion.md`); the 6,607 registry files under `/r/` are copied byte for
byte; `/init`, `/init/md` and `/r/registries.json` run as the old handlers' own server code. Not ported (served from
the old build's output): `/docs/*.md` (`/llm/*`), `/rss.xml`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`,
`/typeset.css`. Missing: `/api/search` (fumadocs' search over compiled MDX), `/og` (next/og), `/init/v0` (imports
React components to read their source).

CLI (`markless-migrate cli --config migrate-cli.json`, the pinned `shadcn` build against each registry): 10 of 10
cases the same: view, view several, search, add --dry-run, add three components, add a block, add a chart, info,
init with a preset, init then add.

## Open work

- The search palette's search results (`/api/search`), the remaining endpoints above, and `/og`.
- Base UI Radio, Switch, Checkbox, Dialog, AlertDialog, Toast; Radix ScrollArea, ToggleGroup, Select, Slider,
  RadioGroup; vaul; react-resizable-panels; recharts (the charts are SVG from the old page, not interactive).
- Recapture every route's reveals with signatures (only the preview routes have them) and convert all 498 pages
  once bug 1 is fixed; then `check` every route.
- check: a framework's own route announcer and the regions it moves, in what a step changes (journeys), are the old
  framework's (like the announcer already is in the accessibility tree).

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

### Since Markless 0.8.0 (2026-10-20/21)

- All 498 pages convert and build in one app. Markless 0.8.0 from npm (vite-plus 1.3.0, Nitro 3.0.260903-beta);
  the local-main link scripts are gone.
- In-place controls on Markless state, from what each did on the old page (`toggles.ts` uses every checkbox,
  switch, pressed toggle and radio once and records the markup of each state): a `state()` per control or radio
  group binds each attribute that differs and renders the children of each state in an `@if` arm (a checkbox's
  indicator); the hidden native input Base UI puts beside the control (its label's target) binds `checked`. 355
  groups.
- Base UI Tabs (only the chosen panel is mounted: the panel element binds the chosen panel's id and label, with each
  tab's captured content in an arm) and disclosures that mount their content where they open (Base UI Collapsible
  and Accordion, Radix Collapsible content that leaves while closed, the AI elements' trace): the captured content
  is an arm at the place it went; an accordion item open on load closes when another opens.
- Parts: Radix Select with its item-aligned position (Radix's `SelectItemAlignedPosition`), typeahead and pointer
  rules, each option carrying a hidden copy of the indicator Radix mounts only in the checked one; Base UI Dialog,
  AlertDialog and Drawer (modal focus, scroll lock, backdrop); Radix and Base UI Slider.
- Each page imports the layers only it portals and renders them beside its root (both in branches on a module
  constant: Markless renders a fragment root of components only inside branches). The Document imported all 1,914
  layers before, one 78 MB server chunk that crashed V8's optimizing compiler (`Check failed: is_int26(x)`).
- Endpoints: a route handler that reads no request runs at convert time from the old app's directory, as Next.js's
  build runs a static route: `/rss.xml`, `/typeset.css`, `/r/registries.json` and the 383 `/docs/*.md` (`/llm/*`)
  answers are byte for byte the old ones. `app/sitemap.ts` and `app/robots.ts` run the same way and are written as
  Next.js writes them. `/og` runs on `@vercel/og` (what `next/og` compiles in, at Next's version) with the JSX as
  satori's element objects: pixel-identical PNGs. `/init/v0` no longer pulls the registry's React components: a
  dynamic `import()` counts in a handler's closure only inside code the handler reaches. `/api/search` answers as
  the old one (the collection keeps `structuredData` whose headings are `undefined`). `next/navigation`'s
  `notFound`/`redirect` are shimmed; the handlers' packages are traced into the server output, not bundled.
- Copy Page text is one module per page, loaded on use (2.3 MB in every page's client code before).
- `cache`: a request read named in a string or a comment is not one (the copied page text mentions `headers()`,
  and every page had been planned never cached).
- `convert` peak memory: 3.1 to 3.5 GB (captures are read from the cache while their page is parsed, and only the
  served `<html>` tag is parsed); the 7.3 GB reported before was measured with every capture held at once.

## Markless framework bugs found

Fixed in Markless 0.8.0: 1 (a 12,000-element static page now builds in 0.57 GB, was 2.54 GB), 2 (a handler in
`document.tsrx` is a build error, MARKLESS_ROUTER_DOCUMENT_HANDLERS_UNSUPPORTED), 4, 5 and 6, and the `@if` arm text
parse (quotes and backticks in arm text).

1. Build memory and shipped JavaScript grew with static element count (a host record per static element). Fixed.
2. Event handlers in `document.tsrx` were dropped without a diagnostic. Now a build error.
3. Resume locator errors: the first ports' DOM writes (fixed in the pipeline, guarded by `test/parts-guard.test.ts`)
   and bug 5.
4. `attach={(el) => watch(el)}` with an imported `watch` stopped the build. Fixed.
5. A `<template>` with element children broke every later handler of the page. Fixed.
6. Captured content could not sit in an `@if` arm. Fixed.
7. A component-body `const` read by an attribute inside an `@if` arm stops the build, though a module constant or a
   prop in the same place compiles:
   ```tsrx
   export default function Child() @{
   	const id = 'x';
   	let open = state(false);
   	<div>
   		<button onClick={() => (open = !open)}>toggle</button>
   		@if (open) { <><p id={id}>shown</p></> }
   	</div>
   }
   ```
   MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED "holds an attribute binding". With `const ID = 'x'` at module level, or
   `id={path}` from a prop, it builds. The converter keeps such arms rendered and hidden (a shared component reads
   its per-page values through a body `const values = VALUES[path]`).
8. A page's root cannot be a fragment holding components (MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED), yet the same
   components inside `@if` arms of a fragment root build and resume correctly:
   `<>@if (SHOWN) { <main><Child /></main> }@if (SHOWN) { <><Layer /></> }</>` with `const SHOWN = true` at module
   level. The converter uses that form to render a page's own layers beside its root.
9. Build memory grows with page count: a synthetic app of pages that each use 20 of 200 stateful components peaks
   at 2.07 GB with 50 pages and 3.69 GB with 200 (about 11 MB a page; generator in the PR). ui.shadcn.com's 498
   pages peak at 15 to 19 GB and exceed Node's default 4 GB heap (`JavaScript heap out of memory` while rendering
   chunks), so the build needs `--max-old-space-size`.
10. Server code in one module can grow past what V8 compiles: with all 1,914 layers imported by the Document, the
    server's 78 MB chunk (render data, about 40 KB a layer) crashed Node 24 on arm64 in Maglev
    (`Check failed: is_int26(x)`); `node --no-maglev` serves it. Splitting the layers per page avoids it.

11. A page whose root is a bare `@switch` builds without a diagnostic and then answers every request with
    "Page module must export a Markless compiled artifact":
    ```tsrx
    export default function Page({ url }: PageProps) @{
    	const search = url.search;
    	@switch (search) {
    		@case "?a": { <main><p>a</p></main> }
    		@default: { <main><p>d</p></main> }
    	}
    }
    ```
    The same switch inside `<>…</>` works. `/create` (14 query variants) and `/docs/directory` (48) rendered that
    message on the first full deploy; the converter now wraps the switch.
12. The build writes `interaction-closures.json` (in `.output/.markless/public`) as one `JSON.stringify` string listing
    every handler's module closure per route: handlers × the component's symbols, so a page with 400 handlers on a
    component of 2,000 symbols lists 600,000 module ids. ui.shadcn.com's was 462 MB; a few hundred more handlers
    passed V8's string limit and the build stopped with `RangeError: Invalid string length` in
    `interactionClosuresAsset`, after 49 minutes. The converter now puts a tab list's handlers on the list (one per
    event instead of one per trigger and event), which cut `/docs/cli`'s share from 39.6 to 26.5 MB.

## Status (2026-10-21)

Preview: https://mm-shadcn-ui-new.vercel.app serves all 498 HTML routes with Markless (no route falls through to
the old deployment: `--fallthrough` is not set and the crawl of every route finds a Markless page, no old-side
header), and every endpoint from the new app's own server code or its convert-time output.

Full build of the 498 pages on Markless 0.8.0 (56,288 modules): peak 15.3 to 22.2 GB resident across runs, 23 to 49
minutes (the Vercel-preset build and upload together), with `--max-old-space-size=20000`; Node's default 4 GB heap
runs out while rendering chunks. Convert: 3.0 to 3.5 GB, 2 to 7 minutes from the captures cache.

## Open work

- The search palette's search results (`/api/search`), the remaining endpoints above, and `/og`.
- Base UI Radio, Switch, Checkbox, Dialog, AlertDialog, Toast; Radix ScrollArea, ToggleGroup, Select, Slider,
  RadioGroup; vaul; react-resizable-panels; recharts (the charts are SVG from the old page, not interactive).
- Recapture every route's reveals with signatures (only the preview routes have them) and convert all 498 pages
  once bug 1 is fixed; then `check` every route.
- check: a framework's own route announcer and the regions it moves, in what a step changes (journeys), are the old
  framework's (like the announcer already is in the accessibility tree).

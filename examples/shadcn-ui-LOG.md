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
  pages), content controls reveal captured as inert templates, and assets copied byte for byte.
- The library part an element gets comes from the usage inventory (`PartResolver`, usage.json): the export the
  source renders with that `data-slot`. The markup only tells Radix's, Base UI's and cmdk's candidates apart.
  Prop defaults the source passes through (`sideOffset = 4`) are read from the component's parameters.
- `parts/`: Markless ports of library behaviour, each written once, delegated from the page root: Radix Dialog
  (driving the shared dialog engine from `library-port-radix-dialog`, vendored unchanged), Popover, DropdownMenu,
  Tabs, Collapsible/Accordion, Popper on @floating-ui/dom as Radix configures it, Presence, aria-hidden's
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
3. After a part replaces part of a page (View Code), a later interaction logs `Resume locator h1889 expected <div>
   at DOM order index 1890`. Not reproduced in a minimal app yet; it reproduces on the converted
   `/docs/components/radix/accordion`.

## Status

See the PR description for the latest counts; this section is updated with each run.

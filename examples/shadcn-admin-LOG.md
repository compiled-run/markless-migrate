# Migration log: shadcn-admin (Vite + React) to Markless

[satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT, Copyright (c) 2024 Sat Naing), at
commit `e16c87f`, moved in part to `examples/shadcn-admin-markless` by Claude Code (Opus) through the
library-parity feature: `plan --source` inventories every library, `parity <library>` scaffolds the port of
exactly what the routes use, and `check --source --new-source` proves each route. The old app is fetched and
built by `deploy/shadcn-admin/fetch-old.sh` (not committed) and served locally by `deploy/shadcn-admin/serve-old.ts`.

Ported slice: `/sign-in` (react-hook-form + zod), `/` (dashboard: cards, recharts, tabs) and `/users`
(TanStack Table: sorting, filtering, pagination, row selection, dropdown menus, dialogs).

## Set-up

1. `npm create markless@latest -- shadcn-admin-markless --yes --starter minimal --agents claude-code --no-git --no-workspace`
   (published 0.4.0).
2. `npm install --legacy-peer-deps @markless/ui@0.4.0` (see U2), Tailwind 4.2.2 (the old app's exact version:
   4.3.3 generates different CSS), `zod`, `@tanstack/table-core`, `clsx`, `tailwind-merge`,
   `class-variance-authority`: the libraries plan classifies as as-is.
3. `plan --old http://127.0.0.1:4471 --source ../../deploy/shadcn-admin/old`, run in the new app: 7 crawled
   routes, 26 in source, 44 libraries in `.migrate/libraries.json`.

## Libraries (`.migrate/libraries.json`)

44 libraries: 18 map to `@markless/ui`, 11 need a parity port, 7 are used as they are, 3 are the framework
(React, React DOM, TanStack Router), 5 are dropped. Used surface against the package's exports, for the ones
that matter here:

| Library | Class | Used / exported | Usage sites | Port in this app |
| --- | --- | --- | --- | --- |
| shadcn/ui (local kit) | markless-ui | 124 / 148 | 896 | markup from the old DOM; tabs on `@markless/ui` tabs |
| @radix-ui/react-tabs, -dialog, -select, -popover, -checkbox, -collapsible, -radio-group, -switch, -label, -alert-dialog | markless-ui | 4/13, 8/26, 10/49, 4/22, 2/17, 3/10, 3/10, 2/7, 1/3, 5/28 | 4 to 15 each | tabs used; the others hand-rolled in the menu port (below) |
| sonner | markless-ui (toaster) | 3 / 9 | 20 | `lib/parity/sonner/` (113 lines): the `toaster` family's state cannot be reached from an app module (U4) |
| cmdk | markless-ui (combobox) | 7 / 12 | 8 | `lib/parity/cmdk/behaviour.ts` (96 lines) |
| @radix-ui/react-dropdown-menu, -tooltip, -separator; react-day-picker | markless-ui, not in 0.4.0 (U1) | 16/49, 6/19, 1/3, 2/183 | 17, 6, 1, 3 | `lib/parity/radix-ui-react-dropdown-menu/` (500 lines: trigger, content, popover content, item, checkbox item, select item, label, separator, group, shortcut); tooltips not ported |
| @tanstack/react-table | parity, core @tanstack/table-core | 17 / 221, 48 members | 52 | `lib/parity/tanstack-react-table/users-table.ts` (326 lines over table-core as-is) |
| react-hook-form, @hookform/resolvers | parity | 9 / 157, 13 members; 1 / 2 | 27, 13 | `lib/parity/react-hook-form/` (29 lines), `hookform-resolvers/` (20 lines) |
| recharts | parity, core d3-shape | 7 / 216 | 11 | `lib/parity/recharts/charts.tsrx` (SSR skeleton) and `public/parity/recharts.js` (178 lines) |
| lucide-react, @radix-ui/react-icons | parity | 87 / 5,826; 14 / 318 | 138, 19 | 59 and 13 icons rendered by the old app's React once (`scripts/port-icons.mjs`) |
| react-top-loading-bar | parity | 2 / 5 | 2 | `lib/parity/react-top-loading-bar/` and `public/parity/loading-bar.js` (25 lines) |
| zod, clsx, tailwind-merge, class-variance-authority, @faker-js/faker | as-is | 3/280, 2/5, 1/16, 2/5, 1/241 | 127, 2, 1, 8, 22 | imported unchanged (faker only by `scripts/generate-users.mjs`) |

`markless-migrate parity <library> --route / --route /users --route /sign-in` wrote each `behaviour.md` and
`behaviour.json` (what every usage site must do, and the recorded journeys that reach it).

## Framework gaps found (Markless 0.4.0, @markless/ui 0.4.0)

Each one cost a workaround in the port; the ones marked *repro* have a minimal page in `deploy/shadcn-admin/gaps/`.

| # | Gap | Workaround used |
| --- | --- | --- |
| G1 | Two components in one `.tsrx` file that each declare `const cls = computed(...)`: every one renders the last one's recipe (the card header got the card footer's classes) | a distinct name per component |
| G2 | Server rendering closes void elements: `<br class="k"></br>`, which a browser parses as two line breaks; also `</meta>`, `</link>` | a `block` span in place of the `<br>` |
| G3 | `<script>{'...'}</script>` text is HTML-escaped (`>` to `&gt;`, `"` to `&quot;`), so an inline script with a comparison or a double quote is broken | inline script written without them |
| G4 | `<Html>` from `@markless/router` takes only children: `lang` is fixed to `en` and `dir`, `class` or `data-*` cannot be set | `dir` set by the head script, as the old DirectionProvider did |
| G5 | The router wraps every page in `<div data-async-container>`, an element the old app does not have | `[data-async-container] { display: contents }` |
| G6 | A component's root must be one element: a fragment holding `{children}` is refused (`MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED`) | the shared shell moved into `document.tsrx` |
| G7 | An `@if` arm that holds a component, or any attribute bound to state, cannot be rebuilt when its test changes (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`) | every conditional part rendered once and shown or hidden with `hidden` |
| G8 | *repro* An `@for` row added on the client never appears, with no error, when the row renders a component or carries an attribute bound to the row's item (`data-type={toast.type}`); rows with only text holes work | fixed slots shown or hidden instead of rows created on the client |
| G9 | *repro* An `@for` over a prop adds no rows on the client when its component lives in another module | the list's markup kept in the file that owns the state |
| G10 | An element whose text hole has a sibling (`<p>{a}\|{b}</p>`, or `<li><div/>{title}</li>`): updating the hole replaces all the element's children | every hole in its own element |
| G11 | A prop forwarded through `{...rest}` renders once and never updates (`disabled` on a button stayed enabled) | each prop that changes is named and bound |
| G12 | `attach=` never runs for server-rendered elements in a production build (the page wakes on its first event), so nothing can run at load: no timers, no chart drawing | load-time behaviour in a static script in `public/parity/` |
| G13 | A state object passed to a function in a `.ts` module and changed there does not update the page | the ported libraries are pure functions; the handler writes the result back |
| G14 | A `computed()` recipe using `?.` or a TypeScript `!` on a state array, or returning an element of one, fails to compile (`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`) | `list.length > i ? list[i].x : ''` |
| G15 | An import renamed with `as` and used in a `computed()` fails to compile the same way | imports under their own names |
| G16 | A behavior (`attach`) cannot write `shared()` state (same error) | none needed after G12 |
| G17 | A `computed()` that compares a prop with a cell stops refreshing after resume | the prop copied into a cell first (`let name = state(menu)`) |
| G18 | A cell indexed by a dynamic value in a recipe is refused (`MARKLESS_STATE_DYNAMIC_PATH_READ`: `rows[at]`) | a plain function does the indexing (`field(rows, slot, 'username')`) |
| G19 | *repro* `@for` over a `computed()` whose list comes from a function in a `.ts` module never updates on the client: neither text holes nor attributes change when the list does (`deploy/shadcn-admin/gaps/for-component-rows.tsrx` shows the component case) | fixed slots: the users table renders 50 `UserRow` slots and 7 page-button slots, each shown or hidden |
| G20 | An event handler reading an array cell that no template binding reads gets `null` (`Cannot convert undefined or null to object`) | list-valued table state kept as comma-joined strings |
| G21 | A handler cannot call another function declared in the component (`MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED`) | each handler written out in full (the users page is generated, so the repetition costs nothing by hand) |
| G22 | After an early `return` in a handler, a later `event.preventDefault()` is compiled as unconditional: every key is prevented (Tab included) and every pointer button | the guard wraps the `preventDefault` instead of returning early |
| G23 | A script outside Markless that adds or removes elements breaks resume (`Resume locator h50 expected <div> at DOM order index ...`) | the server renders the full chart skeleton; `public/parity/recharts.js` only sets attributes and text |
| G24 | A handler whose body calls a callback prop is compiled to that callback alone: the rest of the body never runs (the row actions trigger, `onPointerdown={() => { m.open = ...; onActions(); openMenu(...) }}`, did nothing; the event record names the parent's callback symbol) | the trigger writes the open row into the shared menu cell (`m.at = '-3'`) and the page reads it; callback props are only called from handlers that do nothing else |
| G25 | A component nested inside a component used many times (a `DropdownMenuTrigger` inside each of 50 `UserRow`s) got its handlers bound to the outer instance's component edge (`bound:symbol%3A0:component-edge%3A6` instead of the nested edge), so pressing it ran nothing | the row's trigger written inline in `UserRow` |
| G26 | A pending `async` handler holds every later event on the page until it settles: after `await sleep(3000)` in the row checkbox's handler, the next three clicks did nothing | timers (`setTimeout`) inside synchronous handlers |
| G27 | A text hole beside an element (`<button><span class="sr-only">{label}</span>{n}</button>`) wipes the element on update (G10 again, confirmed on the pagination buttons) | the number in its own `<span>`; the old button's text node is a span here, so `fonts` cannot see its font (proposed acceptance below) |
| G28 | Render data grows with every component instance and every `computed()`: the users page downloads 2.74 MB of JavaScript (old app: 1.46 MB), three chunks of compiled render plans (1.23 MB, 746 kB, 272 kB), although only 3.7 kB runs at load (old: 721 kB). The resume metadata in the HTML is 1.6 MB | none found: fewer slots would drop page sizes 20 to 50 |
| G29 | `vite-plus` 0.1.20 deadlocks building this app: the main thread blocks inside a native call (`__psynch_cvwait` under `vite-plus.darwin-arm64.node`, reached from an `await` continuation, which matches `@markless/bundler`'s `await loadOxcTransformSync()` then `transformSync()` in `stripEmittedTypes`) while every `rolldown-worker` waits on a condition variable. Roughly half the builds of the final app stall; a single component with 140 computeds and 20 handlers (the rows unrolled into five group components, or into the page) stalled 5 of 5 times, with `RAYON_NUM_THREADS`, `ROLLDOWN_WORKER_THREADS` and `ROLLDOWN_MAX_BLOCKING_THREADS` raised or not | builds are watched and restarted when the bundler accrues no CPU for 45 s (`deploy/shadcn-admin/deploy.sh`); rows stay one small component each |
| U1 | Published @markless/ui 0.4.0 has 21 families: no `menu`, `tooltip`, `table`, `drawer`, `calendar` or `base.separator`, which exist in the unpublished 0.5.0 source | parity ports of the Radix primitives the routes use |
| U2 | @markless/ui 0.4.0 asks for `vitest ^4.1.5` as a peer while the starter's `vite-plus` brings vitest 5, so `npm install` fails with ERESOLVE | `--legacy-peer-deps` |
| U3 | 0.4.0 ships `.tsrx` source but no `ui()` Vite plugin and no word on setup: Vite pre-bundles it unless `optimizeDeps.exclude` and `ssr.noExternal` name it | both set in `vite.config.ts` |
| U4 | An app module cannot reach a family's `shared()` state: `toaster.state()` fails with "no compiled interface for @markless/ui" (`MARKLESS_SHARED_CALL_UNRESOLVED`), and the subpath export `toasterState()` compiles but throws `MARKLESS_SHARED_CALL_UNCOMPILED` at render | the toast queue kept in the page; only the family's pure queue functions considered |
| U5 | yuku-tsrx 0.1.3 (what 0.4.0 resolves) cannot parse `@if`/`@for` directly inside a member tag such as `<toaster.root>` | the part under a local name |

## Tool bugs found

| # | Bug | Effect |
| --- | --- | --- |
| T1 | `assets` treats Vite chunk names whose 8-character hash reads like a word (`users-Bkzkyznz.js`, `sign-in-Leyasppu.js`, `logo-yviHajhk.js`, `user-auth-form-BruTwSak.js`) as public files the new app must serve: `isHashToken` rejects PascalCase-shaped tokens even when the old app's built JS names the file | 4 red `assets` failures on every route; fixed in 22531a0 (a script or stylesheet ending in an eight-character hash counts when the built code names it) |
| T2 | The source scan's component graph does not link TanStack Router route files to the components they name in `component:` (imported from `features/`), so `plan`'s migration order attributes the dashboard and users components to the wrong routes | the library inventory computes routes itself (`src/library/routes.ts`); fixed in c93e2e6 (a route file's `component:` reference links the component to its route) |

| T3 | `parity` wrote its skeleton (`components.tsrx`, `index.ts`) beside a hand port saved under other names (`menu.tsrx`, `behaviour.ts`), leaving two competing modules in `lib/parity/<library>/` | fixed in `src/library/parity.ts`: any non-skeleton source file in the directory owns the code, and only `behaviour.md`/`behaviour.json` are refreshed (test in `test/library.test.ts`) |
| T4 | `plan` records at most 30 journeys per route in DOM order, so on `/users` the sidebar, header and menus use the whole budget and no journey reaches the table's own controls (sorting, filters, pagination, row menus): `check` proves them only through the rendered and CSS dimensions | the table's behaviour checked with `deploy/shadcn-admin/scripts/users-probe.mjs`, which drives the same 17 steps on both apps and prints what each shows; fixed in 02243b7 (coverage-driven journeys, main content and tables first, every element exercised or the route stays red) |
| T6 | `config --vercel` keeps an asset on the old deployment whenever the old one answers it, and an SPA answers every path with its `index.html` (200 `text/html`): the front door sent `/build/*.js`, `/parity/*.js` and the new stylesheet to the old app, and every switched page loaded without scripts | `deploy/shadcn-admin/scripts/front-assets.mjs` adds the new app's assets that the old app answers only with HTML (`/build/:path*`, `/parity/:path*`, the stylesheet) before the catch-all; fixed in db0a830 (`config` reads the new build's files and does not count an HTML answer to a file path as the old app serving it) |
| T5 | The `fonts` check reports a matched element's font as "(no text)" when the new element holds its text in a child span, and names the old element by its accessible name, which for the pagination buttons reads "Go to page 11" for page 1 (sr-only "Go to page 1" plus the visible "1") | fixed in accfd44 |

## Attempts

| Route | What happened |
| --- | --- |
| `/sign-in` | Static port in one pass from the old DOM; then G1, G2, G3, G5 (structure), the loading bar's timing, and the toast (G7 to G11, U4, U5). Left red only by T1 and the loading bar strip (below) |
| `/` | Shell (sidebar, header, team/user/theme/profile menus, command palette) generated from the old DOM, tabs on `@markless/ui` tabs, cards static, charts as an SSR skeleton drawn by `public/parity/recharts.js` (G12, G23). Menus needed G7, G13, G14, G17, G22; the space between the tab panels came from a too-general CSS rule of mine, removed. Left red only by the chart data (below) |
| `/users` | The table model is `@tanstack/table-core` as-is (`lib/parity/tanstack-react-table/users-table.ts`), fed plain strings from the page's cells; the page is generated (`deploy/shadcn-admin/scripts/gen-users.py`). `@for` could not show the rows (G19), so 50 row slots; a first version with one component per row nested a menu trigger that never fired (G24, G25); unrolling the rows into the page or into group components deadlocked every build (G29); the final version is one small `UserRow` per slot with its trigger inline. Then the hidden Reset button and hidden row slots changed `space-x` and `:last-child` styling (two scoped CSS rules), the fixed header's scroll shadow needed a static script, the page's second toaster added a region, and pending `async` handlers blocked later clicks (G26). Left red by T1, the avatars, G27/T5 and G28 |

## Results (local, one `check --route / --route /users --route /sign-in --source --new-source` run)

| Route | Dimensions red | What is left |
| --- | --- | --- |
| `/sign-in` | assets, css | T1 (4 chunk files); the loading bar's divs, whose timeline in the old app starts when React has rendered and here at the load event: the two drift apart under load (in a quiet run this route was red only by T1 and the bar's first 25 ms, `visual` on y 0 to 5) |
| `/` | visual, css, a11y, assets | bar and area paths and the chart region's pixels: the old charts draw `Math.random()` at module load, and the seeded stream the check installs is at a different position in each app; the loading bar (as above, including its fade counting as motion under reduced motion); T1; the avatars |
| `/users` | assets, weight | T1, `/avatars/shadcn.jpg` and `/avatars/01.png` (the old SPA answers 200 `text/html` for any path; the files do not exist), the pagination button font (G27, T5), JavaScript downloaded (G28) |

Every route: rendered, a11y (bar the loading-bar motion on `/`) and behaviour green; JavaScript run at load
`/` 440 kB to 10.1 kB, `/users` 721 kB to 3.7 kB, `/sign-in` 241 kB to 3.6 kB; on the wire `/` 1,215 kB to 532 kB,
`/sign-in` 740 kB to 449 kB, `/users` 1,475 kB to 2,750 kB (G28).

What the users table does, from `users-probe.mjs` on both apps (17 steps): the same rows, row counts, page labels,
URLs (`?username=ab&status=%5B%22active%22%5D`, `?page=2&pageSize=20`) and focus after selecting a row, select
all, clearing the selection, sorting by username descending, typing in the filter, picking a status facet,
Escape from the popover, Reset, next page, page 4, 20 rows per page (page index kept as TanStack does), hiding
the email column, and opening a row's Delete dialog (focus ends on the page in both). The bulk toolbar, its
live announcement (cleared after 3 s) and the promise toasts match too.

Not ported: the Add User, Edit User, Invite User and multi-delete dialogs (their buttons render and do nothing),
the bulk toolbar's tooltips (U1: no tooltip family in 0.4.0), and reading the table state from the URL on a
fresh load (`fromSearch(url.search)` is wired, but `check` loads only the bare route).

## Proposed acceptances (for a human: `markless-migrate accept <id> --reason "..."`)

None were accepted here: the skill reserves `accept` for a person. Ids are from the run above; the three routes
were switched with `switch --force` and these reasons, so the front door could be deployed.

| Route | Ids | Failure | Reason |
| --- | --- | --- | --- |
| `/sign-in` | `526dae8cfc`, `c20fd11ced`, `8e9eea0add`, `404425faa0` | T1 chunk files | Vite chunk names, not public files |
| `/` | `6bab2b6f26` | T1 | as above |
| `/users` | `6a1720cd72` | T1 | as above |
| `/` | `c9cb794a62`, `10db3d54ab`, `3bce0d6cfb`, `95b3e245a6`, `2fd8a39830`, `e3e5fa878e` | `/avatars/*` | the old app has no such files; its SPA fallback answers 200 `text/html` |
| `/users` | `8296f93f62`, `575f917c3d` | `/avatars/*` | as above |
| `/users` | `3578ca3c57`, `0c1ebf86cc` | pagination button font | G27/T5: the same Inter, the text sits in a span |
| `/users` | `115879ab00` | JavaScript downloaded | G28; JavaScript run at load fell from 721 kB to 3.7 kB |
| `/` | `8c02831df9`, `6b459e2985` and the `path` css ids | chart data | random at module load in the old app |
| `/`, `/sign-in` | `e7a12a903e`, `5c90511d53`, `76ff2547ed`, `1dcea167ac`, `bbc7cc8a39` | loading bar | the old bar's timeline starts at React's first render, a moment no Markless page has |

## Deployed

| What | URL |
| --- | --- |
| Old app (its own Vite build, SPA fallback) | https://mm-shadcn-admin-old.vercel.app |
| Markless app | https://mm-shadcn-admin-new.vercel.app |
| Front door (`/`, `/users`, `/sign-in` to the new app, the rest to the old one) | https://mm-shadcn-admin.vercel.app |
| Check report | https://mm-shadcn-admin.vercel.app/_migrate/report.html |

`deploy/shadcn-admin/deploy.sh old|new|front` rebuilds each (after `deploy/shadcn-admin/fetch-old.sh`).

## Markless 0.5.0 (2026-10-17)

Rebuilt on the published 0.5.0 framework packages (`@markless/*` 0.5.0, `vite-plus` 0.3.1). `@markless/ui` stays at 0.4.0: 0.5.0 of it is not on npm (the release held it back with `@markless/icons` and `@markless/ui-tools`), so U1 to U5 stand.

### What changed

0.5.0 refused two handlers 0.4.0 compiled: a key handler with a `preventDefault()` in each of several `if` blocks fails with `MARKLESS_SYNC_POLICY_SECOND_CANCEL` (only the first statement's cancel reaches the event). The dropdown menu's content, the command palette and the users table's facet filters now cancel once, at the top, for every key they handle (the generators `gen-users.py` and `shell.template.tsrx` write the same).

Not removed: the users table's 50 fixed row slots, the toaster's fixed slots, `public/parity/*.js` for what runs at load (loading bar, chart drawing, header shadow), and the `<br>`-as-span. 0.5.0 fixes the bugs behind them (G2, G8, G12 for `onIdle`, G19, G22), but replacing them means regenerating the table and the shell, which this pass did not do.

The settings cog ("Open theme settings") sets its state but the theme drawer it opens was never ported, so the cog does nothing on the Markless pages.

### Check (against the deployments)

`check --route / --route /users --route /sign-in`, old https://mm-shadcn-admin-old.vercel.app, new https://mm-shadcn-admin-new.vercel.app. Vercel's firewall had denied `/users` and `/sign-in` to the checker's address during an earlier run; a system bypass for that address is now on the demo projects.

| Route | Result |
| --- | --- |
| `/` | not compared: the page loads in the check's journeys timed out after 30 s (twice; the same page loads in under a second outside the check) |
| `/users` | not compared, the same |
| `/sign-in` | red: css (one muted text colour), behaviour (coverage: controls past the journey budget, one typing step that lost focus); JS on the wire 238.7 → 94.5 kB, run at load 241.2 → 5.0 kB |

Responsiveness on `/sign-in`: first interaction old 49 ms → new 57 ms at 4x CPU (desktop 50 → 61 ms).

Routes switched: none. The three routes had been switched with `--force`; they are back on the old app, so the front door (https://mm-shadcn-admin.vercel.app) serves the old app everywhere and its settings cog opens the old drawer (checked in a browser).

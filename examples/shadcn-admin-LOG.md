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
| U1 | Published @markless/ui 0.4.0 has 21 families: no `menu`, `tooltip`, `table`, `drawer`, `calendar` or `base.separator`, which exist in the unpublished 0.5.0 source | parity ports of the Radix primitives the routes use |
| U2 | @markless/ui 0.4.0 asks for `vitest ^4.1.5` as a peer while the starter's `vite-plus` brings vitest 5, so `npm install` fails with ERESOLVE | `--legacy-peer-deps` |
| U3 | 0.4.0 ships `.tsrx` source but no `ui()` Vite plugin and no word on setup: Vite pre-bundles it unless `optimizeDeps.exclude` and `ssr.noExternal` name it | both set in `vite.config.ts` |
| U4 | An app module cannot reach a family's `shared()` state: `toaster.state()` fails with "no compiled interface for @markless/ui" (`MARKLESS_SHARED_CALL_UNRESOLVED`), and the subpath export `toasterState()` compiles but throws `MARKLESS_SHARED_CALL_UNCOMPILED` at render | the toast queue kept in the page; only the family's pure queue functions considered |
| U5 | yuku-tsrx 0.1.3 (what 0.4.0 resolves) cannot parse `@if`/`@for` directly inside a member tag such as `<toaster.root>` | the part under a local name |

## Tool bugs found

| # | Bug | Effect |
| --- | --- | --- |
| T1 | `assets` treats Vite chunk names whose 8-character hash reads like a word (`users-Bkzkyznz.js`, `sign-in-Leyasppu.js`, `logo-yviHajhk.js`, `user-auth-form-BruTwSak.js`) as public files the new app must serve: `isHashToken` rejects PascalCase-shaped tokens even when the old app's built JS names the file | 4 red `assets` failures on every route; not fixed here (src/check/assets.ts had another worker's uncommitted edits) |
| T2 | The source scan's component graph does not link TanStack Router route files to the components they name in `component:` (imported from `features/`), so `plan`'s migration order attributes the dashboard and users components to the wrong routes | the library inventory computes routes itself (`src/library/routes.ts`) |

## Attempts

| Route | What happened |
| --- | --- |
| `/sign-in` | Static port in one pass from the old DOM; then G1, G2, G3, G5 (structure), the loading bar's timing, and the toast (G7 to G11, U4, U5). Green except T1 and the loading bar race below |

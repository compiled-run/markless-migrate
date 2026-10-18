# Migration log: Devtron's IPC panel (React + AG Grid Community) to Markless 0.5.0

[electron/devtron](https://github.com/electron/devtron) (MIT, Copyright (c) Electron contributors), at commit
`e6a45e3` (2026-10-10), moved to `examples/ag-grid-markless` by Claude Code (Opus) with markless-migrate's
library-parity feature. The old app is fetched and built by `deploy/ag-grid/fetch-old.sh` (not committed) and served
locally by `deploy/ag-grid/serve-old.ts`.

## Why this app

The brief asked for a realistic app on AG Grid Community (MIT): thousands of rows, sorting, filtering, paging or
virtual scrolling, editing, selection, column resizing and keyboard navigation, not the feature demo.

- AG Grid's own demo apps (`ag-grid/ag-grid-demos`: finance, inventory, HR, performance) were the first choice, but
  every one imports `ag-grid-enterprise` (master/detail, set filters, sparklines, Excel export) and the repository has
  no licence at all, so they are neither Community-only nor open source. `ag-grid/ag-grid-react-example` is the same
  (enterprise modules, no licence file). `ag-grid/react-data-grid` (MIT) holds blog snippets of 10 to 20 rows.
- Devtron is the Electron project's devtools extension for tracing IPC. Its panel (`src/extension/react`) is a
  React 19 app whose main view is an AG Grid Community 34.2 grid of IPC events, registering only Community modules,
  and keeping up to 20,000 events. It uses virtual scrolling over thousands of rows, sorting (with shift multi-sort),
  two text filters and a custom filter in header popups, single row selection, column resizing with flex columns,
  header keyboard navigation, a resizable details panel with a JSON tree (`@microlink/react-json-view`), light and
  dark themes and lucide icons.
- What it does not use: cell editing (no column is editable) and paging (it virtualises instead); rows are focusable
  but `suppressCellFocus` turns off cell-by-cell keyboard navigation. Those parts of the brief have nothing to compare
  here.

The panel gets its events from the extension's background service worker through `chrome.runtime.connect`. Both apps
run in the same devtools host here: `examples/ag-grid-markless/public/devtools-host.js` is a `chrome.runtime` stub that
answers the panel's `get-all-events` with a fixed, seeded log of 5,000 IPC events (channels, payloads up to five
levels deep, request/response pairs with matching uuids and response times, service-worker events). The old app's
`index.html` loads it before `react.js` (served that way by `serve-old.ts` and `deploy.sh old`); the new app's
`document.tsrx` loads it after the page. No source of the old app was changed.

## Set-up

1. `npm create markless@latest -- ag-grid-markless --yes --starter minimal --agents claude-code --no-git --no-workspace`
   (published 0.5.0), then `npm install --legacy-peer-deps @markless/ui@0.4.0` (U2 below), Tailwind 3.4.18 and
   postcss-preset-env 10.4.0 (the old app's versions and PostCSS chain).
2. `deploy/ag-grid/fetch-old.sh`: clone, `yarn install --immutable`, `yarn build:browser`, a copy of the panel's
   source in `deploy/ag-grid/old-panel` (T1), and the extension's other entries copied into the new app's `public/`.
3. `node deploy/ag-grid/serve-old.ts 4480`, then in the new app
   `markless-migrate plan --old http://127.0.0.1:4480 --source ../../deploy/ag-grid/old-panel`.
4. `markless-migrate parity ag-grid-react`, `parity ag-grid-community`, `parity @microlink/react-json-view`,
   `parity lucide-react` (without `--route`, T6).

## Libraries (`.migrate/libraries.json`)

8 libraries: 3 to port, 3 as-is, 2 replaced by Markless. No @markless/ui family maps to any of them: 0.4.0 has no
grid, table, tooltip or JSON tree (U1).

| Library | Class (plan) | Used / exported | Sites | Port |
| --- | --- | --- | --- | --- |
| ag-grid-react 34.2 | parity | 2 / 39 | 3 | `lib/parity/ag-grid-react/` (below) |
| ag-grid-community 34.2 | as-is (T3: wrong, it is the grid) | 18 / 1,506, 9 members read | 20 | same port; its CSS is shipped as `styles/ag-grid.css` and `styles/ag-theme.css` |
| @microlink/react-json-view 1.27 | parity | 1 | 1 | `lib/parity/microlink-react-json-view/tree.ts`, component `ReactJson` in `components/panel.tsrx` (G5, G12) |
| lucide-react 0.513 | parity | 11 / 5,419 | 14 | `lib/parity/lucide-react/components.tsrx`; the icons inside `@if` arms written out as SVG (G1) |
| denque | as-is | 1 | 1 | only the background service worker uses it; that file is served unchanged |
| @fontsource/space-mono (and @fontsource-variable/roboto, missing from the list, T2) | as-is | CSS | 1 | `styles/fonts.css`, files in `public/fonts/` |
| react, react-dom | Markless | 8, 1 | 34 | `state`, `computed`, `shared`, `onIdle` |

AG Grid's used surface, as the port implements it (libraries.json lists only the `<AgGridReact>` prop names and a
few members, T4):

- Props: `rowData`, `columnDefs`, `getRowId` (serial number), `theme` (`themeQuartz.withParams({ cellFontFamily })` and
  the light or dark `rowBorder`/`backgroundColor`/`foregroundColor`/`browserColorScheme`), `defaultColDef`
  (`sortable: true, filter: false, resizable: true`), `onRowClicked`, `rowSelection: 'single'`,
  `suppressCellFocus`, `suppressScrollOnNewData`, `headerHeight: 25`, `rowHeight: 29`, `animateRows: false`,
  `enableFilterHandlers`, `tooltipShowDelay`/`tooltipShowMode` (no column has a tooltip, so nothing shows),
  `ref` for `api.ensureIndexVisible(index, 'bottom')` and `api.getRowNode(id).setSelected(true)`.
- Column definitions: `headerName`, `field`, `width`, `flex` (1 and 3), `cellClass`, `headerClass`, `valueFormatter`
  (time), `cellRenderer` (direction badge, channel with a Response badge, JSON preview), `filter:
  'agTextColumnFilter'` on Channel and Data with `filterValueGetter` (JSON of the args) on Data, a custom filter
  (`{ component: DirectionFilter, doesFilterPass }`, `model`/`onModelChange`, `handlerParams.getValue`) on
  Direction, `resizable: false` on Data.
- What those bring with them, all ported: the client-side row model with row virtualisation (row buffer 10, rows
  kept in the DOM in AG Grid's order), the sort cycle and shift multi-sort with sort numbers, the text filter popup (8
  operators, a second condition with AND/OR, 500 ms debounce, case-insensitive), the custom filter popup, flex column
  sizing and drag resizing, column move by header drag and column hide by dragging a header out of the grid, row
  hover/focus/selection classes and ctrl-click deselect, header keyboard navigation (Tab and arrows between
  headers, Enter sorts, Ctrl+Enter opens the filter, ArrowDown to the grid body) with AG Grid's tab guards, the
  operator picker's keyboard (Enter/ArrowDown open, arrows move, Enter picks, Escape closes the list only), Escape
  and outside clicks closing popups, ARIA (`grid`, `row`, `columnheader`, `gridcell`, `aria-rowcount`,
  `aria-rowindex`, `aria-colindex`, `aria-colcount`, `aria-sort`, `aria-selected`), the aria live region's
  announcements (debounce, zero-width space on a repeat), the "No Rows To Show" overlay, the invisible ("apple")
  scrollbars and their 550 ms fade, and AG Grid's own DOM and class names so its stylesheet applies unchanged.
- Port size: 2,227 lines for the grid (`components.tsrx` 725, `model.ts` 956, `api.ts` 375, `header.ts` 171, as
  formatted by `vp fmt`) and 523 for the JSON tree (`tree.ts` 347, `ReactJson` 176). AG Grid for the same modules is
  833 kB minified, 236 kB gzipped (an `esbuild` bundle of `ag-grid-community` with the 11 registered modules plus
  `ag-grid-react`, React external). The grid port builds to 161 kB minified of code (model, handlers, resolver)
  plus 208 kB of compiled render data (G28), uncompressed; the JSON tree's model is 5 kB.

## Results

`markless-migrate check --all --source ../../deploy/ag-grid/old-panel --new-source .`, run against the deployed old
and new app (`--old https://mm-ag-grid-old.vercel.app --new https://mm-ag-grid-new.vercel.app`), coverage gate and
responsiveness on (markless-migrate main at `b75ed5f`):

| Route | Result | What is left |
| --- | --- | --- |
| `/` | red, `assets` only | `/react.js`: the old panel's own bundle, not served by the new app (proposed acceptance below). Rendered, visual (desktop and phone), seo, css, a11y (axe, landmarks, Tab order, reduced motion, keyboard paths), i18n, behaviour, network, weight and responsiveness green |
| `/manifest.json` | green, switched | the extension's manifest, served unchanged |
| `/src/extension/` | red when deployed, green locally | not a route: plan read the webpack template as one (T5); Vercel's static 404 page and Nitro's plain "Not found" differ |
| `/src/extension`, `/src/extension/devtools/devtools.html`, `/markless-migrate-no-such-page` | green | 404 on both |

The check's journeys reach only the five toolbar buttons (T8), so the grid itself is compared by
`deploy/ag-grid/scripts/grid-probe.mjs`: 51 scenarios, each on a fresh page of both apps, comparing focus, header
state (sort, width, sort number, filtered), `aria-rowcount`, the rendered row range, every visible row's
`aria-rowindex`, id and selection, visible text, scroll position, the open popup, the details panel's text, the
overlay, the theme and local storage. **51 of 51 the same**: load, scrolling (programmatic, wheel, through all rows),
sorting every column both ways and back, multi-sort, every text-filter operator on Channel, AND and OR, the Data
filter, an empty result, the direction filter (one, two, Clear all), filter and sort together, Escape and outside
clicks, Ctrl+Enter, the operator picker by keyboard, row selection, ctrl-click, the linked-event jump, closing the
details, react-json-view's folding (including its quirk: a nested node ignores its first click after it shows a new
value), header and row keyboard paths, Tab out of the grid and back, column resize and move, dragging a column out of
the grid, the dark theme, the details panel below, and clearing the events.

## Numbers

| | Old (React 19 + AG Grid 34) | New (Markless 0.5.0) |
| --- | --- | --- |
| JavaScript downloaded (deployed, compressed) | 705 kB | 88 kB |
| JavaScript downloaded (uncompressed source) | 2,428 kB | 492 kB |
| JavaScript run at load (Chromium coverage) | 1,038 kB | 214 kB |
| First rows on screen after navigation (local) | ~150 ms | ~62 ms |

The old panel's `index.html` loads `react.js` twice (webpack's HtmlWebpackPlugin injects every entry, and the
template adds `react.js` again), so React and AG Grid start twice; that is the shipped extension, measured as it is.

First interactions with the CPU slowed 4x (`deploy/ag-grid/scripts/measure.mjs`, 1280x800, median of 5 fresh loads,
trusted input to the next frame after the first DOM change):

| Interaction | Old | New |
| --- | --- | --- |
| Sort click (Channel header), first use | 139 ms | 77 ms |
| Sort click, second use | 63 ms | 41 ms |
| Open the Channel filter | 75 ms | 46 ms |
| Filter typing, first key | 21 ms | 16 ms |
| Filter result on screen after the last key (less the 500 ms debounce both share) | 73 ms | 36 ms |
| Row click (select and open details), next frame | 49 ms | 88 ms |
| Row click, details panel painted (Chrome trace, 3 runs) | ~105 ms | ~92 ms |
| Cell edit | n/a (no editable column) | n/a |

The row click is the one slower first frame: AG Grid paints the selected row a frame before React renders the details
panel, while the Markless handler selects the row and builds the panel (and its JSON tree) in one task, so its first
frame comes after both; the panel itself shows sooner. markless-migrate's own responsiveness dimension (toolbar
buttons only) reports old 65 ms → new 51 ms at 4x CPU.

Scroll smoothness, a fast scroll through all 5,000 rows (one viewport per frame, 194 frames, 4x CPU, 3 runs): old
0 to 3 frames over 50 ms (worst 46 to 62 ms), 0 to 2 long tasks (up to 10 ms blocking), 5.4 to 7.1 s; new 0 frames
over 50 ms (worst 35 to 42 ms), 0 long tasks, 4.9 to 5.3 s. Neither left a viewport without rows.

## Proposed acceptances (for a person: `markless-migrate accept <id> --reason "..."`)

None were accepted and no route was forced; `/` stays red and unswitched until a person decides.

| Route | Id (deployed run; local run) | Failure | Reason |
| --- | --- | --- | --- |
| `/` | `4b1f3d752f`; `8b572026f0` | `assets`: `/react.js` 404 on the new app | the old panel page's own bundle (React and AG Grid); nothing but that page loads it, and the Markless page replaces it |
| `/src/extension/` | the 59 ids under that route in the published report | 404 pages differ on Vercel | not a route of the app (T5); Vercel's default 404 page against Nitro's |

After accepting `/react.js`: `markless-migrate switch /` and `deploy/ag-grid/deploy.sh front` puts the Markless panel
behind the front door.

Known differences no check reports (no acceptance needed, listed for the record): elements the old app creates and
removes are kept and hidden in the new one (the filter popups, the second filter condition, a hidden column's
cells, the JSON tree's other node shape, G1/G9/G16), the JSON tree has `display: contents` wrappers per node (G16),
and the old app's console warnings from AG Grid's ValidationModule are gone.

## Markless 0.5.0 gaps

Each cost a workaround in the port. *Repro* points at a minimal page in `deploy/ag-grid/gaps/`, each run on a 0.5.0
app and confirmed; the others were seen in this app and are described with the shape that triggers them.

| # | Gap | Workaround |
| --- | --- | --- |
| G1 | An `@if` arm that holds a component is refused (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`) even when the component only takes constants (`<Sun strokeWidth={3} size={15} />` against `<Moon .../>`, the filter's `<Check />`) | the icon's SVG written in the arm |
| G2 | A component whose root is `@if/@else` (two alternative root elements) compiles, then fails at render with `MARKLESS_SSR_DATA_CHILD_RENDER_MISSING: component-edge:2` (DirectionBadge) | one root element with the `@if` inside |
| G3 | *repro* `computed-of-computed.tsrx`: a computed that reads another computed sees `undefined` when the browser refreshes it after resume (`Cannot read properties of undefined`) | every computed calls a plain function of state and props; the costly step (filter and sort of 5,000 rows) is cached in `model.ts` |
| G4 | A prop whose value is a module constant the parent imports (`columnDefs={columnDefs}`) is `undefined` in the child's computeds in the browser | the parent puts it in a `state()` |
| G5 | *repro* `prop-forwarded.tsrx`: a prop forwarded through one more component is `undefined` in the inner component's computed (Panel → DetailPanel → ReactJson) | the owner passes it directly (ReactJson as DetailPanel's `children`) |
| G6 | A handler in a component rendered per row cannot read its row prop (`MARKLESS_CAPTURE_OPAQUE_PROP: ... prop "row" ... reads it as row.serial ... has no route there`), and a callback prop bound as the handler itself (`onClick={onSort}`) is refused the same way | handlers read the row id from the element (`row-id`); callbacks wrapped in arrows |
| G7 | A handler cannot set a property on an `element()` handle (`fakeV.scrollTop = top` → `MARKLESS_STATE_READ_ONLY_WRITE: element bindings are read-only`) | `setScrollTop(el, top)` in a `.ts` helper |
| G8 | `@for` over a module constant is refused (`MARKLESS_REPEAT_ROWS_FROZEN`) even when the rows read state | `computed(() => ALL_DIRECTIONS.slice())`, later the options built by a function of state |
| G9 | *repro* `if-in-for-row.tsrx`: an `@if` written directly in a keyed `@for` row stops that list from updating in the browser, silently; the same `@if` inside a same-file component works, and that component imported from another file is never created in the browser | values switched by `style`/`hidden`/class (`ag-hidden`) instead of `@if` in rows |
| G10 | Child components per row or per column did not reach the grid's state: `HeaderCell`'s sort click ran a handler bound to another instance (`c0:c5:c2:bound:symbol:7` for the first header), writes to a page-scope `shared()` from those children never reached the parent's computeds, a `GridRow` component's `onClick` never ran for clicks on its children (`no event record matched [span]`), and a same-file row component calling `shared()` was never created | one `AgGridReact` component with the header cells, rows and options written inline |
| G11 | *repro* `recursive-component.tsrx`: a component that renders itself fills on the server but not when the browser replaces its data | react-json-view's tree written out seven levels deep |
| G12 | Nested `@for` loops (inner over a field of the outer row) in `ReactJson` filled level 1 but never level 2 while `ReactJson` lived in `lib/parity/...` and got the row through DetailPanel; the same component in `components/panel.tsrx`, fed by Panel directly, works. A smaller page with an imported component and nested loops works, so the trigger is narrower than "another file" | `ReactJson` in `panel.tsrx` |
| G13 | *repro* `two-roots-in-row.tsrx`: a `@for` row with two sibling root elements renders only the first in the browser | both wrapped in a `display: contents` element |
| G14 | Inside rows, reading a computed of the enclosing component (`style={styles.colon}`) renders nothing | the styles copied into each row's data |
| G15 | *repro* `keyed-rows-reinserted.tsrx`: adding rows to the end of a keyed list removes and re-adds every existing row element (12 mutations for 2 new rows); a focused row loses focus on every scroll | rows kept in AG Grid's DOM order, and a MutationObserver that puts focus back (`keepRowFocus`) |
| G16 | The panel root's `onIdle` handler ran three times (the page has two other `onIdle` elements, the grid and the details panel), so the 5,000 events arrived three times; the docs say it runs once per element | a once-guard (`firstTime`) |
| G17 | No way to run code when the page loads other than `onIdle`; the panel connects to `chrome.runtime` on idle (the rows still show ~90 ms sooner than the old app's) | `onIdle` |
| G18 | DOM writes from a state change are not done by the next animation frame: the old app's `requestAnimationFrame(() => ensureIndexVisible(last))` found the rows container still 0 px tall | `afterRowsRendered`: a ResizeObserver waits for the container's height |
| G19 | DetailPanel's computeds never saw its `direction` prop change (it also passes `direction={dir}` to DirectionBadge); renamed to `dock`, they do. A small page with the same names does not reproduce it | the prop renamed |
| G20 | A template expression mixing a prop and state in a client-created component (`hidden={(node.size > 0) === toggled}`) is refused (`MARKLESS_CAPTURE_OPAQUE_PROP: ... read through a path the compiler cannot reduce`), and a computed doing the same reads the prop as `undefined` | the expanded flags computed into the tree data |
| G21 | Two `preventDefault()` calls in one handler are refused (`MARKLESS_SYNC_POLICY_SECOND_CANCEL`) | one combined key test |
| G22 | Dev server: the first request after start, and requests after some edits, fail with `MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED`, which hid the real compile error (G21) until a production build showed it; edits often left the old output in place until a restart | restart the dev server; check with `npm run build` |
| G23 | `vp check` warns on the starter's own `markless-router-env.d.ts` (`triple-slash-reference`) | none |
| G24 | A literal `@if` in JSX text (`<p>inline @if rows</p>`) is a parse error | reworded |
| G28 | Compiled render data is half of the client JavaScript: one 529 kB chunk (minified, of 1,111 kB) for this one page (panel 498 kB, grid 419 kB, details 72 kB before minifying), against 161 kB of the grid's code; only 214 kB runs at load and 88 kB crosses the wire compressed | none |
| U1 | `@markless/ui` 0.5.0 is not on npm; 0.4.0 has no grid, table, tooltip or tree family, so the grid is a hand port | parity port |
| U2 | `npm install @markless/ui@0.4.0` into the 0.5.0 starter still fails with ERESOLVE (vitest peer) | `--legacy-peer-deps` |

Gaps from the shadcn-admin migration (0.4.0) still present: G7 there (`@if` arms holding components, G1 here) and
G28 there (render data). Fixed since and relied on here: keyed rows updating in place under the same key, and
`if (e.key !== 'Enter') return; e.preventDefault();` cancelling only that key.

## Tool bugs found (markless-migrate main `b75ed5f`; not fixed here, this task owned only the ag-grid paths)

| # | Bug | Effect |
| --- | --- | --- |
| T1 | `plan --source` crashes with `Cannot read properties of null (reading 'startsWith')`: an uninitialised `let devtronSW;` is recorded as a `require()` import with source `null` (`src/source/js.ts`: `const req = d.init && requireSource(d.init)` yields `null`, and `null !== undefined`), then `resolveImport` reads `null.startsWith` | plan cannot scan Devtron's repository; scanned `deploy/ag-grid/old-panel` (the panel's own source) instead |
| T2 | `libraries.json` misses `@fontsource-variable/roboto` (a side-effect `import '@fontsource-variable/roboto'` beside the listed `@fontsource/space-mono/400.css`) | one library unlisted |
| T3 | `ag-grid-community` is classed "as-is (framework-agnostic): import it unchanged; nothing to port": it renders the whole grid itself, so following the advice ships AG Grid to the browser, which the migration skill forbids | the catalog should treat DOM-owning widget libraries (AG Grid, Handsontable, Tabulator) as ports |
| T4 | For AG Grid, `libraries.json` lists the `<AgGridReact>` prop names and a few members, but not the column definitions' keys, the custom filter's props, or the grid API calls made through the ref (`api.ensureIndexVisible`, `api.getRowNode(id).setSelected`); the `theme` prop's value is cut at 40 characters | the used surface above was read from the source by hand |
| T5 | For a webpack app, plan takes the HTML templates as routes (`/src/extension/` from `src/extension/index.html`, `/src/extension/devtools/devtools.html`) | `check --all` checks two routes that do not exist; on Vercel the 404 pages differ and `/src/extension/` goes red |
| T6 | `parity <library> --route /` fails with "is not used on /": the crawled `/` is not linked to the webpack entry, so no library and no component is attributed to a route (`status` lists every component as "unchecked") | parity run without `--route`; `behaviour.md` says "No interactions recorded yet" |
| T7 | The parity skeleton for a default export is `export function default(...)`, a syntax error (`lib/parity/microlink-react-json-view/components.tsrx`) | replaced by hand |
| T8 | `check`'s coverage counts native controls only: on a page whose content is a grid with clickable column headers (`role=columnheader`), filter buttons (spans), focusable rows (`role=row tabindex=0`) and a clickable linked-event span, it reports "interactions exercised: 5 of 5" (the toolbar), so sorting, filtering, selection, resizing and grid keyboard navigation are neither replayed nor timed | `deploy/ag-grid/scripts/grid-probe.mjs` and `measure.mjs` |
| T9 | `config --vercel` sends `/.gitkeep` (the starter's empty `public/.gitkeep`) to the new app as an asset | harmless rewrite in `deploy/ag-grid/front/vercel.json` |

## Deployed

| What | URL |
| --- | --- |
| Old app (Devtron's built panel with the devtools host stub) | https://mm-ag-grid-old.vercel.app |
| Markless app | https://mm-ag-grid-new.vercel.app |
| Front door (`/manifest.json` from the new app, `/` and the rest from the old one until `/` is accepted and switched) | https://mm-ag-grid.vercel.app |
| Migration index and check report | https://mm-ag-grid.vercel.app/_migrate/ and https://mm-ag-grid.vercel.app/_migrate/report.html |

`deploy/ag-grid/deploy.sh old|new|front` rebuilds each (after `deploy/ag-grid/fetch-old.sh`).

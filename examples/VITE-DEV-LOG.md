# Migration log: vite.dev homepage to Markless

The real Vite homepage (https://vite.dev/, VitePress with the `@voidzero-dev/vitepress-theme`), ported to a
Markless app in `examples/vite-dev-markless` by Claude Code (Opus, on the owner's subscription) with
`markless-migrate` checking every step. Only `/` moves to Markless; every other route stays on the old app.

## Set-up

| What | How |
| --- | --- |
| Old app | `git clone --depth 1 https://github.com/vitejs/vite` at `df7503c` into `~/dev/scratch/vite`; `pnpm install`; `pnpm --filter vite run build` (the docs import the local `vite` package); `DEPLOY_PRIME_URL=https://vite.dev COMMIT_REF=b6c20f6a pnpm docs-build`; `vitepress serve --port 4710` |
| Matches production? | Yes. The `/` HTML's visible text and `<head>` are identical to https://vite.dev/ (asset hashes aside) once the build gets production's two Netlify variables: without them the footer reads `(dev)` instead of `(b6c20f6a)` and adds a "Vite 8 Docs (release)" link |
| New app | `npm create markless@latest -- vite-dev-markless --yes --starter app --no-git --no-workspace` (published 0.4.0), served from its production build (`npm run build`, `node .output/server/index.mjs`) |
| Inventory | `plan --old http://localhost:4710 --source ~/dev/scratch/vite/docs --limit 30` |

The repo pins `pnpm@12.11.2`, whose native binary fails to start on this machine (`ENOEXEC`); `npx pnpm@12.11.2` works.

## How the homepage was ported

- Markup: each section of the old page's rendered DOM was drafted into `.tsrx` by `.port/to-tsrx.mjs` (it walks the
  live DOM, so SVG attribute case and the Iconify icons the old page fetches at runtime come out as inline SVG),
  then split into one component per Vue component (`components/*.tsrx`) and the repeated parts rewritten as data
  plus `@for` (testimonials, sponsor tiers). Vue's scoped-style attributes (`data-v-*`) stay, because the ported
  stylesheet selects on them.
- Styles: the old build's stylesheet (Tailwind 4 output plus VitePress and the theme's scoped styles), with every
  `url()` pointed back at the theme's source file by byte comparison (`.port/port-css.mjs`) so Vite re-hashes them
  (`styles/vite.css`). `styles/home.css` holds what the Vue components decided in JavaScript and Markless 0.4.0 can
  only do in CSS (see "Markless 0.4.0 findings").
- Assets: images and fonts imported from the theme's sources; `public/trusted-by/`, the favicon and the OG image
  copied from `docs/public` so they keep their URLs.
- Interactions in Markless: the four header flyouts (hover, click, focus leaving), the mobile menu (accordions,
  Escape, focus trap, scroll lock), the install tabs and their copy buttons, the banner's close button.
- Load-time JavaScript in `page-scripts/page.ts`, a plain module script bundled by `page-scripts.config.ts`: the three Rive
  animations, the search shortcuts (`/`, Ctrl/Cmd+K) and the search buttons, which load `page-scripts/search.ts` on first
  use (a port of VPLocalSearchBox on the same MiniSearch index, copied from the old build by
  `scripts/search-index.mjs`).
- Sponsors: rendered on the server from the same live `https://sponsors.vite.dev/sponsors.json` the old page fetches
  in the browser after load.

## Deployed

| What | URL |
| --- | --- |
| Front door (project `migrate-demo`) | https://markless-migrate-demo.vercel.app, index at `/_migrate/`, report at `/_migrate/report.html` |
| Markless app (project `vite-dev-markless`) | https://vite-dev-markless.vercel.app |
| Old app (project `vite-dev-old`) | https://vite-dev-old.vercel.app |

`deploy/vite-dev/deploy.sh old|new|front` builds and deploys each. `/` is not switched yet (it is not green;
see "What is left"), so the front door serves the old app everywhere until the owner switches it; the Markless
homepage is live at its own URL, where every other path is forwarded to the old app.

## Iterations

| # | Started | Took | What check caught | Fix |
| --- | --- | --- | --- | --- |
| 0 | 18:32 | did not finish | Baseline against the untouched starter hung (see tool finding 1); a second agent's migration was also serving on the starter's port 4411 | Moved to dedicated ports (old 4710, new 4712 frozen snapshot, 4713 for development) |
| 1 | 23:52 | 158 s | 262 failures, red on visual, assets, css, a11y, i18n, behaviour, network, weight. `lang` was `en` and `data-theme`/`data-variant` missing on `<html>` (so every element's `-webkit-locale` and the dark theme's link colours differed); two hidden logo images in the always-present mobile menu shifted every image position; the Rive files and search index came from different URLs or as a `fetch`; the Iconify and sponsors requests were gone; 680 kB of JavaScript on the wire against 140 kB | `<html>` attributes through a Nitro middleware; the menu logos rendered only while it is open; Rive files emitted at the old `/assets/name.hash.ext` URLs; search index loaded as a module chunk; same-page links scroll instead of reloading; Brotli on public assets |
| 2 | 00:08 | 149 s | 190 failures. My CSS-only logo strip kept 12 hidden images in the DOM (every later image position shifted); my `#app` div plus the router's `data-async-container` paired generic elements wrongly; Rive canvases sized differently after breakpoint crossings; links to other pages log the old app's FloatingVue error; JavaScript on the wire 148.5 kB | Logo strip as Markless state with two static `@if` arms, set by a `logofit` event the page script dispatches from LogoGrid.vue's overflow check (DOM swaps outside Markless broke its DOM-order resume locators); dropped `#app`; Rive recreated before the size attributes are patched, and only the attributes whose bound value changed, as Vue does; the docs pages' CSS, images and fonts forwarded too; 29 handlers folded into 9 delegated ones |
| 3 | 00:22 | 150 s | 20 failures: canvas sizes and hero pixels in forced widths, a footer margin, the three missing requests, weight, ten FloatingVue steps | Rive bundled into the page script (one request fewer, starts sooner); new tool fix 2 |
| 4 | 00:28 | 139 s | 36 failures: the canvases now raced the two-frame sample the other way | Tool fix 2 (`fbd8778`): forced states wait for the network to go quiet |
| 5 | 00:39 | 148 s | 19: no canvas-size failures left; remaining state screenshots differ only on the Rive canvas | Preloaded the banner image the footer shares |
| 6 | 00:46 | about 180 s | 20, same kinds | Pruned the copied theme assets to the 43 files used (8.5 MB to 3.3 MB) |
| 7 | 00:52 | 183 s | **21, all in five kinds the owner has to rule on** (below); http, auth, rendered, seo, assets, css, i18n and data green | none: these are not fixable in the app without making it worse, see "What is left" |

The machine slept between 19:07 and 23:35; that gap is not part of any timing above. Hands-on time from the first
`plan` to the deployed apps was about five hours, of which roughly 1.5 went to the two tool bugs that made `check`
hang or flap, and most of the rest to Markless 0.4.0 limitations (findings below).

## What is left on `/` (iteration 7)

Each needs the owner's ruling; the tool lets only a human accept a difference. The scratch copy in `/tmp/vd/acc`
was used to confirm the entries below parse and match; `.migrate/accepted.json` was not written.

1. **Iconify icons** (`network`, 2 failures): the old page fetches 10 icon definitions from `api.iconify.design` in
   the browser after load; the Markless page has the same SVGs inline. Recommend accepting.
2. **Sponsors** (`network`, 1): the old page fetches `sponsors.vite.dev/sponsors.json` in the browser and fills the
   sponsor grid after load; the Markless page fetches the same live file on the server, so the grid is in the HTML.
   Recommend accepting (porting the browser fetch is possible, but would mean a client-rendered grid and a layout
   shift, for no visible difference).
3. **JavaScript downloaded** (`weight`, 1): 146.7 kB against 140.1 kB locally (old gzip, new Brotli); on Vercel,
   192 kB in 155 requests against 147 kB in 7. JavaScript **run** at load drops from 210 kB to 63 kB (-70%). The
   extra bytes are Markless 0.4.0's own runtime chunks and the route's render data, which it modulepreloads and
   which the app cannot opt out of (finding 14). Recommend accepting as a known Markless issue, not as intended.
4. **Hero animation frame in forced-state screenshots** (`visual`, 6 to 8 per run, ids vary): every differing
   region lies on one of the three Rive canvases. Rive advances on `requestAnimationFrame` time, which `check` does
   not freeze, and the Markless page starts the animation at a different moment (its `load` event fires at about
   600 ms locally against 100 ms). The default-state screenshots pass. Recommend accepting, matched by check
   `screenshot in *` (broad: it would also hide a real visual change in a forced state, so re-check by eye).
5. **FloatingVue error after following a link to another page** (`behaviour`/`a11y`, 10): every full load of an
   old docs page logs `Failed to patch FloatingVue ... reading 'Popper'` (seen on a direct load of
   http://localhost:4710/guide/ too). The old homepage navigates with VitePress's client router and never reloads,
   so its journeys do not see it; from the Markless page the same link is a normal page load of the old app.
   Recommend accepting.

Commands, run in `examples/vite-dev-markless` (the ids are stable; 4 and 5 need hand-written entries because
their ids vary or there are ten of them):

```sh
# the two apps, if they are not still running:
#   (cd ~/dev/scratch/vite/docs && npx vitepress serve --port 4710)
#   npm run build && PORT=4712 HOST=127.0.0.1 node .output/server/index.mjs
M="node ../../src/cli.ts"
$M accept 6ffc3c1414 --reason "Icons are inlined as SVG at build time instead of fetched from the Iconify API"
$M accept 63c8009f1d --reason "Icons are inlined as SVG at build time instead of fetched from the Iconify API"
$M accept 2a17311a61 --reason "Sponsors are fetched on the server and rendered into the HTML"
$M accept 0611c0f315 --reason "Markless 0.4.0 modulepreloads its runtime chunks; JavaScript run at load is 70% lower"
# then add to .migrate/accepted.json:
#  { "route": "/", "dimension": "visual", "check": "screenshot in *", "reason": "Rive canvas animations run on the real clock", "by": "<you>", "date": "2026-10-17" }
#  { "route": "/", "dimension": "*", "check": "* link *", "match": { "actual": "/FloatingVue/" }, "reason": "The old app logs this on every full page load", "by": "<you>", "date": "2026-10-17" }
$M check --old http://localhost:4710 --new http://127.0.0.1:4712 --route / --source ~/dev/scratch/vite/docs --new-source .
$M switch /
../../deploy/vite-dev/deploy.sh front
```

## Weight of `/`

| | JS downloaded | requests | JS run at load |
| --- | --- | --- | --- |
| vite.dev (production) | 136 kB | 7 | 210 kB |
| Old build on Vercel | 147 kB | 7 | 210 kB |
| Markless on Vercel | 192 kB | 155 | 63 kB |
| Old, local (`check`) | 140 kB (gzip) | 7 | 205 kB |
| Markless, local (`check`) | 147 kB (Brotli) | 155 | 62 kB |

## Markless 0.4.0 findings

Each is worked around in the app; the workaround is named.

1. `onVisible` never fires until a user interaction wakes the page: the inline resumer skips `visible`, and the
   visibility observer is installed only by the full runtime (the visible primer that fixes this is in v0.5.0,
   unpublished). Its handler also receives `undefined` instead of the element. `attach` behaviours wait for the
   same trigger. Workaround: the Rive canvases start from a plain module script (`page-scripts/page.ts`).
2. `<Html lang="...">` attributes are read only from `document.tsx`/`.jsx`, but the starter scaffolds
   `document.tsrx`, which the router renders with a hard-coded `<html lang="en">`; a `document.tsx` is ignored, a
   plain `<html>` in `document.tsrx` is nested inside the router's, and a hand-exported
   `__marklessRouterHtmlAttributes` is dropped by the tsrx compiler. Workaround: `server/html-attributes.ts`
   rewrites the opening tag.
3. Text inside `<script>` is HTML-escaped (`&&` becomes `&amp;&amp;`, `=>` becomes `=&gt;`), which breaks inline
   scripts. Workaround: the three head scripts are written without `&`, `<` or `>`.
4. Attribute values are not entity-decoded (`href="...&amp;v=4"` is sent with `&amp;`), and in text only `&amp;`
   is (`&copy;` renders literally). Workaround: raw characters.
5. `@` in markup text is a parse error (`npm create vite@latest`). Workaround: a string expression.
6. A component `<style>` block is compiled to `.output/public/assets/*.css` but never linked into the page.
   Workaround: `styles/home.css`, linked from the document.
7. `aria-expanded={String(open)}` renders once and never updates; `open ? 'true' : 'false'` updates.
8. Inside a nested `@for`, attributes that read the outer row (`class={tier.linkClass}`) are dropped from the
   output. Workaround: the classes are copied onto each inner row.
9. An `@if` arm cannot hold an attribute binding, a component, or an `src={importedUrl}`
   (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`), so content with any dynamic attribute cannot be added and removed.
   Workaround: the mobile menu stays in the DOM behind `hidden`, with only its two logo images in an `@if` arm,
   using the old app's public `/vite-dark.svg` and `/vite-light.svg`.
10. An element handle used with optional chaining in a handler (`root?.contains(...)`) is not lowered
    (`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`). Workaround: the handlers read `event.target`.
11. Props passed to a component whose handler captures them must be literals: an imported asset URL is
    "opaque" (`MARKLESS_CAPTURE_OPAQUE_PROP`), and so is an optional prop the parent leaves out; a destructuring
    default is rejected in markup (`MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`).
12. A fragment root cannot contain a `<style>`, and two sibling roots separated by `;` pass the parser but fail
    type stripping with an unrelated message.
13. Void elements are serialised with closing tags (`<meta ...></meta>`, `<img ...></img>`).
14. The router modulepreloads 179 chunks (155 after folding handlers, since every event handler is its own
    chunk) for this page, including a 346 kB chunk holding the render code of the
    whole page (static sections included), and the Nitro server sends public files uncompressed by default.
    Workaround: `compressPublicAssets` (346 kB becomes 22.5 kB with Brotli).

## markless-migrate findings

1. **`check` hung forever on this page** (fixed, `cb2a909`, with `test/settle.test.ts`). `settle()` waited for
   each unfinished image's `loadend` event, which `<img>` never fires, and the homepage has eleven lazy images
   still loading after the scroll to the bottom, one of them inside `display:none` so it never loads. Now it
   waits for `load` or `error`, scrolls each pending lazy image into view first, and gives each image at most
   five seconds. 160 unit tests pass.
2. `plan --source` does not recognise VitePress (`framework not recognised`), so every route is "only in the
   crawl" and failures carry no old-side source line.
3. `config --nitro` writes a snippet for `markless({ nitro: { routeRules } })` from `@markless/router/vite`, an
   option the published 0.4.0 router does not have (it exports `router()`, which takes no Nitro options). What
   works is a top-level `nitro.routeRules` in `vite.config.ts`, which Nitro's Vite plugin reads. It also lists only
   crawled paths and the assets the crawled pages load, not the old build's lazily loaded chunks or root files;
   `scripts/old-routes.mjs` adds those.
4. A check whose origin drops a connection mid-load waits forever (seen when another process restarted the
   server under it); there is no overall timeout.
5. The weight dimension compares bytes on the wire, so an old server that compresses and a new one that does not
   look 5x apart for the same code.
6. **Forced CSS states were sampled two frames after the change** (fixed, `fbd8778`, with
   `test/states-settle.test.ts`): work a state starts, such as a canvas refetching its animation when the width
   crosses a breakpoint, landed in some runs and not others, so old and new raced. States now wait for the page's
   requests to go quiet (150 ms, at most 3 s) before freezing animations and sampling. 163 unit tests pass.
7. `requestAnimationFrame` time is not frozen (documented), so canvas animations differ in forced-state
   screenshots whenever the two pages start them at different moments; the old runs agree with each other, so
   the noise mask does not cover it.
8. A hand-written `accepted.json` entry without `date` makes `check` crash with
   `Cannot read properties of undefined (reading 'replace')`, though the README says entries may be edited by hand.
9. `check` once reported `margin-inline: 0` on the footer's first `section` (old: 16px) in four runs in a row with
   the element at the same position (x 16, width 1248); it reproduced in about 1 load in 6 outside `check` and not
   at all in iteration 7. Unexplained; it coincided with the footer's lazy image finishing after first layout.
10. Journeys abort third-party requests, so the old page logs `TypeError: Failed to fetch` for its own sponsors and
    Iconify fetches; only differences the new page adds are reported, so this showed up as noise in the expected
    side of every navigation step rather than as a failure.
11. Several other agents ran migrations in this worktree at the same time; one served on port 4411, which my
    first baseline used, and its server restarts made that check hang (finding 4). Dedicated ports fixed it.

## Markless 0.5.0 (2026-10-17)

Rebuilt on the published 0.5.0 packages (`@markless/*` 0.5.0, `vite-plus` 0.3.1). The page-scripts build runs through `vp build -c page-scripts.config.ts`: the starters alias `vite` to `@voidzero-dev/vite-plus-core`, which has no `vite` binary.

### Workarounds removed

| Workaround (0.4.0 finding) | Now |
| --- | --- |
| 2: `server/html-attributes.ts` rewrote `<html lang="en">` in every response, and `document.tsrx` exported `__marklessRouterHtmlAttributes` by hand | `<Html lang="en-US" dir="ltr" data-variant="vite" data-theme="dark">`; the middleware and the hook are gone |
| 3: the three head scripts written without `&`, `<`, `>` or quotes (script text was escaped) | the scripts use their quotes again |
| 8: sponsor classes copied onto every inner row (a nested `@for` dropped attributes reading the outer row) | the inner rows read `tier.linkClass`, `tier.logoClass` and `tier.emptyClass` from the outer row |
| 13: void elements closed (`</meta>`, `</img>`) | 0.5.0 writes them without a closing tag (no workaround was needed in the app) |

Kept: the Rive canvases, search shortcuts and logo strip in `page-scripts/page.ts`, a plain module script (`onVisible`/`attach` still do not run at load; `onIdle` would start them later than VitePress does).

New: the homepage is the same for every visitor, so it is kept on Vercel's CDN for an hour (`isr: 3600`; the sponsors it renders come from a live file). The search box's code loads at idle, and the appearance and search choices are written to storage as VitePress writes them.

### Check (against the deployments)

`check --concurrency 1 --route /`, old https://vite-dev-old.vercel.app, new https://vite-dev-markless.vercel.app.

`/`: red on a11y, behaviour, network, weight and responsiveness; 71 of 76 interactions exercised. JavaScript on the wire 143.3 → 145.6 kB (0.4.0: 192 kB in 155 requests), run at load 205.2 → 67.7 kB.

Responsiveness (slowest each side): first interaction old 56 ms → new 67 ms at 4x CPU (desktop 60 → 49 ms); navigation old 351 ms → new 424 ms at 4x CPU (desktop 137 → 291 ms).

What keeps it red:

1. The five owner rulings from 0.4.0 (Iconify and sponsors fetched on the server, the FloatingVue error the old docs pages log, Rive frames in forced-state screenshots), still unruled.
2. Weight: 1.2 kB over the old page (149.1 kB against an allowance of 147.9 kB).
3. Opening search fetches its 145 kB index, as VitePress does; the check counts any code a Markless interaction fetches. Loading the index on hover was tried and dropped: the pointer rests over the nav when the page loads, so the index counted in the page's weight.
4. Links from the homepage into the docs: the new app proxies those routes to the old one, so following one is a page load where VitePress navigates in place (205-271 ms → 277-424 ms at 4x CPU).
5. The install tabs' radios could not be clicked on the old page within the step's 3 s, so their coverage needs a person's accept.

Routes switched: none (as before). The front door (https://markless-migrate-demo.vercel.app) serves the old site everywhere.

## Every route, and the network contract of the old page (2026-10-18)

The route coverage check (`check --only coverage`) found 35 of the old site's 115 routes missing on the new app:
the Markdown copies of the docs pages (`/guide/why.md` and so on). What changed:

- **Markdown copies and llms files.** `scripts/llms.mjs <vite-docs-dir>` loads the docs' own VitePress config and runs
  the site's own `vitepress-plugin-llms`, with its settings, over the same Markdown the pages come from, and writes
  the 42 `.md` copies plus `llms.txt` and `llms-full.txt` into `public/`. All 44 files are byte for byte the old
  build's. The root ones were proxied to the old app before; they are now the new app's own files
  (`old-routes.json` no longer lists them). Routes on the new app: 115 of 115.
- **Iconify and sponsors in the browser, as the old page does.** The server now sends the 18 icons the old page
  fills at runtime as the same empty 16x16 placeholders, and `page-scripts/icons.ts` fetches the same two
  `api.iconify.design` URLs and fills them as `@iconify/vue` does. The sponsor grid is no longer rendered on the
  server: `page-scripts/sponsor-tiers.ts` fetches `sponsors.vite.dev/sponsors.json` after load and inserts the grid
  where the old page does (a sponsor without a name gets no alt text, as Vue leaves a null attribute out).
- **Weight.** Moving the sponsor grid out of Markless also stopped the router from preloading the page's render data
  (it was there for the async list). JavaScript downloaded on Vercel: 146.8 kB old → 110.7 kB new (was 149.1 kB,
  against an allowance of 147.8 kB); run at load 210.1 kB → 71.7 kB. The allowance was not touched.
- **Console errors after a link into the docs.** The old docs pages log FloatingVue's patch error on every full
  load (vite.dev does too). The check now compares such an error against what that unswitched page logs on a plain
  load from the old app, so the old page's own error is not counted against the port (tool change, with a test).
- **Copy button.** Without clipboard access VitePress copies through a hidden textarea and gives focus back, which
  fades the copied icon in and the language label out; the port does the same now (the new motion check caught it).
- **Rive.** No change to the animation code was needed: with the render data gone the page starts the canvases at
  the same moment as the old one on Vercel (first frame about 450-550 ms after navigation on both), and `/`'s
  motion check is green. A forced-width screenshot still caught a different canvas frame in one of two runs.
- **Front door.** The stale `/islands/:path*` rewrite is gone from `deploy/vite-dev/front/vercel.json` (not
  redeployed; no route is switched, and `deploy.sh front` regenerates the new app's rewrites when one is).

### Check against the deployments

`plan --old https://vite-dev-old.vercel.app --source ~/dev/scratch/vite/docs`, then the full check of every route
and dimension against https://vite-dev-markless.vercel.app. The first run left 22 routes unchecked for network
timeouts (the machine was running several other checks); those and the 11 red ones were checked again.

Routes on the new app: **115 of 115**. Route checks green: **101 of 115**, 10 red, 4 not checked (connection
timeouts to Vercel in both runs).

| Dimension | Result |
| --- | --- |
| coverage, http, auth, rendered, seo, css, i18n, data, weight | green on every route checked |
| motion | green on every route where it ran, `/` included |
| visual | red on `/` in one of two runs (a forced 640 px width caught a different Rive canvas frame) and on `/acknowledgements` |
| responsiveness | red on `/`: opening search fetches its 145 kB index as code (VitePress loads its index on open too), the language button answers in 51 ms against 32 ms, and links into the docs are full page loads where VitePress navigates in place (319-386 ms against 264-284 ms at 4x CPU) |
| behaviour, a11y, network, assets, responsiveness on docs pages | red on 9 docs pages, a different set in each run. Those pages are the old app's own, forwarded by the new app; the differences are click timeouts under load and Iconify picking a fallback host at random |

Routes switched: none. The front door still serves the old site everywhere.

## Every docs page on Markless (2026-10-20)

The docs pages are no longer forwarded to the old app. `scripts/import-docs.ts <vite-docs-dir>` writes each one from the vite repo's
own Markdown through the docs' own VitePress pipeline. A rerun from a clean checkout reproduces every file it writes, including the
blog feed, which now uses the docs' commit time as its clock. Caching comes from `cache plan` and `cache apply`.

### What fixed what

| Fix | Came from |
| --- | --- |
| Assets keep VitePress's `name.hash.ext` URLs; `.html` links open their clean page in place; `.html` addresses move to the clean URL before the docs' redirect rules; sponsor grids mounted together each fetch `sponsors.json`; translation links carry the query and hash; the not-found page fetches `hashmap.json` | `run --agent claude` from the check's reports (commit "fixes written by markless-migrate run") |
| The feed is reproducible; every layout keeps VitePress's `<div id="app">` (Markless 0.7.0 marks `<body>` as the router's container) | the import step |
| Weight red on 28 docs pages (113 kB against 105 kB) | Markless 0.7.0: 0.5.0 preloaded the 30 kB resume runtime on static pages, plus a 3.6 kB resolver per visible link (repro below; fixed upstream) |
| `/` never finished checking | checker: holding a loop swallowed the checker's own frame waits (#12) |
| VitePress page chunks with `-` in the hash; label-drawn radios | checker (#2) |
| 0.7 fragment fetches counted as new requests; fragment URLs not cached | checker and cache (#13) |

The search experiments the agent tried were reverted: loading the index at idle, a JSON index, and replacing focus-trap and mark.js.
None of them made a route green, and focus-trap and mark.js are kept libraries.

### Check against the deployments

`check --all --concurrency 2`, old https://vite-dev-old.vercel.app, new https://vite-dev-markless.vercel.app (Markless 0.7.0):
**166 of 184 routes green**, 18 red. Weight is green everywhere: the docs pages download about 71 kB of JavaScript, against
102-117 kB on the old app. `cache check` finds no problems: 57 pages prerendered, 100% CDN hits on the second pass.

What keeps the 18 red:

1. **Links to another page's section lose the hash** (`/guide/` "Hot Module Replacement (HMR)" lands on `/guide/features`, not
   `#hot-module-replacement`; also on `/config/build-options`, `/blog/announcing-vite3`). This is a Markless 0.7.0 router bug: an in-place
   navigation goes to the URL of whichever link to that page was prefetched (here the sidebar's `/guide/features`), not the link that
   was clicked. Minimal repro in `~/dev/scratch/markless-repros/static-page-preloads` (`nav-repro.mjs`): from a page linking `/b` and
   `/b#second`, following `/b` ends at `/b#second`.
2. **`MARKLESS_EVENT_DISPATCH_UNMATCHED` on `focusout`** of the search box's input (built by a page script) when a link is followed
   with search open: 17 routes through the shared layout.
3. **Theme switch, then reload** (14 routes): on the old page the switch reads "Switch to light theme" after the reload; on the new
   page it does not change. Another worker owns the theme toggle.
4. **`/live` countdown**: the old page's 1 s timers tick during the "Close banner" step and the new page's do not. That is a live
   clock compared step by step: a checker nondeterminism, not a port difference.
5. **Search on `/`**: opening search fetches its index (VitePress does too); the checker requires that no code be fetched.
6. `/blog.rss` `lastBuildDate`: the deployed old feed carries the old build's time, the port the docs' commit time.
7. `/changes/hotupdate-hook` copy-button motion, `/blog/announcing-vite6` one computed style, and the not-found page's
   `hashmap.json` content (VitePress's hashes of its own chunks).

## Markless 0.8.0, and the follow-ups (2026-10-21)

The app is on Markless 0.8.0 from npm (core, router, analyzer, typescript-plugin; Node 24.15 here, 0.8.0 needs 22.18+).

### What fixed what

| Red before | Fix | Came from |
| --- | --- | --- |
| The 0.8.0 build: 25 docs pages failed to parse, and the header and document | TSRX now reads `//` and `/*` in template text as comments, so the importer writes the `/` that starts one as `&#47;` (pages regenerated by import-docs; a second clean rerun reproduces every file); a code block or `@if` arm renders one node, so the hand-ported header's and document's multi-node arms are wrapped in a fragment `<>...</>` | the import step, and the 0.8.0 language change |
| Links to another page's section lost the `#section` | none in the port: the router fix in 0.8.0 | Markless |
| `MARKLESS_EVENT_DISPATCH_UNMATCHED` on the search input's `focusout` (17 routes) | none in the port: fa58a8f8, in 0.8.0 | Markless |
| Theme switch, then reload (14 routes) | the switches keep the served `aria-checked` until the theme first changes, as VitePress's hydrated switch does (after a reload in dark both sites read "Switch to light theme" with `aria-checked="false"`). A port difference, not a Markless bug | `run --agent claude` |
| `/live` countdown during a step, and in the page's tree, text and screenshot | the checker compares a clock by being there, not by its reading (#17, #20), and now in the screenshot at each forced viewport width too | checker, with tests |
| Search fetching its index on open | allowed when the old app fetches code on the same interaction in every run and the new one fetches no more (#17) | checker, with a test |
| `/blog.rss` `lastBuildDate` | a feed's build date compares as a date (#17) | checker, with a test |
| Not-found page: `hashmap.json` fields "no longer shown" | the fields were only in VitePress's `<link rel="prefetch">` chunk URLs; a script's `src` and a resource hint's `href` load code and show nothing | checker, with a test |
| Page guard on `/live`: the default primary-button image not loaded | `<html>` is served without `data-variant`, which the first page script sets, as the theme's `enhanceApp` does; the appearance is written once at load, as `useColorMode`'s immediate watch does; Iconify falls back to its two other hosts after 750 ms, as `@iconify/vue` does | `run --agent claude` |
| `/live` weight on Vercel: 111.3 kB against an allowance of 109.9 kB | `home.js` (the homepage's Rive code, 36.7 kB) is preloaded on `/` only: now 74.6 kB against the old 108.9 kB | `run --agent claude` against the deployment |

### Check against the deployments

`check --all --concurrency 2 --timeout 1800`, old https://vite-dev-old.vercel.app, new https://vite-dev-markless.vercel.app
(Markless 0.8.0): **177 of 184 routes green**, 6 red, 1 not checked (`/blog`: the old app timed out twice). The
timeout was raised from 600 s because the machine was shared with other agents' builds and checks (load average 15-25):
in the three runs before at 600 s, `/` never finished, and every page sharing its header stayed red as "not exercised".

What keeps the 6 red:

1. **`/`**, as before: the logo strip's and hero's computed styles, a forced-width screenshot near the Rive canvas, the
   banner button's hover fade, the Rive frames, and opening search at 4x CPU (101 ms against 56 ms: it now fetches its
   box and index on open as VitePress does, so only the time is red).
2. **Copy buttons** (`/blog/announcing-vite3`, `/config/build-options`; other pages in other runs): "old does not
   animate" on one run, "new does not animate" on another, on a different button each time. Both run VitePress's
   `useCopyCode`: clipboard access is denied, the copy goes through a hidden textarea, and a 2 s timer clears "Copied"
   and blurs the button. Under this load the checker's observation can land on either side of that timer: a checker
   nondeterminism, not fixed here.
3. **`/acknowledgements`**: three forced-width screenshots where the new page's sponsor grids are one column. The run
   agent saw the new page's window report 1x1 px for a moment while the checker took its three screenshots at once,
   and the grids' resize code (VitePress's, unchanged) read it. I could not reproduce a 1x1 resize with plain
   Playwright; the route was green on its own rerun.
4. **`/changes/`** ("Close banner" click timed out) and **`/guide/api-environment`** (first copy click 72 ms against 48 ms):
   load: neither failed on its own in the three runs before.

Routes switched: none (the run agent's `switch /live` was undone; switching is the owner's call).

## Page load against vite.dev (2026-10-21)

PageSpeed Insights (mobile, one run each) scored the port 69 (FCP 2.6 s, LCP 7.8 s) against vite.dev's 77 (FCP 2.4 s, LCP 5.1 s).
`check` had no page-load dimension; it has one now (`load`, Lighthouse mobile, median of runs, red only beyond the noise between them).

What Lighthouse measured (`npx lighthouse@12 --form-factor=mobile --only-categories=performance`, Chrome 155, runs interleaved, medians):

| | Performance | FCP | LCP | Speed Index | LCP breakdown (TTFB, render delay) |
| --- | --- | --- | --- | --- | --- |
| port before (5 runs) | 72 | 1.69 s | 4.61 s | 2.48 s | 632 ms, 3975 ms |
| port after (11 runs) | 92 | 1.70 s | 3.27 s | 2.40 s | 648 ms, 2625 ms |
| vite.dev (11 runs) | 78 | 1.74 s | 5.68 s | 2.16 s | 1534 ms, 4143 ms |
| vite-dev-old (11 runs) | 80 | 1.83 s | 5.11 s | 2.14 s | 614 ms, 4500 ms |

The LCP element is the hero heading on all three: text, so the load delay and load time are zero and the time is render delay.
Lighthouse simulates a slow phone from one fast load: its LCP is as late as the slowest request that began before the heading
painted. Rive's wasm and `.riv` files started before it, and a Rive task (the `.riv` decoding its embedded image) held the load
event back and ended in a layout, which the Speed Index estimate counts at its simulated end, after those downloads.

| Red before | Fix | Came from |
| --- | --- | --- |
| `load` FCP and Speed Index against vite.dev | the homepage's Rive canvases start in a task of their own once the page has loaded | `run --agent claude --only load` against the deployment |
| The router's landing modulepreloads at High priority, which Lighthouse counts as render-blocking for FCP | `fetchpriority="low"` (Markless #66, merged; reaches the port with the next Markless release) | Markless |

Still open: the HTML is 21.7 kB compressed against vite.dev's 10.1 kB, over the 14.6 kB that fits in the first round trip
of Lighthouse's simulated connection (one 150 ms round trip on FCP); 3 kB of it is the import map of every chunk on the site.
The heading's font (APK Protocol, no `font-display`) is fetched only after the stylesheet is parsed, on vite.dev as here, so
the heading shows a frame after the first paint; preloading it moved LCP from 4.24 s to 2.24 s on a local copy.

## Embeds: the Vite 6 keynote video as a Markless component (2026-10-22)

`run --agent claude` on `/blog/announcing-vite6` turned the theme's YouTube frame into `components/embeds/youtube-embed.tsrx`
(poster and channel picture from YouTube's own addresses, the title and channel from oEmbed, Roboto served by the app),
placed by the docs importer for every `full-width-youtube-video` frame; a click or Enter loads the same frame, playing.
It was promoted to markless-migrate's `youtube` adapter. The embed step against https://vite-dev-old.vercel.app (live):
the same at desktop in light and dark and at mobile in dark; at mobile in light 22 pixels of 66,000 differ (12 at the
rounded corners, where the old page clips a frame and the component a box, and 10 inside the poster), over the
checker's limit of 20, so that row is red; locally the agent measured 9. Activation is the same by a click and by
Enter at both viewports (the video plays). PageSpeed Insights (mobile, median of 5), this port without and with the
change: 3,103 -> 2,314 kB, 69 -> 60 requests, FCP 7.86 -> 2.25 s, LCP 18.2 -> 10.5 s, TBT 229 -> 0 ms, score 52 -> 68
(the page's other weight, its Rive canvases and images, is unchanged). https://mm-embeds-evidence.vercel.app.

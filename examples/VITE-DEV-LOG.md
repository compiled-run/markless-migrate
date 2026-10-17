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
- Load-time JavaScript in `islands/page.ts`, a plain module script bundled by `islands.config.ts`: the three Rive
  animations, the search shortcuts (`/`, Ctrl/Cmd+K) and the search buttons, which load `islands/search.ts` on first
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
   same trigger. Workaround: the Rive canvases start from a plain module script (`islands/page.ts`).
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

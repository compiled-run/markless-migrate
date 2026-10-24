# Migration log: alpinejs.dev to Markless, from the URL alone

Claude Code (Opus 5.5, the owner's subscription) moved three pages of https://alpinejs.dev to Markless (published
0.4.0 packages) using only the live site: no access to its repository. `markless-migrate` planned, checked and
switched; the port is `examples/alpinejs-dev-markless`. Started 18:53, all three routes green 22:30 (CDT,
2026-10-16), worked in parallel with the htmx.org migration (`examples/htmx-org-LOG.md`).

## Deployed

| What | URL |
| --- | --- |
| Front door (switched routes from Markless, every other path from the real alpinejs.dev) | https://mm-alpinejs-dev.vercel.app |
| Report and index | https://mm-alpinejs-dev.vercel.app/_migrate/ , https://mm-alpinejs-dev.vercel.app/_migrate/report.html |
| The Markless app alone | https://mm-alpinejs-dev-new.vercel.app |

`deploy/alpinejs-dev/deploy.sh new|front` rebuilds and redeploys each (the front door's `vercel.json` is what
`markless-migrate config --vercel` writes; it must be rerun after every new-app deploy, because the old site also
uses `/build/`, so each Markless chunk gets its own rewrite).

## Routes

| Route | Result | Interactive parts ported (no Alpine on the page) |
| --- | --- | --- |
| `/` | green, 3 accepted (+ attribution) | the Attributes / Properties / Methods tabs with their slide-in, the search button |
| `/start-here` | green, 4 accepted (+ attribution) | counter, dropdown with click-outside, filtered search list, mobile menu, contents highlighter |
| `/directives/model` | green, 3 accepted (+ attribution) | all 14 `x-model` demos (text, textarea, checkbox, checkbox array, radio, the four selects, range, `.blur.enter`, programmatic set), mobile menu, contents highlighter |

Each Alpine `x-data` block became a component with its own `state()`. The mobile menu keeps Alpine's behaviour:
slide in and out, focus moves in and returns, Tab stays inside, Escape and a click outside close it, the rest of the
page is hidden from assistive tech and stops scrolling. DocSearch (Algolia, the site's own search widget) stays.

### Accepted differences (by the converting agent, for owner review)

- **Livewire's script** (`/livewire/livewire.js`): every old page loads it, no page uses it; the port has no Livewire.
- **Cloudflare's email decoder** (`/cdn-cgi/.../email-decode.min.js`, `/start-here`): Cloudflare had mangled
  `alpinejs@3.x.x` in a code sample into an "[email protected]" link; the port writes the decoded text. Chrome
  shapes a few glyphs at the edge of the decoder's separate text node differently, which static HTML cannot
  reproduce: a few pixels, accepted with it.
- **The stylesheet's host**: the old pages name `https://alpinejs.dev/build/assets/app.9ea156ae.css` by absolute
  URL; checked through the local mirror that reads as another origin. Same file, same path in the port.
- **JavaScript downloaded** (weight, as this check measures it, uncompressed): Markless modulepreloads every page's
  template as render data (630 kB on `/directives/model`). Compressed as served the routes come out at 117 to 161 kB
  against Alpine's 145 kB (table below); JavaScript run at load drops from 76 to 84 kB to 18 kB on every route.
- **Licence attribution** (intended): a fixed badge on every page, "Unofficial demo copy ... Alpine.js and its
  documentation © Caleb Porzio and contributors, MIT license". Its accepts are bounded to its own text, links,
  tab stops and box.
- **Carbon ads** were removed by blocking the ad network in the checker (a tool fix), not by accepting.

## Weight (JavaScript)

| Route | Transferred, compressed: alpinejs.dev -> front door | Run at load (check, uncompressed) |
| --- | --- | --- |
| `/` | 144.6 kB -> 117.4 kB | 76.6 kB -> 17.7 kB |
| `/start-here` | 145.9 kB -> 145.2 kB | 83.9 kB -> 17.8 kB |
| `/directives/model` | 144.5 kB -> 160.8 kB | 84.0 kB -> 17.7 kB |

Transferred bytes are one load of each page as served (`deploy/htmx-org/weigh.mjs`). The check's own "on the wire"
column is not comparable here: the mirror and the local server send uncompressed, the CDNs compressed. Uncompressed,
the Markless pages download 331 to 841 kB, nearly all of it preloaded render data that never runs at load.
`/directives/model` loads 124 script files against Alpine's 13.

## Iterations

| Step | What the check said | What changed |
| --- | --- | --- |
| 1 | tool crash: invalid regular expression | fixed the noise pattern builder (tool bug 1) |
| 2 | 430 lines: shifted css pairs everywhere, `x- data` text, 930 kB JS | wrapper pairing (tool bug 2), exact whitespace in the drafting script |
| 3 | demos dead in old journeys, hamburger "visible" at desktop | journeys load CDN assets (tool bug 3), then fetch them once (tool bug 4) |
| 4 | select placeholder not selected, DocSearch button missing | `selected`, DocSearch kept |
| 5 | `Resume locator ... found <button>` | DocSearch renders off-tree; Markless owns the button |
| 6 | Carbon ad content | ad hosts blocked (tool bug 5) |
| 7 | toggle dropdown first click lost, list first keystroke lost | `''` instead of `undefined`; wake on focus |
| 8 | homepage: `@for` tabs empty, `<br></br>` doubled, css pairs in `body/div` | assembly fix, Nitro plugin for `</br>`, geometry pairing (tool bug 6), `url()` origins (tool bug 7) |
| 9 | attribution badge diffs | layout-neutral badge, bounded accepts |

## The deployed copy

The final checks ran locally (old: the mirror; new: the local build). The same check against the deployed Markless
app passed everything but DocSearch: the "Search by Algolia" link carries the page's hostname (`utm_source=127.0.0.1`
for the mirror, the Vercel host for the deployed app). Through the front door both sides share one host, so that is
the environment, not the port.

## URL-only: what the tool could and could not tell

- Every failure's old side read "(source not found)": with no source, `where` lines name only the `.tsrx` file.
  The new side was always right; the old side had to be found by eye in the cached HTML.
- `plan` found the routes (sitemap) but not what is interactive: Alpine directives are in the HTML, so the
  drafting script (`deploy/htmx-org/to-tsrx.ts`, server HTML with scripts off) dropped `x-`/`@`/`:` attributes and
  the demos' live state was recorded with Playwright (`deploy/alpinejs-dev/demo-state.mjs`). Several behaviours were
  guesses checked against the live page: Alpine leaving a select's model `''` while the browser shows "Red"; the
  contents highlighter's rule (read from the inline script the page serves); `.space-y-3` margins from the leftover
  `<template>`.
- The journeys were the real oracle: once they loaded the page's own CDN scripts they recorded what Alpine did, and
  every behaviour bug above was caught by them.
- What could not be known: the site's server routes (only what the sitemap and links show), whether `/components`
  is a page or a redirect (it answered 200; unknown paths answer 302), and what Livewire was meant for.
- Production politeness needed a read-only caching mirror (`deploy/htmx-org/mirror.ts`): 213 requests reached
  alpinejs.dev while the checks were served 17,304.

## Markless limitations met (0.4.0)

1. Two sibling elements at a component body's top level need `;` between them; the parse error does not say so.
2. A component with two root elements fails with an internal `MARKLESS_TYPE_STRIP_FAILED`; a fragment root holds only
   static HTML, so every page needs a wrapper (`display: contents`), and the router adds `<div data-async-container>`.
3. `attach` cannot write state, and its error message blames reads nested under calls. It runs only after the page
   wakes; `onVisible` never wakes it. Workaround: attach re-dispatches window events as a DOM event a handler turns
   into state.
4. An imported function used inside `attach` is "not defined" at runtime; a module-level wrapper works.
5. `onClick={moduleFunction}` silently does nothing; `onClick={() => moduleFunction()}` works.
6. Handlers cannot call component-local functions that write state; object-literal props are rejected.
7. `import type` from a `.tsrx` or `.ts` file inside a page is emitted as a value import (MISSING_EXPORT).
8. `event.currentTarget` is null in handlers (deferred); use `event.target`.
9. TSRX text collapses whitespace runs, drops whitespace-only text, and every `{"..."}` text costs about four copies
   of the string in client render data.
10. Every page ships its whole template as preloaded render data, even a page with no state.
11. A third-party script that inserts or swaps elements before resume (DocSearch) breaks resume
    (`Resume locator ... expected <a> ... found <button>`): resume finds elements by DOM position.
12. The first change of an attribute to `undefined` after resume is dropped (the element keeps `display: none`).
13. A keyed `@for` drops its first update after resume unless the page woke earlier; a row's class bound to
    component state never updates; a handler in a row loses its row item after resume.
14. SSR writes `</br>`, which every browser reads as a second `<br>`: an extra line break and broken resume.
15. The first DOM commit after a handler lands later than a microtask and a macrotask, so `focus()` after showing an
    element needs another signal (here, the slide-in animation's start).
16. A string literal inside `<script>` is HTML-escaped (quotes, ampersands).

## markless-migrate bugs found (fixed with tests unless noted)

1. Noise patterns put an unescaped `-` in a character class, aborting the whole check (c5d77d0).
2. Nameless, textless elements were paired by order across the page, so one wrapper div shifted every css pair
   (c5d77d0); then within a landmark path too (7e04fd5: pairs by box first).
3. Journeys aborted every other-origin request, including the old page's own framework and stylesheet from a CDN,
   recording alpinejs.dev unstyled and dead (c5d77d0).
4. With that fixed, journeys burst CDNs with hundreds of simultaneous requests and hung; other-origin assets are now
   fetched once per run, in a request context of their own (c5d77d0).
5. `plan` loaded ads and analytics while crawling: it fired Fathom pageviews and Carbon and DoubleClick impressions on
   alpinejs.dev (c5d77d0); Carbon, BuySellAds and Cloudflare Web Analytics joined the block list.
6. Computed `url()` values kept the app's origin, so the same file at the same path differed (7e04fd5).
7. `config --vercel` treated a redirect (alpinejs.dev's answer to every unknown path) as "served", so the front door
   sent the Markless chunks to alpinejs.dev (abf01ca).
8. Fixed later: a plain `403 Forbidden` from Vercel's own protection (it blocked my address from the deployed htmx app
   after a check's journey bursts) was not recognised as a wall, so the route reported failures instead of "blocked"
   (7a121ee); `check` reported "fetch failed" without naming the unreachable origin (85ffbe5). Not fixed: `plan --limit` takes routes in
   sitemap order, not by distance from `/` (on htmx.org a limit of 40 stopped inside `/attributes/` and never reached
   `/docs/` or `/examples/`); there is no way to treat an old
   page's absolute production URLs as its own origin when checking a mirror or staging copy.

## Markless 0.5.0 (2026-10-17)

Rebuilt on the published 0.5.0 packages (`@markless/*` 0.5.0, `vite-plus` 0.3.1).

### Workarounds removed

| Workaround (0.4.0 bug) | Now |
| --- | --- |
| `plugins/void-end-tags.ts` (deleted `</br>` from every response) | removed: void elements have no closing tag |
| `attach` relaying outside clicks as a custom `outside` event that a handler turned into state (dropdown demo, mobile menu) | the `attach` listener writes `open` / `leaving` itself |
| the contents highlighter started from `attach` plus empty wheel/touch/keydown handlers to wake the page (`attach` ran only after a wake) | `onIdle={(event) => watchHeadings(event.target)}`; the module-level wrappers and `wake()` are gone; the highlighter stops when a client-side navigation replaces its page |
| the search demo's empty `onFocus` wake (the first keystroke was lost) | removed; the first keystroke filters the list |

0.5.0 also refused a pattern 0.4.0 accepted: a keyed `@for` over a module constant whose rows read a prop (`MARKLESS_REPEAT_ROWS_FROZEN`), so the nav list now builds its rows (with their active classes) from the `pathname` prop in the component body.

Client-side navigation: `/start-here` and `/directives/model` link to each other and to `/`; those links swap in place. The three pages are kept on Vercel's CDN (`isr: true`).

### Check (against the deployment)

`check --route / --route /start-here --route /directives/model`, old = the read-only mirror of https://alpinejs.dev, new = https://mm-alpinejs-dev-new.vercel.app.

| Route | Result | Interactions exercised | JS on the wire (uncompressed) | JS run at load |
| --- | --- | --- | --- | --- |
| `/` | red: behaviour, a11y | 14 of 14 | 262.9 → 159.0 kB | 78.0 → 23.9 kB |
| `/start-here` | red: behaviour, a11y, responsiveness | 66 of 107 | 264.2 → 195.8 kB | 87.5 → 36.4 kB |
| `/directives/model` | red: behaviour, a11y, responsiveness | 103 of 134 | 262.9 → 195.8 kB | 86.0 → 36.5 kB |

Responsiveness (slowest each side): first interaction old 155 ms → new 122 ms at 4x CPU (desktop 72 → 58 ms); navigation old 149 ms → new 157 ms at 4x CPU (desktop 167 → 143 ms).

What keeps the routes red:

1. `alpinejs_session`: alpinejs.dev's Laravel server sets this HttpOnly cookie on every page; the port sets none. Every link step that lands on an unported page through the front door picks it up there, so it shows as an added cookie. Needs an owner decision.
2. Responsiveness on the demos: the first use of a checkbox, radio or the counter costs 82 to 87 ms at 4x CPU against Alpine's 32 to 40 ms (the second use is 19 to 34 ms). No code is fetched; the cost is Markless starting the handler the first time (see the findings).
3. Coverage: controls the journeys could not use on the old page, or did not reach in the budget, keep the route red until a person accepts them.
4. The tab buttons on `/` lose focus to the body after a click (old: focus stays on the button).

Routes switched: none. Front door: every path goes to alpinejs.dev.

## Every route (2026-10-18)

Until now the port served 3 of the old site's routes. It now serves all of them, built by rule from where each page's content
comes from, with no page written by hand.

### Routes: old against new

`plan` against the read-only mirror of https://alpinejs.dev found 94 routes. The sitemap lists 75; the link crawl adds the
other pages. On top of those, the site answers the six docs section URLs (`/directives` and so on), which no link points to.

| Kind | Old | New |
| --- | --- | --- |
| Docs pages (`/start-here` … `/advanced/async`, including the 4 plugin pages missing from the sitemap) | 50 | 50 |
| Docs section pages (`/directives`, `/essentials`, …: an empty docs column) | 6 | 6 |
| Component pages (`/component/<slug>`) | 21 | 21 |
| `/components`, `/license`, `/login`, `/forgot-password`, `/` | 5 | 5 |
| Redirects: `/installation`, `/plugin/focus`, `/plugin/collapse`, `/magics/next-tick`, `/directives/bind.md`, and every unknown path (302 to `http://alpinejs.dev/essentials/installation`) | yes | yes |
| `/component/headless-*` (9 paid pages, 302 to `http://alpinejs.dev/components`); unknown `/component/*` and `/cdn-cgi/*` (404) | yes | yes |
| `/login/github` (302 to GitHub sign-in for the site's OAuth app) | yes | yes |
| `/sitemap.xml` (the old file, served as `text/xml`), `/robots.txt`, the images the pages use (`/img/...`) | yes | yes |

`deploy/alpinejs-dev/verify-routes.mjs` asks both sites for every route `plan` found, plus the section pages, a trailing-slash
form and two unknown paths. It compares the status class, the redirect target, `<title>`, and every `<h1>`. Against the
deployment: **103 of 103 match, 0 misses** (`.port/verify-routes-deployed.txt`). `check`'s coverage dimension agrees: 91 of
92 routes present. The other one, `/login/github`, is accepted because its GitHub `state` parameter is random on both sides.

### How the pages are made

`npm run build` (and `npm run dev`) first runs `node importer/run.ts`. That script writes `pages/`, `demos/` and `generated/`.
The output is committed because the router's file scan skips gitignored files.

- **Docs** (`importer/docs.ts`, `markdown.ts`, `docs-page.ts`):
  - **Source**: the Alpine repository's own docs. `content/docs/` is `packages/docs/src/en` at tag v3.17.4, the version the live site shows; see `content/source.json`.
  - **Order**: front matter gives the sidebar, the section prefixes (`x-`, `$`, `Alpine.`), the previous/next links, and each page's `<title>`, description and social image.
  - **Markdown**: markdown-it, with the site's rules applied on top:
    - `<a name>` before a heading becomes the heading's id and a link.
    - Every other h2–h4 gets the id the contents script would give it.
    - Alpine attributes outside an example are dropped.
  - **Code highlighting**: Shiki with github-light writes Torchlight's markup: one `div.line` per line, one span per colour run, `&nbsp;` on blank lines, and the hidden copy target.
    - Two small TextMate grammars (`importer/grammars.ts`) reproduce Torchlight's "alpine" language: attribute values as JavaScript, attribute names split at `:` and `.`, and built-ins shown as support names.
    - Measured against the 376 code blocks on the old pages: 375 have identical colour runs. The one that differs is `x-intersect:leave.margin.10%.25px…`, where the `%` is coloured differently.
- **Live examples** (`importer/alpine.ts`, `importer/expression.ts`):
  - **What counts**: every `START_VERBATIM` block, and every raw HTML block with its own `x-data`, such as the plugin pages' collapsible installation notes. That is 90 blocks: 88 become components, and 2 have no Alpine in them and stay static markup.
  - **Data**: each example becomes a Markless component by rule. `x-data` properties become `state()`, getters become `computed()`, and nested scopes get unique names.
  - **Expressions**: rewritten with acorn. Data names become those variables, `this.x` inside getters too. `$refs`, `$el` and `$root` become element handles. `$dispatch`, `$data`, `$focus` and `$refs.x._x_model` get their own rewrites.
  - **Rendering**: `x-text`, `:class`, `:style`, `:attr`, `x-for` and `x-if` are Markless bindings and constructs. `<template>` elements stay in the page, as Alpine leaves them.
  - **Teleports**: `x-teleport` is resolved at build time.
  - **Morph**: `Alpine.morph` to a template that only adds elements becomes those elements behind a flag.
  - **Behaviours**: `components/alpine/*.ts` is a port of Alpine's own DOM code (MIT), driven after every write the expression reads:
    - `x-show`, `x-transition` (helper and class forms) and Collapse, with the same rAF/timeout stages and inline styles, so the motion is Alpine's.
    - The x-on modifiers and key filters.
    - x-model reads and writes.
    - Focus (`x-trap`, `$focus`), on the same focus-trap and tabbable libraries.
    - Anchor (Floating UI), Sort (SortableJS), Mask, Intersect, Resize and Persist.
  - **Setup timing**: listeners and plugins start on the first pointer, focus or touch inside the example, not at idle, so nothing runs at load. Only `x-resize` and `$persist` start at idle, because they report at load. `.prevent` and `.stop` are plain statements, so Markless applies them before the handler's code arrives.
  - **Check**: `deploy/alpinejs-dev/compare-demos.mjs` drives every control of every example on both sites. Once the dev server was warm it found 0 DOM differences on all 26 pages with examples. Against the local production build, after the fixes below, the only difference left was the Intersect example caught partway through its 1 s fade.
- **Component pages, `/components`, `/license`, `/login`, `/forgot-password`** (`importer/capture-server-pages.ts`, `importer/server-pages.ts`):
  - **Source**: these Laravel/Livewire views are closed source, so their only content source is the server's HTML. The capture keeps only what the port publishes, in `content/server-pages/`, and drops Livewire, CSRF tokens and Alpine attributes.
  - **Templates**: one rule per template.
  - **Sign-in dialog**: a port of Alpine's transitions, focus trap and register toggle.
  - **Left out on purpose**: the paid Alpine UI demos and their scripts. Their markup says "Copying this code is against the product license". Each demo area keeps its frame and links to the demo on alpinejs.dev.
  - **Forms**: they cannot post, because there is no backend.
- **Home**: still the hand port. It is a single page with its own template, and its panels now run Alpine's own class transitions (`components/home-steps.ts`).
- **Server rules** (`middleware/request.ts`, generated from the route list): the old server's redirects, 404s, the GitHub redirect and the sitemap.

### Check

Against the deployment: `check --old <mirror> --new https://mm-alpinejs-dev-new.vercel.app`, every route, with the coverage and
motion dimensions (`.port/check-all-routes-deployed.txt`).

- **Routes**: 91 of 92 present on the new app; 1 accepted (`/login/github`, whose GitHub `state` parameter is random on both sides). 45 of 92 routes green.
- **Responsiveness (slowest)**: first interaction old 210 ms → new 91 ms at 4x CPU. Navigation old 264 ms → new 167 ms.
- **Not checked**: 5 routes could not be measured, because Vercel stopped answering this machine (`UND_ERR_CONNECT_TIMEOUT`) partway through the run.

Against the local production build of the same commit (`--concurrency 2`, `.port/check-all-routes-local.txt`), every route
was measured:

- **Routes**: 91 of 92 present, 1 accepted. **47 of 92 routes green**; 21 of the 45 red routes are component pages.
- **Responsiveness (slowest)**: first interaction old 239 ms → new 152 ms at 4x CPU. Navigation old 1155 ms → new 709 ms.
- **`/login/github`**: its two http differences are the same random GitHub `state` parameter. They were accepted after this run started.

What keeps routes red, and why:

1. **The component pages (21)**: the visible text, accessibility tree, tab order and styles of the demo area differ, because the paid demos are left out (see above). The network and image differences from the same cause are accepted. These are not accepted, because they also cover the rest of each page and need a person's eye.
2. **Contents highlighter on some docs pages**: after the check scrolls, the old page highlights one heading and the new page the next one, or none. The code is Alpine's `visibleNavHighlighter` with its 50 ms throttle, ported line for line, and both pages lay out identically (measured). So which scroll event wins depends on timing. I have not found the cause.
3. **First-use cost**:
   - On the Focus, `x-on` and `$data` pages, the first click costs 87 to 150 ms at 4x CPU, against Alpine's 40 to 61 ms: Markless loads the handler's code on first use.
   - The same delay leaves a hover or focus colour fading on the Search, Purchase Access and Get Access buttons under reduced motion.
   - It also lets the focus trap's 15 ms activation land while the check is typing (Focus page).
4. **Sign-in form**: Livewire disables the submit button while it posts, so its opacity fades to 0.25. The port has no backend, so there is no request and no fade.
5. **`/plugins/persist` and `/plugins/resize`**: JavaScript run at load (454 and 264 kB, against about 86 kB). Both examples must report at load, so they start at idle, and idle runs the page's whole chunk. Markless `storage()` would avoid that, but in the 0.5.0 production build it throws "Unsupported markless/state protocol version 2" when it resumes.
6. **Sidebar links the check cannot click**: on 10 docs routes, the sidebar's "Dropdown" and "Modal" links count as not exercised. On the old page they sit under a gradient overlay, so the check cannot click them there either.
7. **Small differences**:
   - Glyph pixels on `/` (0.25 %) and in code text on `/upgrade-guide` and `/plugins/focus` (0.02 to 0.06 %).
   - YouTube player requests on `/upgrade-guide`.
   - Routes not compared because Vercel or the mirror timed out under this machine's load (other migrations were running checks at the same time).

### Tool fixes (markless-migrate, with tests)

1. `check` crashed on the whole run when a route redirected to GitHub. GitHub's Content-Security-Policy blocks the inline script that injects axe. Axe now runs by evaluation (`test/a11y-csp.test.ts`).
2. Coverage counted the old site's own catch-all target (`/essentials/installation`, where every unknown path is sent) as missing on the new app, because the new app answers unknown paths with the same page (`test/coverage-fallback.test.ts`).
3. A route the old app redirects to another origin (through the mirror, alpinejs.dev's own absolute redirects) was checked as a page and could become a template group's representative. It was then "not compared", which left its layout's controls unexercised on 10 routes. Such a redirect is now compared by its status and redirect chain. A same-origin redirect, such as a login guard or a locale, still checks the page it shows (`test/redirect-routes.test.ts`; the auth and accept-language e2e mutations caught a first version that reclassified every redirect).

### Markless limitations met (0.5.0)

1. Imported functions used inside `attach` are still not carried into the browser module. Handlers (`onIdle` and others) carry them.
2. A text binding must be a plain read or a `computed()`; a function call in markup is refused.
3. `@if` arms cannot hold text bindings, and text with `'` inside an `@if` arm fails to parse (`Expected '</'`).
4. Element handles are read-only: `$el.textContent = …` needs a helper.
5. `.prevent` and `.stop` only work as `event.preventDefault()` statements the compiler can lift out, with no TypeScript casts in the guard.
6. A `computed()` over another computed through `as unknown` came back undefined after resume. A keyed `@for` over an object-mapped list appended its rows instead of reconciling them; iterating the list itself works.
7. `storage()` fails to resume in the production build (above).
8. The router wraps every page in a block `div[data-async-container]`. `display: contents` on it (`public/port/site.css`) lets the page lay out under `<body>` as before.
9. Static HTML still ships as render data. Docs pages download 400 kB to 1.1 MB uncompressed; the Torchlight markup is most of it.

## Markless 0.9.0 (2026-10-22)

The app is on Markless 0.9.0 from npm (core, router, analyzer, typescript-plugin), from 0.5.0. It builds on 0.9.0 as
it is: the importer reran and wrote the same pages, and no other file changed. The build guard is green: no page loads or runs Alpine or any other framework's
runtime (505 script and HTML files in `.output`).

### Check against the deployments, before and after

`check` on the ecosystem suite's sample (`/directives/model`, `/start-here`, `/components`, `/plugins/persist`,
`/essentials/templating`), `--concurrency 2 --timeout 1800 --no-psi`, old https://alpinejs.dev, new
https://mm-alpinejs-dev-new.vercel.app on 0.5.0, then on 0.9.0 once deployed:

| | 0.5.0 | 0.9.0 |
| --- | --- | --- |
| Routes green | 0 of 5 | 0 of 5 |
| Failures, not counting "not exercised" | 329 (48, 63, 112, 61, 45) | 262 (41, 58, 64, 62, 37) |
| "Not exercised" | 12 | 18 |

Gone on 0.9.0: the first-use responsiveness rows at 4x CPU on `/directives/model`, `/start-here` and
`/essentials/templating` (checkboxes, radios, the Expand and Toggle buttons), the SVG computed styles on
`/components`, JavaScript run at load on `/plugins/persist`, and two layout or screenshot rows of in-place navigation.
New: the sidebar's active-link styles on `/plugins/persist` ("Installation" and "Via CDN"), a `:disabled` screenshot
on `/components`, the pricing dialog's close on `/components` (the page tree around the dialog differs after it
closes), and `/essentials/templating`'s lab LCP (2.02 s, 455 ms over the old page).

## The disclosure note, and the deploy from main (2026-10-23)

The fixed note at the bottom right now reads "Unofficial demo copy of alpinejs.dev. Alpine.js and its documentation ©
Caleb Porzio and contributors, MIT license." The tool's name and links are gone (owner decision). Its accepted
differences in `.migrate/accepted.json` were re-recorded against the new text, including its link's address as the
checker now writes it (`OLD`), and checked: on `/start-here` against alpinejs.dev every row from the note is accepted
and nothing else is. Deployed from main (`31867c4`, with the DocSearch-on-intent and Ctrl+K changes of #64) at
https://mm-alpinejs-dev-new.vercel.app. A person's pass against alpinejs.dev before the deploy, on the local build:
47 of the 71 demos on 25 routes respond as the original does and the other 24 have nothing to use; search, the sidebar,
the mobile menu and the tap demos behave the same.

## DocSearch from markless-migrate's shared part (2026-10-24)

The search button's loading on intent, the press kept while DocSearch loads and the platform key (Ctrl+K off Apple
platforms) now come from markless-migrate's docsearch part (`parts/docsearch.ts`, #74 and #93), which the importer
copies to `generated/docsearch.ts`; the port's own copy of that code in `page-scripts.ts` is gone, and the button
carries its config (`data-mm-docsearch`). Checked against alpinejs.dev on the local build, as macOS and as Windows:
the same label and keys (⌘ K, and Ctrl K with "Search (Ctrl+K)"), the dialog opens from the first click and finds the
same results for "model". `guard build` lists DocSearch 3 as loaded from jsDelivr on the first intent, with its own
UI runtime (Preact), as alpinejs.dev itself loads it (at page load there). TODO after launch: the part moves onto the
Markless-built DocSearch 4 dialog of the Docusaurus port, so no port loads DocSearch's own UI runtime.

## The search dialog on a press made before DocSearch arrives (2026-10-24)

On a slow phone the port shows its search button about 1.2 s before DocSearch's script arrives (alpinejs.dev shows it
only once DocSearch has loaded), so a press there waited for the download. The docsearch part now shows DocSearch's
dialog as alpinejs.dev first draws it (overlay, focused input, "No recent searches"; captured from the original by
markless-migrate's `captureDocSearchShell` into `content/docsearch-shell.html`) on such a press; the visitor types into
it, and when DocSearch arrives it draws its own dialog in the same place and the query, caret and focus move to it.
Measured with the showcase's click.mjs (4x CPU, slow 4G, 3 runs, local build against alpinejs.dev): search works
from the first click at 1.84–1.91 s with 0 clicks lost, against alpinejs.dev's 2.70–2.80 s and 0. At the handover a
dialog is on screen in every frame, at the same place. The home page's own copy of the disclosure note now has the
same text as the other pages (it still named the tool).

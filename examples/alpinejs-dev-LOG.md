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
8. Not fixed: a plain `403 Forbidden` from Vercel's own protection (it blocked my address from the deployed htmx app
   after a check's journey bursts) is not recognised as a wall, so the route reports failures instead of "blocked";
   `check` reports "fetch failed" without naming the unreachable origin; `plan --limit` takes routes in
   sitemap order, not by distance from `/` (on htmx.org a limit of 40 stopped inside `/attributes/` and never reached
   `/docs/` or `/examples/`); there is no way to treat an old
   page's absolute production URLs as its own origin when checking a mirror or staging copy.

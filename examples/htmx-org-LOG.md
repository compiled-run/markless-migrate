# Migration log: htmx.org to Markless, from the URL alone

Claude Code (Opus 5.5, the owner's subscription) moved four pages of https://htmx.org to Markless (published 0.4.0
packages) using only the live site: no access to its repository. `markless-migrate` planned, checked and switched;
the port is `examples/htmx-org-markless`. Started 18:53, all four routes green 22:45 (CDT, 2026-10-16), worked in
parallel with alpinejs.dev (`examples/alpinejs-dev-LOG.md`, which also lists the Markless limitations and tool bugs
both migrations hit; this log adds what htmx.org met on its own).

## Deployed

| What | URL |
| --- | --- |
| Front door (switched routes from Markless, every other path from the real htmx.org) | https://mm-htmx-org.vercel.app |
| Report and index | https://mm-htmx-org.vercel.app/_migrate/ , https://mm-htmx-org.vercel.app/_migrate/report.html |
| The Markless app alone | https://mm-htmx-org-new.vercel.app |

`deploy/htmx-org/deploy.sh new|front` rebuilds and redeploys each.

## Routes

| Route | Result | Interactive parts ported (no htmx or hyperscript on the page) |
| --- | --- | --- |
| `/` | green (+ runtime scripts, boosted links, attribution) | hamburger menu (was hyperscript), hero fade-in (was class-tools), GitHub star button |
| `/docs/` | green (+ weight, attribution) | hamburger, the 170 kB documentation page |
| `/examples/` | green (+ attribution) | hamburger |
| `/examples/click-to-edit/` | green (+ GitHub widget, attribution) | the demo: view, edit form with autofocus, submit (PUT), cancel (GET), and the "Server Requests" panel with its timeline, request details, 750-character truncation and Show/Hide |

The demo on htmx.org runs htmx against a sinon fake server in the page. The port keeps what a visitor sees: the
contact, the form, and the request log the fake server would have produced, written as Markless state; no request
leaves the page on either side.

### Accepted differences (by the converting agent, for owner review)

- **htmx.org's runtime scripts** (`/js/htmx.js`, `class-tools.js`, `preload.js`, `_hyperscript.js`, `demo.js`):
  the port replaces what they do and serves none of them; unswitched pages still get them from htmx.org.
- **Boosted navigation** (owner decision): `hx-boost` and `preload="mouseover"` turn nav-link clicks into an XHR GET
  of the next page and a body swap. The port navigates normally to the same URL and page. Markless's client-side
  navigation is off because `document.tsrx` reads the URL to write each page's head, and most nav targets
  (reference, talk, essays) stay htmx pages during the migration. The alternative is moving per-page heads into the
  pages so the router can navigate client-side.
- **JavaScript downloaded on `/docs/`**: 1.34 MB of Markless render data for the 170 kB page; JavaScript run at load
  drops from 97 kB to 18 kB.
- **The GitHub star button on the demo page**: there sinon's fake XMLHttpRequest pushes `buttons.js` into its iframe
  fallback. The port writes the same iframe, inside the span `buttons.js` leaves, because swapping an element for
  another breaks Markless resume. The widget is live, so a few hundred pixels and its count's fields vary; the
  accepts are bounded to that box.
- **Licence attribution** (intended): a fixed badge, "Unofficial demo copy ... htmx and htmx.org © Big Sky Software
  and contributors, Zero-Clause BSD license"; accepts bounded to its own text, links, tab stops and box.

## Weight (JavaScript)

| Route | Transferred, compressed: htmx.org -> front door | Run at load (check, uncompressed) |
| --- | --- | --- |
| `/` | 177.6 kB -> 187.0 kB | 98.6 kB -> 18.3 kB |
| `/docs/` | 70.6 kB -> 178.4 kB | 96.6 kB -> 18.1 kB |
| `/examples/` | 70.5 kB -> 73.7 kB | 96.6 kB -> 18.1 kB |
| `/examples/click-to-edit/` | 682.0 kB -> 213.7 kB | 1701.8 kB -> 30.9 kB |

Transferred bytes are one load of each page as served (`deploy/htmx-org/weigh.mjs`); the check's "on the wire" figure
mixes compressed and uncompressed responses here (see the alpinejs.dev log). The old demo page carries sinon (about
600 kB); the new one loads 423 small script files, one per compiled symbol of its 40-slot request timeline.

## Iterations

| Step | What the check said | What changed |
| --- | --- | --- |
| 0 | htmx.org stopped answering a minute into the first check (connections timed out for minutes) | read-only caching mirror for every later check |
| 1 | iframe, hero animation, `Unexpected token '&'`, nav requests, response panel empty | first full pass |
| 2 | GitHub button: `Resume locator ... found <span>` | serve a span, swap the link in before `buttons.js` |
| 3 | `@for` rows never render; `First Name: Joe` became `Joe`; code block wiped | fixed slots with computeds; values in their own spans |
| 4 | inline scripts broken by escaping; footer narrower on `/docs/` | backtick-only scripts; `wide-content` footer |
| 5 | `/examples/move-before` without its slash | trailing-slash redirect plugin, as Netlify does |
| 6 | the demo page's GitHub iframe | the same iframe in the span's shadow root |
| 7 | attribution badge | layout-neutral badge, bounded accepts |

## The deployed copy

Checked against the deployed Markless app (old: the mirror), `/docs/` and `/examples/` passed, then Vercel's own
protection started answering my address with a plain `403 Forbidden` for the deployed app, and the rest failed on
blocked chunks. The front door, which reaches the app from Vercel's edge, kept working, and the demo passes through it
(`deploy/htmx-org/smoke.mjs https://mm-htmx-org.vercel.app`). The tool did not recognise the plain 403 as a wall (fixed in 7a121ee).

## URL-only: what the tool could and could not tell

- Production pushed back: htmx.org (Netlify) dropped connections after one route's first check (all-page assets,
  two viewports, journeys, forced states). Every later check went through `deploy/htmx-org/mirror.ts`, which fetched
  each URL once (336 requests reached htmx.org while 117,066 were served) and never forwards a write.
- The old side of every failure was "(source not found)". The demo's fake server and log format came from reading
  the scripts the page serves (`/js/demo.js` and the page's inline script); that is still the live site, but it is
  where guessing ended and reading began.
- Hidden behaviour only the journeys revealed: the demo's GitHub button falls back to an iframe because sinon
  replaces XMLHttpRequest; the hero fades in through a class added 100 ms after load.
- `plan --limit 40` crawled `/attributes/...` from the sitemap and never reached `/docs/` or `/examples/`; `check
  --route` works without them, but the inventory does not know their assets until a check runs.
- Not knowable from the URL: which pages share templates (found by diffing drafts: header and footer identical,
  `/docs/` footer wider), and server redirects except by probing (`/examples/move-before` -> slash form).

## Markless limitations met here (beyond the alpinejs.dev list)

1. A dynamic attribute on a keyed `@for` row (`id`, `class`, `data-*`) stops the rows from rendering when items are
   added; `@empty` never goes away once shown.
2. Updating a text value that shares its element with other content replaces the whole element's content.
3. A value binding does not reach an input's `value` attribute, so `form.reset()` restores the first value.
4. An `@if` arm with two statements renders only the last; `{/* */}` inside an arm is a parse error; arms cannot
   hold attribute bindings (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`).
5. A row item cannot be passed to a component (`MARKLESS_CAPTURE_OPAQUE_PROP`); template reads like `log[0].label`
   do not update, computeds that read state into a local first do.
6. A destructuring default on a prop is rejected (`MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`).
7. `import { definePlugin } from 'nitro'` in a Nitro plugin is left unbundled by the Vercel build (500 on every page);
   a plain exported function works.
8. An element with a bound attribute, or even a plain static one in some positions, is a resume host: a third-party
   script that swaps it for another tag (GitHub's `buttons.js`) breaks resume.

## markless-migrate bugs found here

- `config --vercel` sent the whole `/css/` directory to the new app, because the directory test only looked at old
  assets the new app lacks, and `/css/site.css` is served by both (abf01ca, with a test).
- Not fixed, intermittent: about once per full four-route check, one nav-link click on the new side ("talk",
  "reference", "essays": a different link each time) missed the journeys' 3 s step timeout ("could not be used"),
  with or without other checks running on the machine. It never reproduced outside the full check: 0 stalls in 15
  timed clicks (`deploy/htmx-org/nav-click.mjs`) and 0 in 44 replays of the journey through the tool's own `replay`,
  12 one at a time and 32 eight at a time (`deploy/htmx-org/replay-nav.ts`). The route passes when checked again. No
  retry was added; the cause is still open.
- The other tool fixes (journeys and CDN assets, pairing, noise patterns, ads in `plan`) are in the alpinejs.dev log.

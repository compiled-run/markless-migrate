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

## Markless 0.5.0 (2026-10-17)

Rebuilt on the published 0.5.0 packages (`@markless/*` 0.5.0, `vite-plus` 0.3.1 as the 0.5.0 starters pin it).

### Workarounds removed

| Workaround (0.4.0 bug) | Now |
| --- | --- |
| `plugins/void-end-tags.ts`, which deleted `</br>` from every HTML response | removed: 0.5.0 writes void elements without a closing tag |
| inline scripts written with backticks only (script text was entity-escaped) | the scripts use plain quotes again; `String.fromCharCode(38)` in the GitHub button script is `"&"` |
| the click-to-edit timeline as 40 fixed `<li>` slots, each with four computeds, and wake-on-pointer/focus handlers | one keyed `@for` over the log with bound `id` and `class`; the wake handlers are gone (the first update after resume reaches the list) |
| each demo value in its own `<span>` (updating a text hole wiped its siblings) | `First Name: {contact.firstName}`, the text node htmx.org has |
| a plain function instead of `definePlugin` from `nitro` (the import was left unbundled for Vercel) | `definePlugin` again; the Vercel build bundles it |

Kept: the GitHub button's span-then-link swap (htmx.org's sinon fake server is what pushes `buttons.js` into its iframe on the demo page) and the form's `fillForm` (a value binding still does not reach `form.reset()`).

Client-side navigation: links between the four ported pages now swap in place through the router (the document reads the URL for each page's head, so the router morphs the whole body); links to unported pages load them, through the front door from htmx.org. The four pages are the same for every visitor, so `routeRules` keep them on Vercel's CDN (`isr: true`: rendered once per deploy, then served as `x-vercel-cache: HIT`).

### Check (against the deployment)

`check --route / --route /docs/ --route /examples/ --route /examples/click-to-edit/` with old = the read-only mirror of https://htmx.org (as before, so the check does not load htmx.org thousands of times) and new = https://mm-htmx-org-new.vercel.app. The old side is on loopback and the new side on Vercel, so the new side's times include the network.

| Route | Result | Interactions exercised | JS on the wire (old → new, uncompressed) | JS run at load |
| --- | --- | --- | --- | --- |
| `/` | red: behaviour, a11y | 69 of 71 | 397.5 → 167.6 kB | 101.2 → 25.0 kB |
| `/docs/` | red: behaviour, a11y | 236 of 318 | 287.9 → 57.7 kB (0.4.0: 1.34 MB) | 99.2 → 24.8 kB |
| `/examples/` | red: behaviour, a11y | 43 of 47 | 287.9 → 57.7 kB | 99.2 → 24.8 kB |
| `/examples/click-to-edit/` | red: behaviour, a11y | 18 of 21 | 918.3 → 93.6 kB | 1742.7 → 38.1 kB |

Responsiveness (slowest on each side): first interaction old 32 ms → new 48 ms at 4x CPU (desktop 41 → 50 ms), all within the allowance; navigation old 150 ms → new 77 ms at 4x CPU (desktop 221 → 92 ms). No route is red on responsiveness.

What keeps every route red, none of it in the port's own pages:

1. htmx's history cache: boosted navigation writes `htmx-current-path-for-history` (on load) and `htmx-history-cache` (on every boosted click) to sessionStorage. The port has no htmx, so the `behaviour` storage comparison reports them missing on every link step. Needs an owner decision (accept as htmx internals, like its runtime scripts).
2. Coverage: links the journeys could not click on the old page (`locator.click: Timeout 3000ms`, mostly the docs page's in-page anchor links) are listed as "not exercised" and keep the route red until a person accepts them.

The demo itself (view, edit with autofocus, submit, cancel, the request log and its Show/Hide) matches step for step.

Routes switched: none (none is green). Front door: every path goes to htmx.org.

## Every route (2026-10-18)

The port served 4 of htmx.org's 188 sitemap pages. It now serves all of them, and every other file and redirect
htmx.org answers, built from htmx.org's own source (bigskysoftware/htmx `www/`, pinned at fa978b2) instead of the live
HTML.

### How the pages are made

`npm run import` (also `prebuild`) runs `scripts/import-htmx-org.ts`:

1. Clones the source at the pinned commit and downloads the Zola version htmx.org's `netlify.toml` pins (0.19.1).
2. Builds the site twice with Zola: once as htmx.org builds it (the reference, plus every non-page file), and once with
   content-only templates (`scripts/import/zola-overlay.ts`) that print each page's front matter and its rendered
   markdown. Zola renders the markdown, so heading ids, anchor links, smart punctuation and the syntect code
   highlighting (inline-styled spans) are htmx.org's own output.
3. Writes each page with the importer for its Zola template (`scripts/import/templates.ts`: page, section, demo, essay,
   essay_index, essay_all, talk, 404, index), which writes what that Tera template puts in `<main>`. The shared header
   and footer are the existing components. `scripts/import/html-to-tsrx.ts` turns the HTML into TSRX markup; inline
   `<style>` blocks become stylesheets in the head (TSRX scopes `<style>`), `<script>` text is kept as is.
4. Compares every generated `<main>` with Zola's own build of the same page (tags, attributes and text): all 188 match.
   The one difference the importer reports: the talk page's announcement list orders two posts of the same day
   arbitrarily in Zola (it differs between Zola runs); the importer uses the order htmx.org shows.
5. Writes the heads (`site-heads.ts`: title, description, canonical, extra feeds, stylesheets, scripts), and copies
   everything else Zola writes into `.import/public` (gitignored, 101 MB): static files, `atom.xml`, `essays/atom.xml`,
   `sitemap.xml`, `robots.txt`, alias pages, `404.html`, `/test/`, `/src/`, `/node_modules/`.

187 pages are generated; `/` and `/examples/click-to-edit/` keep their hand ports (their behaviour is Markless state),
with heads from the importer. The 30 pages whose content uses htmx itself (the demo pages under `/examples/`,
`/attributes/hx-indicator/` and `/essays/view-transitions/`) load htmx's own scripts directly, as htmx.org does:
`/js/htmx.js`, plus `class-tools.js`, `preload.js` or `_hyperscript.js` only where the content uses them, and sinon
plus `/js/demo.js` on demo pages. The other 157 generated pages load none of them.

### What Netlify did that the port now does

`netlify-routes.ts` (generated) lists what Netlify answers beyond the files, served by Vercel routes on the CDN and by
`plugins/trailing-slash.ts` locally: `_redirects` (14 paths, with and without the slash), Pretty URLs (`/x` serves
`x.html`, `/x/index.html` serves `/x/`, and links inside the static `/test/` pages rewritten as Netlify rewrites them),
a 301 to the lower-case path for a path with capitals (`/CVE-2026-3682-1/` -> `/cve-2026-3682-1/`), and case-insensitive
file lookups the pages rely on (`/img/Github_Logo.png` is `GitHub_Logo.png` on disk). The `demo.htmx.org` host rule has
no counterpart on this host.

Markless limits met: `pages/api/` is reserved for API routes, so `/api/` lives at `pages/_api/` and is served at
`/api/`; content CSS that targets `body > footer` needed `body > [data-async-container] > div > footer`, because the
page sits in the router's container.

### Coverage

`scripts/verify-routes.ts https://htmx.org https://mm-htmx-org-new.vercel.app` (old side fetched once, slowly):

| What | Match |
| --- | --- |
| Pages: 188 sitemap routes and their `/index.html` forms: status 200 (or the same redirect), same `<title>`, same first `<h1>` | 377 of 377 |
| Every other file (feeds, sitemap, robots, aliases, static files, `/test/` pages) and every Netlify route: same status, redirect target and bytes, plus two paths no site has (404) | 360 of 360 |

`markless-migrate plan` (old: the read-only mirror) lists 240 routes (sitemap, crawl, feeds, robots, redirects and
the source); `check --only coverage` against the deployment: **228 of 228 routes of the old site present** (the other
12 are Zola template files the source scan lists, which htmx.org answers 404).

plan stopped at first on `/discord` (a redirect to discord.gg, which answers with a Cloudflare challenge): it treated
the other site as a wall on the old app. Fixed here: a route that redirects to another site is recorded as the old
app's redirect (`test/plan-offsite-redirect.test.ts`).

### Check (every route, against the deployment)

`check` with no `--route` (old: the read-only mirror; new: https://mm-htmx-org-new.vercel.app), which checks all 228
routes and runs visual, behaviour and responsiveness on one representative per template group (`/attributes/:page/`
35 pages, `/posts/:page/` 35, `/examples/:page/` 26, `/essays/:page/` 43, ...):

| Run | Result |
| --- | --- |
| Full run | **181 of 228 green**, 31 red, 15 not checked (connection timeouts to Vercel, and 600 s route timeouts on `/docs`, `/essays`, `/api/`, `/examples/animations`), 1 blocked (`/discord`: its target, discord.gg, answers with a Cloudflare challenge) |
| The 46 not green again (`--timeout 1500`) | 13 green; the rest below |
| After the accepted boosted-link entries were fixed (next paragraph) | `/essays/all`, `/extensions/sse/` green; 28 red, 2 not checked (the mirror timed out on `/` and `/migration-guide-htmx-1/`) |

Coverage: 228 of 228 routes present. Responsiveness: first interaction old 566 ms → new 530 ms, navigation old 911 →
877 ms (4x CPU). JavaScript run at load on a content page: about 97 kB → 29 kB (pages that use htmx load it, as before).

The boosted-link acceptance from 2026-10-17 had stopped matching: the check now names shared-layout links
`click link "docs", in the layout shared with /` (a `/`, which `*` does not cross) and adds htmx's history cache to the
expected result. The entries now use `**` and allow that cache; the decision itself is unchanged (plain navigation,
no htmx on pages that do not use it), and htmx's sessionStorage keys are then accepted automatically as htmx's own.

Still red, none of it in the generated markup (each was compared against htmx.org's build: same tags, attributes and
text on every page):

1. **Controls the check could not use on the old page** (most routes): unnamed in-page links (`link`, `link #2`...)
   reported "missing: it is not on the page" on htmx.org itself. In the partial reruns the header's links and search
   box also read "not exercised, shared with /" because `/`, the route that exercises the shared header, timed out on
   the mirror in that run; in the full run `/` exercised them.
2. **Live third-party embeds**: YouTube iframes (`/examples/move-before/*`, `/essays/a-real-world-*`,
   `/essays/how-did-rest-...`, `/migration-guide-htmx-1/`) make different requests and paint different frames each
   load; the GitHub star widget sometimes falls back to its iframe (rate limits during long checks); videos on
   `/essays/you-cant/` and `/attributes/hx-partial/` show different frames.
3. **Motion that never stops**: `/examples/animations/` toggles `.faded` every second (htmx's class-tools, served as
   htmx.org serves it, same CSS transition); the two pages are captured at different phases (opacity 1 against 0.3 or
   0.37). The home page's hero fade now starts as class-tools starts it (100 ms after `DOMContentLoaded`, not after
   the script is parsed).
4. `/webring/` and `/attributes/hx-partial/` visual differences in some viewport widths, not investigated further.

Not done: a full `check` run after the acceptance fix (one full run takes about 2 to 3 hours here; the machine slept
through parts of these runs). Tool fixes made on the way: plan no longer stops at an off-site redirect, and check no
longer ends the whole run when a retried page load is aborted by its own `about:blank` (`test/infrastructure.test.ts`).

## Embeds: the GitHub star and Sponsors buttons as Markless components (2026-10-22)

Done through the pipeline: `usage` found the buttons.js star button on every page (`a.github-button`, and on the
click-to-edit demo the frame buttons.js falls back to) and, on `/`, the GitHub Sponsors frame; `embeds study` pictured
them; `run --agent claude --only embeds` on `/` and `/examples/click-to-edit/` did the rest. The star button is the
certified `github-button` adapter (no buttons.js, no frame, the count from GitHub's REST API marked live); the Sponsors
frame, which no adapter covers, is a component the agent wrote from its study. The 51 px frame the port carried on
click-to-edit was a copy of runs where htmx.org's own frame got no count back from api.github.com (unauthenticated,
60 requests an hour): the component draws the 101x20 button with its count.

The embed step against https://htmx.org (live) and https://mm-htmx-org-new.vercel.app: the Sponsors button is the same
in all 12 pictures (desktop and mobile, light and dark, at rest, hovered and focused) and both ways of activating it;
the star button is the same in every picture but where GitHub's count moved since the data was read (accepted
automatically), and leads where the old one leads by a click and by Enter. PageSpeed Insights (mobile, median of 5),
this port without and with the change: `/` 982 -> 827 kB, 66 -> 58 requests, FCP 3.19 -> 1.22 s, LCP 4.95 -> 3.15 s,
score 74 -> 93; `/examples/click-to-edit/` LCP 2.59 -> 1.37 s, score 96 -> 100. Pictures, recordings and the table:
https://mm-embeds-evidence.vercel.app.

## Markless 0.9.0 (2026-10-22)

The app is on Markless 0.9.0 from npm (core, router, analyzer, typescript-plugin), from 0.5.0. Since 0.8, TSRX reads
`//` and `/*` in markup text as the start of a comment, which broke 37 generated pages (URLs and code in the text). The
importer now writes any text holding either as a string, as markless-migrate's convert step does
(`scripts/import/html-to-tsrx.ts`), and the 37 pages were regenerated by it; every generated `<main>` still matches
Zola's build of the same page. Nothing else changed: the demo pages still load htmx's own scripts (next section).

### Check against the deployments, before and after

`check` on the ecosystem suite's sample (`/`, `/docs/`, `/examples/click-to-edit/`, `/attributes/hx-indicator/`),
`--concurrency 2 --timeout 1800 --no-psi`, old https://htmx.org, new https://mm-htmx-org-new.vercel.app on 0.5.0, then
on 0.9.0 once deployed: red on both, 289 failures on 0.5.0 (95, 66, 62, 66) and 266 on 0.9.0 (77, 66, 62, 61), not
counting 2 and 4 controls not exercised. New on 0.9.0: following the header's "examples" link makes no request at the
click, where the old site's boosted link fetches `/examples/` (the router fetched the page ahead of the click), and on
`/attributes/hx-indicator/` the demo button's focus and name while its "Loading..." indicator shows differ from the old
page's (that demo still runs htmx itself).

## No htmx, class-tools or _hyperscript on any page (2026-10-23)

Every page that loaded `/js/htmx.js`, `/js/class-tools.js` or `/js/_hyperscript.js` (the 30 demo pages under `/examples/`,
`/attributes/hx-indicator/`, `/essays/view-transitions/`, `/essays/rest-copypasta/`, `/extensions/` and `/webring/`) is
now a Markless page: `run --agent claude` took each route in turn and wrote its demo as Markless state and handlers,
with the demo's fake server (htmx.org's sinon setup and `demo.js` request log) as a plain module beside it
(`components/<demo>.ts`). The importer keeps those pages as hand ports (`HAND_PORTED`) and writes no htmx script into
any head. class-tools' timed classes are `lib/class-tools.ts`. The build guard is green: no page loads or runs another
framework's runtime. htmx.org's own files (`/js/htmx.js` and the rest, `/src/`, `/test/`) are still served at their
addresses as downloads, as htmx.org serves them; nothing in the app loads them.

The run took one attempt a route (two on the first three), without the page load measure, since each check took most
of an hour otherwise. No route went green: every one keeps the licence badge's `htmx.org` link (an accepted difference
the checker no longer matches since it writes the old origin as `OLD` before matching) and axe's
`label-content-name-mismatch` on the certified GitHub button's count ("49,565" shown, "49565 stargazers on GitHub"
read, as buttons.js does inside its frame).

### Check against the deployments, before and after

`check --no-psi` on 36 routes (the ecosystem suite's sample and every page above), old https://htmx.org, new
https://mm-htmx-org-new.vercel.app, with htmx and then without: 1,097 failures to 1,001, not counting controls not
exercised; 28 routes fewer, 2 the same, 6 more. JavaScript on a demo page: 2.65 MB downloaded and 1.69 MB run at load
to 105 kB and 66 kB (htmx.org: 2.64 MB and 1.74 MB).

The six with more:

- `/examples/animations/`: the color-swap demo no longer changes colour every second (htmx polled for it), and 16
  computed-style rows on it follow. A second run on the route built a fix the compiler refused
  (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` on a component inside an `@if`) and ran out of time; it was not kept.
- `/examples/tabs-hateoas/`: after an in-place navigation the tabs' code (Markless's `marklessRowSlotMint` chunk) is
  fetched on the first click instead of ahead of it, so the checker's click lands before it runs; on a fresh load the
  tabs work as on htmx.org. The same holds on six other demo pages.
- `/essays/rest-copypasta/`: the Copy buttons show nothing in the checker (the clipboard write is refused there and
  the port awaits it, where _hyperscript shows "copied" anyway).
- `/examples/infinite-scroll/`, `/examples/move-before/`, `/webring/`: a font row on the table cells, a navigation
  row and one rendered row.

## Every demo working, checked like a person (2026-10-24)

A person's pass over the 35 demo and essay routes, on the local build against htmx.org, found six that did not work
after htmx was taken out: edit-row's Edit buttons, both tabs examples (and a script error on the JavaScript one),
the essay's "Copy For HN", infinite-scroll's empty id cells at load, and the animations page's colour swap.
`run --agent claude` fixed each of them in the port, and the run agent's skill now carries the htmx, class-tools and
_hyperscript patterns these needed (#77). The same pass afterwards: none broken. Every other route either works or
has nothing the pass can drive (file uploads, the sortable drag, async-auth).

- edit-row: Markless 0.9 drops the event handlers of an `@if` inside an `@for` row after resume; the rows' buttons
  are one delegated handler on the table body until Markless fixes it (reported).
- Links keep htmx.org's own addresses (`/extensions/idiomorph`, no slash). htmx.org redirects those to the slashed
  page; the port's in-place navigation lands on the slashed page too, through the host's slash rule, so nothing in the
  importer rewrites them.
- The disclosure note now reads "Unofficial demo copy of htmx.org. htmx and htmx.org © Big Sky Software and
  contributors, Zero-Clause BSD license.", without the tool's name; its acceptances were re-recorded against it.
  The seven acceptances that were no longer true (the GitHub star iframe, the 0.4.0 weight, hx-boost's requests)
  were dropped, and the one for htmx's own script files now names the build guard as its evidence.

Still red in the checker on the suite's routes, none of them the port's doing: the header links, where htmx's boost
sends its own request and history entry and the router navigates in place; hx-indicator's class-tools toggle, whose
3 s phase the click lands on differently each time (a person sees the same thing on both); the star count's width
on click-to-edit as GitHub's live count moves; and on `/` the page-load row for images below the first screen, which
the port marks up as htmx.org does (no `loading` attribute on either).

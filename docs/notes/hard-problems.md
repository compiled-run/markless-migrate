# The hard problems, and where semantic analysis helps

"Semantic analysis" here means reading the old app's source with real parsers (oxc for JS/TS, yuku-css
for CSS, framework-specific readers for routes and config), plus Markless's own analyzer on the new
app. It never calls a model; the agent can add hints in a file the tool reads.

| Problem | Runtime answer | What semantic analysis adds |
| --- | --- | --- |
| Routes hidden behind JavaScript | interaction explorer records every URL it reaches | read the router: Next/Remix/React Router/Vue Router/Angular route tables, Rails `routes.rb`, Laravel `routes/web.php`, Django `urls.py`, WordPress permalinks; dynamic segments get sample values from the sitemap, links or the CMS |
| Logged-in pages | `--auth` runs a login script once (or reuses a Playwright storage state) per role, and every check runs once per role; `plan` writes the roles it finds into a starter auth file | find auth guards (middleware, layouts, `before_action`, decorators) to know which routes need which role, and the login route to script |
| Writes in production | explorer classifies every action before running it; anything that writes is replayed only against `--old` marked as staging, or recorded as "would POST /cart" and compared without sending | read form handlers, server actions, API routes and fetch calls to know which actions write (method, handler body touching a DB or payment SDK) and which are safe reads |
| Bot protection | run against staging/preview URLs; `--header`/`--cookie` for a bypass token; detect challenge pages and stop with a clear message instead of failing every check | none needed |
| Noise (A/B tests, ads, personalisation, time) | repeated old loads, then freeze what can be frozen: fixed clock, seeded `Math.random`, fixed timezone and locale, ads/analytics blocked | find the sources of variation (`Date.now`, `new Date`, `Math.random`, feature-flag SDKs, ad and analytics tags, personalisation reads) and pin them deliberately instead of guessing from diffs; flag the rest as known noise per element |
| Other origins (CMS, APIs, payments) | record every request each page makes during server render and in the browser, compare old vs new as a contract (method, path, query, body shape, which response fields the page actually uses) | find the CMS and API clients (Contentful, Sanity, Shopify, Strapi, REST/GraphQL), their queries and the fields read, so a missing field or a different query is named before the page even renders |
| Same data on both sides | point both apps at the same staging backend, or replay recorded responses (record from old, serve to both) | know which responses feed which component, so recorded data can be trimmed and refreshed per route |
| Explaining a failure | today: route, dimension, expected/actual, old CSS rule | map each DOM node back to the old component and source line (source maps, React/Vue devtools hooks, data attributes) and to the new `.tsrx` component via Markless's analyzer, so a failure says "old `ProductCard.tsx:42` renders the price; new `product-card.tsrx` doesn't" |
| Planning the order | none | dependency graph of old components and routes: convert shared layout and leaf components first, routes in an order where each one unlocks the most others |
| Non-browser surface | compare RSS/Atom, sitemap, robots, `/.well-known`, JSON endpoints, emails rendered by the app | route reading finds these non-page endpoints so they are checked too |

## Order

1. Freeze nondeterminism (clock, random, timezone, blocked ad/analytics), with source scanning to find
   what to pin. Every other check gets more trustworthy.
2. Network contracts: record requests per page, compare old vs new. Covers CMS and APIs.
3. Write-safety: classify actions by reading handlers; never send a write to anything not marked
   staging.
4. Auth: roles from guards, a login script per role, checks per role.
5. Route reading for the common stacks beyond Next.js.
6. Old-to-new source mapping in failures, using Markless's analyzer on the new side.
7. Bot-protection detection and bypass headers.

## What check cannot see yet

Every dimension compares end states: the page after it loads, after a step, in a forced state. What happens
between two end states, or only with time, sound or a GPU, needs its own recording. Motion now has one; the
rest are listed with the plan for each.

| Kind | Why it is invisible today | Plan | Status |
| --- | --- | --- | --- |
| Transitions and animations an interaction starts (a sidebar category collapsing, a dropdown fading in) | the screenshot and DOM after the step are the same whether the change animated or jumped | the `motion` dimension: replay each journey's last step with motion allowed and the clock running in real time, record every `transitionrun`/`animationstart` and every `document.getAnimations()` entry (element, properties, duration, delay, easing, iterations), hold finite ones at their start and take frames at fixed offsets across the longest; compare per element, matched as the other dimensions match them | done |
| Hover and focus transitions on controls | forced `:hover`/`:focus` states compare the end style only | hover and keyboard-focus each control a journey used on one page, record what starts | done |
| Reduced motion | contexts load with `prefers-reduced-motion: reduce`; the a11y check only lists animations still running at load | every interaction that moved is replayed again with reduce; both sides must agree | done |
| Script-driven motion (an element's inline style written frame by frame) | not a Web Animation, so `getAnimations()` misses it | a MutationObserver counts the frames that wrote each property of an element's inline style; a property written on six frames or more is motion, timed by the wall clock with a looser tolerance (max(50 ms, 25%)) | done |
| Scroll-linked effects (a header that hides on scroll, content that fades in as it enters, parallax, `animation-timeline: scroll()`) | pages are captured scrolled to the top, and scroll-driven animations exist at load so a step never starts them | done in part: "scroll down one screen" is a motion interaction, so transitions and animations a scroll starts are compared. Next: scroll in steps and compare element boxes and the current time of scroll-timeline animations at each offset | partial |
| Sound and media playback | nothing records audio | done in part: a media element's `play` event and Web Audio sources started during an interaction are compared ("old plays audio sent.mp3; new plays nothing"). Next: compare what plays (the decoded file's hash) and video frames | partial |
| Canvas and WebGL content | the screenshot sees a canvas's pixels at load only; what it draws after an interaction is not compared, since journeys compare the accessibility tree and not pixels, and WebGL output varies by GPU | read each canvas after load and after each step (`toDataURL`, or a clipped screenshot for WebGL without `preserveDrawingBuffer`) and compare with a pixel tolerance measured from repeated old loads; record the draw calls a chart library makes when it exposes them | planned |
| Timing-based UI (a toast that leaves after 5 s, an autoplaying carousel, a countdown, a session timeout warning) | the clock is frozen and moves only when a timer fires, and a step waits out timers of at most a second | a timed journey per route with the clock running: sample the accessibility tree and text at 1, 3 and 10 s after load and after each step that started a longer timer, and compare the sequences | planned |
| Drag, swipe and pinch | journeys click, type, press keys and choose options only | add drag and swipe steps for elements that listen to pointer moves (sliders, sortable lists, carousels) and compare the step result as for clicks | planned |
| The clipboard | a copy button's result is not on the page | record `navigator.clipboard.writeText` and `copy` events during a step and compare the text written | planned |

## Known flakes

| Test | What happened | Root cause to fix | Seen |
| --- | --- | --- | --- |
| `test/e2e/motion.test.ts`, "an accordion panel whose height variable is left at auto and that leaves at once on close is red on both" | failed once on PR #18 (d869718, run 39667727244) and passed on rerun: the closing use of the trigger was recorded only with reduced motion, not with motion allowed | the motion recording of a step's second use depends on timing under load (the runner was busy); the checker must wait for the step's animations by state, not by wall clock | 2026-10-21 |

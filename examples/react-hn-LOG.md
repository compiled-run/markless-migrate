# Migration log: react-hn (React 15, Firebase live data) to Markless

[insin/react-hn](https://github.com/insin/react-hn), a Hacker News client that reads everything from the HN Firebase
API over one live socket, ported to Markless 0.9.0 (the published packages, from `create-markless`) by Claude Code and
checked page by page against the unchanged original with `markless-migrate`. The point of this port is live client
data: hundreds of per-item reads, values pushed by the database while you read, deep comment trees that arrive piece by
piece, new-comment highlighting, and "new since your last visit" kept in `localStorage`.

## What was migrated

| Part | Upstream | Commit | Licence |
| --- | --- | --- | --- |
| Old app | [insin/react-hn](https://github.com/insin/react-hn) v1.7.1: React 15.3.2, react-router 2.8.1 (`hashHistory`), firebase 3.4.1, reactfire 1.0.0, react-timeago 3.1.3, built with nwb 0.22 (webpack 4.1.1) | `7c5a780` (2020-05-19, the last commit) | MIT |
| Data | the public [Hacker News API](https://github.com/HackerNews/API) on Firebase, `hacker-news.firebaseio.com/v0` | live | |

### Getting the old app to build and run, unchanged

No source file was changed. The repo has no lockfile, so `npm install` resolves its semver ranges as of the day it ran
(the versions that resolved are above; the lockfile npm wrote is kept in `deploy/react-hn/old-package-lock.json`).

| Shim | Why |
| --- | --- |
| Node 10.24.1 (`fnm install 10`, then `fnm exec --using=10 npm install` and `npm run build`) | Node 24 fails at once: nwb loads webpack-dev-server, whose `spdy` → `http-deceiver` calls `process.binding('http_parser')`, removed from Node (`No such module: http_parser`). Node 10 was current when nwb 0.22 and webpack 4.1 shipped; `NODE_OPTIONS=--openssl-legacy-provider` on Node 24 does not get past it. |
| `dist/` served by any static server (`python3 -m http.server 4201`) | The app is a static build with `publicPath: ''`. Every route is `/#/<route>`, so the server only ever serves `/`. |

```bash
git clone https://github.com/insin/react-hn ../mm-upstreams/react-hn && cd ../mm-upstreams/react-hn && git checkout 7c5a780
fnm install 10 && fnm exec --using=10 npm install && fnm exec --using=10 npm run build
cd dist && python3 -m http.server 4201
```

## Running it locally

```bash
# old app on :4201 (above); new app on :4311
cd examples/react-hn-markless && npm ci && npm run build
NODE_OPTIONS="--require $PWD/../../src/check/record-server.cjs" PORT=4311 HOST=127.0.0.1 node .output/server/index.mjs
```

## How the port is built, and why

Routes keep the old app's paths without the `#`: `/news`, `/newest`, `/show`, `/ask`, `/jobs`, `/read`,
`/newcomments`, `/story/:id` (and `/item`, `/job`, `/poll`), `/comment/:id`, `/user/:id`, `?page=N`, and a 404 page. A
one-line script at the top of the document head sends every old link (`/#/story/8863`) to its real path before
anything renders, so links people saved from the old app keep working.

The server renders the shell (header, settings, footer) and each page's loading state, exactly the first frame the
old app showed. The data then arrives in the browser over one Firebase socket, as in the old app:

- `lib/firebase.ts` speaks the Firebase Realtime Database wire protocol the old SDK spoke (handshake, listen,
  unlisten, split frames, merges, cancelled listens), in about 220 lines and no SDK. One socket per page, kept across
  in-place navigations; a path several parts of a page listen to is listened to once.
- Each live region (`components/Stories.tsrx`, `ItemView.tsrx`, `Updates.tsrx`, `Permalinked.tsrx`) owns its
  listener in an `attach` on its root element (started by `onVisible`, so it starts as soon as the page shows): the
  listener writes the values it hears into the region's `state()`, and the attach's cleanup stops every listen when
  the router swaps the page out. Nothing else writes state; no effect, no polling.
- What the page shows is derived: `computed(() => storiesPage(view, ...))`, `computed(() => threadRows(thread, now))`.
  The old stores' rules are plain functions over that state in `lib/thread.ts` and `lib/views.ts`: when the first
  load of a thread ends, what is new since the last visit, which subtrees auto-collapse, the "highlight N comments
  from ..." slider, mark as read, child counts of a folded thread. The visit record keeps the old key and shape
  (`localStorage[storyId] = {lastVisit, commentCount, maxCommentId}`), so a reader's history carries over the switch.
- The comment tree is rendered as one flat, keyed list of rows in document order, each with its `Comment--levelN`
  class: the old CSS indents by that class, so the page looks the same. (A recursive component tree was the first
  attempt; see the bugs below for why it could not work in 0.9.0.)
- The user page is the one read that is not live in practice, so it uses the server path: a page-level
  `computed(async () => fetchUser(params.id))` inside `@try`/`@pending`/`@catch`, rendered and streamed on the server
  from the REST API (`/v0/user/<id>.json`).
- The relative times ("5 minutes ago") tick as react-timeago did: one clock per region (`lib/clock.ts`), re-read
  every second while a shown time is under a minute old, every minute under an hour, every hour under a day.
- The session caches the old `StoryStore` and `UpdatesStore` kept (`idCache`, `itemCache`, `updates` in
  `sessionStorage`, saved on unload) are module state in `lib/cache.ts`, so going back to a list shows it at once.
- The old stylesheet is served byte for byte from `public/app.css` (the old build's own CSS).

Where the old app had a bug that shows, the port keeps it (the check compares behaviour, and a reader expects what
they had): a thread holding a dead comment that has replies never ends its first load in the old store (it waits for
replies it never renders), so on such a thread the first visit is only recorded when the page is left, and comments
that arrive while reading are not marked new. `lib/thread.ts` `loaded()` counts the way the old store counted.

## Iterations

TODO

## Results

TODO

## Accepted differences

TODO

## Measurements

Local, Chromium, both apps production builds, both fed the same recorded database
(`deploy/react-hn/data/story_50226419.json`: story 50226419, 187 comments, 150 recorded live updates) through the
migrator's fake Firebase server. `node measure/journeys.mjs` writes `measure/results-50226419.json`;
`node measure/weight.mjs` gives the JavaScript figures. Times are wall clock on an unthrottled M5 laptop, so read
them as a ratio, not as absolute numbers.

**Journeys** (requests are HTTP; "listens" are database subscriptions the page opened over its one websocket)

| Journey | Old | New |
| --- | --- | --- |
| Open a story: first comment on screen | 305 ms | 128 ms |
| Open a story: all 187 comments on screen | 387 ms | 152 ms |
| Open a story: HTTP requests (most at once) | 5 (4) | 28 (13) |
| Open a story: database listens, frames, bytes | 197, 396, 107 kB | 197, 395, 107 kB |
| Collapse and expand a subtree: requests, listens | 0, 0 | 0, 0 |
| Live updates while reading (4 updates to this thread): new listens, comments marked new | 1, 1 | 1, 1 |
| Come back (reload): requests, listens, comments marked new | 5, 198, 0 | 28, 198, 0 |

The new app makes more HTTP requests because the page is split into small modules and the router prefetches the
other routes when idle; both apps talk to the database the same way (same listens, same frames).

**JavaScript at load** (V8 coverage: bytes of the functions that ran; then the bytes of JavaScript received, as
each local server sends it)

| Route | Old executed | New executed | Old received | New received |
| --- | --- | --- | --- | --- |
| /news | 201.5 kB | 125.3 kB | 428.9 kB | 345.6 kB |
| /story/50226419 | 207.0 kB | 176.6 kB | 428.9 kB | 443.8 kB |
| /item/8863 | 206.9 kB | 176.5 kB | 428.9 kB | 443.8 kB |
| /comment/8054455 | 202.4 kB | 155.2 kB | 428.9 kB | 503.3 kB |
| /newcomments | 202.3 kB | 118.2 kB | 428.9 kB | 345.6 kB |
| /read | 178.0 kB | 117.3 kB | 428.9 kB | 345.6 kB |
| /user/patio11 | 194.1 kB | 77.0 kB | 428.9 kB | 362.3 kB |

The new app runs 15% to 60% less JavaScript at load on every route measured. It receives more on the item and comment
routes because, once idle, the router prefetches the other routes' modules and their render data (the item view's
alone is 79 kB). That is prefetched download, not code run at load.

**Memory over a 2-minute live session** (heap after a forced GC, sampled every 10 s)

| Session | Old heap | New heap | DOM elements old / new |
| --- | --- | --- | --- |
| Thread that grows (124 new comments pushed) | 5.0 → 5.7 MB | 4.4 → 4.6 MB | 2,419 → 2,887 / 4,438 → 5,318 |
| Thread that is edited in place (150 updates) | 5.1 → 5.3 MB | 4.4 → 4.5 MB | flat / flat |
| 15 in-place navigations between stories | 4.2 → 6.6 MB (levels off) | 3.8 → 15.9 MB (+~800 kB per visit, linear) | flat / flat |

The live sessions do not leak in either app. The navigation churn does leak in the new app: framework bug 12
(a window `load` listener per in-place navigation keeps every visited page alive). The app cannot work around it
without editing the framework.

## Markless 0.9.0 bugs found (minimal repros in `react-hn-markless/repros/`)

Each repro is one page (and the components it uses). `node repros/run.mjs` builds a scratch app with the published
0.9.0 packages, drives every repro in the dev server and in a production build, and writes `repros/results.json` (the run behind
this table). "Dev" and "prod" say where it was seen. Bugs 3, 7 and 8 were seen in the app and are kept with their
app symptom, but their minimal repros do not reproduce them, so treat them as unconfirmed.

| # | Repro | What the author writes | Expected | Actual |
| --- | --- | --- | --- | --- |
| 1 | `01-literal-prop` | `<Label label="apples" />`, the component shows `{label} {count}` and bumps `count` from an `attach` | `apples 3` after the bump | `3` (dev and prod): once the browser updates the text, a literal (string or number) prop reads as `undefined`; a prop from `params` or state works |
| 2 | `02-component-async-twice` | a component-level `computed(async () => slowValue(id))` inside `@try` | the server awaits it and streams the arm, as a page-level one does | the server runs the fetch, discards it and sends only `@pending`; the browser runs the fetch again (two fetches, no server-rendered value) |
| 3 | `03-async-prop-graph-node` | `@try { <Child item={item} /> }` with `item` an async `computed` | no error | seen in the app (`pageerror: Markless DOM update expected graph node computed:item.` on the story page); the minimal repro does not reproduce it, in dev or prod, so it needs more of the app's shape than this |
| 4 | `04-mutual-recursion` | `Outer.tsrx` renders `Inner.tsrx`, which renders `Outer.tsrx` (a comment and its replies in two files) | renders, builds, answers clicks | dev: renders the 3 levels, but the first click does nothing (`open` stays); prod: the production build never finishes (killed after 180 s at `transforming...`) |
| 5 | `05-recursive-async` | a recursive component (one file) whose body awaits its own item in `@try` | 4 nested bodies, the toggle works | dev and prod: no body and no toggle render at all, with no error (in the app it also threw `Unknown async symbol c1:symbol:8`) |
| 6 | `06-attach-prop` | an `attach` closure that reads the component's `id` prop | `attach read id /06-attach-prop` | the prop reads `undefined` in the browser; seeding `let x = state(id)` and reading that works |
| 7 | `07-arm-attach` | an `attach` on an element inside an `@if` arm the browser opens | the arm renders and its attach runs | seen in the app (the settings panel: `Unknown async symbol` page error and the arm does not render); the minimal repro works in dev and prod, so the trigger is the arm sitting in a page with async regions |
| 8 | `08-async-in-browser-computed` | a browser-side `computed` that reads an async value the server resolved, then a click | `3` | seen in the app (`TypeError: Cannot convert undefined or null to object` after resume); the minimal repro works in dev and prod |
| 9 | `09-row-branch` | `@for` rows whose body is an `@if` / `@else`, rows added in the browser | 3 rows | no rows at all, no error |
| 10 | `10-first-click-propagation` | `event.stopPropagation()` in a button's handler, a click handler on its ancestor | `inner 1 outer 0` | the first (waking) click also runs the ancestor's handler; later clicks are right |
| 11 | `11-row-attach` | an `attach` on an element in a row the browser adds | the row's HTML set by its attach | the attach never runs |
| 12 | `12-navigation-leak` | a page with a handler and an `attach`, navigated in place 5 times (a link to the same route with another query) | the number of window `load` listeners stays the same | prod: 0 -> 5, one more per in-place navigation: the inline resumer re-run for the swapped-in page calls `addEventListener('load', ..., { once: true })` after the window has loaded, so it never fires, and its closure keeps the page container and its `__marklessCensus` (every node of the page) alive. On react-hn: +830 kB of heap per story visited, unbounded (see the memory measurements) |
| 13 | (in the app) | the router's built-in `#/` handling on `/` | `/#/story/1` lands on the story | the router renders the story but keeps the hash URL, and the next hash change throws `TypeError: Cannot read properties of undefined (reading 'startsWith')`; the port's own one-line redirect in the head avoids it |
| 14 | (in the app) | the dev server after a compile error is fixed | the fixed file is served | the old compile error kept being served (`MARKLESS_CHILD_REPEAT_WITHOUT_ELEMENT`, after the `@for` got its element) until a restart; also, stopping `vp dev` leaves its `vite` child running on the port |


## Markless gaps (diagnosed limits, with the authored workaround)

These are not crashes: the compiler or a diagnostic refuses the shape, or the API has no way to say it.

| Gap | Diagnostic or symptom | Workaround in the port |
| --- | --- | --- |
| No way to keep a value's data in the browser after a server-side `computed(async)`, and component-level async does not stream (bugs 2, 8) | | the live regions read the database in the browser from an `attach` and keep what they hear in `state()`; only the user page uses `computed(async)` |
| A dynamic key read on graph state (`items[id]`), even in a handler | `MARKLESS_STATE_DYNAMIC_PATH_READ` | lookups go through plain functions over the whole state (`lib/thread.ts`, `lib/views.ts`) |
| A prop expression (`level + 1`, `Number(params.id)`) | `MARKLESS_CAPTURE_OPAQUE_PROP` | the value is a `computed` or seeded into `state()` first |
| A row value passed into a child component that looks it up | `MARKLESS_CAPTURE_OPAQUE_PROP` | rows are plain markup; the one shared row list (`CommentList.tsrx`) takes the whole computed list |
| An `@if` arm holding a `@for` of components, or a branch inside a branch | `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` | one level of `@if`, optional parts toggled with `hidden` |
| Browser-added rows cannot branch or attach (bugs 9, 11) | rows silently empty | each row carries every variant and hides the others (`hidden`); trusted HTML goes in `data-html` and the region's own attach sets it with a MutationObserver (`lib/markup.ts`). Cost: about 1.8x the old app's DOM elements on a thread |
| `@try` content must read one async value directly | `MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT` | the settled value is handed to a child component |
| No trusted-HTML binding | `innerHTML={...}` becomes an attribute | `data-html` + `lib/markup.ts` |
| `storage()` keys are compile-time strings | `MARKLESS_STORAGE_KEY_STATIC` | per-story visit records (`localStorage[storyId]`) are read and written from the listeners |
| A `@for` at the top of a component needs an element of its own | `MARKLESS_CHILD_REPEAT_WITHOUT_ELEMENT` | `CommentList` wraps its rows in a `<div>` |
| An arm or code block renders one node | `MARKLESS_PARSE_ERROR` (TSRX2011) | fragments |
| Every `.tsrx` under `pages/` is a page | a component file there became a route | components live in `components/` |
| No "after this write is on screen" hook for focus | focus set in a handler ran before the arm existed on the first (waking) click | the settings panel focuses itself from its own `onVisible` |


## markless-migrate improvements made

Each started from a red run of the check on `main` against this port, and each is its own PR with tests that fail
without the change.

| PR | What the check could not do | What it does now |
| --- | --- | --- |
| [#125](https://github.com/compiled-run/markless-migrate/pull/125) `check/hash-routes` | compare an old app whose routes live after `#` (`/#/story/1`): it loaded `/story/1` on the old server, got the old app's home page, and compared that | `--old-hash-routes` (also detected from the source): the old side is opened at `/#<route>`, its URLs are read back as routes (with react-router's `?_k=` key and its `@@History` session entries treated as the router's own), and every old `/#/...` link must land on its route in the new app |
| [#126](https://github.com/compiled-run/markless-migrate/pull/126) `check/firebase-live` | record or replay anything that arrives over a websocket: both apps read the live database during the check, so they saw different data and nothing pushed while the page was open was compared | `--data record --live-window <s>` records what the old page heard from its Firebase database (snapshot plus the timed updates); replay serves both apps the same snapshot from a fake database over the same socket protocol, then journeys push the same recorded updates to both ("receive the N updates ... then reload", "come back after the N updates arrived while the page was not listening") and compare what each page shows. Also fixes Playwright's routed-socket ids colliding under the frozen `crypto` |

## Deployed

TODO

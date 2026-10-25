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
NODE_OPTIONS="$(node ../../src/cli.ts recorder)" PORT=4311 HOST=127.0.0.1 node .output/server/index.mjs
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

TODO

## Markless 0.9.0 bugs found (minimal repros in `react-hn-markless/repros/`)

TODO

## Markless gaps (diagnosed limits, with the authored workaround)

TODO

## markless-migrate improvements made

TODO

## Deployed

TODO

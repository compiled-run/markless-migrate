# Migration log: Hacker News clone (Next.js 12 + Apollo GraphQL) to Markless

[clintonwoo/hackernews-react-graphql](https://github.com/clintonwoo/hackernews-react-graphql) ported to Markless 0.9.0
(the published packages, `create-markless --starter full-stack`) by Claude Code, and checked route by route against the
unchanged original with `markless-migrate`. The point of this port is data fetching: the old app fetches on both sides
(server render with Apollo's `getDataFromTree`, then client-side GraphQL queries on every in-app navigation, mutations for
upvote, hide and submit, and a Passport session), so it tests whether Markless stays correct when every page waits on data.

## Result

**156 of 386 route checks green** (69 routes of the old app, all present on the new one, each checked signed out and
signed in, plus the paginated and per-item variants `plan` found), on the last full run (run 9). 253 differences were
accepted automatically by the tool (Next's route announcer); none by hand: `check` does not let an agent accept a
difference, and the ones I would ask the owner to accept are listed under "Differences that are intended".

Green: the 35 static and near-static pages that share a layout (as a group, except the six below), `/from?site=` (55
of 56), `/security`, every trailing-slash redirect, the 404, `robots.txt`, and some sample-data feeds. Red, by cause:

| Cause | Route checks | Whose |
| --- | --- | --- |
| Mid-fetch navigation: click a link then Back, or a second link, before the page arrives. On 20 the page Back returns to runs its recipes again in the browser (bug L: `POST /graphql User` and the feed's query); on most of the rest a superseded navigation ends on a page that differs from a fresh load of where it ended, or shows in-between views, sometimes with `MARKLESS_STREAM_ARM_TEMPLATE_MISSING` | 199 (79 of them red for nothing else) | Markless (L reproduced; the second not reduced to a repro) |
| `MARKLESS_STREAM_ARM_TEMPLATE_MISSING: boundary:1` in the console after an in-place navigation, mostly to item pages | 55 (mostly `/item`, both roles) | Markless (not reduced to a repro) |
| A control the old page has not found on the new page during a journey, mostly the signed-in header's "logout" and own-user links, while a direct load shows them: under the machine's load (load average 40 to 60) the header's `@try` streams its `@pending` arm first | 101 (19 red for nothing else) | open: not reproduced outside the check |
| Upvote or hide sends the refetch (`topNewsItems`, or `User` when it lands on the login page) | 35 | the normalized-cache gap (intended, below) |
| React's repair of invalid nesting in six static pages (`/changepw`, `/front`, `/leaders`, `/newsfaq`, `/newsguidelines`, `/showhn`): the old DOM is what React built, the new is what the HTML parser builds from the same markup | 19 accessibility tree, 11 visible text, 4 css | intended (below) |
| Page load FCP on seven routes: HTML sent uncompressed by Nitro's Node server | 7 | hosting (below) |
| Text that follows the clock, signed in: the 40-day look now loads signed out (#232) on both sides, and the new page's server-rendered times did not move with it | 10 | the tool: #232 kept the server clock still for signed-in looks; fixed forward in #247 |
| `/reply` does not send the old page's unused `Comment` query | 2 | intended (below) |

### Differences that are intended

- **One extra query after each upvote or hide** (the refetch): Apollo's normalized cache has no Markless equivalent,
  and the shapes that would merge answers locally hit bugs A, A'', B and C.
- **The router's in-place navigation and idle prefetch** where the old app did full loads for its plain `<a>` links:
  the router's default, measured faster (see Measurements); it is why navigations send `GET /_markless/fragment/...`
  instead of the old page's browser `POST /graphql`.
- **The six static pages' DOM**: the new page is what the HTML parser makes of the old page's own markup; matching
  React's repair would mean writing different markup than the old source.
- **`/reply` leaves out a query whose answer the old page never shows.**
- **HTML not compressed by the local Node server**: Next's server compresses, Nitro's does not; any CDN in front
  compresses it.


## What was migrated

| Part | Upstream | Commit | Licence |
| --- | --- | --- | --- |
| Old app | [clintonwoo/hackernews-react-graphql](https://github.com/clintonwoo/hackernews-react-graphql): Next.js 12.0.8, React 17, Apollo Client 3.5, Apollo Server 3 on Express 4, Passport local, express-session | `6875c72` (2022-02-15) | Apache-2.0 (`hn-graphql-markless/LICENSE-hackernews-react-graphql`) |
| Data | the Hacker News Firebase API, as a recorded slice (`deploy/hn-graphql/hn-snapshot.json.gz`) | recorded 2026-10-25T00:36:51Z | |

37 pages (and Next's 404): ten GraphQL feeds (`/`, `/news`, `/newest`, `/best`, `/ask`, `/show`, `/shownew`, `/jobs`,
`/upvoted`, `/favorites`), nine feeds drawn from the app's own sample data (`/active`, `/bestcomments`, `/newcomments`,
`/noobstories`, `/noobcomments`, `/threads`, `/submitted`, `/newpoll`, `/hidden`), the item page with its comment tree,
the user page (public, and the signed-in user's own form), `/login` with sign-in and create-account, `/submit`, `/reply`,
and fourteen static or near-static pages.

What is not ported: the GraphQL server. The brief was to port the pages; the data layer is the backend's. The port's pages
read `/graphql` exactly as the old pages did, with the same documents (fragments included), the same `operationName`s and
variables, and forward `/graphql`, `/login`, `/register` and `/logout` to the old Express server (`middleware/request.ts`).

## Getting the old app to run (2022 code, unchanged)

The source is unchanged. Three environment shims, all outside the app:

1. **Node 16** (`fnm install 16`, 16.20.2 arm64). The Dockerfile pins Node 14.17, which has no arm64 build; `engines` says
   `>=14.16`. Dependencies with `npm ci --legacy-peer-deps`: the lockfile came from npm 6, which ignored peer ranges, and npm 8
   refuses `react-apollo@3.1.5`'s peer `apollo-client@2`.
2. **`next build --no-lint`**: the repo's own `npm run build` fails in `next build`'s lint step (eslint errors in its own
   source: `@typescript-eslint/interface-name-prefix` no longer exists in the pinned plugin). Then `tsc --project tsconfig-server.json`
   as its script does.
3. **Data**: the server reads Hacker News through the Firebase SDK (a websocket to `hacker-news.firebaseio.com`), which
   neither recorder nor replay can see, and the live site changes by the minute. `deploy/hn-graphql/firebase-rest.cjs` is a
   `node -r` preload that answers `firebase/app` and `firebase/database`'s `get(child(ref, path))` over Firebase's REST API at
   the app's own `DB_URI` (`<DB_URI>/v0/<path>.json`, the same URLs the REST API has), and `deploy/hn-graphql/hn-api.mjs`
   serves a recorded slice there (`snapshot.mjs` recorded it: 120 top and new stories, 60 best, 30 each of show/ask/jobs, the
   full comment trees of the six top stories, every submitter).

Accounts live in the server's memory, so every run starts with fresh servers (`deploy/hn-graphql/local.sh`) and creates the
account it signs in with (`deploy/hn-graphql/signin.mjs`, the old app's own `/register`).

```bash
deploy/hn-graphql/local.sh          # snapshot API :4870, old app :4871, the new app's backend :4874, new app :4872
deploy/hn-graphql/check.sh --all    # fresh apps, a fresh account on each, plan, then check every route
```

Each app gets its own backend process (the old app is its own; the new app's is a second copy of the old server), both on
the same snapshot, so a journey's upvote on one app cannot change what the other shows, and writes are sent (both are on
this machine).

## How the port is built

- **Data: `computed(async ...)` in the page, read in `@try`.** Each page reads the session (`ME_QUERY`, as `MainLayout`'s
  `useQuery` did) and its own query (`lib/feed.ts`, `lib/item.ts`, `lib/user.ts`), each in its own `@try`. On the server the
  transport (`lib/graphql.ts`) posts to the app's own `/graphql` with the visitor's cookie, as the old server render did
  (the old app's Apollo client posted to `http://localhost:<port>/graphql`); in the browser it posts to `/graphql` with
  `credentials: 'same-origin'`, as Apollo's `createHttpLink` did. No loaders, no effects, no client cache, no status flags.
- **Mutations are plain handler code.** Upvote and hide post the mutation (one handler on the feed's `<tbody>`); a failure (signed out) goes where the old
  `onError` sent the visitor (`Router.push('/login', '/vote?id=...')` is `navigate('/login')` and `history.replaceState`
  to the masked address); success asks the page for its data again (see "Apollo features without a Markless equivalent").
- **Links are plain `<a>`.** The router navigates them in place, as `next/link` did; the old app's plain `<a>` links (the
  story titles, `More`) were full loads there and are in-place here.
- **Comment and profile HTML** (`react-render-html` in the old app) is parsed into nodes on the server (`lib/html.ts`) and
  drawn with `@for`/`@switch` (`components/rich-text.tsrx`): Markless has no way to insert an HTML string.
- **Layouts**: there is no layout file, and the session's `@try` cannot live in a shared layout component (Markless bugs F
  and G below), so each page writes the `#hnmain` table with its header `@try` and its data `@try` side by side.
- The old app's own quirks are kept: `/news` ignores `?p` (Express renders `/` without the query), `NewsFeed` drops
  `isJobListing`/`isRankVisible`/`isUpvoteVisible` (so `/jobs` looks like every feed), submit's `onCompleted` reads
  `res.data`, which Apollo never passes, so submitting never navigates, and every comment links to `/user?id=mstade`.
  One is not kept: the old `/submit` page's inline `tlen` script is HTML-escaped by React (`n &gt; 0`) and throws a
  SyntaxError on load; Markless writes it as authored, so the port has one console error fewer.

## Iterations

| # | What ran | Result | What it caught |
| --- | --- | --- | --- |
| 0 | `vp dev`, by hand | | every compile diagnostic named the authored shape and its fix (`MARKLESS_STATE_DYNAMIC_PATH_READ` for `patches[row.id]`, `TSRX2011` for a two-node arm, `MARKLESS_SHARED_RETURN_UNNAMED`, `MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT` for a `@try` reading two async values); a click on any story's arrow did nothing (`no event record matched [a]`): bugs A and B, then C, D, F, G and I on the way to a shape that works |
| 1 | `check --all`, 71 routes x 2 roles, stopped at 196 of about 200 route checks to fix what it showed | 0 green | 270 extra `rowgroup`s (one `<tbody>` per story, the first workaround for B: replaced by one handler on the `<tbody>`); every hide and upvote red on Apollo's `__typename` (tool fix #156); every in-place navigation red on the data the old app read from the browser (tool fix #175); server requests to a separate backend host instead of the app's own `/graphql` (the port now posts to its own `/graphql` on the server too, as the old app did); `<next-route-announcer>` as an unexercised control on every route (tool fix #178); scores off by one on the new app, because a hand test of mine had upvoted on its backend mid-run (every later run restarts both backends) |
| 2 | the same, stopped at 117 | 0 green | the old app's server requests now hung under the recorder: my own #160 (filing `node:http` bodies) threw on node-fetch's array-valued headers, so the old app rendered without data and fetched it in the browser. Fixed forward in #180 |
| 3 | the same, stopped at 115 | 0 green; most routes down to framework-level differences | `/best` posted `topNewsItems` where the old page posts `bestNewsItems` (and `/newest`, `/upvoted`, `/favorites` `NewestFeed`): each feed page now sends its own operation name; `/submit` sent a `text` variable Apollo leaves out (the operation does not declare it); a `<title>` inside the `WordSection1` div made its text "Hacker News CloneNo such user." for check's label match (the title now sits beside it); and every in-place navigation to an item page logged `MARKLESS_STREAM_ARM_TEMPLATE_MISSING`, which turned out to be my own `--server-clock` (#147): a clock that never moved left Markless's streaming unable to see its first-flush deadline pass. The frozen clock now starts at the frozen instant and runs on |
| 4 | `check --all`, both roles, every route to the end | 5 of 386 green | 808 "not exercised" lines: since #168 alike clickables are used in turn in one session, and signed out the first `hide` leaves for the login page, so the rest of each feed's `hide` links were never clicked (tool fix #189) |
| 5 | the same | 4 of 386 | the check's browser closed mid-run and 376 route checks failed to run at all (`http`: "the check of this route"); not reproduced on the next run |
| 6 | the same, with #175, #178, #188 and #189 | 135 of 386 green, 310 differences accepted automatically (Next's route announcer) | what is left is mostly the framework's: script weight (247), React's repair of invalid nesting (accessibility tree and visible text on six static pages), the item pages' in-place navigation (focus), and `/user`'s ME query (below) |
| 7 | the same, with compressed public files (`compressPublicAssets`) and the stylesheet preloaded | stopped after 332 of 386 | every signed-in route after the first few compared two signed-out pages: the new app's session was ended by the router prefetching the logout link (fixed in the port: `prefetch={false}`), the old app's by the check's own clock (tool fixes #225 and #232) |
| 8 | the same, with #225 | stopped after 213 | the old app's session still died partway through: the clock-shift look (#232) |
| 9 | the same, with #225 and #232, the logout link not prefetched, and `/user` sending ME only when Apollo's cache would | **156 of 386 green**, 253 differences accepted automatically, 1 not checked (an infrastructure timeout) | both sessions alive to the end. New on `main` since run 6: the mid-fetch navigation probes (click, then Back or a second link before the page arrives) found Markless bug L and more (below) |

## Apollo features without a Markless equivalent

| Apollo | What the old app does with it | Authored workaround | Cost |
| --- | --- | --- | --- |
| Normalized cache (`NewsItem:<id>`) | an upvote's answer `{ id, upvoteCount, upvoted }` updates that story's arrow and points wherever it is shown; a hide's `{ id, hidden }` removes it from the feed and renumbers the rest | the page's data recipe reads a `version` state; a mutation's handler bumps it, and the page asks for its query again. The natural Markless shape, a `state` of answers merged over the server rows in a `computed`, does not work in 0.9.0 (bugs A, B and C) | one extra request per mutation: `UpvoteNewsItem` then `topNewsItems` (old: the mutation alone) |
| Cache-first queries across navigations | `ME_QUERY` is answered from the cache after the first page; an in-app navigation sends only the page's own query, from the browser | none needed: the router asks the server for the next page, which runs both queries there | the browser makes one `GET /_markless/fragment/<page>` instead of one `POST /graphql`; the backend sees two queries per navigation instead of one |
| Cache answering one query from another | on `/user`, the page's query selects `me { id }`; the layout's `ME_QUERY` (`me { id karma }`) is then answered from the cache when `me` is null or is the user being shown, and sent (after the first, on the server) only for a signed-in visitor on someone else's page | `lib/user.ts` does the same by hand: the user query first, then `ME_QUERY` only in that one case | the same requests as the old page; one sequential query for a signed-in visitor on another user's page, as on the old |
| `getDataFromTree` (server waits for every query) | no loading state is ever served | none: Markless sends a `@try`'s `@pending` first only when its value takes over 10 ms, which these queries do not on one machine | a slow backend would show `@pending` content (the spinner) before the data; the old app would just be slower to first byte |
| `Router.push(href, as)` | the login page shown at `/vote?id=...` | `navigate('/login')`, then `history.replaceState` to the masked address | Back to that entry reloads `/vote`, a 404 on both apps (Next restores the masked page from its own state) |
| `react-render-html` / raw HTML | comment and profile text | parse on the server into a node list, draw with `@for`/`@switch` | only the tags Hacker News emits (`p`, `a`, `i`, `pre`, `code`) |
| Optimistic response, `refetchQueries` | not used by the old app | | |

## Markless bugs found (0.9.0, the published packages)

Each is a page in `hn-graphql-markless/repros/`, a small Markless app of its own (`cd repros && npx vp build && PORT=4889
node .output/server/index.mjs`, then `node probe.mjs`). `probe.mjs` drives each page in Chromium and prints expected and
actual; the `control-*` pages (and `nav-slow-data.tsrx`) are the nearest shapes that work. A to I were reproduced in a
production build and in `vp dev`; J, K and L in a production build. Last run: 14 of 14 bugs still reproduce, the 6
controls behave.

| # | Repro (`repros/pages/`) | Shape | Expected | Actual |
| --- | --- | --- | --- | --- |
| A | `derived-rows-over-async.tsrx` | `@for` over a sync `computed` derived from an async `computed`, in the page | a row's click handler runs with its row | no event record matches the click (`MARKLESS_EVENT_DISPATCH_UNMATCHED`): every row is dead |
| A' | `derived-rows-over-async-prop.tsrx` | the same, in a child component given the async value as a prop | `#out` reads `two` | the handler runs, but its row is `undefined` (`#out` is empty) |
| B | `fragment-row-handlers.tsrx` | a `@for` row that is a fragment of two `<tr>`s (Hacker News draws three per story), over plain `state` | `two` | the row is `undefined` in its handler |
| B' | `fragment-row-handlers-async.tsrx` | the same over an async value | the click refetches | no event record matches |
| C | `row-component-prop.tsrx` | each row a component with its own `state`, given its item as a prop | `one 0 two 1` | `one 0 undefined 1`: the row component's `computed` reads its prop as `undefined` once it runs in the browser |
| D | `shared-field-in-async-recipe.tsrx` | an async `computed` reading a `shared()` field before its first `await` | the served page reads `loaded 0` | the server renders `@catch`; in the browser, after a click, it works |
| F | `child-try-never-streams.tsrx`, `child-try-never-streams-prop.tsrx` | a slow (streamed) async value whose `@try` is in a child component, made there or passed in | the response ends with the settled arm | it stays on `@pending`: no streamed part is sent. A page-level `@try` streams (`control-sibling-try-streams.tsrx`) |
| G | `nested-try-never-streams.tsrx` | two slow async values, one `@try` inside the other | `pending`, then `outer` and `inner` | the outer stays `pending` and nothing streams; sibling `@try` blocks work |
| I | `rows-in-branch-lose-handlers.tsrx` | rows inside an `@if`/`@else` arm, over an async value a row click fetches again | every click counts up | the first click works; after the rows are redrawn no event record matches (`control-rows-refetch.tsrx`, the same without the `@if`, works) |
| A'' | `derived-rows-over-async-update.tsrx` | rows from a sync `computed` merging a `state` of click answers into an async value, one handler on the table | each click counts its row up in place | the first click shows nothing; every later one adds a second set of rows beside the first |
| J | `streamed-navigation-reruns-recipe.tsrx` (from `nav-start.tsrx`) | an in-place navigation by a link the router had not prefetched before the click, to a page whose async value takes over 10 ms on the server, so the fragment streams | the browser shows the value the server streamed and runs nothing | the browser runs the recipe again (a second `/api/slow`); the same page behind a link prefetched before the click is fine (`nav-slow-data.tsrx`) |
| L | `back-before-arrival-refetches.tsrx` | click a link, then Back 20 ms later, before the next page has arrived | the page Back returns to stays as served and runs nothing | its async recipe runs again in the browser (a second `/api/slow`, 5 of 5 tries in the last run): on the port, `POST /graphql User` and the feed's query, on 20 route checks |
| K | `async-prop-state-twice.tsrx` | an async value handed to a child component as a prop | the served page carries the value once in its `markless/state` | it carries it twice, as the page's `computed` and again as the child's props (`control-async-value-in-page.tsrx`: drawn in the page, once) |

What each cost the port, and the workaround it carries:

- A, A'', B, C together leave no shape for "server rows plus the answers of my mutations": hence the refetch after every
  mutation (one extra request each), instead of a `state` of answers merged in a `computed`.
- B: no row has a handler. The feed's `<tbody>` has one `onClick` that finds which story a click is on from the DOM (the
  story's item link, `lib/feed.ts` `feedAction`). The first version gave each story its own `<tbody>` instead, which
  `check` reported as 270 extra `rowgroup`s in the accessibility tree.
- D: the page's `version` is a plain `state` handed to `NewsFeed` as a callback prop (`onAnswered`), not `shared()`.
- F and G: with the session read in the header component, a signed-in visitor would have seen "login" whenever the
  session query took over 10 ms (the `@pending` arm), and nothing after. The session is read in each page, beside the data.
- I: an empty feed and a missing item are the page's `@catch` (the recipe throws), not an `@if` around the rows.
- J has no workaround in the port: it is a duplicate request on every in-place navigation whose target the router had not
  prefetched when the backend is slow. With the backend 120 ms away (a delay proxy), following `More` on `/news` made
  the browser post `User` and `topNewsItems` after the router's fragment had already run both on the server, and the
  login page reached after a signed-out hide posted `User` again. On one machine the queries take under 10 ms, nothing
  streams, and it does not show.
- K: every feed page sends its 30 stories twice in the page's state (`computed:feed` 15.4 kB and `NewsFeed`'s props
  15.2 kB on `/`): 30.8 kB of the 80.5 kB page. Drawing the feed in the page instead of `NewsFeed` would avoid it, at the
  cost of the component every feed page shares.

Smaller things seen on the way:

- In `vp dev` only, typing into the login form and submitting at once (Playwright's `fill` then `click`) is prevented with
  no message: the submit's `preventDefault` decision reads state the first input event had not delivered yet, because that
  event was still waiting for its handler's module. Not reproduced in a production build, so there is no repro for it.
- A `.tsrx` parse error in the router's anchor transform surfaced as `MARKLESS_DEV_RUNTIME_ERROR TSRX2011 ... (1065:1066)`
  with no file name (it came from a stale dev server, but the message gave nothing to find the module by).
- `@if (sel.best) { {' | '} <a>best</a> }` is refused (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`, "holds a text binding")
  for a string literal; `<>{' | '}<a>...</a></>` is accepted.
- An `@if` or `@for` arm with two sibling nodes needs a fragment (`TSRX2011`), which then makes B bite in tables.


## markless-migrate: what fell short, and the fixes

Each became a red-first test and its own PR (never part of the port's PR):

| # | What fell short | Fix | PR | State |
| --- | --- | --- | --- | --- |
| 1 | `markless-migrate recorder` printed `NODE_OPTIONS=--import=...`; Node 16 refuses `--import` in `NODE_OPTIONS`, so the old app would not start with the recorder and its server requests were never compared. Its printed line also nested double quotes | the recorder is CommonJS and loads with `--require` on any Node from 16, wraps `fetch` only where the server has one, and the line is single-quoted | [#142](https://github.com/compiled-run/markless-migrate/pull/142) | merged |
| 2 | `plan --source` read six auth guards on every route: express-session, `passport.initialize()`, `passport.session()`, Passport's sign-in handler, and the Passport strategy inside the custom server's setup function. It then wrote a starter `auth.json` for an Email/Password/"Sign in" form on `/`. No route of this app turns anyone away | session and Passport set-up middleware and `authenticate` with a success redirect are not guards; a server module's guards come only from its route chains; a guard's path argument is its login redirect, not its role | [#143](https://github.com/compiled-run/markless-migrate/pull/143) | merged |
| 3 | check froze the page's clock and not the server's, so the server-rendered "N hours ago" disagreed: the old app redraws it in the browser (React 17 patches text on hydration) and the port does not. A manual `fixed-clock.cjs` preload in both servers was needed | with `check --server-clock`, a page load check makes carries the frozen time in the recorder tag, and the recorder answers `Date.now()`/`new Date()` with it while the server handles that load. Opt-in: on by default it turned CI's next-app e2e red (a session cookie issued at the default frozen instant, 2026-01-15, is already expired by the browser's real clock) | [#147](https://github.com/compiled-run/markless-migrate/pull/147) | merged |
| 4 | plan listed what an Apollo page reads as `feed....NewsFeed`: the fragment is colocated in another file and interpolated into the query | fragment spreads resolve project-wide | [#151](https://github.com/compiled-run/markless-migrate/pull/151) | merged |
| 5 | plan listed Apollo Server's schema (`typeDefs = gql(\`type Comment ...\`)`) as a Sanity GROQ client of the page | a `gql` text that starts with a type definition, and a `.graphql` file with no operation, is a schema, not a client | [#154](https://github.com/compiled-run/markless-migrate/pull/154) | merged |
| 6 | every GraphQL request a port sends with its own client was red against Apollo, which adds `__typename` to every selection set | `__typename` below the root, unaliased, is cut from the compared query text | [#156](https://github.com/compiled-run/markless-migrate/pull/156) | merged |
| 7 | the old app's server-side GraphQL queries were all a bare `POST /graphql`: node-fetch posts through `node:http`, filed without a body | `node:http` request bodies are filed (the response is still the app's) | [#160](https://github.com/compiled-run/markless-migrate/pull/160) | merged |
| 8 | #160 threw on node-fetch's array-valued headers, so the old app's requests never went out under the recorder | array headers read; filing can no longer throw into the app's request | [#180](https://github.com/compiled-run/markless-migrate/pull/180) | merged |
| 9 | every in-place navigation was red: Apollo posts the next page's query from the browser, the Markless router fetches the next page from the server, which runs the query there | on a navigating step where either side fetched the landing page through its framework (in the step or prefetched), reads are left out; writes are still compared | [#175](https://github.com/compiled-run/markless-migrate/pull/175) | merged |
| 10 | `<next-route-announcer>` was an unexercised clickable on every route | framework markup is no control | [#178](https://github.com/compiled-run/markless-migrate/pull/178) | merged |
| 11 | the same error logged on both apps was red: its stack names each framework's bundle chunks | console errors are compared by message, stack frames left out | [#188](https://github.com/compiled-run/markless-migrate/pull/188) | merged |
| 12 | since #168 (alike clickables used in turn in one session), every `hide` after the first on a feed was "not exercised": signed out, the first one sends the visitor to the login page and the turn had nothing left to click | the members after one that leaves the page start a new turn from a fresh load | [#189](https://github.com/compiled-run/markless-migrate/pull/189) | merged |
| 13 | with `--server-clock`, every signed-in route checked after the first signed-in upvote was really signed out: the mutation ran at the frozen time, so the old server's user cache entry it wrote (2 h max age) was stale to the next request and Passport dropped the user. All 28 signed-in `/user` routes compared two signed-out pages | writes (any method but GET and HEAD) keep the real clock; only reads render at the frozen time | [#225](https://github.com/compiled-run/markless-migrate/pull/225) | merged |
| 14 | after #225 the signed-in role still lost its session partway through: the clock-shift look (#185, by another worker, after #147) rendered on the server 40 days ahead with the role's cookie, and express-session's store deleted a session it read past its 7-day expiry | for a role with a saved session the moved look keeps the server on its own clock (the browser still moves) | [#232](https://github.com/compiled-run/markless-migrate/pull/232) | merged |
| 15 | #232 itself made a false red: for the signed-in look the browser moved 40 days and the server did not, so a page the server renders (the port) kept real times while the old page's browser moved them; 10 signed-in route checks | the moved look moves the server too and loads signed out instead | [#247](https://github.com/compiled-run/markless-migrate/pull/247) | PR247 |

Also hit, already fixed on `main` by other workers before this port needed it: the crawl ran into the sample-data feeds'
endless `?p=N` pagination (`/newcomments?p=1246`, 10,000 pages, an hour of `plan`) until #116 stopped it where a page
repeats an earlier one apart from its numbers.


## Measurements

All on one machine (Apple Silicon), production builds, fresh servers on the recorded snapshot.

### Data journeys, request by request

`deploy/hn-graphql/journeys.mjs <origin> [--cpu 4]`: the app's own requests per step (scripts, styles and images left
out), time from the step's start to its first request, and to the result being on screen. Unthrottled / 4x CPU:

| Step | Old requests | Old shown | New requests | New shown |
| --- | --- | --- | --- | --- |
| load `/` | `GET /` | 99 / 239 ms | `GET /` + 6 idle prefetches | 62 / 108 ms |
| `More` (page 2) | `GET /?p=2` (a full load) | 86 / 166 ms | `GET /_markless/fragment/?p=2` (in place) + 6 prefetches | 64 / 80 ms |
| a story's age link to its item page | `POST /graphql NewsItemWithComments` (browser) | 54 / 94 ms | none of its own: the page was already prefetched; 6 prefetches | 50 / 48 ms |
| Back to the feed | none | 10 / 33 ms | none of its own; 6 prefetches | 8 / 19 ms |
| upvote, signed out | `POST /graphql UpvoteNewsItem` | 51 / 62 ms | `UpvoteNewsItem`, `GET /_markless/fragment/login` + 1 prefetch | 97 / 106 ms |
| create account | `GET /login`, `POST /register`, `GET /user?id=...` | 145 / 202 ms | the same three + prefetches | 103 / 175 ms |
| home, signed in | `GET /` | 63 / 124 ms | `GET /` + 6 prefetches | 37 / 66 ms |
| upvote #1 | `POST /graphql UpvoteNewsItem` | 46 / 61 ms | `UpvoteNewsItem`, then `topNewsItems` | 50 / 106 ms |
| hide #2 | `POST /graphql HideNewsItem` | 52 / 58 ms | `HideNewsItem`, then `topNewsItems` | 43 / 75 ms |
| `new` then `show` at once (navigating mid-fetch) | `POST /graphql NewestFeed`, `POST /graphql topNewsItems` | 89 / 174 ms | `GET /_markless/fragment/newest` (abandoned), `/show` was prefetched; lands on `/show` with its own data | 121 / 167 ms |
| submit page | `GET /submit` | 35 / 79 ms | `GET /submit` + 3 prefetches | 19 / 67 ms |
| submit | `POST /graphql SubmitNewsItem`; stays on `/submit` (the old `onCompleted` bug) | 835 / 869 ms | the same | 827 / 845 ms |

Click to first request: within a few ms of each other on every step (old 22 to 62 ms, new 11 to 84 ms; both include
Playwright's own click latency). Nothing waterfalls on one machine, and no request repeats within a step. Three things
the new app sends that the old does not:

- **The refetch after each mutation** (the normalized-cache gap above): one extra `topNewsItems` per upvote or hide,
  which costs about 45 ms more until the arrow disappears at 4x CPU.
- **Idle prefetch of linked pages**: after every page load and navigation the router fetches up to six visible links'
  pages ahead of any click, item and user pages included, and each is a server render with its two GraphQL queries:
  up to 12 backend queries per page view that nobody may use. The old app's `next/link` prefetches only those pages'
  code. This is the router's default; the port keeps it, with one exception: the logout link is
  `<Link prefetch={false}>`, because Hacker News logs out with a GET (see below).
- **Bug J under a slow backend**: with 120 ms between the app and its GraphQL server (a delay proxy), `More` on `/news`
  made the browser post `User` and `topNewsItems` again after the router's fragment had run both on the server, and
  the login page reached after a signed-out hide posted `User` again. That is a duplicate request per navigation to a
  page the router had not prefetched. On one machine nothing streams and it does not show.

Found while checking: before `prefetch={false}`, the router's idle or hover prefetch of the header's logout link
(`/logout?auth=...`, a GET that ends the session) logged every signed-in visitor out the moment the link was on
screen long enough. The old app's link is a plain `<a>`, never prefetched.

### JavaScript at load

Coverage in Chromium after load and 1.5 s of idle (uncompressed bytes; "run" counts bytes inside functions that ran):

| Route | Old downloaded / run | New downloaded / run |
| --- | --- | --- |
| `/` | 817 kB in 24 scripts / 361 kB | 20 kB in 6 scripts / 13 kB |
| `/item?id=...` | 850 kB / 362 kB | 20 kB / 13 kB |
| `/login` | 429 kB / 171 kB | 18 kB / 9 kB |
| `/user?id=...` | 809 kB / 362 kB | 19 kB / 13 kB |

The new app's figure leaves out what the router modulepreloads at low priority for later navigations: `check` counts
it, about 800 kB uncompressed (172 kB compressed as served) against the old 817 kB (246 kB gzip) on `/`, none of it run
at load.

### Responsiveness (`check`, run 6)

Slowest first interaction: old 98 ms, new 32 ms (desktop); old 118 ms, new 32 ms (4x CPU, mobile). Slowest navigation
from a control: old 290 ms, new 208 ms (desktop); old 297 ms, new 254 ms (4x CPU).

### Page load (Lighthouse mobile, `check --only load`, median of 5)

| Route | Old FCP / LCP / score | New, as first built | New, with `compressPublicAssets` |
| --- | --- | --- | --- |
| `/` | 756 ms / 2.03 s / 99 | 1.21 s / 3.76 s / 89 | 1.20 s / 2.26 s / 99 or better |
| `/item?id=...` | 755 ms / 1.96 s / 99 | 909 ms / 3.91 s / 88 | 903 ms / within noise / 99 or better |

The LCP gap was Nitro's Node server sending files uncompressed (`news.css` 10.9 kB against 2.6 kB, the scripts 5x),
fixed by `compressPublicAssets` as two other ports here do. FCP stays about 450 ms worse on `/`: the HTML itself is
sent uncompressed (80.5 kB, against the old server's 6.5 kB gzip of 42.8 kB). Nitro has no compression for rendered
responses; Next's server compresses them. On a host or CDN that compresses (Vercel does) the HTML is 11.8 kB gzip.
It is also twice the old page's size before compression: 30.8 kB of it is bug K (the feed's 30 stories twice in the
page state; Apollo's cache in the old page is 10.4 kB).

## Deploy

Not deployed. The port needs the old app's Express server behind it (Apollo Server, Passport, and the accounts and
sessions it keeps in process memory, over a Firebase API this repo replays from a snapshot). On serverless functions
each instance would have its own accounts and sessions, so signing in on one request and upvoting on the next would
fail at random; a faithful deploy needs one long-lived Node process for the backend, which `deploy/` has no pattern for.
Everything runs locally with `deploy/hn-graphql/local.sh`.

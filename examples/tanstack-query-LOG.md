# Migration log: TanStack Query kitchen sink (React) to Markless

TanStack Router's `kitchen-sink-react-query-file-based` example, ported to Markless 0.9.0 (the published packages) by
Claude Code and checked route by route against the unchanged original with `markless-migrate`. The point of this port
is client data fetching under load: dependent queries, prefetch on hover, mutations that invalidate and refetch,
search-param-driven reads, and clicks faster than the network.

## What was migrated

| Part | Upstream | Commit | Licence |
| --- | --- | --- | --- |
| Old app | [TanStack/router `examples/react/kitchen-sink-react-query-file-based`](https://github.com/TanStack/router/tree/main/examples/react/kitchen-sink-react-query-file-based) (React 19.3.1, `@tanstack/react-router` 1.170.46, `@tanstack/react-query` 5.104.5, Vite 8) | `da2adec76dbe6c0da6d6a0d5640f7b9388217f45` | MIT (`LICENSE-tanstack-router`) |

`deploy/tanstack-query/fetch-old.sh` copies just that example out of the TanStack repo at that commit into
`../mm-upstreams/kitchen-sink-react-query`, installs and builds it; its source is not changed.
`deploy/tanstack-query/serve-old.ts` serves the build as a single-page host does (every unknown path gets
`index.html` with 200).

The new app was made with `npm create markless@0.9.0 -- tanstack-query-markless --yes --starter minimal --agents
claude-code --no-git --no-workspace` and pins `@markless/*` 0.9.0, `vite-plus` 1.3.0, `nitro` 3.0.260903-beta. The
old app's built CSS (Tailwind 4, `dist/assets/index-3hmDRWSn.css`) is copied byte for byte to `public/assets/`.

What the old app does, and the data paths the check has to exercise:

| Route | Data | Interaction |
| --- | --- | --- |
| `/dashboard` | invoices count (`useSuspenseQuery`) | |
| `/dashboard/invoices` | invoice list | create form: `useMutation`, then `invalidateQueries()` refetches the list; "Creating ⍥", "Created!", "Failed to create." (a title with "error") |
| `/dashboard/invoices/$id` | list + one invoice | edit form (`invalidateQueries()` refetches both), "Show Notes" toggles `?showNotes`, the notes textarea writes `?notes=` on every key |
| `/dashboard/users` | user list (once), sorted and filtered in the browser | sort `<select>` and filter box write `?usersView={...}` (JSON in the address) on every change |
| `/dashboard/users/user?userId=` | list + one user (`loaderDeps` on the search param) | |
| `/login`, `/profile` | in-memory auth; `/profile`'s `beforeLoad` redirects to `/login?redirect=/profile` | |
| every page | a sandbox panel: loader delay (Fast 150 ms, Fast 3G 500 ms, Slow 3G 2000 ms, a slider) and TanStack's `defaultPendingMs`/`defaultPendingMinMs`, kept in sessionStorage | |

The mock API (`src/utils/mockTodos.ts`) fetches `jsonplaceholder.typicode.com/posts` and `/users` once per tab, keeps
them in memory, and waits `sessionStorage.loaderDelay` ms before every read (`null`, so 0 ms, on the very first reads
of a fresh tab; 500 ms after the panel has mounted). Every link preloads on intent (`defaultPreload: 'intent'`,
`defaultPreloadStaleTime: 0`).

## Running it locally

```bash
deploy/tanstack-query/fetch-old.sh                       # old app, built
node deploy/tanstack-query/serve-old.ts 4520            # old on :4520
cd examples/tanstack-query-markless && npm install && npx vp build
KS_TRACE=1 PORT=4521 HOST=127.0.0.1 NODE_OPTIONS='--require="../../src/check/record-server.cjs"' node .output/server/index.mjs > /tmp/new-server.log
node ../../src/cli.ts plan --old http://127.0.0.1:4520 --source ../../../mm-upstreams/kitchen-sink-react-query
node ../../src/cli.ts check --all --old http://127.0.0.1:4520 --new http://127.0.0.1:4521 \
  --source ../../../mm-upstreams/kitchen-sink-react-query --new-source .
node ../../deploy/tanstack-query/measure.ts http://127.0.0.1:4520 http://127.0.0.1:4521 /tmp/new-server.log
```

`.migrate/accepted.json` is a copy of `deploy/tanstack-query/accepted.json`.

## Deployed

`deploy/tanstack-query/deploy.sh old|new|front` builds each app as Vercel Build Output and deploys it:

| | URL |
| --- | --- |
| Old app (the example's own build on a static host) | https://mm-tanstack-query-old.vercel.app |
| New app (the port, a Nitro function) | https://mm-tanstack-query-new.vercel.app |
| Front door and check report | https://mm-tanstack-query.vercel.app (report at `/_migrate/report.html`) |

No page is switched to the new app, because no page route is green, so the front door serves the old app on every
address. The port keeps one store per tab in its function instance's memory; when Vercel answers a later request from
another instance, that tab's data starts over (a created invoice can disappear). The old app keeps its data in the
tab, so it never does. Smoke-tested after deploying: creating an invoice on the deployed port showed `#11` in the list,
and the Users tab loaded.

## Results

The last full `check --all --no-cache` (2026-10-25, the CLI with every fix below merged locally): **21 of 48 routes
green, 27 red**, 518 accepted differences. The route list has 21 of 21 old routes present on the new app. After that
run one more accepted entry was added (the tab cookies listed when Back leaves the app, below); it covers 8 failures on
routes that stay red for other reasons, so the count of green routes does not change.

What is green is not the interesting part: the 20 trailing-slash forms (compared as redirects) and the not-found page.
**None of the 21 page routes, and none of the 6 `?showNotes=true` variants, is green.** What keeps each one red, in
journey steps that are not accepted:

| Cause | Steps | Routes | Whose |
| --- | --- | --- | --- |
| The browser fetches again what the server already rendered after an in-place arrival (M1) | 517 | all 20 data routes | Markless |
| A view the old page never showed between a step and its result: the superseded page in a race, or `@pending` after a mutation | 19 | 17 | Markless (no per-page pending hold, superseded navigation commits) |
| The `@pending` spinner turns where TanStack kept the old content (Create, Save) | 18 | 3 | follows from the row above |
| JavaScript downloaded is larger on data pages | 18 | 18 | Markless (router and runtime chunks), see Measurements |
| Focus lands on `<body>` after Back pressed before the page arrived | 13 | 8 | Markless |
| In-app link navigation slower at 4x CPU (34-48 ms old, 103-206 ms new), one first interaction (34 → 58 ms) | 7 | 6 | Markless |
| Pixels: 73 to 334 pixels (0.02 to 0.03%) around truncated invoice titles and the users page text | 5 | 3 | not traced to a cause |
| Layout shift on `/dashboard/invoices/1` (0.040 against 0.000) | 1 | 1 | the invoice form arriving after the shell |
| The modality probe found an invoice textbox again on the new page but not on the old one | 4 | 4 | checker nondeterminism on the old side, not fixed |
| The users route's modality probe sees `?usersView=%7B%7D` in the address | 1 | 1 | the accepted Users-tab difference, read by another check |

The static pages (`/`, `/expensive`, `/foo/bar`, `/login`, `/profile`, `/route-a`, `/route-b`) are red only for the
race steps (an in-between view, focus after Back) and, on two, the in-app navigation timing.

Six full runs: 17 green in the first five (the same trailing-slash forms), 21 in the last. The four new greens are the
not-found page and the three slashed forms of client-redirect routes (#191). Between runs the red steps changed far
more than the green count did: the tool fixes (#148, #158, #159, #179) and the port's own fixes turned several hundred
red steps into passes or accepted differences, while #152 and #153 added the pending-view and race steps that are red.

## Accepted differences

In `deploy/tanstack-query/accepted.json` (a copy of `.migrate/accepted.json`), each matched narrowly by its expected and
actual text:

| What differs | Why it cannot match |
| --- | --- |
| Cookies the old app does not set: `kitchen-sink-tab` (HttpOnly, per tab) and `loaderDelay`, `pendingMs`, `pendingMinMs` | The old app keeps its data and sign-in in tab memory and its panel settings in sessionStorage. Markless renders every page, in-place navigations included, on the server, which needs both with each request; a cookie is the only thing a navigation fetch carries. The sessionStorage keys are still written exactly as before |
| The same cookies, listed beside the sessionStorage keys when Back leaves the app (an invoice page's race on the link to itself adds no history entry, so both apps go back to the blank tab) | What the tab keeps after leaving: the cookies above |
| Each sandbox-panel control also changes the cookie of the same name | The same mirror, so the server waits as long as the old app's mock did, and a reload renders the panel with the stored values |
| Create, Save, Login and Log out make requests (`POST /api/invoices` and `GET /api/invoices`; `PATCH /api/invoices/{id}` and the two reads; `POST`/`DELETE /api/auth`) where the old app makes none | The old app's mock API and auth live in the tab; the port's live on the server for server rendering. The calls are the same mock calls, now over HTTP (create: 2 mock calls on both sides; edit: 3 on both) |
| `/markless-migrate-no-such-page` answers 404, not 200 | The old app is a static single-page host that answers every address 200 and draws Not Found in the browser; the port answers 404 with the same Not Found page |
| The dashboard's Users tab links to `/dashboard/users?usersView=%7B%7D`, not `/dashboard/users` | TanStack's users route writes `usersView={}` into the address as it mounts, which needs code at load; the link carries it instead, so the address after the click is the old app's |

## How the port is built, and why

Markless renders every page on the server, and an in-place navigation asks the server for the next page. TanStack
Query's cache lives in the browser tab, and so does the old app's mock data. The port moves the data to the server and
keeps everything else as plain Markless:

- **Reads.** Every query is an async `computed()` in the page that shows it, read inside `@try`, with `@pending`
  showing what TanStack's `defaultPendingComponent` shows and `@catch` showing TanStack's `ErrorComponent`. Nothing
  else: no loader, no query cache, no status flag. `lib/data.ts` calls the store directly while the server renders,
  and the `api/` routes when a recipe runs again in the browser.
- **Mutations.** The create and edit forms are `onSubmit` handlers that `POST`/`PATCH` the API and then move the page's
  `version` state, which every invoice recipe reads: that is `queryClient.invalidateQueries()`. The mutation's own
  status ("Creating ⍥", "Created!", "Failed to create.") is a `state()` the handler sets, as TanStack's `useMutation`
  status is the mutation's, not the query's.
- **The mock API on the server.** `lib/store.ts` is `mockTodos.ts` with one store per browser tab. A fresh visit or a
  reload starts a tab (`middleware/tab.ts` sets the `kitchen-sink-tab` cookie), as the old app's memory starts over;
  in-place navigations, prefetches and API calls keep it. jsonplaceholder is fetched once per tab, as before. The
  sandbox panel still writes the old sessionStorage keys and mirrors each into a cookie, so the server waits as long
  as the old app did (0 ms for a fresh tab's first render, as `sessionStorage.getItem('loaderDelay')` is `null` there).
- **Search params.** The users view (`?usersView={...}`, TanStack's JSON-in-the-address format, `lib/search.ts`), the
  notes (`?notes=`, `?showNotes=true`) and the user (`?userId=`) are read from the URL on the server. Typing in the
  filter or the notes rewrites the address with `history.replaceState`, as TanStack's `navigate({ replace: true })`
  does, and filters the list already on the page; nothing is fetched, as in the old app.
- **Redirects the old app makes in the browser at load** (the users route's `usersView={}`, a fresh load of a user
  bouncing to the users list, a signed-out `/profile`) are 307s from the server.
- **Prefetch on intent** is Markless's router prefetch on hover. The Profile link has prefetch off: it is a guarded
  page, and its prefetch only fetched the redirect.

## Markless defects found (0.9.0, the published packages)

Each one is a page in [`tanstack-query-markless/repros/`](tanstack-query-markless/repros/), a small app of its own;
`repros/verify.mjs` drives every page in Chromium and prints `REPRODUCED` or `not seen`. All of them reproduced on
2026-10-25. The table in `repros/README.md` has the same list with the workaround each one cost the port.

| # | Repro | Expected | Actual |
| --- | --- | --- | --- |
| M1 | `navigation-reruns-recipe` | An in-place arrival on a page whose data is still on its way is filled by the server's streamed answer | The browser runs the recipe again after the swap: the data is fetched twice (server, then browser), and the answer shown is the browser's, about half a second after the server had it. In the port every invoice or user link the visitor clicks before its prefetch finished costs `GET /api/invoices` and `GET /api/invoices/{id}` (or `/api/users`, `/api/users/{id}`) from the browser after the server already rendered them: 517 journey steps of the last check are red for these requests alone, and two rapid clicks on users make 10 mock API calls where the old app makes 2 |
| M2 | `child-async-not-streamed` | An `@try` in a component the page renders streams its answer, as in the page | The server runs the recipe, ends the response on `@pending`, and the browser runs it again. Every async read had to move into the page component itself |
| M3 | `shared-in-async-recipe` | A recipe that reads a page-scoped `shared()` field reruns when it changes | It throws `undefined` on the server and in the browser; `@catch` shows "caught undefined" and the fetch never runs. The same throw happens in a synchronous `computed()` chained on an async one. Invalidation is a page `state()` instead |
| M4 | `state-from-prop-recipe` | A recipe that reads a `state()` seeded from a page prop reruns in the browser | When the answer comes inside the 250 ms pending deadline and the `@try` has a `@catch`, the browser evaluates the seed again with no props (`Cannot read properties of undefined (reading 'pathname')`) and the new value never shows. This is also what the `MARKLESS_SERVER_ONLY_PROP_BROWSER_READ` diagnostic tells you to write (`let value = state(http.someField)`). The port writes every prop-seeded state as `onServer ? <prop> : <the browser's own copy>` (`lib/where.ts`) |
| M5 | `async-row-reads-prop` | An `@for` row inside `@try` that reads a page prop renders when the list changes in the browser | The row is added and the page throws `reading 'pathname'`: the browser evaluates it with no props. The port marks the active row in the recipe |
| M6 | `arm-link-handler` | An `<a onClick>` inside `@try` runs its handler after an in-place arrival | The router follows the link instead; a `<button>` beside it works. The invoice page's "Show Notes" link carries the `href` its handler pushes, so following it ends in the same place, one round trip later |
| M7 | `sync-from-pending-async` | A synchronous `computed()` over an async one waits for it | After an in-place arrival it runs while the async value is pending, reads `undefined` and throws `is not iterable`. The users list guards with `Array.isArray` |
| M8 | `empty-derived-list-attribute-rows`, `empty-derived-list-pending` | A filtered list that becomes empty shows no rows | When the rows carry an attribute (or the `@try` has a `@catch`), an empty list switches the `@try` to `@pending` for good: typing a name that matches nobody showed a spinner where the list was, and it never came back. The users list keeps one hidden row when nothing matches |
| M9 | `empty-derived-list-with-empty` | An `@empty` arm shows while the list is empty | `Failed to execute 'removeChild' on 'Node'`, and the rows never come back |
| M10 | `loop-variable-shadows-async` | `@for (const item of rows)` beside an async `computed()` named `item` renders both | The response never ends; the server spins at full CPU and its memory grows (463 MB in 4 s) until it is killed, and answers nothing else. Looping over the async list itself, the build refuses it with a misleading `MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT`. Found because the users page's rows were called `user` beside the `user` recipe |
| M11 | `async-optional-and-whole` | `{data?.text}` beside `{JSON.stringify(data)}` streams in | The stream ends after `@pending` (`net::ERR_INCOMPLETE_CHUNKED_ENCODING`) and the page never finishes loading. The user recipe returns the two strings it shows |
| M12 | `textarea-value` | `<textarea value={text}>` shows the text | The server writes a `value` attribute, which a textarea ignores: the invoice body was empty. The text is the textarea's child |
| M13 | `assignment-value` | `f((count = 5))` passes 5 | It passes `undefined`; the sandbox panel stored the string "undefined" this way |

Two more seen in the port, without a repro of their own:

- **A superseded navigation still commits.** Clicking one user and then another 100 ms later, the first user's page is
  on screen for a moment before the second's (TanStack shows neither until the second is ready); the `check` race
  journeys show the same for Home then Dashboard (`shows 1 view in between for 245 ms ("Summary Invoices Users
  dashboard! ...")`). The final page is right; nothing stale wins.
- **Focus after Back.** Following a link and pressing Back before the page arrives leaves focus on `<body>`; TanStack
  keeps it on the link (13 journey steps in the last check).
- **`MARKLESS_STREAM_ARM_TEMPLATE_MISSING: boundary:0`** was thrown in the browser twice in 11 runs of: load
  `/dashboard/invoices`, create an invoice at once, wait 5 to 8 s, follow the Users tab. The users page showed and
  worked each time; no other effect was seen, and it did not reproduce on demand, so there is no repro page.

Already fixed upstream, after 0.9.0: a form whose `onSubmit` calls `preventDefault()` is still submitted by the browser
when its handler loads on first use (Markless #205). The sign-in form posted a GET to `/login?` and lost the tab; the
port's forms carry `method="dialog"`, which submits nowhere.

## What TanStack Query does that Markless has no clean equivalent for

| TanStack Query | In the port | What it costs |
| --- | --- | --- |
| A cache shared across routes: going back to a page renders its cached data at once and refetches in the background | Every page asks the server, and the server reads the mock API again | Revisiting a page waits for the data again (500 ms with the panel's default); the check's navigation timings stay faster on Markless at load because the old app renders nothing until its JavaScript runs |
| Keeping the current page on screen while the next one loads (`defaultPendingMs: 1000`, `defaultPendingMinMs: 500`, a spinner on the link and in the header) | Markless holds the old page for 250 ms, then shows the next page's `@pending` for at least 200 ms; both are framework constants, with no per-page or per-link setting | Every navigation with the 500 ms delay shows the pending view for about 250 ms where TanStack showed none (`(part of the page gone)` in the check). The panel's two pending sliders are kept and stored but change nothing |
| A refetch after a mutation keeps the old data on screen (`isFetching`, no suspense) | The recipe re-runs and `@try` shows `@pending` again past the 250 ms deadline | Saving an invoice replaces the form with the pending view for about 600 ms (the list kept its rows); TanStack kept the form and swapped the new title into the list |
| `onSuccess: () => invalidateQueries()` holds the mutation pending until the refetch is done | The handler moves `version` and sets "success" at once | "Created!" appears about 500 ms before the list shows the new invoice; TanStack shows both together |
| A "refreshing" indicator next to stale data, background refetch on window focus | Not ported: nothing in the old app showed one, and Markless has no way to read "a recipe is running again" without a status flag | None for this app |
| Prefetch on intent only (`defaultPreload: 'intent'`) | Markless's router also prefetches visible links when the browser is idle | Each page load renders the dashboard, invoices and users pages on the server once more (about 3 extra mock API reads per load, `serverCalls` in the measurements) |
| A route that writes its default search into the address as it mounts | A server redirect on a document load; the in-app Users link carries `?usersView=%7B%7D` itself | The link's `href` differs (accepted, below) |
| Tab memory as the data store | One store per tab on the server, keyed by a cookie | Cookies the old app does not set (accepted, below); on Vercel, a tab whose requests reach another function instance starts over |

## Tool problems found and fixed (each a PR with a test that failed first)

| PR | What was wrong | Fix |
| --- | --- | --- |
| [#149](https://github.com/compiled-run/markless-migrate/pull/149) | `plan` classed `@tanstack/react-query` as a parity port over `@tanstack/query-core` and printed "keep @tanstack/query-core as-is": it sent the converting agent to port a query cache, loaders and status flags | TanStack Query (and SWR) are "replaced by Markless itself: async computed() with @try/@pending/@catch, mutations in event handlers" |
| [#150](https://github.com/compiled-run/markless-migrate/pull/150) | The `auth.json` starter guessed Email, Password and "Sign in" for a sign-in form with only a "Username" box and a "Login" button | A form without a password field is read too: fill its field from `${SIGNED_IN_USERNAME}`, click its own button |
| [#148](https://github.com/compiled-run/markless-migrate/pull/148) | The old app (a static host, no recorder) fetches jsonplaceholder in the browser; the port fetches it on the server. With no old server recording, server requests were left out and every invoice and users route was red for `browser request missing` | When only the new server runs the recorder, an old browser request the new server makes while rendering is compared there, by count and shown fields |
| [#158](https://github.com/compiled-run/markless-migrate/pull/158) | Journeys abort every data call to another origin, so in every old-side journey the app's own API failed and TanStack Router showed "Something went wrong! Show Error": `check` explored the error screen (42 red steps for a button only the broken old page had) | A data GET the page's load already made, or one to a host the old source's API clients name, is answered from the run's one copy |
| [#159](https://github.com/compiled-run/markless-migrate/pull/159) | The old app answers 200 and moves the address in the browser (`?usersView={}`, a user page bouncing to the list, `/profile` to `/login`); the port answers with a 307 to the same address. `http` reported a different redirect chain | When every old load sat at one other address after loading and the new redirects end exactly there, it is the same answer |
| [#152](https://github.com/compiled-run/markless-migrate/pull/152) | Steps were compared once settled, so a loading view the old page never showed (Markless's `@pending` after 250 ms on every navigation here) was invisible to `check` | The reaction watch reads the painted text once a frame: views between the step and its result that no old run showed, for 100 ms or more, are red, with what they showed and for how long |
| [#153](https://github.com/compiled-run/markless-migrate/pull/153) | Every journey waited for the page to settle between steps, so nothing checked a click faster than the network | The first two links of a link group race (the second 60 ms after the first, and Back 60 ms after the first), and the page the race ends on must equal a fresh load of its address; the first search box is also typed key by key, 150 ms apart. A second commit came out of the full check: where Back leaves the app (the invoice pages, whose first raced link is the page itself, so no history entry is added), the step threw "Execution context was destroyed" on the side that left faster and was reported as a control that could not be used, on 9 routes |
| [#191](https://github.com/compiled-run/markless-migrate/pull/191) | #159 applied to the page route only: the trailing-slash forms `/dashboard/users/`, `/dashboard/users/user/` and `/profile/` stayed red for the same redirect, and the route list called `/dashboard/users`, `/dashboard/users/user` and `/profile` missing (`old 200, new 307`), which `switch` refuses for good. Both apps end at the same address for all six | When the old app answered with one 2xx and the new one redirects, the redirect check and the route list load the old route once in a browser and apply #159's rule |
| [#179](https://github.com/compiled-run/markless-migrate/pull/179) | An accept entry's `check` glob was matched like a route: `*` stopped at `/`, and journey steps name addresses, so `"check": "*"` silently matched none of the "after arriving from / by link" steps. And a run limited to some routes called entries for other routes stale ("remove them") | `*` in a check glob matches any text; a partial run judges only entries for exact routes |
| [#187](https://github.com/compiled-run/markless-migrate/pull/187) | `run --agent claude-code` (the name `setup` uses) failed: run only knew `claude` | run takes the setup names too (`claude-code`, `gemini-cli`, `github-copilot`) |

All ten are merged (2026-10-25), each once its CI was green; none had review findings, human or bot. Three CI reds
on the way were in tests these PRs do not touch and were rerun with the reason on the PR: a page-load timing on #149,
a Vue dev-build trace on #187, and on #153 a Recharts pointer test and the memory check (measured first: the heap after
the last route was 103.2 MB with and without #153; both tests were since fixed on main).

Found while doing this and not fixed:

- The timed loads hold an old page's 1 to 3 s timeouts while a step is read, which is where the old app's mock waits
  when the panel says Slow 3G (2,000 ms); the port waits on its server, which nothing holds. After "Slow 3G" and a
  reload, the old page is read still loading and the new one loaded (`click button "Slow 3G" (step 4 of 5: reload after
  use 3)`).
- An accepted difference stops matching when the same step also differs in another way. The Create and Log out
  entries accept the API requests; every Create step is now also red for its pending view (`shows 2 views in between
  ... "(part of the page gone)"`), and the check reports both entries as matching nothing ("remove them"). They are
  kept: the request difference is still there, inside a failure that is red for another reason.
- The signed-in role cannot be checked by loads on this app at all: its sign-in is tab memory, so a page loaded with
  the role's saved storage state is signed out again. Only journeys that sign in and then navigate in place reach
  `/profile` signed in; `plan` still proposes the role.

## Letting an agent port routes: `run --agent claude`

On a copy of the finished port without `/expensive` and `/foo/bar`, `run --agent claude --route /expensive --route
/foo/bar --attempts 1 --agent-timeout 20 --serve "node .output/server/index.mjs" --build "./node_modules/.bin/vp build"`
(Claude Code on its own login; `.migrate/run.log`):

| Route | What Claude Code did | Result |
| --- | --- | --- |
| `/expensive` | Wrote `pages/expensive.tsrx` in the port's own pattern (the one-line page inside `Shell`), correct on the first try. Then spent most of its 18 minutes on the failures that are Markless's (M1 and focus after Back): it added a document-level click listener that refocuses the clicked layout link after each in-place navigation, and turned prefetch off on the Users tab. It said it could not start a server to test, and that the stale-accept warnings asked it to delete entries it was not allowed to edit | Red after the re-check, for the framework failures alone (focus after Back, the router's slower in-app navigation at 4x CPU). The page itself matches. The focus script is the kind of hand-written effect the port avoids, and was not kept |
| `/foo/bar` | Ported TanStack's `validateSearch` error faithfully (zod's message, `ErrorComponent`), as a helper that returns either the search or an `Error`, and an `@if (result instanceof Error)` | Timed out at 20 minutes; the page does not build: Markless refuses the helper's return (`MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED`) and the global `Error` in the template (`MARKLESS_TEMPLATE_READ_UNDECLARED`) |

What it showed about the tool: `run --agent claude-code`, the name `setup` uses, failed at once (fixed in #187), and
each one-route attempt's report told the agent to delete accepted entries that match on other routes (fixed in #179).

## Measurements

Lab numbers on an Apple-silicon laptop, both apps on this machine; old is the Vite production build on a static
server, new the Markless production build on Nitro. JavaScript and first interaction are from `check`; the journeys
are `deploy/tanstack-query/measure.ts` (one run each, a fresh tab per run, the panel's default 500 ms loader delay).

**JavaScript per route** (uncompressed, from the last `check --all`; "run at load" is V8 coverage):

| Route | On the wire, old → new | Run at load, old → new |
| --- | --- | --- |
| `/`, `/expensive`, `/route-a`, `/route-b`, `/login`, `/profile`, `/foo/bar` | 433-446 kB → 318-431 kB | 121-130 kB → 10.0-10.4 kB |
| `/dashboard` | 443 kB → 415 kB | 136 kB → 48 kB |
| `/dashboard/invoices` | 450 kB → 452 kB | 142 kB → 115 kB |
| `/dashboard/invoices/{id}` | 450 kB → 511 kB | 155 kB → 123 kB |
| `/dashboard/users`, `/dashboard/users/user` | 444-446 kB → 452 kB | 164-172 kB → 115 kB |

Markless runs 21 to 92% less JavaScript at load, but downloads more on the invoice and user pages: the modulepreloaded
router and runtime chunks (`chunk-SXLl7TJT.js` 134 kB, `chunk-qubcHbDO.js` 59 kB) and the invoice page's render data
(`chunk-0Y6kNk0v.js` 58 kB). `weight` is red on 18 routes for that (the 10 invoice pages, their 6 `?showNotes` forms
and the 2 users pages). The old app's download moved by up to 17 kB between runs; the new app's did not.

**First interaction and navigation** (`check` responsiveness, slowest control or link per side, 4x CPU on a phone-sized
page / desktop): first interaction old 78 ms → new 58 ms (desktop 48 → 50 ms); navigation old 606 ms → new 206 ms
(desktop 592 → 112 ms). Navigation is faster because a Markless page arrives as HTML where the old app runs React and
the router first; within a loaded app the old one is faster at following links between pages it has cached (34-48 ms
old against 103-206 ms new at 4x CPU, red in `responsiveness` on 6 routes, with `/foo/bar`'s first click on "Show
Error", 34 → 58 ms). The previous full run measured first interaction 109 → 131 ms at 4x CPU, so the first-interaction
gap is within run-to-run noise; the navigation gap is not.

**Data journeys** (`measure.ts`; "mock calls" are calls of the old app's mock API functions, in the browser for old and
on the server for new, `KS_TRACE`; requests are the new browser's to its own origin, the old app makes none):

| Journey | Requests old → new | Mock calls old → new | Click to fetch start | Click to result old → new | Area swaps / pending visible old → new |
| --- | --- | --- | --- | --- | --- |
| Create an invoice | 0 → 2 (`POST /api/invoices`, `GET /api/invoices`) | 2 → 2 | 1 ms → 1 ms | 533 → 550 ms | 1 / 0 ms → 1 / 0 ms |
| Edit an invoice | 0 → 3 (`PATCH`, then both reads) | 3 → 3 | 1 ms → 1 ms | 533 → 548 ms | 1 / 0 ms → 1 / 0 ms (the list; the form shows `@pending` for about 600 ms, see the check) |
| Hover a link 600 ms, then follow it | 0 → 3 (the hovered page's fragment, plus 2 idle prefetches) | 1 → 4 | prefetch started 583 ms before the click → 51 ms after | 14 → 51 ms | 1 / 0 → 1 / 0 |
| Follow a user, then another 100 ms later | 0 → 8 | 2 → 10 | 3 → 1 ms | 650 → 1,467 ms | 1 / 0 → 4 / 1,416 ms (the first user's page shown in between) |
| Follow an invoice, then Back 100 ms later | 0 → 6 | 1 → 7 | 4 → 1 ms | back at once on both | 0 / 0 → 2 / 67 ms |
| Type "clem" into the users filter, 150 ms a key, 300 ms answers | 0 → 0 | 0 → 0 | none: the filter never fetches, in either app | 629 → 640 ms | 2 / 136 ms → 2 / 150 ms; layout shift 0.015 → 0.001 |

The duplicated requests and mock calls in the two rapid journeys and the hover are M1 (the browser fetches again what
the server already rendered) and the router's idle prefetch; the old app makes one call per query and reuses its cache.

**Search as you type, with answers slower than 250 ms.** This app has no search that fetches: the users filter narrows a
list already loaded, in both apps, so with the panel at 300 ms neither shows a pending view while typing (2 swaps in the
results area on both sides, 136 ms against 150 ms of intermediate results, layout shift 0.015 against 0.001). The
closest fetch-per-input path here is clicking users in quick succession, above: 4 swaps between content and the
pending view, 1,416 ms of pending view, where TanStack showed none.


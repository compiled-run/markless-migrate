# Migration log: Next.js Learn dashboard to Markless

The final example of the Next.js App Router course (`vercel/next-learn`, `dashboard/final-example`, commit
`bb25584`: Next 16.0.10, NextAuth 5.0.0-beta.25 with credentials sign-in, Postgres through `postgres` 3.4, invoice
create/edit/delete, search, pagination) ported to Markless 0.4.0 (published packages, `create-markless --starter
full-stack`) by Claude Code, and proven with `markless-migrate check`.

Result: **30 of 30 route checks green** (8 pages plus 6 trailing-slash redirects and `/query`, each anonymous and
signed in), with 6 accepted kinds of difference (52 accepted failures, listed below). `/seed` is not checked: its
GET handler writes.

## Deployed

| What | URL |
| --- | --- |
| Front door (all checked routes switched to the new app) | https://mm-next-dashboard.vercel.app, index and demo login at `/_migrate/`, report at `/_migrate/report.html` |
| Old app (Next.js, source unchanged) | https://mm-next-dashboard-old.vercel.app |
| New app (Markless) | https://mm-next-dashboard-new.vercel.app |

Demo login: `user@nextmail.com` / `123456` (the course's seed user). The two apps share the Auth.js session format
and secret, so a session made by either works in both, which the front door relies on.

`deploy/next-dashboard/deploy.sh old|new|front` builds and deploys each. The Vercel team has no database
integration installed and adding one needs a human to accept the marketplace terms, so per the brief there is no
hosted database: each app runs a seeded Postgres inside its function (`deploy/next-dashboard/embedded-postgres`,
PGlite behind the Postgres wire protocol on loopback, with TLS in front because the old app connects with
`ssl: 'require'`). The old app gets it through a deploy-only `instrumentation.ts` added to a build copy; its source
is unchanged. Data resets when a function instance starts, and two instances do not share writes. The index page
says so.

## Set-up

1. Postgres 17 from Homebrew in a private cluster (`~/.mm-pg/next-dashboard`, port 55432, SSL on with a
   self-signed certificate). Seeded through the old app's own `/seed` route; the first call failed on a race in its
   own `CREATE EXTENSION` (four `Promise.all` branches create `uuid-ossp` at once), the second succeeded. Seed saved
   with `pg_dump`, restored before every check.
2. Each app has its own copy of the seeded database (`dashboard`, `dashboard_new`). With one shared database the edit
   journey the check replays on the old app changed an invoice before the new app's pages were captured.
3. Old app: `next build` (needs the database: `/dashboard` is prerendered) and `next start -p 3100` with the request
   recorder. New app on port 47310 (4100 belonged to another worker).
4. `plan --old http://localhost:3100 --source ../../deploy/next-dashboard/old-app` (after tool fix 1): 2 crawled
   routes, 9 in source, guard on `/dashboard/*`, login at `/login`. `auth.json` uses the starter steps with
   `${SIGNED_IN_EMAIL}`/`${SIGNED_IN_PASSWORD}`; `samples.json` gives `:id` a seeded invoice.

## How the port is built

- Pages render on the server. A page reads its data with an async `computed()` whose loader takes an
  `import.meta.env.SSR` branch to the same SQL (`server/data.ts` is the old `app/lib/data.ts`), so database code
  never reaches the browser. Page links are plain `<a>`: every navigation is a document load (see limitation 14).
- Middleware reads list data before the page renders and keeps it by request, because Markless streams any async
  value slower than 10 ms and a streamed boundary refetches in the browser (limitations 18, 19).
- The session is Auth.js's: same cookie names, JWE token from `@auth/core/jwt`, same secret. `middleware/request.ts`
  ports `auth.config.ts`'s `authorized` callback, NextAuth's csrf and callback-url cookies, the proxy matcher,
  Next's trailing-slash 308s, and serves `/query` and `/seed` (Markless `api/` routes live under `/api/`).
- Writes post the form's fields to `api/` endpoints with `fetch` (Next used server actions); after a failed action
  the form is reset, as React 19 does.
- `/dashboard` is prerendered at build in Next and never revalidated, so the new app reads a snapshot taken at
  build time (`scripts/snapshot.ts`) and has no async boundary there.
- Tailwind 3 with the old config and the same autoprefixer; next/font's files and `@font-face` rules copied from
  the old build; next/image's resized copies made with sharp at the same widths as WebP, byte-identical to what Next
  sends a browser that accepts WebP; heroicons rendered once with React into one `.tsrx` per icon.

## Iterations

| # | Time | Green | What the check caught, and what changed |
| --- | --- | --- | --- |
| 1 | 123 s | 0/30 | Redirects to `/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100...` differing only by port (tool bug 2). No trailing-slash 308s. `/seed`, fetched as a data endpoint, inserted 13 invoices per load (tool bug 3), so the latest-invoices list showed one customer five times. Only the last statement of each `@try` rendered (limitation 1). 339 kB downloaded on `/` against 141 kB: one icon module's render data was 204 kB. |
| 2 | 175 s | 12/30 | Fragments, one module per icon and skeleton, trailing-slash redirects. Caught `border-t` missing (a class built in a `.ts` file Tailwind did not scan), `<div data-async-container>` shifting every CSS pairing (now `display: contents`), the 404 page's inline style double-escaped (limitation 5) and its stylesheet import dropped (limitation 17), `__marklessSsrComponent1 is not defined` on the edit page (limitation 6). |
| 3 | 374 s | 13/30 | Social titles follow the page title; Next's 404 has two `<title>`s and `noindex`; a database per app. |
| 4 | 301 s | 13/30 | Search: callback argument lost across files (limitation 7), state initialised from a prop undefined in the browser (8), pagination's computed props threw (9). Submit: the form also posted natively (10); `@for` over component state never re-rendered (11). The old app's search was compared mid-debounce (tool bug 4). |
| 5 | 155 s | 13/30 | Search, forms and errors fixed. Mobile `/dashboard/invoices` sometimes showed the table skeleton: two `@try` blocks on one async value stream only one arm (limitation 18). |
| 6 | 142 s | 13/30 | The hero image differed by 43 pixels: Next sends WebP to browsers that accept it (now WebP too). Signed-in `/query` was compared as page markup (tool bug 5). |
| 7 | 140 s | 13/30 | One boundary per async value; middleware reads list data before rendering. A stale server answered with missing chunks (the build replaced `.output` under it; the check script now restarts it). |
| 8 | 138 s | 14/30 | Forms reset after a failed action; WebP images. Left: route announcer, weight, request shapes. |
| 9 | 127 s | 14/30 | `/dashboard` from the build snapshot with no async boundary: 337 kB to 204 kB downloaded when signed in. |
| 10 | 120 s | 30/30 | Six differences accepted (below). |
| 11 | 145 s | 30/30 | Final run after the deployment changes. |

Time: first check 00:00, green at 01:23, deployed at 08:52 (commit times; the session also ported the Remix app).

## Accepted differences

Accepted by the converting agent under the owner's brief ("accept differences only when genuinely impossible, with a
reason"), with `by` naming the agent; the reasons are in `.migrate/accepted.json` and in the report.

| What | Where | Why it cannot be removed |
| --- | --- | --- |
| `- alert` missing from the accessibility tree | every page | Next mounts an empty route announcer (`<next-route-announcer>`, role=alert) for client-side navigations; the port navigates with document loads, which assistive tech announces itself. |
| JavaScript downloaded is higher | every page | Markless modulepreloads the render data of every component a page could re-render. Run at load falls from 150-256 kB to 0.5-1.2 kB. |
| Search makes a `GET /api/data/...` request | `/dashboard/invoices`, `/dashboard/customers` | Next refetches the page as an RSC payload (framework transport, not counted); Markless has no server-rendered partial navigation, so the list comes from a JSON endpoint. URL, list and focus match. |
| Form posts go to `/api/invoices...` with plain fields | create and edit pages | Next posts to the page as a server action (`1_$ACTION_*` fields); Markless has no server actions. Messages, redirect and the database write match. |

## Weight (uncompressed, from the final check)

| Role | Route | Downloaded, kB | Run at load, kB |
| --- | --- | --- | --- |
| anonymous | `/` | 141.0 → 128.6 | 170.8 → 0.5 |
| anonymous | `/login` (and every guarded route, which redirects there) | 132.7 → 162.8 | 152.5 → 1.2 |
| anonymous | 404 | 130.5 → 112.1 | 139.6 → 0.5 |
| signed in | `/dashboard` | 140.7 → 203.8 | 214.8 → 0.5 |
| signed in | `/dashboard/customers` | 147.2 → 265.7 | 202.2 → 1.2 |
| signed in | `/dashboard/invoices` | 150.7 → 370.7 | 256.0 → 1.2 |
| signed in | `/dashboard/invoices/:id/edit` | 143.5 → 308.4 | 186.9 → 1.2 |
| signed in | `/dashboard/invoices/create` | 143.5 → 288.5 | 183.4 → 1.2 |

## Markless limitations hit

Places where Markless 0.4.0 itself could not express what the Next app does, or broke doing it, with the workaround.

1. **Only the last statement of a control-flow block renders on the server.** Inside `@try`/`@if`, sibling elements
   are statements that need `;` (a bare newline is a parse error reported at the enclosing block's `@`), and then
   only the last one is in the SSR output. Workaround: a fragment.
2. **Root fragments**: a component's root fragment cannot hold components from other files
   (`MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED`); several `;`-separated root elements fail the server build
   (`MARKLESS_TYPE_STRIP_FAILED`); one fragment root (links holding icon components) hung the client build with no
   output and no CPU use. Workaround: one component per link.
3. **`@if` arms that hold an attribute binding cannot change** (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`), and
   branches cannot nest. Workarounds: anchors without `href` for Next's `<div>`/`<Link>` pagination split, the
   `hidden` attribute or class for messages.
4. **A component with handlers or computed values cannot take a prop from a `@for` row, or from a plain constant**
   (`MARKLESS_CAPTURE_OPAQUE_PROP`; `snapshot.cards.x` from an imported JSON failed, an async value worked). The
   error names the wrong component when a module exports several. Workaround: markup inline, ids on `data-`.
5. **String attributes do not decode HTML entities** as JSX does (`&quot;` is sent as `&amp;quot;`).
6. **A component declared in the page file and placed in another component's children crashes SSR**
   (`ReferenceError: __marklessSsrComponent1 is not defined`); moved to its own file, the build failed ("client-assets
   manifest contains a non-canonical asset URL /virtual:markless:render-data:...").
7. **A callback prop called from a component in another file receives `undefined`** (same file works).
8. **Page props read in the browser are undefined**: `state(url.search)` re-ran its initialiser in the browser.
   Workaround: loaders read the URL from the request (server) or `location` (browser).
9. **Computed values over props passed from page state throw in the browser** ("Capture slot ... is a callback route").
10. **`event.preventDefault()` does not stop a submit inside an `@try` boundary**: the sync-policy runner is inlined
    only for forms outside async boundaries, so the browser also posted the form natively. Workaround:
    `action="javascript:void 0"`, so these forms need JavaScript (Next's server-action forms do not).
11. **`@for` over a component's own state never re-renders in the browser**, empty or not; text bindings update.
12. **A page cannot set its status code**: Next answers 404 for a missing invoice; the port renders it with 200.
13. **No request context in pages** (only `params`, `url`, `status`): the session needs Nitro's experimental
    `asyncContext` and an `import.meta.env.SSR` branch.
14. **Client navigation renders the next page in the browser** (the docs say the router asks the server), so a data
    page refetches through an API or opts out with plain `<a>`.
15. **Weight**: render data for every component a page could re-render is modulepreloaded, with each component's
    statics and the build machine's absolute source path (`/Users/.../components/icons/...`) in shipped JavaScript.
16. **No image optimiser**: resized copies are made at build time with sharp.
17. **A side-effect CSS import in `404.tsrx` is dropped**; a `?url` import and a `<link>` in the page work.
18. **Two `@try` blocks reading one async value: when it streams, only one is filled**; the other keeps `@pending`
    forever (`streamArmAppends` keys arms by graph node). Workaround: one boundary per async value.
19. **Any async value slower than 10 ms streams** (`MARKLESS_STREAM_FIRST_FLUSH_DEADLINE_MS`), and the streamed
    boundary then refetched its data in the browser. A real database is never that fast, so middleware reads the
    page's data before the page renders.
20. **Nitro bundles middleware, endpoints and pages separately**, so module state (a database pool, a request-keyed
    map) exists once per bundle; kept on `globalThis` to be shared.
21. **A Markless app with `api/` or `middleware/` files does not run on Vercel**: the server bundle keeps
    `import { defineHandler } from "nitro"` and the function has no `node_modules` (`ERR_MODULE_NOT_FOUND`).
    Worked around after the build (`deploy/next-dashboard/one-function.mjs`).
22. **Nitro's Vercel output gives every `api/` route its own function**, so per-instance state differs between an
    endpoint and the page it serves; the deploy serves every route from the main function.
23. **The server does not exit on SIGTERM while a database pool is open** (the local scripts kill it outright).

## markless-migrate problems found and fixed

1. **plan found no guard in a Next 16 `proxy.ts` exporting `NextAuth(authConfig).auth`**, the course's own pattern.
   Fixed: `callbacks.authorized` is the guard, `pages.signIn` the login route. `3efb252`
2. **An app's origin inside a redirect's query** (`callbackUrl=http%3A%2F%2Flocalhost%3A3100...`) made every guarded
   route red. Fixed: compared as `{origin}`. `91f96cd`
3. **`check --all` fetched a GET endpoint that writes** (`/seed`). Fixed: listed as not checked with the reason
   (`efa3502`), without failing the run (`a83be6b`), and only for writes a GET can trigger (`93103f8`).
4. **A debounced search was compared before the debounce fired.** Fixed: a step waits for timeouts of up to a
   second. `8ad3252`
5. **An endpoint that redirects a signed-in visitor to a page was compared as page markup.** Fixed: compared by
   where it sends them. `0fed8ea`
6. **`config --vercel` listed only assets in each page's HTML**, so chunks loaded on interaction went to the old app.
   Fixed: it follows module paths in the scripts, including chunk tables. `7119325`, `e1b941e`
7. (not fixed) **`config --vercel` does not route endpoints the switched pages call from scripts** (`/api/*`), so the
   login post went to the old app; worked around with `switch '/api/*rest' --force <reason>`. `switch` also accepted
   Vercel's `/api/:path*` silently and `config` turned it into `/api/:path:rest+`, which matches nothing.
8. (not fixed) The migration skill tells agents never to write `accepted.json`; this brief asked the converting agent
   to accept what cannot be removed, so entries carry `by: Claude Code (converting agent), per the owner's brief`.

## Markless 0.5.0 (2026-10-17)

Rebuilt on the published 0.5.0 packages (`@markless/*` 0.5.0, `vite-plus` 0.3.1).

### Workarounds removed

| Workaround (0.4.0 limitation) | Now |
| --- | --- |
| 21: the Vercel build kept `import { defineHandler } from "nitro"`; `deploy/next-dashboard/one-function.mjs` rewrote it | the rewrite is gone: 0.5.0 bundles it (`one-function.mjs` still copies PGlite's files and keeps every route on one function, which the in-function database needs) |
| 12: a page could not set its status, so a missing invoice's edit page answered 200 | middleware marks the request in `http.locals`, the page sets `http.response.status = 404` |
| 10: `action="javascript:void 0"` on the forms inside `@try` (preventDefault did not stop the native submit) | removed: the forms have no action and the handler's `preventDefault` stops the submit |
| 14: plain `<a>` links loaded a new document | the same links navigate in place through the router, with prefetch on intent; redirects after signing in and after saving an invoice navigate in place too (as Next's server actions do) |

Kept: the search's JSON endpoint (a router navigation would replace the search box and lose its focus, where Next keeps the layout mounted), the middleware prefetch of list data, and `asyncContext`.

New in 0.5.0: the cookies middleware sets with `http.response.headers` reach normal pages but are dropped when the router answers with its 404 page, so the 404 page appends them again from `http.locals` (Next sets `__Host-authjs.csrf-token` and the callback-url cookie on its 404 too).

Not cached: `/` would be the only visitor-independent page, but middleware must still run on it (it sends a signed-in visitor to `/dashboard`), so nothing is put on the CDN.

### Check (against the deployments)

`check --all --auth .migrate/auth-deployed.json`, old https://mm-next-dashboard-old.vercel.app, new https://mm-next-dashboard-new.vercel.app. Against deployments the checker holds back every write, sign-in included, so the signed-in role uses storage states saved by signing in on each deployment once (`.migrate/auth/deployed-old.json`, `deployed-new.json`; not committed, they hold a session).

**22 of 30 route checks green.** Anonymous: all 8 pages (including the 404 with its cookies), `/query` and the six trailing-slash redirects green. Signed in: `/query` and the redirects green, the 8 pages red.

Responsiveness (slowest each side): first interaction old 474 ms → new 492 ms at 4x CPU (the search box's debounced search; desktop 448 → 408 ms); navigation old 337 ms → new 166 ms at 4x CPU (desktop 304 → 134 ms).

JavaScript on the wire falls from 140-160 kB to 51-57 kB anonymous and 119-141 kB signed in; run at load from 175-200 kB to 2.5-5 kB.

What keeps the signed-in pages red:

1. "Sign Out" and the invoices' "Delete" buttons are never pressed by the checker (destructive names), so coverage stays incomplete until a person accepts them.
2. The "Acme" logo link: Next keeps its layout mounted and focus stays on the link after the redirect to `/dashboard`; the router replaces the whole page, so focus goes to the body.
3. Navigation from the sidebar links at 4x CPU: old 45-61 ms, new 142-166 ms (Next has the next page's RSC payload prefetched; the router fetches the page HTML on pointer-down on a phone, which has no hover).
4. A held-back invoice save: the checker answers the write itself; Next then shows its error boundary ("Something went wrong!"), the port keeps the form.

Routes switched: `/query` only (green for both roles). The trailing-slash redirects are green too, but the front door's rewrite for `/dashboard/` also covers `/dashboard`, a red page, so they stay on the old app with every page.

## Every route, signed in too (2026-10-18)

`plan --old https://mm-next-dashboard-old.vercel.app --source ../../deploy/next-dashboard/old-app --auth .migrate/auth-deployed.json` now crawls a second time as the signed-in user: 23 routes, 15 of them reached only signed in (the three `?page=` pages of the invoice list and the edit page of each of the 13 invoices on them). Before, plan counted only what a signed-out visitor reaches, so the gate said "0 missing" without having looked at the dashboard.

`check --only coverage` now fetches every route once per role, with that role's session. Result before the fix below: anonymous 20 of 23, signed-in 23 of 23. The 3 missing were the invoice list's pages for a signed-out visitor: Next keeps the page's query on the way to the login page (`/login?page=2&callbackUrl=...`), the port dropped it. `middleware/request.ts` now keeps it.

Two tool fixes came out of this: a signed-in visitor sent to `/dashboard` from any unknown path is the old app's own rule (NextAuth's `authorized` callback), not a catch-all of the port, so coverage no longer calls `/`, `/login` and `/query` missing for the signed-in role; and `check --all` now checks every planned route, so the 13 edit pages and the paged lists are checked too.

### Check (against the deployments, new app redeployed)

`check --all --concurrency 2 --auth .migrate/auth-deployed.json --source ../../deploy/next-dashboard/old-app --new-source .`

**Routes: 23 of 23 for both roles.** **54 of 60 route checks green** (route and role), 6 red, none unchecked. Signed out: every page green. Signed in: the invoice list pages, 12 of the 13 edit pages (checked on the first as their template) and `/login` green; `/`, `/dashboard`, `/dashboard/customers`, the first edit page, `/dashboard/invoices/create` and the 404 page red.

| Dimension | Result |
| --- | --- |
| coverage | green, 23 of 23 per role |
| http, rendered, seo, visual, css, fonts, assets, network, weight | green (rendered carries the accepted route-announcer difference) |
| behaviour | red signed in: "Sign Out" (the checker holds the sign-out post back; Next then re-renders the page it is on, the port follows its own logout URL); the held-back invoice save (Next shows its error page, the port keeps the form); the "Acme" link (Next keeps focus on the link after its redirect, the router's page swap puts it on the body) |
| a11y | red signed in for the same "Acme" focus and the held-back saves, by keyboard |
| responsiveness | red on some signed-in first uses: "Acme" at desktop speed, the customers search box at 4x CPU, the create page's links (the router fetches the next page's HTML; Next has the payload prefetched) |

JavaScript on the wire 140-160 kB to 51-141 kB, run at load 175-280 kB to 2.5-10 kB.

### Check again with the motion dimension (markless-migrate `3701487`)

The same `check --all --concurrency 2 --auth .migrate/auth-deployed.json` after rebasing on the motion dimension: **50 of 60 route checks green**, 7 red, 3 not checked (the connection to the old deployment timed out). Routes 23 of 23 for both roles. Responsiveness at 4x CPU: first interaction old 798 → new 543 ms, navigation 258 → 177 ms.

| Dimension | Result |
| --- | --- |
| motion | red on the login form (`/dashboard` and `/dashboard/invoices/create` signed out answer it): clicking "Log in" fades the button to its hover colour over 150 ms on the old page and jumps there on the new one. Hovering alone fades the same way on both (same classes, same computed transition, the same transitionrun/transitioncancel sequence); only the click differs, and the cause was not found. Signed in, "Create Invoice" after a held-back save fades on the new page only, because Next replaces the form with its error page and the port keeps it |
| everything else | as above |

## Markless 0.9.0 (2026-10-22)

The app is on Markless 0.9.0 from npm (core, router, analyzer, typescript-plugin), from 0.5.0. It builds on 0.9.0 with
no other change, and the build guard is green (135 script and HTML files in `.vercel/output`; no page loads React or
Next.js).

### Check against the deployments, before and after

`check --route / --route /dashboard/invoices --route /dashboard/customers --auth .migrate/auth-deployed.json
--concurrency 2 --timeout 1800 --no-psi` (the ecosystem suite's sample, anonymous and signed in), old
https://mm-next-dashboard-old.vercel.app, new https://mm-next-dashboard-new.vercel.app, on 0.5.0 and then on 0.9.0 once
deployed: 38 failures to 33, no route green on either. Anonymous (each redirects to the login page): 13 to 6. Signed
in: 25 to 27. New on 0.9.0: every dashboard page fetches `/dashboard` ahead of any click, a request the old page does
not make (the router fetching a linked page ahead), and following the "Acme" link at 4x CPU is a full page load where
the old app navigates in place; one other navigation row on `/dashboard/invoices` turned green.

## Feature audit and fixes (2026-10-23)

Every feature was walked as a person uses it: the original and the port, both production builds served on one
machine, each with its own copy of the same seeded Postgres 17 database. That is 20 scenarios: sign-in, wrong
password, sign-out, auth redirects with `callbackUrl`, dashboard cards, chart and latest invoices, sidebar
navigation, back/forward, search on invoices and customers, pagination, create, edit, delete, form validation, the
not-found and error pages, the 404s, a slow search, mobile, keyboard sign-in and the logo link. The walk lives in
`/tmp/port-audit/next-dashboard/witness.mjs`.

On Markless 0.9.0 from npm, 3 of the 20 were broken, all in Markless:

1. After a save, the list showed data from before it. The router reused pages it had fetched ahead of the click for
   up to 30 seconds. Fixed in compiled-run/markless#187: any write from the page (a submitted form, or a same-origin
   fetch that is not a read) drops those pages, and a fragment's `Cache-Control` is respected.
2. Delete reloaded the page and left the row on screen. Inside an `@try`, only one row's form carried the
   preventDefault mark, so the other rows' submits went out natively. Fixed in compiled-run/markless#183.
3. The logo link to `/`, which redirects a signed-in visitor to `/dashboard`, fetched the whole `/dashboard`
   document only to discard it, then loaded it again. Fixed in compiled-run/markless#184: a redirect answered to a
   fragment request stays a fragment.

Two more Markless changes went in for parity:
- compiled-run/markless#190: a form's code starts loading when the pointer reaches its submit button. Before, the
  first press to the validation errors was 25 ms slower than the original at 4x CPU.
- compiled-run/markless#186, the in-place navigation reland: after a sidebar click, focus stays on the link as in
  Next, instead of going to the body.

With all five, every scenario works on the port as on the original. The walk's screenshots are byte-identical or 0 px
apart, except about 9 px of antialiasing on the mobile customers card ("2 invoices": React writes the number and the
word as two text nodes).

The deployment (https://mm-next-dashboard-new.vercel.app) is built from these PRs packed locally: markless
`integ/next-dashboard` at 73875ff9d, which is main plus #183, #184, #186, #187 and #190. Only `@markless/*` is
overridden; every other package comes from this example's `package-lock.json`.

## Comparison method and results (2026-10-23)

Both apps are production builds (`next build` / `next start`, and the Markless Nitro server) on the same machine. Each
reads its own copy of the same seed, and every run starts with an empty browser cache, signed in, on `/dashboard`.
`next start` gzips its responses; Markless's Node server does not compress CSS or JS. So the port sits behind a plain
gzip proxy, as both sit behind Vercel's edge in production. Without it, Lighthouse found the port's mobile LCP 400 ms
worse, because its CSS and JS travelled uncompressed.

Five runs per measure, median, with the per-run spread where it is wide. Desktop is unthrottled; the 4x column adds
4x CPU slowdown and 40 ms of latency. Script: `/tmp/port-audit/next-dashboard/measure.mjs`.

| Measure | Original, desktop | Port, desktop | Original, 4x | Port, 4x |
| --- | --- | --- | --- | --- |
| JS run at load (bytes V8 executed, inline scripts included) | 213.2 kB | 8.7 kB | 213.1 kB | 8.7 kB |
| JS on the wire, gzip | 144.8 kB | 127.2 kB | 144.8 kB | 127.2 kB |
| JS decompressed | 226.9 kB | 253.2 kB | 254.8 kB | 378.4 kB |
| LCP | 24 ms (20–28) | 32 ms (20–52) | 136 ms | 128 ms |
| Sidebar clicks with no hover first (Invoices / Customers / Home) | 54 / 39 / 11 ms | 20 / 8 / 10 ms | 160 / 114 / 22 ms | 60 / 18 / 24 ms |
| Sidebar clicks after the pointer rests on the link | 50 / 31 / 14 ms | 14 / 14 / 12 ms | 160 / 112 / 28 ms | 53 / 30 / 13 ms |
| First press to validation errors (pointer rests on the button first) | 26 ms | 28 ms | 85 ms | 73 ms |
| Save to list with the new row | 348 ms (49 or 349) | 50 ms | 137 ms | 128 ms |
| Search, typing "lee" to the filtered list (300 ms debounce in both) | 782 ms | 481 ms | 544 ms | 543 ms |
| Slowest single event | 40 ms | 32 ms | 40 ms | 40 ms |

Where the original's 213 kB goes on `/dashboard`, attributed through browser source maps from a build of the same
source with `productionBrowserSourceMaps`:

| Source | Executed at load |
| --- | --- |
| Next.js runtime | 91.0 kB |
| React (react, react-dom, scheduler) | 72.8 kB |
| Page data Next sends as inline scripts (RSC payload and bootstrap) | 43.3 kB |
| Other packages | 3.2 kB |
| App code | 0.8 kB |

How to read these numbers:
- Clicks are fast because the port shows pages it fetched ahead of the click: on hover, on press, and at idle for
  links in view. Next 16 fetches dynamic pages at the click.
- The port downloads about as much JavaScript as the original but runs 4% of it at load. The rest runs only when
  something on the page is used.

The fixed checker (markless-migrate#54) against the same two local builds gives 14 of 60 route checks green, the same
count as before the fixes. No route is red any more on page load, network, focus or the logo link. What remains:
- 41 routes: og:image and twitter:image. The port copies the hash the deployed Next build wrote; this local Next
  build writes a different one.
- 15: Sign Out posts to `/api/auth/logout` where Next posts a server action. Markless has no server actions.
- About 20: the two databases drift apart, because the checker's own Delete journeys run on each app at different
  times. This causes the 404 status and `noindex` differences on edit pages of deleted invoices, and the
  page-count differences.
- 3 responsiveness rows, each measured with a press that does not rest on the control first:
  - the Create Invoice button: 73 ms against about 40 at 4x CPU;
  - the Create Invoice link: 90 against 46 ms;
  - the customers search: over the 200 ms budget on both, because of the 300 ms debounce both apps share.

Known issue on the live demos: each Vercel function instance runs its own in-memory seeded database (PGlite), and
requests spread across instances. A write is often not visible on the next request, on the original as well as the
port. In one test, a new invoice showed on 1 of 6 reloads of the port and on 4 of 6 of the original. One hosted
Postgres shared by both projects removes this. It needs someone to accept the Vercel Marketplace terms.

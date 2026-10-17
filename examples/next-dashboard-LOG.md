# Migration log: Next.js Learn dashboard to Markless

The final example of the Next.js App Router course (`vercel/next-learn`, `dashboard/final-example`, commit
`bb25584`, Next 16.0.10, NextAuth 5.0.0-beta.25, `postgres` 3.4) ported to Markless 0.4.0 (published
packages, `create-markless --starter full-stack`) by Claude Code, proven with `markless-migrate check`.

| What | Where |
| --- | --- |
| Old app (unchanged source) | `deploy/next-dashboard/old-app` |
| New app | `examples/next-dashboard-markless` |
| Local servers | `deploy/next-dashboard/local.sh db\|reset\|old\|new\|stop` |

## Set-up

1. Postgres 17 from Homebrew in a private cluster (`~/.mm-pg/next-dashboard`, port 55432, SSL on with a
   self-signed certificate, because the old app connects with `ssl: 'require'`). Seeded through the old
   app's own `/seed` route. The first call failed with a race in its own `CREATE EXTENSION` (four
   `Promise.all` branches create `uuid-ossp` at once); the second succeeded. Seeded state saved with
   `pg_dump` and restored before every check.
2. Each app gets its own copy of the seeded database (`dashboard` and `dashboard_new`). With one shared
   database, the edit journey the check replays on the old app changed an invoice before the new app's
   pages were captured, and every later comparison drifted.
3. Old app: `next build` (needs the seeded database: `/dashboard` is prerendered at build time) and
   `next start -p 3100`, with the request recorder in `NODE_OPTIONS`.
4. New app: `npm create markless@latest -- --yes --starter full-stack`, then `node .output/server/index.mjs`
   on port 47310 (4100 was another worker's).
5. `plan --old http://localhost:3100 --source ../../deploy/next-dashboard/old-app`: 2 crawled routes, 9 in
   source, 1 guard (after the plan fix below), login route `/login`. `auth.json` uses the starter login
   steps with `${SIGNED_IN_EMAIL}`/`${SIGNED_IN_PASSWORD}` (`user@nextmail.com` / `123456`, the course's
   seed user). `.migrate/samples.json` gives `:id` a real invoice id.

## How the port is built

- Pages render on the server. A page reads its data with an async `computed()` whose loader takes an
  `import.meta.env.SSR` branch to the same SQL (`server/data.ts`, copied from `app/lib/data.ts`), so the
  database code never reaches the browser. Page links are plain `<a>`: every navigation is a document load.
- The session is the Auth.js one: same cookie names, the same JWE token made with `@auth/core/jwt` and the
  same `AUTH_SECRET`, so a session from either app is valid in the other (this matters on the front door,
  where the two apps share one domain). `middleware/request.ts` ports `auth.config.ts`'s `authorized`
  callback, NextAuth's csrf and callback-url cookies, the proxy matcher, Next's trailing-slash 308s, and
  serves `/query` and `/seed` (Markless `api/` routes live under `/api/`).
- Writes are `api/` endpoints posted to with `fetch` from the form handlers (Next used server actions).
- `/dashboard` is prerendered at build in Next and never revalidated, so the new app snapshots the
  overview at build time too (`scripts/snapshot.ts`).
- Tailwind 3 with the old config; the next/font files and `@font-face` rules copied from the old build;
  next/image's resized copies made with sharp at the same widths (byte-identical to Next's output for
  the hero images); heroicons rendered once with React into one `.tsrx` component per icon.

## Iterations

| # | Time | Green | What the check caught, and what changed |
| --- | --- | --- | --- |
| 1 | 123 s | 0/30 | Redirects to `/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100...` differ only by port (tool bug 2). Next's trailing-slash 308s missing. `/seed`, fetched by `check --all` as a data endpoint, inserted 13 invoices per load (tool bug 3), so the latest-invoices list showed one customer five times. Only the last statement of each `@try` rendered (Markless bug 1). 339 kB downloaded on `/` vs 141 kB: the icon module's render data was 204 kB. |
| 2 | 175 s | 12/30 | Fragments instead of `;`, icons and skeletons split one per file, trailing-slash redirects. Caught: `border-t` missing (class built in a `.ts` file Tailwind did not scan), Markless's `<div data-async-container>` shifting every CSS pairing, the 404 page's inline style double-escaped (Markless bug 5), its stylesheet import dropped, `__marklessSsrComponent1 is not defined` on the edit page (Markless bug 6). |
| 3 | 374 s | 13/30 | Social titles follow the page title; Next's 404 has two `<title>`s and `noindex`; a separate database per app. |
| 4 | 301 s | 13/30 | Search: callback argument lost across files (bug 7), state initialised from a prop read as undefined in the browser (bug 8), pagination's computed props threw "Capture slot ... is a callback route" (bug 9). Submit: the form posted natively next to the handler's `fetch` (bug 10); `@for` over component state never re-rendered (bug 11). Old search compared mid-debounce (tool bug 4). |

## Markless limitations hit

Each is a place where Markless itself could not express what the Next app does, or broke while doing it,
with the workaround used.

1. **Only the last statement of a control-flow block renders on the server.** Inside `@try`/`@if`, sibling
   elements are statements and must be separated by `;` (a bare newline is a parse error reported at the
   enclosing block's `@`, not at the element), and then only the last one appears in the SSR output.
   Workaround: wrap siblings in a fragment.
2. **A component's root fragment cannot hold components from other files**
   (`MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED`), and a component whose root is several `;`-separated
   elements fails the server build (`MARKLESS_TYPE_STRIP_FAILED`); a fragment root that holds only
   elements hung the client build with no output and no CPU use. Workaround: one component per link.
3. **`@if` arms that hold a binding cannot change** (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`), and branches
   cannot nest. Workarounds: anchors without `href` for Next's `<div>`/`<Link>` pagination split, the
   `hidden` attribute or a `hidden` class for error messages.
4. **A component with handlers or computed values cannot take a prop from a `@for` row**
   (`MARKLESS_CAPTURE_OPAQUE_PROP`). The error names the wrong component when the module exports several
   (it blamed `DeleteInvoice` for `UpdateInvoice`). Workaround: the delete form inline in the table, the id
   on a `data-` attribute.
5. **String attributes do not decode HTML entities** as JSX does: `style="font-family:&quot;Segoe UI&quot;"`
   is sent as `&amp;quot;`. Workaround: single quotes inside the style.
6. **A component declared in the page file and placed in another component's children crashes SSR**
   (`ReferenceError: __marklessSsrComponent1 is not defined`); moving it to its own file then failed the
   build ("client-assets manifest contains a non-canonical asset URL /virtual:markless:render-data:...").
   Workaround: the `@if` directly in the page.
7. **A callback prop called from a component in another file receives `undefined`** (same file works).
   Workaround: the search box inline in each page; the delete callback takes no argument.
8. **Page props read in the browser come back undefined**: `state(url.search)` re-ran its initialiser in
   the browser and threw "Cannot read properties of undefined (reading 'search')". Workaround: loaders read
   the URL from the request (server) or `location` (browser), never from props.
9. **Computed values over props passed down from page state throw in the browser** ("Capture slot ... is a
   callback route"). Workaround: the loader computes pagination and passes plain values.
10. **`event.preventDefault()` does not stop a submit inside an `@try` boundary**: the sync-policy runner is
    inlined only for pages whose form is outside async boundaries, so the browser posted the form natively
    while the handler's `fetch` ran. Workaround: `action="javascript:void 0"`, which also means these forms
    no longer work without JavaScript (Next's server-action forms do).
11. **`@for` over a component's own state never re-renders in the browser**, whether the list starts empty
    or not (text bindings in the same component update). Workaround: one bound `<p>` per message.
12. **A page cannot set its status code.** Next answers 404 for a missing invoice (`notFound()`); the page
    gets `status` as a read-only prop and middleware's `response.status` is ignored once the page returns a
    `Response`. The missing-invoice view renders with 200.
13. **No request context in pages.** Pages get only `params`, `url` and `status`; reading the session needs
    Nitro's experimental `asyncContext` and an `import.meta.env.SSR` branch.
14. **Client navigation renders the next page in the browser**, so a data page either refetches through an
    API or opts out with plain `<a>` (used here). The docs say the router asks the server for the page.
15. **Weight: render data for every component a page could re-render is modulepreloaded**, with each
    component's statics and the build machine's absolute source path (`/Users/.../components/icons/...`)
    in the shipped JavaScript.
16. **No image optimiser** (next/image): resized copies are made at build time with sharp.
17. **Side-effect CSS imports in a status page (`404.tsrx`) are dropped**; a `?url` import and a `<link>`
    in the page work.

## markless-migrate problems found (and fixed)

1. **plan found no auth guard in a Next 16 `proxy.ts` that exports `NextAuth(authConfig).auth`**, the
   course's own pattern, so it wrote no `auth.json`. Fixed: the config's `callbacks.authorized` is read as
   the guard (its path tests give the routes, `pages.signIn` the login route). Commit `3efb252`.
2. **An app's own origin written into a redirect's query** (`callbackUrl=http%3A%2F%2Flocalhost%3A3100...`)
   made every guarded route red on both `http` and `auth` because the two apps run on different ports.
   Fixed: compared as `{origin}`. Commit `91f96cd`.
3. **`check --all` fetched a GET endpoint the source scan knew writes** (`/seed` inserts 13 invoices per
   load; discovery alone loads it once). Fixed: such endpoints are listed as not checked, with the reason.
   Commit `efa3502`.
4. **A step that types into a debounced search was compared before the debounce fired**: a step settles
   after 150 ms without requests, before the old app's 300 ms timer, while the new app's lazy handler load
   kept it busy long enough to see the result. Fixed: a step also waits for timeouts of up to a second.
   Commit `8ad3252`.
5. (not fixed) The skill says agents never write `accepted.json`; this run's owner asked the converting
   agent to accept differences that cannot be removed, so they were accepted with `--by` naming the agent.

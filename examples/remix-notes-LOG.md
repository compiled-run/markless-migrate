# Migration log: Remix Indie Stack notes to Markless

The Remix Indie Stack (`remix-run/indie-stack`, commit `56abb93`, archived; Remix 2.17 with the classic compiler,
email and password sign-up and login with a signed cookie session, SQLite through Prisma 5, notes you create and
delete) ported to Markless 0.4.0 (published packages, `create-markless --starter full-stack`) by Claude Code, and
proven with `markless-migrate check`. The stack is archived and React Router has no equivalent template with auth and
a database (its templates are starters without either), so the archived stack is the reference, run as it ships.

Result: **26 of 26 route checks green** (6 pages, 404, `/healthcheck` and 5 trailing-slash redirects, each anonymous
and signed in), with 2 accepted kinds of difference (14 accepted failures, listed below).

## Deployed

| What | URL |
| --- | --- |
| Front door (all checked routes switched to the new app) | https://mm-remix-notes.vercel.app, index and demo login at `/_migrate/`, report at `/_migrate/report.html` |
| Old app (Remix, source unchanged) | https://mm-remix-notes-old.vercel.app |
| New app (Markless) | https://mm-remix-notes-new.vercel.app |

Demo login: `rachel@remix.run` / `racheliscool` (the stack's seed user), or sign up with any email and a password of
8 or more characters. Both apps use Remix's cookie session format and secret, so a session from either works in both.

`deploy/remix-notes/deploy.sh old|new|front` builds and deploys each. No hosted database (see the dashboard log):
each function copies the seeded SQLite file to `/tmp` when an instance starts, so sign-ups and notes last as long as
that instance. The old app runs its own Remix server build, unchanged, behind `@remix-run/node`'s request handler in
one Build Output API function (`build-old.mjs`); the only addition is the Linux engine in a copy of its Prisma schema
(`binaryTargets`), because Prisma generates for the build machine only.

## Set-up

1. `npm install`, `prisma migrate deploy`, `prisma db seed`, `remix build` in `deploy/remix-notes/old-app` (npm 11
   blocks install scripts, so `esbuild` and Prisma's were approved; the approval it wrote into `package.json` was
   reverted). Seeded database saved to `~/.mm-pg/remix-notes/seed.db`; each app gets its own copy before every check.
2. Old app: `remix-serve` on port 47320 with `NODE_ENV=production` (so the session cookie is `Secure`, as deployed)
   and the request recorder. New app on port 47330.
3. `plan --old http://localhost:47320 --source ../../deploy/remix-notes/old-app`: 3 crawled routes, 8 in source,
   guards on `/notes/*` (`requireUserId`), login at `/login`, a correct starter `auth.json`. `samples.json` gives
   `:noteId` a seeded note.
4. A tool change first: Remix v2's own data requests (`GET ...?_data=routes/...`) would have counted as app requests
   on every navigation; they are now framework transport like Next's RSC (`4d16f0b`).

## How the port is built

- `node:sqlite` on the same file (same tables, rows and integer timestamps as Prisma's); new ids are cuids like
  Prisma's. Queries are synchronous, so page data settles well inside Markless's 10 ms streaming deadline.
- The session is Remix's `createCookieSessionStorage` format (base64 JSON signed like `cookie-signature`).
- `middleware/request.ts` ports the loaders and actions that decide before a page renders: the root loader's logout of
  a deleted user, `requireUserId`'s redirect, the login/join redirect for signed-in visitors, `/logout`, `/healthcheck`
  (including its HEAD request to itself), and every form post. A post from the page's script asks for JSON (errors
  with status 400, or the redirect); a post without JavaScript gets the redirect.
- Forms post urlencoded to the page's own URL, query included, as Remix's `<Form>` does, and focus the first field
  with an error, as the old pages' effects do.
- Tailwind 3.4.19 and autoprefixer 10.6.1, as the old app; CSS minification off (see limitation 6).

## Iterations

| # | Time | Green | What the check caught, and what changed |
| --- | --- | --- | --- |
| 1 | 73 s | 7/26 | Signed-in notes pages 500: `ReferenceError: data is not defined` (limitation 1). Hidden error `<div>`s changed axe's landmark regions. The login form posted to `/login`, the old one to `/login?redirectTo=...`. `.transition` listed `-webkit-backdrop-filter` (Vite's CSS minifier). |
| 2 | 88 s | 7/26 | Notes pages 500: `MARKLESS_PROJECTION_NOT_RENDERED` for `{children}` inside `@try` (limitation 2). |
| 3 | 73 s | 10/26 | The email in the notes header was empty (limitation 3); `border-b` missing (a class built in `lib/nav.ts`, not scanned); `/login/` and `/join/` did not redirect a signed-in visitor (Remix matches a route with or without the slash). |
| 4 | 69 s | 12/26 | The login journey reached `/notes` on the old app only: the sign-up journey on `/join` had created its sample user there first. Routes checked in parallel share each app's database, so the order decides. Checked with `--concurrency 1` from here. |
| 5 | 147 s | 12/26 | Only weight left. |
| 6 | 176 s | 26/26 | Weight and new-note ids accepted. |
| 7 | 195 s | 26/26 | `/logout` checked again (tool fix `93103f8`). |
| 8 | 180 s | 26/26 | Final run after the deployment changes. |

Time: tool change 07:56, green at 08:19, deployed at 09:04 (commit times).

## Accepted differences

| What | Where | Why it cannot be removed |
| --- | --- | --- |
| JavaScript downloaded is higher | every page | Markless modulepreloads its router runtime on every page (about 108 kB even on the static 404 page, where Remix sends none) and the render data of components a page could re-render. Run at load falls from 92-95 kB to 0.5-1.4 kB. |
| The URL after saving a new note | `/notes/new` | A new note's id is a fresh cuid (time, counter, host fingerprint, randomness): it differs on every run and between the two servers. |

## Weight (uncompressed, from the final check)

| Role | Route | Downloaded, kB | Run at load, kB |
| --- | --- | --- | --- |
| anonymous | `/` | 90.5 → 205.9 | 92.5 → 1.2 |
| anonymous | `/login`, `/join` (and guarded routes, which redirect to login) | 90.0 → 139.9 | 92.7 → 1.2 |
| anonymous | 404 | 0.0 → 111.3 | 0.2 → 0.5 |
| signed in | `/notes` | 90.0 → 187.0 | 92.2 → 1.2 |
| signed in | `/notes/:noteId` | 90.2 → 208.7 | 92.9 → 1.2 |
| signed in | `/notes/new` | 90.4 → 207.1 | 94.7 → 1.4 |

## Markless limitations hit

In addition to those in `next-dashboard-LOG.md` (several recurred here: the 10 ms streaming deadline, no request
context in pages, no page status code, the `nitro` import that breaks Vercel deploys of apps with middleware):

1. **An attribute expression over an async value crashes SSR**: `<ol hidden={data.notes.length === 0}>` inside `@try`
   compiles to a server render that reads `data` outside its scope (`ReferenceError: data is not defined`).
   Workaround: compute the boolean in the loader.
2. **`{children}` inside an `@try` is not counted as rendered** (`MARKLESS_PROJECTION_NOT_RENDERED`), so a layout
   cannot put the page inside an async boundary. Workaround: `@try` only around the async parts.
3. **An `@try` whose content is a bare `{value}` renders nothing**; `<p>{value}</p>` inside it works.
4. **A failed form post cannot re-render the page with errors and status 400** (pages cannot read the request body
   or set their status), so without JavaScript a failed login only redirects back to the empty form; Remix re-renders
   it with the errors.
5. **The router runtime is modulepreloaded on every page**, so a static 404 page goes from no JavaScript to 111 kB
   downloaded (0.5 kB run).
6. **Vite 8's default CSS minifier adds vendor prefixes** (`-webkit-backdrop-filter`) the old stylesheet does not
   have; `build.cssMinify: false` keeps Tailwind's output as written.

## markless-migrate problems found

1. Fixed: **Remix v2 data requests were app requests** (`GET ?_data=`), and `_data` made a Remix form post and a plain
   post of the same fields differ. `4d16f0b`
2. Fixed: **a GET loader with a POST-only action next to it (`/logout`) was left out** as a writing endpoint. `93103f8`
3. Fixed: **the front door sent chunks loaded on interaction to the old app** (saving a note failed behind it), as both
   apps serve `/build/`. `7119325`, `e1b941e`
4. (not fixed) **Journeys on different routes share each app's server state**: with routes checked in parallel, the
   order of the sign-up and login journeys decided whether login succeeded. `--concurrency 1` made it deterministic.
5. (not fixed) `plan` lists `crypto.randomBytes()` in `remix.init/index.js` (the template's one-off setup script, not
   app code) as a source of nondeterminism.

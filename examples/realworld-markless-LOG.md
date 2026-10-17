# Migration log: RealWorld "Conduit" (Angular) to Markless

The Angular RealWorld frontend, ported to Markless 0.4.0 (the published packages) by Claude Code, checked
route by route against the unchanged original with `markless-migrate`. Both apps talk to the same RealWorld
backend, so their network contracts can be compared request for request.

## What was migrated

| Part | Upstream | Commit | Licence |
| --- | --- | --- | --- |
| Old frontend | [realworld-apps/angular-realworld-example-app](https://github.com/realworld-apps/angular-realworld-example-app) (Angular 21, zoneless, signals, path routing) | `dd99ed2` | MIT (`LICENSE-angular-realworld`) |
| Theme | [realworld-apps/realworld](https://github.com/realworld-apps/realworld) `assets/theme/styles.css` (the submodule the Angular app builds from) | `ffbd690` | MIT (`LICENSE-realworld`) |
| Backend | [realworld-apps/nitro-prisma-zod-realworld-example-app](https://github.com/realworld-apps/nitro-prisma-zod-realworld-example-app) (Nitro, Prisma, libsql SQLite, JWT), one of the two spec-compliant backends the RealWorld README lists | `c8c6685` | MIT |

Why Angular and not the Vue 3 app first considered (`mutoe/vue3-realworld-example-app`): that app uses hash
routing, so every page is `/` to a crawler and to `check`; the Angular app has real paths.

The upstream checkouts live outside this repo, in `../mm-upstreams/`. The one change to the old app is its API
base: `src/app/core/interceptors/api.interceptor.ts` points at `https://api.realworld.show/api`, and is set to
`/api` so the old app talks to the same backend as the new one (both serve `/api` from their own origin and
forward it).

Seed data (`deploy/realworld/seed.ts`, through the API itself): 4 users, 23 articles over 10 tags, comments on 6
articles, favourites and follows, so the home feed has 3 pages. The seeded SQLite file is
`deploy/realworld/conduit.db`.

## Running it locally

```bash
# backend on :4100
cd ../mm-upstreams/nitro-prisma-zod-realworld-example-app && bun install && bun run build
cp ../../markless-migrate/deploy/realworld/conduit.db dev.db
JWT_SECRET=conduit-demo-secret DATABASE_URL=file:./dev.db PORT=4100 bun .output/server/index.mjs
# old app on :4101 (Angular build, SPA fallback, /api forwarded)
node deploy/realworld/serve-old.ts 4101
# new app on :4102
cd examples/realworld-markless && npm run build && PORT=4102 HOST=0.0.0.0 node .output/server/index.mjs
```

Checks run against the machine's LAN address (`http://192.168.68.81:4101` and `:4102`), not `127.0.0.1`: both
apps write to one shared database, and on a non-loopback origin `check` holds every journey's write back
(`would POST ...`) instead of sending it, so exploring one app cannot change what the other one shows.

```bash
export SIGNED_IN_EMAIL=demo@conduit.test SIGNED_IN_PASSWORD=demo-password-1
node ../../src/cli.ts plan --old http://192.168.68.81:4101 --source ../../../mm-upstreams/angular-realworld-example-app
node ../../src/cli.ts check --all --old http://192.168.68.81:4101 --new http://192.168.68.81:4102 \
  --source ../../../mm-upstreams/angular-realworld-example-app --new-source . --auth .migrate/auth.json
```

Roles: anonymous and `signed-in` (the starter `auth.json` from `plan`, credentials from the environment; a copy
is in `deploy/realworld/auth.json`).

## Iterations

| # | What was checked | Result | What it caught |
| --- | --- | --- | --- |
| 1 | `/`, one article, `/login`, both roles | 0 of 6 green | `<html lang="en">` the old app does not have (`-webkit-locale` on every element, `i18n`); hidden header menus taking image positions; hidden "Your Feed" `<li>` adding a sibling margin; Google Fonts as a cross-origin stylesheet so the font files could not be hashed, and an extra request; favourite buttons redrawn instead of updated in place, losing focus |
| 2 | 11 routes x 2 roles | 6 anonymous green | `background: none` minified to `0 0` by Vite (computed `background-position` differs), so the theme CSS is now served from `public/` untouched; held-back favourite POST: Angular maps the empty 204 to an error and changes nothing, the port toggled; signed-in pages made an extra `GET /api/user` on every link |
| 3 | same | 20 of 22 | forced `:hover`/`:focus` states sampled mid-transition (a tool bug, below); the profile tabs reloaded the whole page |
| 4 | same | 22 of 22 | |
| 5 | `check --all` | 179 of 188 | an unmatched route's "Home" link must still load the home page; following the header's own-profile link from another profile must keep the page (Angular reuses the component); a third request landing after the step settled |
| 6 | the 9 red | 14 of 16 | |
| 7 | `check --all` | see below | |

## Results

(filled in from the last `check --all`, see the end of this file)

## How the port is built, and why

Markless 0.4.0 could not express most of this app's client-side UI the idiomatic way (see "Markless
limitations"), so the port is split:

- Markless renders every page's static shell on the server (`components/*.tsrx`, `pages/**`), wires the
  events, and wakes the code that runs after load (`onVisible` / one boot event per page).
- The parts drawn from API data (article lists, the article page, comments, profiles, the header's signed-in
  menu) are drawn by `lib/render.ts` from the same template the Angular components used, element for element,
  and updated by `lib/pages.ts`, which makes the same API calls in the same order as the Angular services.
- `lib/nav.ts` reproduces the two Angular router behaviours a full page load would change: a link to the
  address already shown does nothing, and switching tabs inside a page (the home feeds, one tag to another, a
  profile's posts and favourites) keeps the page and reloads only the list, as Angular reuses the component.
- The signed-in user is fetched once per tab (`GET /api/user`) and kept in `sessionStorage` for in-app
  navigations only, as the single-page app kept it in memory; a reload or a direct visit asks again, as the old
  app does.

The session stays a JWT in `localStorage` under the old key (`jwtToken`), so a visitor signed in on the old app
is signed in on the new one, and the front door can switch routes without signing anyone out. Because the token
is not a cookie, the server cannot know who is signed in, so pages are rendered on the server in their loading
state and filled in the browser, exactly as the old app did; a cookie session would let Markless render signed-in
pages on the server, which is the one real improvement this port leaves on the table to stay a drop-in.

## Accepted differences

(see the end of this file)

## Weight

JavaScript per route, uncompressed, from the last `check` (old Angular -> new Markless):

| Route | On the wire | Run at load |
| --- | --- | --- |
| `/` | 307.0 kB -> 196 kB | 182 kB -> 47 kB |
| `/article/:slug` | 368.1 kB -> 179 kB | 213 kB -> 55 kB |
| `/profile/:username` | 293.6 kB -> 182 kB | 174 kB -> 46 kB |
| `/login` | 278.4 kB -> 201 kB | 140 kB -> 43 kB |
| `/settings` | 315.1 kB -> 188 kB | 178 kB -> 43 kB |

About a quarter of the JavaScript runs at load. Most of what is still downloaded is Markless's own runtime,
module-preloaded on every page (see the limitations).

## Markless limitations hit (0.4.0, the published packages)

Each was reproduced on its own; minimal repros for the main ones are in `realworld-markless/probes/`.

1. **A keyed `@for` whose row binds any attribute never renders rows the browser adds.** `@for (const t of
   rows; key t.id) { <li class={t.on ? 'on' : 'off'}>{t.name}</li> }` stays empty when `rows` is set from a
   handler, with no diagnostic in a production or debug build. Rows with text only work. Every list here has
   `href`s, `src`s or classes per row (articles, tags, comments, pagination), so lists are drawn by
   `lib/render.ts` into an element handle instead.
2. **An `attach` on a row created in the browser never runs**, so attributes cannot be set from a behaviour either.
3. **Writing to a row item in a row handler is rejected** (`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`),
   though the lists doc's own example does `item.done = !item.done`; and a row handler that reads the parent's
   array state gets `null` at run time.
4. **Reads nested under an index or call in a template are silently not reactive**: `href={'/x/' + (rows[0]?.id
   ?? '')}` and `{rows[0]?.name}` render once and never update. In handlers and `computed` the compiler asks for
   a local read first (`const list = rows; list[0]`), which works.
5. **An `@if` arm cannot hold any attribute binding** (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`), so every
   state-dependent block with an `href` or `class` had to become a `hidden` toggle or imperative markup; a
   `hidden` element still counts as a sibling for CSS (`.nav-item + .nav-item`) and as an image position.
6. **`onVisible` does not fire until the runtime has woken from some other event.** The event-only resumer
   skips `visible` records, so a page with only `onVisible` never runs it. Worked around with one hidden element
   carrying `onBoot` and a script that dispatches `boot` on `load`.
7. **A prop captured by a browser handler or `computed` fails at run time** ("Capture slot ... is a callback
   route"), so handlers read `window.location` instead of the `url`/`params` props.
8. **`<br />` is serialized as `<br></br>`**; an HTML parser reads `</br>` as a second `<br>`, which doubles the
   line break and shifts every DOM-order locator after it, so every handler after it binds to the wrong element.
   All void elements get end tags (`<img></img>`, `<link></link>`); only `</br>` (and `</p>`) create elements.
9. **Text inside a `<script>` is entity-escaped** (`=>` becomes `=&gt;`, quotes become `&quot;`), so inline
   scripts with `>`/`&` break; inline scripts here avoid those characters.
10. **`document.tsrx` attributes on `<Html>` are ignored**: the router's transform only matches `document.tsx`
    and `document.jsx`, so `<Html lang=...>` in a `.tsrx` document always renders `lang="en"`. The old app has no
    `lang`; a head script removes it.
11. **The router wraps the page in `<div data-async-container>`**, which breaks a `body { display: flex }`
    layout whose child must be the page root (`app-root { flex: 1 }`); fixed with `display: contents` on the
    wrapper.
12. **Component `<style>` blocks are not linked into the server HTML**; their CSS loads only after the runtime
    wakes, so the first paint is unstyled. Rules live in global stylesheets instead.
13. **`Link` from `@markless/router` fails the build** (`MARKLESS_CAPTURE_METADATA_MISSING` for the imported
    child), and plain `<a>` links do full page loads, though the links doc says both navigate in place. So every
    link is a document load; the session cache and `lib/nav.ts` above keep the requests the same.
14. **`shared()` fields written from a handler must be declared from a spread `state()` object**
    (`MARKLESS_SHARED_SEED_UNKNOWN_FIELD` otherwise), and **generic type arguments inside a handler are
    rewritten as state reads**: `api<{ tags: string[] }>()` next to `let tags = state(...)` compiles to
    `api<{ context.graph.read("state:tags"): string[] }>` and fails to parse.
15. **A build whose component has compile errors can hang with no output** when the component is reached through
    a layout; the same errors are reported when it is imported directly.
16. **The dev server cannot render a `document.tsrx` that uses `Html`** (`MARKLESS_CAPTURE_METADATA_MISSING`);
    only production builds were usable.
17. **create-markless**: the next step it prints is `npm dev` (needs `npm run dev`), and its `doctor` script runs
    `pnpm exec vp build` in an npm project.

## Tool bugs found and fixed (with tests)

- `assets`: Angular's esbuild names (`chunk-BBLBSSIH.js`, upper-case base32) were not seen as build output, so
  every old chunk was probed on the new app as a missing public file (`src/check/assets.ts`, `test/compare.test.ts`).
- Forced CSS states were sampled with their transitions paused at frame 0, i.e. at the value before the state;
  whether a 150 ms transition had finished depended on timing, so `:hover`/`:focus` styles flipped between runs.
  Transitions are now finished (`src/check/states.ts`, `test/states-settle.test.ts`).
- Computed styles were read while finite CSS animations ran (a 2 s entrance animation), so the slower app looked
  finished and the faster one did not; they are finished before styles are read, and what was moving is kept for
  the reduced-motion check (`src/check/capture.ts`, `test/settle.test.ts`).
- `settle` scrolled to the bottom and straight back, so a script lazy loader that cancels when its element leaves
  the viewport never got its response; it now waits for requests to finish at the bottom (`test/settle.test.ts`).
- Rendered fonts were assigned to elements by document order of marked nodes, not by the snapshot's order, so
  one detached or reordered node shifted every font after it (`src/check/fonts.ts`, `test/fonts.test.ts`).
- A step's requests were compared in order; concurrent requests finish in any order, so they are now a set
  (`src/check/journeys.ts`, `test/journeys.test.ts`).
- Webpack chunk names (`/assets/js/17698.64a0fc96bb.js`) are built from an id and a hash map, so the full name
  never appears in the built text; the hash alone now counts. `application/javascript` and `text/javascript` are
  the same Content-Type (`src/check/assets.ts`).

These landed in commit `2322840` together with another worker's shadcn-admin port: the repo's index is shared,
and that commit swept up what was staged here.

## Tool problems not fixed

- `plan` reads Angular's guest-only guards (`canActivate: [() => isAuthenticated.pipe(map(isAuth => !isAuth))]`)
  as "signed-in" guards: `/login` and `/register` are listed as needing a session.
- `plan --source` scans the old app's git submodule (`realworld/specs/api/hurl-to-bruno.js` shows up as a source
  of server nondeterminism).
- Browser storage is not compared, although `docs/plan.md` lists it; the port's extra `sessionStorage` key is
  invisible to `check`.
- A journey that follows a link into a route the new app does not have yet is compared against the new app's own
  404, not against the old app the front door would send it to.

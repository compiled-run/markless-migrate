# @markless/migrate: plan

The developer's own agent (Claude Code, Cursor, Codex) converts the app. Markless supplies the
inventory, the conformance suite and the cut-over, so "done" is a green report, not the agent's word.

## The loop

1. `markless-migrate plan <old-app>` inventories the old app and writes `migration/inventory.json`,
   `migration/plan.md` and an agent skill (through the existing agents.ts skill writer).
2. The agent converts one route (and what it depends on).
3. `markless-migrate check <route|--all>` runs the conformance suite old-vs-new and writes a report the
   agent reads: every failing check names the route, the dimension, the diff and the likely fix.
4. Green route: `markless-migrate switch <route>` moves it from the pass-through to Markless.
5. Repeat until every route is green and switched; then the pass-through is removed.

During the whole migration the new app runs in front and forwards unswitched routes to the old one
(Nitro routeRules proxy; the markless router already passes routeRules through to Nitro), so it
ships on day one.

## Your own agent, on your own subscription

This tool never calls a model or holds an API key. The developer's agent does the converting, signed
in with their own plan:

- `npx @markless/migrate setup` registers an MCP server and installs the migration skill for each agent
  it finds (the REA pattern: review the changes, approve, backups kept): Claude Code, Codex, Cursor,
  Gemini CLI, GitHub Copilot (VS Code agent mode and CLI), Windsurf, Cline/Roo, Zed, Amp, opencode,
  Kiro, Grok Build. Markless's own create CLI already writes skills for several of these (agents.ts);
  share that code.
- The MCP server exposes the loop as tools: plan, next route, check route, explain failure, switch route,
  status. Every result is evidence plus a fix the agent can act on.
- Unattended mode: `markless-migrate run --agent claude|codex|gemini|cursor|copilot|opencode` drives the
  agent's own CLI headless (claude -p, codex exec, gemini -p, cursor-agent, copilot -p, opencode run)
  route by route until every route is green or a route needs a human. It uses whatever login that CLI
  already has, so it runs on the developer's subscription.

## Drop-in replacement: what the inventory finds and the suite checks

The bar is that a user, a crawler, a screen reader and the backend cannot tell which app served a route.

| Dimension | Inventory (old app) | Conformance check (old vs new) |
| --- | --- | --- |
| Routes | router config, file routes, sitemap, crawl of internal links, redirects | every URL: status, redirects, response headers, content type |
| Rendered page | server HTML per route | normalised DOM and accessibility tree equal; screenshots per viewport within a threshold |
| Interactive behaviour | automatic exploration in a real browser: every button, link, form, menu, keyboard path, recorded as replayable scripts | replay each script on the new app: same resulting DOM, URL, focus, network requests |
| CSS | every stylesheet, parsed with yuku-css: rules, custom properties, @media/@container/@layer, fonts, keyframes | computed styles per element and state (hover, focus, open, each breakpoint) equal; stylesheets compared structurally with yuku-css, ignoring hashed class names and rule order, so a missing or changed rule is named, not just seen as pixels |
| Assets | images, fonts, icons, favicons, manifest, downloads, public/ files | every asset served at the same URL (or redirected), same bytes or same decoded image, same content type and cache headers |
| Internationalisation | locales, locale routing (prefix/domain/cookie/Accept-Language), message catalogues, date/number/currency formats, RTL, hreflang | every route in every locale: same text, same formats, same locale negotiation and redirects, same dir and lang attributes |
| Accessibility | axe results, accessibility tree, focus order, landmarks, live regions, reduced-motion and contrast media | same accessibility tree and focus order per route and per state; axe no worse; same keyboard paths; same announcements in live regions |
| Behaviour over time | client navigation, history and scroll restoration, prefetching, loading and error states, optimistic UI, timers, websockets | replayed journeys across routes give the same URLs, history entries, scroll positions, loading and error states, and the same live updates |
| SEO metadata | title, meta, Open Graph, canonical, hreflang, robots, JSON-LD, sitemap.xml, robots.txt | byte-for-byte equal after normalisation, per route |
| Bundler plugins | vite/webpack/next config: SVG/image imports, MDX, CSS modules, Tailwind/PostCSS, env vars, aliases | each mapped to a Markless equivalent or flagged; assets resolve, styles apply, env reads match |
| CMS and data wiring | fetch calls and SDKs (Contentful, Sanity, Strapi, Shopify...), env keys, preview mode, revalidation/webhooks | the same upstream requests during render; content parity on every CMS-driven route; preview and revalidation still fire |
| Component libraries | dependency scan (MUI, Radix, shadcn, Headless UI, Chakra...) | mapped to @markless/ui families or flagged; keyboard and accessibility behaviour of each instance matches |
| Forms, auth, cookies | actions, API routes, middleware, cookies set | same requests, same cookies, same redirects |
| Browser storage | cookies, localStorage, sessionStorage, IndexedDB, service worker, cache | same keys written with the same values and cookie attributes; existing visitors' storage still read correctly after the switch |
| Errors and edge routes | 404, 500, redirects, trailing slashes, case, query strings, auth walls | same status codes and pages for unknown, broken and protected routes |
| Third-party scripts | analytics, tag managers, chat widgets | present, loaded, firing the same events |
| Weight | JavaScript executed at load per route | reported before/after; never worse is a check, the drop is the headline |

## Build order

0. Proof apps: one React + Vite app and one Next.js App Router app with a CMS, chosen from public repos.
1. Inventory + routes + rendered page + SEO, and `check` on one route. Proves the loop end to end.
2. Pass-through proxy and `switch` (built: `switch`, `unswitch`, `proxy`, `config --vercel/--nitro`).
3. Interaction exploration and replay.
4. Bundler-plugin and component-library mapping.
5. CMS/network contracts, forms/auth, third-party scripts.
6. Agent skill and agent-facing diagnostics polished against real migrations by Claude Code and Codex.

## Decisions

- Markless-only, published as `@markless/migrate` from this separate repo (fixtures for every framework).
- Open source, MIT.
- The developer's own agent converts; this tool never calls a model.

## Open, with recommendations

- First source framework: Next.js App Router (see notes/hosts.md).
- How strict "matches" is: accessibility tree, text, metadata and network requests must match;
  screenshots within a small pixel threshold.
- Proof apps: Next.js Commerce and a Contentful or Sanity blog starter.

## What still slips through (2026-10-16, after freezing, network contracts, recorded data and write safety)

What `check` does not catch yet, so a green report does not promise it.

Freezing and noise:

- The clock is frozen in the browser only. Server time, server randomness, data that changes between
  requests and server-side experiments still vary; they are left to the noise baseline below and listed
  in the report's noise section, with the server-side sources the source scan found, but they cannot be
  matched to an element.
- The frozen clock moves only when a `setTimeout` or `setInterval` callback runs, to the time it was due.
  A clock that ticks every second still shows how many ticks ran before the capture, which depends on
  real time. `performance.now`, `requestAnimationFrame` timestamps and `Intl.DateTimeFormat().format()`
  with no date (which reads the engine's own clock) are not frozen. After 10,000 reads of the clock
  without a timer in between, it creeps forward 1 ms per read so busy-waits end.
- `Math.random` is one seeded stream per page: when a framework draws from it too, a change in how
  often the framework draws shifts the values the page sees, and the new app may show different
  "random" values than the old one (reported, not hidden). Web Workers, iframes from other origins and
  service workers are not frozen; service workers are blocked.
- The tracker list is host-based. First-party analytics (served from the app's own origin), tag
  managers on unlisted hosts, and feature-flag services (LaunchDarkly, GrowthBook, Statsig) are not
  blocked, because blocking flags changes which features render.

Noise between loads:

- A text line that differed between the OLD loads may vary only where they differed, within the same
  kind of character. When the first two OLD loads differ, a third is taken after NEW. A value that
  changes between the concurrent second OLD load and the NEW load but never between OLD loads (a clock
  rolling over a minute in that moment) is a false red; this is rare, not impossible.
- Noise the OLD loads did not show (an A/B test that picked the same arm every time) is reported as a
  difference. A line only some OLD loads showed may be absent or replaced.
- Pixels within 6px of pixels that differed between OLD loads are not compared. In forced states the
  whole block around text that varied is masked. pixelmatch's threshold (0.1) misses small shifts
  between dark colours: a changed dark-mode background is caught by computed styles, not by pixels.

CSS states:

- States are forced on the desktop viewport only, on the first two visible elements a state's selector
  matches, and at most 40 states per route. `:hover`, `:focus`, `:focus-visible`, `:focus-within` and
  `:active` are forced through DevTools on that element alone (not its ancestors, no mouse events);
  `:checked`, `:disabled` and `[open]` are set as DOM properties without events.
- Container queries are forced by sizing each size container's content box to the edge widths; only
  width and inline-size conditions are listed, not height or `style()` queries.
- The rule a difference is traced to is the OLD stylesheet as served, followed through the stylesheet's
  source map to the source file and line when the build has one (Next.js with
  `productionBrowserSourceMaps`); Vite builds no CSS source maps, so with `--source` the rule is found in
  the source stylesheets by selector, which misses Sass, CSS modules and PostCSS output whose selectors
  differ from the source.
  Attribution weighs `!important`, specificity and source order; cascade layers are ignored, and a
  shorthand covers its longhands through a short table. Cross-origin stylesheets are not read.
- Box geometry (width, height, transform and perspective origins) and custom properties are not
  compared as computed styles; screenshots cover geometry. `font-family` is compared through the font
  files that render.

Fonts and assets:

- The file behind a web font is found through the first family in the element's stack that has a
  downloaded `@font-face` fitting its weight and style. With `unicode-range` subsets that may name the
  wrong subset; fonts loaded through the FontFace API or cross-origin CSS are named, not hashed.
- An asset counts as build output when its name carries a hash-like token (eight or more random-looking
  characters, so `logo-2024` does not) and the page's built HTML, JS or CSS refers to it, or when it
  lives in a framework's output directory (`/_next/`, `/_nuxt/`, `/_astro/`, `/_app/immutable/`).
  Whether that token really changes with the file's bytes cannot be seen from one build, so it is not
  verified. Third-party assets and scripts are not compared.

Accessibility:

- axe-core violations are compared per rule by count: swapping one violation for another of the same
  rule passes. Landmarks are compared as a set, not in order. Focus order stops after 60 Tab presses.
- Live regions are read as text after each step, which is what changed, not how or when a screen reader
  would speak it. Reduced motion catches running CSS animations, transitions and Web Animations, not
  motion driven from requestAnimationFrame or smooth scrolling.

Internationalisation:

- Dates and numbers are recognised by pattern: ISO dates and timestamps, numeric day/month/year, dates
  with month names in 15 languages, grouped numbers and decimals with a currency symbol. Times on their
  own, relative dates ("3 days ago"), percentages and numbering systems other than Latin and
  Arabic-Indic are not.
- Locales come from hreflang, `<html lang>` and the inventory. Locales chosen by cookie or domain are
  not tried. Accept-Language is compared by the page a browser lands on, and only on routes where the
  OLD app lands differently by language; the redirect status is the http check's.

Interactions:

- Exploration is driven by coverage, on the desktop viewport: every interactive element of the OLD
  page, and every one a step reveals (to four steps deep), is used by one journey, main content first
  (tables, then forms, then the rest of `main`, then shared header, nav, sidebar and footer controls),
  then the keyboard paths, until `--journey-budget` (default 120 s) or `--max-journeys` runs out. An
  element no journey used is a red `behaviour` failure, "not exercised", with the reason (out of budget,
  looks destructive, could not be used on OLD) until a person accepts it. A shared layout control is
  explored by the first route of the run that has it; the other routes carry its failures. It clicks,
  types fixed sample values, chooses the second option of a select, and presses Enter, Space, and after
  opening something Escape and ArrowDown. It does not hover, drag, scroll, long-press or try
  other shortcuts. Form values may fail a page's own validation patterns.
- Requests to other origins are blocked during journeys (unless answered from recorded data), so
  third-party widgets do not run. Form posts and non-GET requests are sent only when both origins are on
  this machine or marked `--staging`; otherwise they are answered by the checker and compared as
  "would POST ..." (a held-back form post lands on a placeholder page, so what the real response would
  have shown is not compared).
- Steps find their target by accessibility role, name and position, so a control renamed on NEW fails
  as "could not be used". After a step navigates, the landing page's content and focus are left to that
  route's own checks. Framework transport (React Server Component payloads, server-action posts,
  `/_next/` requests) is excluded, and GET page loads are compared through the URL only. Timers,
  websockets, history entries and scroll restoration are not compared.

Network contracts:

- Compared per route on the desktop load: browser `fetch`, XHR, EventSource and beacons to any origin,
  documents from other origins, and, with the request recorder, every `fetch` the Node server makes for
  that page load. Static assets, the page's own document, framework transport (`/_next/`, React Server
  Component payloads, server actions) and framework prefetches of other routes are not part of the
  contract. WebSockets are not recorded.
- Server requests are recorded only for Node servers started with the recorder; `node:http(s)` clients
  are recorded without bodies, and other runtimes not at all. Requests the server makes outside a page
  load (cron jobs, build-time fetches, caches warmed earlier) are not seen. A server that caches a
  response between loads makes the request only on some loads; the noise baseline makes it optional.
- URLs are normalised before comparing: path segments that are numbers, UUIDs or long hashes, query
  values that are UUIDs, 10- or 13-digit timestamps or long hashes, and values of common cache-buster
  keys (`_`, `t`, `ts`, `cb`, `nonce`...). An id that does not look like one of these differs between
  loads and is caught by the noise baseline only if the OLD loads differed too.
- "Fields the page shows" means response values of four or more characters, not plain numbers, found
  in the page's text or attribute values. A value the page reformats (dates, prices, truncated text),
  a number, or a value shown only after an interaction is not counted; a field shown on NEW but not OLD
  is left to the rendered check.
- Pairing a missing request with an extra one to name a "changed" or "different endpoint" request is by
  side, method and host; several changes on one host may pair the wrong two.

Recorded data:

- Responses are recorded from the first OLD load of each route: text bodies up to 256 kB (binary
  responses and images are not recorded), from the browser and, with the recorder, from the server.
  Replay answers by exact URL, then by path and query on any host; anything not in the recording goes to
  the network. Recordings are not refreshed or trimmed automatically: delete `.migrate/data/` and record
  again when the old app's data changes. Same-origin API routes are never replayed, so the new app's own
  API runs for real.

Writes:

- A write is recognised by its request (method, server-action header, or a handler the source scan
  marks as writing), at the moment the browser sends it. A GET that writes is caught only when the
  source scan names its handler. Writes the server makes on its own while handling a request (for
  example on page render) are sent, because the browser cannot hold them back; replay avoids the ones
  that go through `fetch`.
- Writes the source scan finds without a request path (server actions, SDK calls, forms without an
  action) cannot be matched to a request; server actions are still caught by their `Next-Action`
  header, and form posts by their method.
- Held-back browser writes are answered with an empty 204 response, so whatever the page does with a
  real response (showing an id, a confirmation) is not exercised.

Logged-in pages (`--auth`):

- Roles come from the auth file. `plan --source` proposes them from the source scan's auth guards: a
  `signed-in` role plus each role a guard compares against (`user.role !== 'admin'`), and the login route
  from a guard's redirect or, when the redirect is built at run time (`/${lang}/login`), from a source
  route named login or sign-in made concrete with a crawled value. A role check inside a condition that
  tests the path (`pathname.startsWith('/admin/') && user.role !== 'admin'`) applies to that path only, so
  the Vite fixture's `/members/` needs a session and `/admin/` the admin role; a role check written
  elsewhere in the function (a lookup table, a helper called with the path) still applies to every path
  the function covers. The starter's steps read the login form (the field before the password, the
  password, the submit button) and end by waiting until the browser leaves the login page; logins over
  several pages, single sign-on on another origin, MFA or a CAPTCHA on the login page are not scripted:
  give the role a storage state file instead.
- Each role signs in once per side per run, with the clock unfrozen and its requests sent (the login
  script is the user's own instruction). The state is saved to `.migrate/auth/<role>.<side>.json` but not
  reused by the next run unless the auth file points `storageState` at it, and a session that expires
  during a long run is not renewed.
- Access is decided from the checker's own request with the role's cookies: denied is 401, 403, or a
  redirect that ends on the login route (the auth file's `loginRoute`, the role's first `goto`, or a path
  like `/login` or `/sign-in`). On a route the source scan finds behind an auth guard (`check --source`),
  a 404 and a 200 page whose `<title>` or first `<h1>` says access is denied, forbidden, not authorised,
  members only or sign in required count as denied too. Without `--source`, or with a denial page worded
  otherwise ("Guides only"), those are compared as pages; a denied visitor redirected somewhere other than
  a login page (the home page) is too. A session held in localStorage rather than a cookie is restored in
  the browser, but the access decision does not see it.
- When the two apps decide access differently for a role, that role's page is not compared (`skipped`):
  a login page against a members page is all noise. Fix access and check again.
- Session cookies are compared by name and attributes (Path, Domain or host-only, HttpOnly, Secure,
  SameSite, session or persistent), never by value, and not by lifetime. Only cookies for the app's host
  count. A role from a storage state file carries the cookie as saved, so what the new app's login would
  set is not seen for it: give at least one role a login script.
- Every route runs once anonymous and once per role, so a run takes (roles + 1) times as long. Recorded
  data is kept per role in `.migrate/data/<role>/`. Signing out, session expiry, CSRF tokens and
  switching roles inside one journey are not checked.

Bot protection:

- A wall is recognised by headers (`cf-mitigated: challenge`, `x-vercel-mitigated` (challenge or deny), `x-amzn-waf-action`,
  `x-datadome`, `server: AkamaiGHost`), cookies it sets (`datadome`, `_px3`, `_abck`...) and page markers
  (Cloudflare's "Just a moment..." and challenge platform, PerimeterX, DataDome, Imperva, and hCaptcha,
  reCAPTCHA or Turnstile when the status is a refusal or the title says it is a check), plus 403 or 429
  pages that talk about captchas or robots. Only a Cloudflare-style wall is proven, on the fixtures; the
  other vendors' markers come from their public challenge pages. A wall that answers 200 with none of
  these markers, or quietly serves a different page, is not recognised.
- The wall is looked for on the checker's first request for each route on each side, on every browser
  page load, and on every response from the app's own origin during the route's check: assets, fetches,
  journeys' posts, forced states, and the checker's asset probes. A wall seen anywhere stops the route as
  blocked. On assets and fetches only a challenge header (`cf-mitigated`, `x-vercel-mitigated`,
  `x-amzn-waf-action`) counts, because a CDN's `server` header on an ordinary 403 is not a wall; the
  exception is Vercel's own plain-text `403 Forbidden` (`server: Vercel`, not HTML or JSON), which its
  firewall sends and an app's own 403 page does not. Another wall that answers an asset with a plain 403
  and no header still shows up as red `assets`. Proven on the
  Vite fixture with a Cloudflare-style wall on its static files only and on its form posts only. Sign-in
  steps are not watched.
- `--header` goes only to each app's own origin (never to third parties or a redirect's other host),
  `--cookie` is set for each app's host, and `--user-agent` applies to everything; the same values go to
  both apps. `plan` takes the same three for the old app, and stops with what to do when its crawl meets
  a wall.

Other:

- Run-at-load JavaScript may grow by up to 2% plus 1 KB before `weight` goes red, because Next.js moved
  by about 1% between loads of one build.
- Element pairing for computed styles uses a role and name heuristic in the page; the accessibility
  checks use Chromium's accessibility tree and Playwright's ARIA snapshot.
- A route takes about 15 to 30 seconds to check: three OLD loads, every forced state on three pages,
  and about twenty journeys run three times. Routes run `--concurrency` at a time (default half the
  cores, at most 4); endpoints and redirects run one at a time after the pages. Each page load still gets
  a fresh browser context (34 ms each with its page on this machine, about 70 per route, so about 2 s of a
  route's time): reusing contexts would leak cookies and storage between journeys, so it was not done.
- yuku-css is not on npm yet, so the package links it from a sibling checkout and cannot be installed
  from npm until it is published.

## Routes, non-page endpoints, source locations and order (2026-10-16)

Built: `check --all` takes the inventory's route union (crawl plus source), fills dynamic segments from
crawled values or `.migrate/samples.json`, lists the rest as "needs a sample", and compares non-page
endpoints as data (`data` dimension; robots.txt and sitemaps under `seo`). Failures about an element name
the old and new source file and line (`where`, `old`, `new` on each failure; links in report.html).
`plan` prints the full migration order from `planOrder`, with the routes each step is part of, and
`status` lists steps and routes in that order. Proven on the Next.js and Vite fixtures (a feed item
removed, a robots.txt line changed, a JSON field renamed; source lines on the heading, tip label, CSS
rule and form mutations) and on `fixtures/markless-site`, a partial Markless port of two Vite routes.

### What Markless would need to add for exact new-side locations

Markless 0.4.0 (and the 0.5.0 source) emits nothing that maps a rendered element to its `.tsrx` line:
compiled elements carry no source attribute (the resumability spec keeps static nodes attribute-free),
the bundler returns `map: null` for every `.tsrx` transform, so there are no source maps back to `.tsrx`,
`window.__MARKLESS_DEBUG__.explainInteraction` returns a host node id and a mechanism, not a position,
and the "locator" stream addresses DOM order for resuming, not source. The one thing it does emit is
`<script type="@markless/core/route">{"file":"pages/about/index.tsrx"}</script>`, which the migrate side
uses to know the page file. Everything else is found by reading the `.tsrx` source with `yuku-tsrx` and
matching elements by tag, written text and accessible name, which fails when two elements on a page are
written alike or the text is computed. Exact locations need, in order of value:

1. A dev-only attribute on every host element the compiler emits, for example
   `data-markless-source="pages/about/index.tsrx:3:3"` (path relative to the app root, 1-based line and
   column of the opening tag), behind the existing `markless({ debug: true })` switch so production HTML
   stays attribute-free. `markless-migrate` already reads `data-markless-source` first.
2. The compiler's per-module source maps passed through the bundler instead of `map: null`, in dev and
   (opt-in) in build, so client code positions map back to `.tsrx` lines the way React's do.
3. `explainInteraction(element)` (or a sibling `explainElement`) returning the source position of the
   element's template node and its component, for elements created on the client where an attribute is
   not rendered.

### What still slips through, from this work

- Old-side runtime hints are proven for production React (fiber to component function to source map),
  static HTML, and development builds on Vite's dev server: React 19's owner stack followed through the
  dev server's source map, Vue's `__file` (the element is then found in that component's template), and
  Svelte 5's `__svelte_meta`. React 18's `_debugSource` and the data attributes are implemented but not
  run by a fixture. Elements a Next.js server component renders have no client fiber, so they are found
  by source matching only.
- Source matching needs the element's tag plus its written text or accessible name; an element whose
  text is entirely computed is placed only inside the route's own files (and the files they import),
  and text from a dictionary is named by exact string or the longest literal it contains. Of several
  elements written alike, a failure about the n-th identical line of the accessibility tree or the text
  is tied to the n-th element with that role and name, and the source element is chosen by its chain of
  ancestors and its position among same-tag siblings (`main:1>section:2>article:2>p:2`); proven on the Vite
  fixture's two "Guided" paragraphs. Inside a component the chain only reaches the component's root, so
  two instances of one component rendered alike still resolve to the one line that writes them (which is
  right), and an element repeated by a loop resolves to the loop body. Elements created by plain JavaScript
  (`createElement`) are not traced to the script that made them (CDP node stack traces would do it).
- Failures about the accessibility tree name the element only when the snapshot line carries a name or
  text; landmark-only and focus-order failures carry no location.
- Feeds are keyed by guid, id, link or title; a feed that changes every key at once reports every item
  as missing. JSON arrays of objects are keyed by the first of `id`, `_id`, `uuid`, `slug`, `key`, `href`,
  `url`, `src`, `path`, `guid`, `title`, `name` that every item has with a distinct value, else aligned by
  longest common subsequence (an item replaced in place is a changed value), so a removed middle item is
  reported as that item; proven on the manifest's icons. When the new app renames the identity field
  itself, the arrays fall back to alignment and the rename shows as changed fields. Endpoint discovery
  probes a fixed list of well-known paths and the feeds and manifest the first 20 pages link to;
  endpoints only reachable otherwise need `--route`. Under `--auth` endpoints are checked once per role
  with that role's session.
- "Needs a sample" routes are counted as not checked: the summary and report.html say how many, and
  `check` exits 1 for them unless `--allow-unchecked`.

## Switching, intended differences, run and speed (2026-10-16)

Built: `switch <route>` / `unswitch` maintain `.migrate/switched.json` (refused unless the last check of
every role is green; `--force --by <name> --reason <why>`, or a confirmation at a terminal, records who
forced it and why, refused for agents `run` drives; MCP `switch_route` never forces). `proxy` serves both apps on one origin; `config` writes `vercel.json` and
Nitro `routeRules`. `accept <failure-id> --reason` writes `.migrate/accepted.json`; accepted failures show
as accepted with the reason, stale entries are listed. `run` checks like `check` (`--source`,
`--new-source`, `--auth`, bypass flags, `--all`), owns the new app's server with `--serve`/`--build`/
`--restart-on`, and passes the MCP server to codex and claude on the command line. `check --all` also
covers redirects and a path no app has. `weight` counts every downloaded script. report.html keeps its
screenshots in `.migrate/shots/`. `--concurrency` and `--changed`. Proven by `test/e2e/proxy.test.ts`
(both apps from the Vite fixture: assets from each side and the fallback, a form post, signing in on OLD
and landing on a switched page, an absolute redirect, a consent cookie pinned to OLD's domain, a cart
cookie set by NEW), the Vercel rewrites compiled with `@vercel/routing-utils`, and the fixture suites.

### What still slips through, from this work

- The proxy picks a side for an asset by the `Referer`'s route; a request without a Referer (a
  `no-referrer` policy, a service worker, a prefetch from another page) goes by its own path, then the
  other app on 404, 405, 410 or 501. An asset both apps serve at the same path with different bytes is
  served by the page's side, which is right for that page and may be wrong for a page of the other app
  that loads it later from cache. Bodies are not rewritten, so absolute URLs to either app's own host
  inside HTML, CSS or JS (canonical links, `og:url`, hard-coded asset hosts) still point there.
  WebSockets (Vite's HMR, live updates) are not proxied. Secure cookies work on `localhost` only.
- `config --vercel` cannot try one deployment and fall back to the other: an asset goes to NEW only when
  a switched page's HTML loads it and OLD does not serve it, and a whole directory goes when OLD has no
  inventoried asset in it. Chunks a NEW page imports at run time from a directory OLD also uses (both
  apps on Vite's `/assets/`) are not listed: regenerate the config after each deploy, or give the two
  apps different asset directories. `config --nitro` proxies only the inventoried routes, endpoints and
  assets of OLD (exact paths); a path the inventory never saw is answered by the Markless app. Nitro
  3's routeRules cannot switch a route back off a wider `proxy` rule, so there is no catch-all.
- `switch` decides on `.migrate/results.json`, so a route checked green against an older build of NEW
  stays switchable until it is checked again.
- Failure ids hash the route, role, dimension, check, viewport, expected and actual (origins replaced),
  so an accepted difference whose values move (a count, a date the noise baseline did not catch) is a new
  failure and the old entry turns stale; widen it by hand with a `/regex/`. Accepting a failure that
  stopped a route from being compared (an access decision) does not make the route green.
- `run --serve` restarts the server only after an attempt or when `--restart-on` changes; an agent that
  builds into a path not named there checks against the old server until the attempt ends. Build and
  server output are kept only when they fail.
- `--changed` trusts git: files outside the new app's checkout (a linked package, a CMS) and changes git
  ignores are not seen, and a route checked without `--new-source` (or without git) has no file list, so
  any change re-checks it. Which files a route is rendered from comes from the page file Markless names
  and what it imports, plus `document.tsrx`.
- Redirects come from Next.js `redirects()`, `vercel.json`, `serve.json` and `_redirects`, plus the other
  trailing-slash form of every page; dynamic redirect sources (`/blog/:slug`), middleware redirects and
  Nuxt/SvelteKit/Astro config are not read. Only the status and redirect chain are compared for them.

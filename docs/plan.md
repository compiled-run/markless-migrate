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
2. Pass-through proxy and `switch`.
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
- The rule a difference is traced to is the OLD stylesheet as served: Next.js and Vite minify CSS, so
  the line and column point into the built file, not the source (source maps are not followed).
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

- Exploration is breadth first to depth 2, at most 30 journeys per route, on the desktop viewport. It
  clicks, types fixed sample values, chooses the second option of a select, and presses Enter, Space,
  and after opening something Escape and ArrowDown. It does not hover, drag, scroll, long-press or try
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

Other:

- Run-at-load JavaScript may grow by up to 2% plus 1 KB before `weight` goes red, because Next.js moved
  by about 1% between loads of one build.
- Element pairing for computed styles uses a role and name heuristic in the page; the accessibility
  checks use Chromium's accessibility tree and Playwright's ARIA snapshot.
- A route takes about 15 to 30 seconds to check: three OLD loads, every forced state on three pages,
  and about twenty journeys run three times.
- yuku-css is not on npm yet, so the package links it from a sibling checkout and cannot be installed
  from npm until it is published.

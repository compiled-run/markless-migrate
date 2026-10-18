# The hard problems, and where semantic analysis helps

"Semantic analysis" here means reading the old app's source with real parsers (oxc for JS/TS, yuku-css
for CSS, framework-specific readers for routes and config), plus Markless's own analyzer on the new
app. It never calls a model; the agent can add hints in a file the tool reads.

| Problem | Runtime answer | What semantic analysis adds |
| --- | --- | --- |
| Routes hidden behind JavaScript | interaction explorer records every URL it reaches | read the router: Next/Remix/React Router/Vue Router/Angular route tables, Rails `routes.rb`, Laravel `routes/web.php`, Django `urls.py`, WordPress permalinks; dynamic segments get sample values from the sitemap, links or the CMS |
| Logged-in pages | `--auth` runs a login script once (or reuses a Playwright storage state) per role, and every check runs once per role; `plan` writes the roles it finds into a starter auth file | find auth guards (middleware, layouts, `before_action`, decorators) to know which routes need which role, and the login route to script |
| Writes in production | explorer classifies every action before running it; anything that writes is replayed only against `--old` marked as staging, or recorded as "would POST /cart" and compared without sending | read form handlers, server actions, API routes and fetch calls to know which actions write (method, handler body touching a DB or payment SDK) and which are safe reads |
| Bot protection | run against staging/preview URLs; `--header`/`--cookie` for a bypass token; detect challenge pages and stop with a clear message instead of failing every check | none needed |
| Noise (A/B tests, ads, personalisation, time) | repeated old loads, then freeze what can be frozen: fixed clock, seeded `Math.random`, fixed timezone and locale, ads/analytics blocked | find the sources of variation (`Date.now`, `new Date`, `Math.random`, feature-flag SDKs, ad and analytics tags, personalisation reads) and pin them deliberately instead of guessing from diffs; flag the rest as known noise per element |
| Other origins (CMS, APIs, payments) | record every request each page makes during server render and in the browser, compare old vs new as a contract (method, path, query, body shape, which response fields the page actually uses) | find the CMS and API clients (Contentful, Sanity, Shopify, Strapi, REST/GraphQL), their queries and the fields read, so a missing field or a different query is named before the page even renders |
| Same data on both sides | point both apps at the same staging backend, or replay recorded responses (record from old, serve to both) | know which responses feed which component, so recorded data can be trimmed and refreshed per route |
| Explaining a failure | today: route, dimension, expected/actual, old CSS rule | map each DOM node back to the old component and source line (source maps, React/Vue devtools hooks, data attributes) and to the new `.tsrx` component via Markless's analyzer, so a failure says "old `ProductCard.tsx:42` renders the price; new `product-card.tsrx` doesn't" |
| Planning the order | none | dependency graph of old components and routes: convert shared layout and leaf components first, routes in an order where each one unlocks the most others |
| Non-browser surface | compare RSS/Atom, sitemap, robots, `/.well-known`, JSON endpoints, emails rendered by the app | route reading finds these non-page endpoints so they are checked too |

## Order

1. Freeze nondeterminism (clock, random, timezone, blocked ad/analytics), with source scanning to find
   what to pin. Every other check gets more trustworthy.
2. Network contracts: record requests per page, compare old vs new. Covers CMS and APIs.
3. Write-safety: classify actions by reading handlers; never send a write to anything not marked
   staging.
4. Auth: roles from guards, a login script per role, checks per role.
5. Route reading for the common stacks beyond Next.js.
6. Old-to-new source mapping in failures, using Markless's analyzer on the new side.
7. Bot-protection detection and bypass headers.

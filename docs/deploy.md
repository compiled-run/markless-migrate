# Caching, switching and deploying

Back to the [overview](../README.md).

## Caching on the CDN

Every migrated site is cached from evidence, not guesses. `plan` ends by asking the old app for every
route twice and once more with a cookie, and writes `.migrate/caching.json`: each route's class, the
reason with its evidence, and the evidence itself (status, Cache-Control, ETag, Last-Modified, Vary,
the cookies set, Age, and `x-vercel-cache`, `cf-cache-status`, Netlify's `Cache-Status` or `x-cache`).
With `--source`, the old route's file and what it imports are read too: auth guards, server reads of
cookies, headers and the session, query keys read, server-side personalisation and flags, data fetched
while rendering. `cache plan` runs the same step on its own.

| Class | When | Generated rule (Vercel through Nitro) |
| --- | --- | --- |
| prerender | the same body and ETag on every request, nothing reads the request | `isr: { expiration: false }`: rendered once per deploy, then the CDN |
| CDN with revalidation | its data changes (the body or ETag moved between requests, the old headers ask for `s-maxage` or `stale-while-revalidate`, the server fetches data or reads the clock) | `isr: { expiration: <old TTL, else 60 s> }`; a page that reads the query gets `s-maxage` and `stale-while-revalidate` instead (Vercel's ISR hands the page no query) |
| never cached | it sets a cookie, is `private`/`no-store`, varies on `Cookie` or `Authorization`, changes when a cookie is sent, sits behind an auth guard, is reached only signed in, or its server code reads cookies, headers or the session | `isr: false` and `Cache-Control: private, no-cache` (`private, no-store` when sign-in, a session or a set cookie is involved) |

`cache apply` (run by `run` before every build and by the deploy scripts) writes the plan into the
Markless app as `migrate-cache.ts` and adds `migrateCache()` to its `vite.config.ts` plugins: a Nitro
module that sets the rules once Nitro's options are resolved, replacing any caching the app set for
the same path and leaving proxied paths alone. Only routes a page of the app renders get a rule. The
app's own pages are read again first: a page that reads cookies or `http.request` headers, or renders
`storage()`, is never cached, whatever the old page was. Because Vercel's ISR cache ignores `Vary`, a
request carrying Markless's fragment header (read from the app's own `@markless/router`) is routed to the
page's ISR function with a query key of its own, so a fragment and a document of one URL never share an
entry. A router that fetches fragments from their own path instead (Markless 0.7: `/_markless/fragment/<page>`,
the prefix read from the app's `@markless/router`) gets each cached page's fragment URL cached the same way
as the page. Content-hashed files in `public/` are marked immutable (a directory holding only hashed files as
one rule); Markless's `/build/` and Nitro's `/assets/` already are.

Both read the app's installed `@markless/router` and Nitro, so `cache apply` and `cache check` refuse an app
that declares them but has not installed them: rules written without the router leave every fragment URL to
the server function.

`cache output [--vercel <dir>]` reads the app's Vercel build (default `.vercel/output`) before it is deployed
and exits 1 when a page the plan caches, or its fragment URL, has neither an ISR function nor a static file
there. The deploy scripts run it before uploading. The shadcn deploy script then deploys a preview, runs
`cache check` on it with the project's protection bypass (`--header name:value` is sent with every request)
and promotes it only when that is green.

`cache check --new <deployment>` reads the deployment route by route: three GETs (a miss, then hits),
a fragment request and the document straight after it, and a new visitor's page view in Chromium. It
writes `.migrate/caching-report.json` with each route's answers and exits 1 when a page the plan never
caches, or a response setting a cookie, is answered from or offered to a shared cache; when a fragment
and a document share an entry or a page answering the fragment header differently lacks it in `Vary`;
when HTML is kept by browsers (immutable, `max-age` of a day or more) or a changing page is kept until
the next deploy; when a static page is not kept, or a page the old site's CDN kept is not (including one
the port made personal); when a cached page's fragment URL is not kept (every prefetch and in-place
navigation would run a function); and when a content-hashed file the page loads is not kept by browsers. With `--previous <deployment>` (the one this deploy replaces) it also follows every file that deployment's pages load, at once or
on use (each script's static and dynamic imports), and is red for each one the new deployment answers with an error: a tab opened
before the deploy asks for its next chunk or stylesheet by those names. It
reports the CDN hit rate on the second pass, function invocations per page view and TTFB. Platform
facts behind the rules: [docs/notes/caching.md](notes/caching.md).

## Switching routes over

`switch <route>` adds the route (a path, or a pattern like `/blog/:slug`) to `.migrate/switched.json`.
It refuses unless the route's last check is green for every role it was checked as. Forcing a route
that is not green is an expert override, like `accept`: `--force --by <name> --reason <why>`, or
`--force` alone at a terminal, which asks for both and for the route typed back. It records who forced
it, why, and the checks it overrode. The MCP server's `switch_route` never forces, and an agent driven
by `run` cannot force or accept (`run` marks its environment and the CLI refuses). `unswitch` sends a
route back. A route must be a path or a `:param` / `*rest` pattern; Vercel's `/docs/:path*` is refused
with the pattern to write instead (`/docs/*rest`).

`status` lists every planned route as green, red, not ported (the old app serves it and the new one
answers 404) or not checked, marks switched routes, and shows forced ones in red as "forced, not
proven". The migration is done only when every planned route is green and switched without force.
`report.html` carries the same table, and `config --index <file>` writes it as the front door's index
page, with the routes not ported yet listed first.

`proxy` serves both apps on one origin while you migrate: page loads of switched routes go to NEW,
every other page load to OLD. Everything else (scripts, styles, images, fonts, fetches, form posts) goes
first to the app that served the page it came from (by `Referer`), then to the other app when that one
answers 404, 405, 410 or 501. Method, body, headers and cookies pass through (Host, Origin and Referer
are pointed at the upstream, `X-Forwarded-*` added). A redirect to either app's own absolute URL is
pointed back at the proxy, and a `Set-Cookie` Domain that would not apply to the proxy's host is
dropped, so a cookie one app sets (consent, cart, session) reaches the other: the cookie and asset
breakage Shopify Hydrogen's proxy hit. Each response carries `x-markless-migrate-side: old|new`.
`switched.json` is read on every request, so `switch` takes effect without a restart.

`config` writes production routing for the same list. `--vercel` writes a `vercel.json` for a project in
front of both deployments: a rewrite per switched route (with and without the trailing slash) and per
asset its NEW page loads, and per file of the new build (`--new-build`, default `.output/public`), that
OLD does not serve (a whole directory when OLD has nothing in it), then `/:path*` to OLD. A file path
OLD answers with an HTML page is not served by OLD: that is an SPA's `index.html` fallback, which would
otherwise keep the new app's scripts on the old deployment. `--nitro` writes the top-level
`nitro.routeRules` of the Markless app's `vite.config.ts` (which `router()` passes to Nitro): a `proxy`
rule per inventoried route and endpoint not switched yet, and per asset OLD's pages load that NEW does
not serve.

## Demo

A real migration you can open: vite.dev's homepage and docs, with switched routes from the Markless port
and the rest from the original, at https://markless-migrate-demo.vercel.app (`deploy/vite-dev/deploy.sh front`).
Its index is `/_migrate/`, the report `/_migrate/report.html`.

The Vite fixture in `examples/` (`vite-site-old`, its port `vite-site-markless` at https://migrate-demo-new.vercel.app,
and the CMS both read at https://migrate-demo-cms.vercel.app) is no longer hosted as a pair: run the old app with
`npm start` in `examples/vite-site-old`. `deploy/deploy.sh cms|old|new|front` still builds and deploys each.
`examples/MIGRATION-LOG.md` records every agent attempt and every problem found on the way.


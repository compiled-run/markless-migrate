# Caching on Vercel through Nitro (measured 2026-10-19, revised 2026-10-21)

What `src/cache/` relies on, each measured on a real Vercel production deploy of a minimal Nitro app
(`nitro@3.0.260429-beta`, then `3.0.260903-beta`), https://mm-nitro-cache-repro.vercel.app. The app is
`nitro.config.ts` plus one `defineHandler` per route; its source is in the last section.

| Behaviour | Measured | What the rules do about it |
| --- | --- | --- |
| Vercel's ISR cache and `Vary` | `/isr-vary` (`isr: 60`, the handler sends `Vary: x-fragment`): a request with `x-fragment: 1` after a plain one gets the plain body, `x-vercel-cache: HIT` | ISR is used only where a fragment has a URL of its own: Markless 0.7 on fetches `/_markless/fragment/<page>`, cached with the page's rule |
| Splitting ISR by a header | a Vercel route with `has: x-fragment` rewriting to an `allowQuery` key (`/isr-split`) is not reliable: the Nitro investigation on `3.0.260903-beta` saw fragment and document share one entry (https://github.com/nitrojs/nitro/issues/4876), while a probe of the repro on 2026-10-21 saw them apart. On mm-htmx-org-new and mm-docusaurus-new (router 0.5, header fragments, plain ISR) a header request got the cached document and, on a fresh entry, a plain request got the fragment, in both orders | removed. A page whose router marks fragments only by `x-markless-fragment` is cached by the CDN by `Cache-Control`, which honours the router's `Vary` |
| CDN caching by `Cache-Control` and `Vary` | `/cdn-vary` (`s-maxage=60, stale-while-revalidate=300`): fragment and document are kept apart in both orders, the query is part of the key, the page sees the query | header-fragment pages (`s-maxage=31536000` for pages static until the next deploy), and pages that read the query on a Nitro older than `3.0.260903-beta` |
| ISR and the query | `/isr-query` (`isr: { expiration: 60, allowQuery: ['q'] }`): `?q=a` and `?q=b` are cached apart, but on `3.0.260429-beta` the handler sees `q=null` for both. On `3.0.260903-beta` `passQuery: true` hands the handler the allowed keys | a page that reads only known keys gets `isr: { allowQuery: <keys>, passQuery: true }` (its fragment URL too) when the app's Nitro is `3.0.260903-beta` or later; otherwise the CDN by `Cache-Control` |
| A `headers` routeRule on a server-rendered route | `/headers-only`: answered 200 by the function, the rule's `cache-control` replaces the handler's | `no-cache` pages get `Cache-Control` from a routeRule |
| `prerender: true` | a plain Nitro handler is written to a static file (MISS, then HIT); in a Markless app every route prerenders as 404 (`Prerendered 0 routes`) | static pages use `isr: { expiration: false }`: rendered once per deploy, then the CDN |
| `publicAssets` `maxAge` | a directory with `maxAge: 0` and no `fallthrough` is served `public,max-age=31536000,immutable`, its 404s too | hashed files get their own `immutable` rule; nothing relies on `maxAge` |

Every Vercel response names its path through the network in `x-vercel-id`: `cle1::iad1::<id>` when a
function region answered (an invocation, or an ISR entry kept in that region), `cle1::<id>` from the
edge alone. An invocation is a response that is not `HIT`, `STALE` or `PRERENDER` whose id names a
function region.

`cache check` tells a fragment from a document by the comments the app's router ends a fragment with
(`FRAGMENT_REGION_END`, `FRAGMENT_APPEND_END`, read from its build), on every request. It asks for the
fragment then the document twice, and the reverse: on fresh entries where the CDN keys on the whole URL
(a made-up query value), and after waiting out the revalidation of up to three ISR pages (`--expiry-wait`,
default 130 s). Pages on ISR that never expire before the next deploy cannot be expired by the check;
the report says so. A page that reads the query is asked for two made-up values on the document and the
fragment URL: red when it does not show a value the old site's page shows, or shows the other value.

## Upstream candidates (Nitro)

1. Fixed in `3.0.260903-beta` with `passQuery`: ISR routes did not see their allowed query keys
   (`isrRouteRewrite` returned `[route, ""]` whenever `x-now-route-matches` was present). Repro:
   `/isr-query?q=a`.
2. The Vercel preset ignores `publicAssets[].maxAge`. `generateBuildConfig` adds
   `cache-control: public,max-age=31536000,immutable` for every public asset directory without
   `fallthrough`, where the AWS Amplify preset checks `maxAge > 0`. Its `src` is `baseURL + "(.*)"`
   with `continue: true`, so it also matches `/plainfoo`, and a 404 under the directory is marked
   immutable too: `/plainfoo` answers `404` with `max-age=31536000, immutable`, and so does any missing
   file under Markless's `/assets/`. Repro: `/plain/file.txt`, `/plainfoo`.
3. Filed as https://github.com/nitrojs/nitro/issues/4876: no way to keep ISR entries apart by a request
   header. Vercel's ISR cache ignores `Vary`, and the `has`-route workaround no longer holds, so a
   handler that varies on a header serves one variant to everyone. Repro: `/isr-vary` and `/isr-split`
   with and without `x-fragment: 1`.
4. Not confirmed upstream yet: `prerender: true` through `nitro/vite` answers 404 for every route of a
   Markless router app. Whether Nitro's prerenderer misses the Vite SSR service or Markless's router
   registers its routes too late is open; a repro without Markless is still to be written.

## Repro source

```ts
// nitro.config.ts
import { defineConfig } from 'nitro';

export default defineConfig({
	compatibilityDate: '2025-07-15',
	serverDir: './',
	publicAssets: [{ dir: 'static-plain', baseURL: '/plain', maxAge: 0 }],
	routeRules: {
		'/headers-only': { headers: { 'x-repro': 'headers-only', 'cache-control': 'private, no-store' } },
		'/isr-vary': { isr: 60 },
		'/isr-split': { isr: { expiration: 60, allowQuery: ['__frag'] } },
		'/isr-query': { isr: { expiration: 60, allowQuery: ['q'] } },
		'/cdn-vary': { headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } },
		'/static-page': { prerender: true },
	},
	vercel: {
		config: {
			routes: [{ src: '(?<__isr_route>/isr-split)', has: [{ type: 'header', key: 'x-fragment', value: '1' }], dest: '/isr-split-isr?__isr_route=$__isr_route&__frag=1' }],
		},
	},
});

// routes/isr-query.ts (the others answer FRAGMENT or DOCUMENT by x-fragment, with Vary: x-fragment)
import { defineHandler } from 'nitro/h3';
export default defineHandler((event) => `q=${new URL(event.req.url).searchParams.get('q')} at ${Date.now()}`);
```

Built with `NITRO_PRESET=vercel nitro build`, deployed with `vercel deploy --prebuilt --prod`.

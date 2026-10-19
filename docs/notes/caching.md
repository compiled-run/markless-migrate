# Caching on Vercel through Nitro (measured 2026-10-19)

What `src/cache/` relies on, each measured on a real Vercel production deploy of a minimal Nitro app
(`nitro@3.0.260429-beta`, the version the examples pin), https://mm-nitro-cache-repro.vercel.app. The
app is `nitro.config.ts` plus one `defineHandler` per route; its source is in the last section.

| Behaviour | Measured | What the rules do about it |
| --- | --- | --- |
| Vercel's ISR cache and `Vary` | `/isr-vary` (`isr: 60`, the handler sends `Vary: x-fragment`): a request with `x-fragment: 1` after a plain one gets the plain body, `x-vercel-cache: HIT` | a fragment request is routed to the page's ISR function with `__markless_fragment=1`, a key in `allowQuery`, so it gets an entry of its own (`/isr-split`: FRAGMENT and DOCUMENT each MISS once, then HIT) |
| CDN caching by `Cache-Control` and `Vary` | `/cdn-vary` (`s-maxage=60, stale-while-revalidate=300`): fragment and document are kept apart, the query is part of the key, the page sees the query | used for pages that read the query |
| ISR and the query | `/isr-query` (`isr: { expiration: 60, allowQuery: ['q'] }`): `?q=a` and `?q=b` are cached apart, but the handler sees `q=null` for both | a page that reads the query is never put on ISR |
| A `headers` routeRule on a server-rendered route | `/headers-only`: answered 200 by the function, the rule's `cache-control` replaces the handler's | `no-cache` pages get `Cache-Control` from a routeRule |
| `prerender: true` | a plain Nitro handler is written to a static file (MISS, then HIT); in a Markless app every route prerenders as 404 (`Prerendered 0 routes`) | static pages use `isr: { expiration: false }`: rendered once per deploy, then the CDN |
| `publicAssets` `maxAge` | a directory with `maxAge: 0` and no `fallthrough` is served `public,max-age=31536000,immutable`, its 404s too | hashed files get their own `immutable` rule; nothing relies on `maxAge` |

Every Vercel response names its path through the network in `x-vercel-id`: `cle1::iad1::<id>` when a
function region answered (an invocation, or an ISR entry kept in that region), `cle1::<id>` from the
edge alone. An invocation is a response that is not `HIT`, `STALE` or `PRERENDER` whose id names a
function region.

## Upstream candidates (Nitro, not filed)

1. ISR routes never see their allowed query keys. `src/presets/vercel/runtime/isr.mjs`
   `isrRouteRewrite` returns `[route, ""]` whenever `x-now-route-matches` is present, so the request
   reaches the handler without its query, while Vercel keys the cache on the `allowQuery` values. A
   page that reads `?page=2` renders page 1 into the `?page=2` entry. Repro: `/isr-query?q=a`.
2. The Vercel preset ignores `publicAssets[].maxAge`. `generateBuildConfig` adds
   `cache-control: public,max-age=31536000,immutable` for every public asset directory without
   `fallthrough`, where the AWS Amplify preset checks `maxAge > 0`. Its `src` is `baseURL + "(.*)"`
   with `continue: true`, so it also matches `/plainfoo`, and a 404 under the directory is marked
   immutable too: `/plainfoo` answers `404` with `max-age=31536000, immutable`, and so does any missing
   file under Markless's `/assets/`. Repro: `/plain/file.txt`, `/plainfoo`.
3. No way to keep ISR entries apart by a request header. Vercel's ISR cache ignores `Vary` (platform
   behaviour), and Nitro's `isr` rule offers no option for it, so a handler that varies on a header
   serves one variant to everyone. A Nitro option (or a documented warning) would let frameworks with
   fragment or partial requests (Markless's `x-markless-fragment`, htmx's `HX-Request`) use ISR safely.
   Repro: `/isr-vary` with and without `x-fragment: 1`.
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

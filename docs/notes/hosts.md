# Which apps to migrate from (researched 2026-10-16)

Order of source frameworks, by audience and fit:

1. Next.js App Router: largest audience (67M weekly downloads), most demand to leave, hardest.
2. React on Vite.
3. Nuxt, SvelteKit, Remix/React Router 7, Astro.

Markless-side blockers found during that research (in the markless repo):

- packages/bundler/package.json pins vite exactly at 8.2.2; current hosts ask for ^8.3.x.
- markless() changes the host's own build (modulePreload default, buildApp order: 'pre').

Proof apps: Vercel's Next.js Commerce (Shopify, many routes and interactions) and a CMS blog starter
(Contentful or Sanity).

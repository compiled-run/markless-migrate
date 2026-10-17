# realworld-markless

The Markless port of the Angular RealWorld ("Conduit") frontend, checked against it with markless-migrate.

- Old app: `realworld-apps/angular-realworld-example-app` at `../../../mm-upstreams/angular-realworld-example-app` (read it, never edit it; the only local change is its API base, `/api`), served by `deploy/realworld/serve-old.ts`.
- Backend: `realworld-apps/nitro-prisma-zod-realworld-example-app`, seeded by `deploy/realworld/seed.ts`. Both apps call it as `/api` on their own origin.
- Build with `npm run build`; serve with `PORT=4102 node .output/server/index.mjs` (`API_ORIGIN` at build time sets the backend).
- Why most of the page is drawn from `lib/*.ts`: see `../realworld-markless-LOG.md`.

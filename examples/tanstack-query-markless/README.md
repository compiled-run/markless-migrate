# TanStack Query kitchen sink, on Markless

A port of TanStack Router's `examples/react/kitchen-sink-react-query-file-based` (React, TanStack Router, TanStack
Query) to Markless 0.9.0, made and checked with markless-migrate. The migration log is
[`../tanstack-query-LOG.md`](../tanstack-query-LOG.md); the Markless defects it hit are reproduced in [`repros/`](repros/).

```bash
npm install
npx vp build
PORT=4521 node .output/server/index.mjs
```

- `pages/` holds one file per route of the old app. Each page reads its data with an async `computed()` inside
  `@try`/`@pending`/`@catch`; mutations are form handlers that call the API and then move the page's `version` state,
  which every invoice recipe reads (the old app's `queryClient.invalidateQueries()`).
- `lib/store.ts` is the old app's mock API (`src/utils/mockTodos.ts`), moved to the server: one store per browser tab,
  started on each fresh visit or reload, kept across in-place navigations (`middleware/tab.ts`).
- `lib/data.ts` calls the store directly while a page renders on the server, and the `api/` routes when a recipe runs
  again in the browser.
- `KS_TRACE=1` logs each mock API call with its tab, for `deploy/tanstack-query/measure.ts`.

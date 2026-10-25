# hn-rsc-markless

[nextjs/next-react-server-components](https://github.com/nextjs/next-react-server-components) (Hacker News on the
Next.js App Router and React Server Components) ported to Markless 0.9.0. The migration log is
[`../hn-rsc-LOG.md`](../hn-rsc-LOG.md).

```sh
npm install
npm run build
PORT=3000 node .output/server/index.mjs
```

The pages read the live Hacker News API (`lib/hn.ts`). `repros/` is a separate Markless app holding the minimal
cases of the Markless defects the port ran into; `cd repros && npm install && npm run build`, start it, then
`node witness.mjs http://127.0.0.1:<port>` prints expected and actual for each.

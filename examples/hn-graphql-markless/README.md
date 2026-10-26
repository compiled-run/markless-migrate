# hn-graphql-markless

[clintonwoo/hackernews-react-graphql](https://github.com/clintonwoo/hackernews-react-graphql) (Next.js 12, Apollo
Client 3, Apollo Server on Express, Passport) with its pages ported to Markless 0.9.0. The GraphQL server is not part of
the port: the pages read it with `computed(async ...)`, as the old pages read it with `useQuery`.

How it was ported, checked and measured: [`../hn-graphql-LOG.md`](../hn-graphql-LOG.md).

```sh
npm install
npm run build
HN_GRAPHQL_BACKEND=http://127.0.0.1:4874 PORT=4872 node .output/server/index.mjs
```

`HN_GRAPHQL_BACKEND` is the old app's Express server, which answers `/graphql`, `/login`, `/register` and `/logout`
(`middleware/request.ts` forwards them). `../../deploy/hn-graphql/local.sh` starts it, the old app and this app against
a recorded slice of the Hacker News API.

`repros/` is a separate small Markless app holding one page per Markless bug this port hit; `repros/probe.mjs` drives
each against a running build and says which still misbehave.

Licence: Apache-2.0, as the original (`LICENSE-hackernews-react-graphql`).

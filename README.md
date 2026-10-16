# @markless/migrate

Move an existing app to [Markless](https://markless.dev) with your own coding agent, and prove every route still works before it switches over.

Your agent (Claude Code, Codex, Cursor...) does the converting. This tool does the rest:

- **plan** takes stock of the old app: routes, interactions, SEO metadata, CSS and assets, bundler plugins, CMS and data calls, component libraries, forms and third-party scripts.
- **check** compares the old route and the new one in a real browser and reports every difference in a form your agent can fix.
- **switch** moves a route to Markless only when its check is green. Until then the new app forwards that route to the old one, so you can ship from day one.

Every report also shows how much JavaScript runs at load on each route, before and after.

Status: not usable yet. See [docs/plan.md](docs/plan.md).

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```

`fixtures/` holds real apps from other frameworks that the checks run against.

## License

MIT

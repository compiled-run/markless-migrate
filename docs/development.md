# Development

Working on Markless Migrate itself. Back to the [overview](../README.md).

## Development

```bash
pnpm install
pnpm browsers      # once: downloads Chromium for Playwright
pnpm typecheck
pnpm test          # unit tests and every fixture suite
pnpm test:unit     # unit tests only (they drive Chromium too)
pnpm test:e2e      # fixture suites only
```

CSS is parsed with [yuku-css](https://github.com/thejackshelton/yuku-css), from npm.

`fixtures/` holds a Next.js App Router app and a Vite multi-page site, each with an Arabic (RTL) locale,
Accept-Language negotiation at `/`, a menu, a counter and a form. The fixture suites build each one,
check it against a separate build of the same source (must be green), and then against 35 mutated
copies each: one per check, from a changed title to a hover colour, a breakpoint moved by 40px, a font
file swapped under the same name (and a font renamed, which must stay green), a removed label, a
positive tabindex, a counter that adds 2, a form that posts elsewhere, a changed label next to a
`Math.random()` tip, and four network contracts: a query field dropped, another endpoint, a second
fetch, and a server request replaced by hardcoded text, and three non-page endpoints: a feed item
removed, a robots.txt line changed and a JSON field renamed. Both fixtures render from a small JSON CMS
(`fixtures/cms/server.ts`) on the server and in the browser, and run with the request recorder. The
suites also replay recorded data to an app on a second CMS with different content (must be green), and
check writes through a guard on a non-loopback address that fails the test if any write reaches it. Each mutation must turn red
exactly the dimensions it affects, with the expected message, and the failures that concern an element
must name its old and new source line. `fixtures/markless-site` ports two routes of the Vite site to
Markless with the published `@markless` packages; its suite checks the Vite site against it and
requires each failure to name the `.tsrx` file and line. `fixtures/react-dev`, `fixtures/vue-dev` and
`fixtures/svelte-dev` are one page each, run on Vite's dev server; their suite changes the heading and
requires the old side to be named from React's owner stack (through the dev server's source map), Vue's
`__file` and Svelte's `__svelte_meta`. Mutated copies are built in `.mutants/`.

Both fixtures also sign in with a cookie session: a member and an admin, a members-only page, an
admin-only page, and a redirect to the login page for anonymous visitors. Their suites check each role
against a rebuild (green, from the starter auth file `plan` writes), against four auth mutations (the
members page shown to anonymous visitors, the admin page shown to members, a different login redirect
target, a session cookie without HttpOnly and with SameSite=Strict), each red only as the role it
affects, and against a copy behind a Cloudflare-style challenge, which must stop as blocked until the
staging pass is sent as a header or cookie.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

- `Typecheck`: `pnpm typecheck`.
- `Unit tests (1/4)` to `(4/4)`: `test/*.test.ts` split in four with `node --test --test-shard`, since
  the unit tests drive Chromium.
- `E2E <suite>`: one job per file in `test/e2e/`, each building its own fixtures. The largest
  suites are split across runners with `E2E_SHARD=i/n` (six for `next-app`, four for `vite-site`, four for `corpus`): a
  shard registers every n-th test and builds only the mutants its tests use. Without `E2E_SHARD`
  every test runs, as `pnpm test:e2e` does locally.
- `CI passed`: green only when every job above passed. This is the one check to require.

A fixture suite runs a quarter of the machine's cores' tests at once (one on a 4-vCPU runner), since
each check already drives several Chromium pages. A whole run takes about 9 minutes, bounded by the
slowest unit test shard and `next-app` shard (about 8 to 9 minutes each).

Every suite runs against servers the tests start on `127.0.0.1`, and fixture data uses `.example`
hosts. The unit tests and every fixture suite pass with outbound network denied except loopback, so
no test needs a live external site and nothing is skipped in CI.

### Branch protection

The workflow does not change repository settings. To make a red `main` impossible, enable under
Settings, Branches, a branch protection rule (or a ruleset) for `main` with:

- Require a pull request before merging.
- Require status checks to pass before merging, with `CI passed` as the required check.
- Require branches to be up to date before merging.
- Do not allow bypassing the above settings.


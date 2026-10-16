# Migration log: Lighthouse Walks (Vite) to Markless

The Vite fixture, copied to `examples/vite-site-old`, moved route by route to `examples/vite-site-markless`
by Codex through `markless-migrate run --agent codex`. This file records every attempt and every problem
the tool or the stack had on the way.

## Deployed

| What | URL | Built from |
| --- | --- | --- |
| Front door | https://markless-migrate-demo.vercel.app (index at `/_migrate/`, report at `/_migrate/report.html`) | `deploy/front`: the `vercel.json` that `markless-migrate config --vercel` writes |
| Old app | https://migrate-demo-old.vercel.app | `examples/vite-site-old`, its `serve.ts` as one Vercel function |
| New app | https://migrate-demo-new.vercel.app | `examples/vite-site-markless`, `NITRO_PRESET=vercel` |
| CMS | https://migrate-demo-cms.vercel.app | `examples/cms/server.ts` as one Vercel function |

`deploy/deploy.sh cms|old|new|front` builds and deploys each one. The old app keeps all of its server
behaviour on Vercel: CMS news and tagline rendered on the server, Accept-Language redirects at `/`, the
`/old-about` redirect, trailing-slash redirects, the 404 page with status 404, sign-in with the cookie
session, the members and admin guards and the 403 page. Dropped on Vercel: the bot wall (`BOT_WALL` is
not set) and the request recorder (it is loaded with `NODE_OPTIONS` into a Node server, which a Vercel
function does not take), so the `network` dimension compares browser requests only.

The front door is the switched site: each switched route is rewritten to the new app, everything else to
the old one. With no route switched yet it serves the old app, sign-in and redirects included.

`migrate-demo.vercel.app` belongs to someone else, so the front door's production address is
`markless-migrate-demo.vercel.app`, added to the project as a domain (`vercel alias set` alone put it
behind Vercel Authentication).

## Set-up

1. `npm create markless@latest -- vite-site-markless --yes --starter minimal --agents codex --no-git --no-workspace` (published 0.4.0).
2. `plan --old https://migrate-demo-old.vercel.app --source ../vite-site-old`, run in the new app: 4 crawled
   routes, 7 in source, locales ar/en/fr, Accept-Language negotiation, two roles and the login route.
3. A temporary `CODEX_HOME` holding a copy of `~/.codex/auth.json`, the Markless skill that create-markless
   installed, `model = "gpt-6.1-sol"`, `model_reasoning_effort = "medium"`, and what
   `setup --agent codex --yes` wrote (MCP server and migration skill).
4. `deploy/serve-new.ts` serves the new app's build at http://127.0.0.1:4300 and restarts after every
   `npm run build`, so Codex only has to build. `AGENTS.md` in the new app says that, and where the old
   source is.
5. Baseline: `check --all` of the deployed old app against the deployed starter, with `--source`,
   `--new-source` and `--auth`: 0 of 25 route checks green (7 page routes x anonymous, signed-in and
   admin, plus robots.txt, sitemap.xml, feed.xml and manifest.json), 7 min 34 s. Published as the first
   report on the front door.

## Attempts

| Route | Attempts | Codex tokens | Time | Result |
| --- | --- | --- | --- | --- |
| `/` | 1 (did not start) | 0 | 1 s | blocked: Codex login expired, see problem 1 |

No route has been converted yet.

## Problems found

### Blocking

1. **The owner's Codex login is dead, and copying `auth.json` into a temporary `CODEX_HOME` is the likely
   cause.** `codex exec` (with the temporary home, and with the default `~/.codex`) fails with "Your access
   token could not be refreshed because your refresh token was already used" and "workspace routing
   discovery unauthorized (401)". `~/.codex/auth.json` was last refreshed 2026-09-28 and its access token
   expired 2026-10-08; `codex login status` still says "Logged in using ChatGPT" because it only reads the
   file. ChatGPT refresh tokens are single-use: when the copy in a temporary `CODEX_HOME` refreshes (as it
   must once the access token has expired), the original's refresh token is spent and the new tokens live
   only in the temporary copy, which is deleted afterwards. The earlier `run --agent codex` trial used
   exactly that set-up. Fix: the owner runs `codex login` once; afterwards either run with the real
   `~/.codex` (setup keeps backups) or copy the temporary `auth.json` back after every run. `run` and
   `docs/notes/agents.md` should warn about this.

### markless-migrate

2. **`run` cannot pass `--source`, `--new-source`, `--auth` or `--all`.** Its own check of each route runs
   without source lines, anonymous only, and never covers robots.txt, sitemaps, feeds or the manifest, so
   `run` can call `/members/` green when only the anonymous redirect matches. Its prompt does not say
   where the old source is either; the new app's `AGENTS.md` says it instead.
3. **`run`'s prompt says "rebuild or restart whatever serves it"**, but a headless agent in
   `codex exec --sandbox workspace-write` cannot keep a server running after its shell command ends, and
   the agent has no way to tell `run` how the new app is served. Worked around with `deploy/serve-new.ts`.
4. **`plan` labels `/members/` as admin-only.** It prints `/members/: admin (middleware.ts:28)`, but the
   guard lets any signed-in user into `/members/` and only `/admin/` needs the admin role. The starter
   `auth.json` lists `guards` the same way. The roles it proposes (`signed-in`, `admin`) are right.
5. **The starter `auth.json` login steps have no `wait` step** after clicking "Sign in". Sign-in still
   worked against the deployed old app, but nothing waits for the redirect that sets the cookie.
6. **`weight` misses the new app's JavaScript.** On the deployed starter `/`, the report says "JS on the
   wire 1.1 kB -> 0.0 kB, run at load 1.0 kB -> 1.1 kB". The page `modulepreload`s 50 chunks, 99,740 bytes
   uncompressed (measured with curl). `downloaded` is summed from coverage entries
   (`src/check/capture.ts`), so a preloaded module that never runs is not counted at all, and the
   modules that did run were counted at 0 bytes, so the byte lookup misses Markless's module scripts.
7. **`check --all` does not cover redirects or unknown paths.** `/old-about` (301 to `/about/`), `/about`
   (301 to `/about/`) and an unknown path (404 with the 404 page) are not in the inventory, so a port that
   drops them would still be green.
8. **`config --vercel` sends `/` and every path ending in `/` nowhere.** Its catch-all
   `{ "source": "/:path*" }` compiles to `^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?$`, which matches neither `/`
   nor `/about/`; on the deployed front door both answered Vercel's own 404 while `/about` and `/robots.txt`
   reached the old app. Worked around in `deploy/build.ts` by adding `/` and `/:path*/` rewrites after it.
   Switched routes are written with and without the slash, so only the catch-all is affected.
9. **report.html is 27.9 MB** for 25 route checks (screenshots inline). It deploys and loads, but slowly.

### Markless and create-markless

10. **create-markless prints `npm dev`** as the next step and in the generated README; npm needs `npm run dev`.
11. **`--agents codex` writes outside the project**: it installs the skill at `~/.codex/skills/markless`
    ("already configured") and nothing in the app, so an agent run with another `CODEX_HOME` does not see it.
12. **The minimal starter's one-button page preloads 50 chunks (99.7 kB uncompressed)** while about 1.1 kB
    runs at load.

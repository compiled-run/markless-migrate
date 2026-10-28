# CI process

CI is green on `main` or the next push to `main` is the fix. A failing check is classified before anything is changed: a regression, environment or config drift, a failure that was already there, or nondeterminism. Nondeterminism gets its cause fixed (awaited readiness, random ports, no wall-clock races). A check is never made to pass by skipping it, loosening it or retrying it.

## Browsers

`check` measures the slow network in Chromium, Firefox and WebKit by default. Every workflow job that runs `check` installs all three (`.github/actions/setup` with `browsers: chromium firefox webkit`), and with `CI` set, `check` exits 2 before checking anything if one of them is missing. `--slow-network-browser` narrows the browsers on purpose.

## Quarantine

A nondeterministic failure whose cause is not fixed yet is listed here with its evidence, an owner and an expiry date at most two weeks out. The test keeps running. A red run of a listed test may be rerun once, and the rerun is noted on the PR. A listed failure in any other test, or a second red on rerun, is treated as a real failure. On the expiry date the entry is either fixed or reviewed and renewed with what was learned.

| Test | What fails | Evidence | Owner | Expires |
| --- | --- | --- | --- | --- |
| `test/coverage.test.ts`: an identical new app is green only when every interactive element was exercised | The new side of two identical apps reports an in-between view lasting seconds when the settings dialog is opened again ("shows 2 views in between for 5778 ms (part of the page gone)"), or an answer missing after "click checkbox Dark mode". Not reproduced locally in 6 runs. The view sampler reads the page text once a frame, only after a DOM mutation, so a stalled renderer stretches the last sampled view up to the final read. | CI runs 40395866035 (Unit 3/4) and 40259842683 (Unit 1/4): 2 of the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/e2e/next-app.test.ts` (shard 1/6, sometimes 3/6 and 4/6): an independent rebuild of the same source is green on every route | On the new side, after an in-place arrival by link ("after arriving from /fr/about by link Accueil"), the language link of the next step is "not on the page"; or the first click on the Arabic "More" button gets no answer (focus moves, nothing opens), as if the click landed before the page's handlers were attached. | CI runs 40275320980, 40269511329, 40216482612, 40210170912, 40203464536, 40193553502: 7 next-app failures in the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/e2e/slow-network.test.ts`: a resource only Firefox requests turns the route red in the Firefox cell alone, and the same page without it is green in every browser | Two identical pages served from two loopback servers come out red in one cell: Firefox LCP or first click (the green half), or a WebKit LCP 0.01 s apart (the red half). A largest paint under one frame apart is no longer a difference (check/lcp-frame-resolution); the Firefox values were not printed, and the assertion now prints them. | CI runs 40592884982, 40576060649, 40447488442, 40603280988: 4 slow-network failures in the last 300 CI runs | thejackshelton | 2026-11-10 |
| `test/e2e/radix-dialog-port.test.ts`: shows what Radix shows at every compared moment of 100 generated action sequences | A real port defect that only some random seeds reach. Open the sheet, close it, reopen it from script while it fades out, click outside, then Shift+Tab 261 ms later: Radix focuses its end focus guard, the port focuses the sheet's close button. Radix removes the backdrop node, which resets where the browser's Tab navigation starts; the port only hides it. Reproduce with `DIALOG_SEED=-1113089783`. | CI run 40252581398 | thejackshelton | 2026-11-09 |

## Runners

The org runs at most 60 jobs at once, shared by every repository, and queued jobs start roughly in the order they were queued. On 2026-10-28 at 01:25Z, ten pull request runs here (29 jobs each) held all 60, with 364 more queued, and Markless's merge queue sat with 3 jobs running and 179 waiting. So:

- A pull request's CI holds at most 8 runners: Typecheck, two unit shards and five e2e jobs at a time. Its 20 jobs are the changes job, Typecheck, 4 unit shards, 13 e2e jobs (the short suites share three runners, one file after another; next-app and vite-site keep their shards) and `CI passed`.
- No e2e suite reads `examples/`, `deploy/` or `docs/`, so a pull request that only touches those, or Markdown, skips the e2e jobs. Every push to `main` runs all of them.
- Every push to `main` gets a run of its own that the next merge does not cancel. In one shared group, merges a few minutes apart cancelled each waiting run, and `main` went hours without a finished one.
- `check.yml` and `convert.yml` run at most 10 shards at once. `check.yml` no longer runs on pull requests; try a change to it with `gh workflow run check.yml --ref <branch>`.

## Caches

The repository's Actions caches share one 10 GB limit, and a cache saved by a pull request is visible to that pull request alone. On 2026-10-27 the caches stood at 10.5 GB, five of them 1.4 GB copies of the same old-site build saved from pull requests, so GitHub evicted entries main's runs had saved and jobs went back to the runners' apt mirror: one slow-network job spent 12 of its 16 minutes downloading 119 MB of browser system packages at 165 kB/s. The Playwright browsers and their system packages (`.github/actions/setup`) are therefore saved from `main` only, and pull requests restore main's entries.

## Secrets

`SHADCN_BYPASS` is the Vercel protection bypass for the shadcn-ui port's preview deployments. Only workflows that run on `workflow_dispatch` read it (today the dead-control probe on the `probe/dead-controls` branch), never one that runs on `push` or `pull_request`, so a fork's run cannot read it. It is sent only as the `x-vercel-protection-bypass` header on requests to the port's host. GitHub masks it in logs, and no step prints it. It was set on 2026-10-28 from the bypass file the shadcn workers use. To rotate it, regenerate the bypass in the Vercel project and run `gh secret set SHADCN_BYPASS < <file>`.


# CI process

CI is green on `main` or the next push to `main` is the fix. A failing check is classified before anything is changed: a regression, environment or config drift, a failure that was already there, or nondeterminism. Nondeterminism gets its cause fixed (awaited readiness, random ports, no wall-clock races). A check is never made to pass by skipping it, loosening it or retrying it.

## Browsers

`check` measures the slow network in Chromium, Firefox and WebKit by default. Every workflow job that runs `check` installs all three (`.github/actions/setup` with `browsers: chromium firefox webkit`), and with `CI` set, `check` exits 2 before checking anything if one of them is missing. `--slow-network-browser` narrows the browsers on purpose.

## Quarantine

A nondeterministic failure whose cause is not fixed yet is listed here with its evidence, an owner and an expiry date at most two weeks out. The test keeps running. A red run of a listed test may be rerun once, and the rerun is noted on the PR. A listed failure in any other test, or a second red on rerun, is treated as a real failure. On the expiry date the entry is either fixed or reviewed and renewed with what was learned.

| Test | What fails | Evidence | Owner | Expires |
| --- | --- | --- | --- | --- |
| `test/coverage.test.ts`: an identical new app is green only when every interactive element was exercised | The new side of two identical apps reports an in-between view lasting seconds when the settings dialog is opened again ("shows 2 views in between for 5778 ms (part of the page gone)"), or an answer missing after "click checkbox Dark mode". Not reproduced locally in 6 runs. The view sampler reads the page text once a frame, only after a DOM mutation, so a stalled renderer stretches the last sampled view up to the final read. | CI runs 40395866035 (Unit 3/4) and 40259842683 (Unit 1/4): 2 of the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/e2e/next-app.test.ts` (shard 1/6, sometimes 3/6 and 4/6): an independent rebuild of the same source is green on every route | On the new side, after an in-place arrival by link ("after arriving from /fr/about by link Accueil"), the language link of the next step is "not on the page". (The other symptom, the first click on the Arabic "More" button getting no answer while focus moved to it, was the checker clicking twice: a click the page acknowledged after the 1.5 s click timeout was sent again and closed the menu it opened. The widget probes clicked twice the same way. Fixed in `clickOnce`, `src/check/click.ts`; CI runs 40269511329, 40216482612 and 40653296197.) | CI runs 40275320980, 40269511329, 40216482612, 40210170912, 40203464536, 40193553502: 7 next-app failures in the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/e2e/slow-network.test.ts`: a resource only Firefox requests turns the route red in the Firefox cell alone, and the same page without it is green in every browser | The identical-page half went red again after it came off this list: Firefox Regular 3G first painted frame, old runs 0.49, 0.44, 0.52, 0.60 s against 0.63, 0.68, 0.58, 0.70 s, 0.15 s worse than a 0.10 s band at p = 0.029. A simulation of the verdict rule (median later than max(33 ms, 5%, the 90th-percentile half-split band, the instrument's step) and one-sided Mann-Whitney p < 0.05) on identical pages gives about 1 to 2% false reds per gated time, so about 10 to 18% for a route's 9 cells at 4 to 5 runs a side, and only about 10% at 8. More runs alone do not fix it: the rule controls each cell's error, not the route's. The fix is a route-level rule (for example Holm across the route's cells, or a band set from a measured identical-page noise floor), a sensitivity choice for check itself, not only for this test. | CI run 41136076115 attempt 1 (#455) | thejackshelton (checker lane L1) | 2026-11-13 |
| `test/e2e/radix-dialog-port.test.ts`: shows what Radix shows at every compared moment of 100 generated action sequences | A real port defect that only some random seeds reach. Open the sheet, close it, reopen it from script while it fades out, click outside, then Shift+Tab 261 ms later: Radix focuses its end focus guard, the port focuses the sheet's close button. Radix removes the backdrop node, which resets where the browser's Tab navigation starts; the port only hides it. Reproduce with `DIALOG_SEED=-1113089783`. | CI run 40252581398 | thejackshelton | 2026-11-09 |

## Runners

The org runs at most 60 jobs at once, shared by every repository, and queued jobs start roughly in the order they were queued. On 2026-10-28 at 01:25Z, ten pull request runs here (29 jobs each) held all 60, with 364 more queued, and Markless's merge queue sat with 3 jobs running and 179 waiting. So:

Between 2026-10-28 and 2026-10-31 the org was at 55 or more of its 60 runners 42% of the time, and this repository's pull request CI was 40% of all runner time; the checker's two mutation suites, next-app (6 shards) and vite-site (4 shards), were 60% of that. So each suite runs here:

| Suite | Pull request | Merge queue | Push to `main` |
| --- | --- | --- | --- |
| Typecheck, unit tests (4 shards) | yes | yes | only if the merge queue did not test this commit |
| e2e quick, pages, networks (Chromium, Firefox, WebKit), shadcn, parity | yes, unless only `examples/`, `deploy/`, `docs/` or Markdown changed | yes | only if the merge queue did not test this commit |
| e2e next-app (6 shards), vite-site (4 shards) | no | yes | only if the merge queue did not test this commit |

- A pull request's CI holds at most 10 runners (Typecheck, four unit shards, five e2e jobs) for about 15 minutes.
- The merge queue tests the exact commit `main` will become, with every suite, before it lands. A push to `main` whose commit passed the merge queue at that SHA does not run them again; the Changes job links the queue's run. A push that did not come through the queue runs everything.
- No e2e suite reads `examples/`, `deploy/` or `docs/`, so a pull request that only touches those, or Markdown, skips the e2e jobs.
- Every push to `main` and every merge queue group gets a run of its own that the next merge does not cancel. In one shared group, merges a few minutes apart cancelled each waiting run, and `main` went hours without a finished one.
- `check.yml` and `convert.yml` run at most 10 shards at once. `check.yml` no longer runs on pull requests; try a change to it with `gh workflow run check.yml --ref <branch>`.

## Slow-network verdicts

`test/e2e/slow-network.test.ts` ("a resource only Firefox requests ...") compares a page against an identical copy in 9 cells (3 browsers, 3 gated times), 4 runs a side. It went red 7 times between 2026-10-21 and 2026-10-28 (CI runs 40592884982, 40576060649, 40447488442, 40603280988, 40636265801, and the runs of main b37f5234, #365 and #367), each a 10 to 20 ms gap: with 4 runs a side the one-sided Mann-Whitney test's two smallest p values, 0.014 and 0.029, are both under 0.05, so one slow run made an identical page significant. `check` now also needs the median to be later by at least max(33 ms, 5% of the old median, the noise band, the instrument's step); `test/slow-network-verdicts.test.ts` deals the measured runs of two such pages into every 4-against-4 split (140) and finds none red, and every split red with 100 ms added to the new side. The test came off the quarantine list after 10 of 10 green runs of it on a Mac at load average 7 to 11 (2026-10-28) and a green pull request run on CI.

## Caches

The repository's Actions caches share one 10 GB limit, and a cache saved by a pull request is visible to that pull request alone. On 2026-10-27 the caches stood at 10.5 GB, five of them 1.4 GB copies of the same old-site build saved from pull requests, so GitHub evicted entries main's runs had saved and jobs went back to the runners' apt mirror: one slow-network job spent 12 of its 16 minutes downloading 119 MB of browser system packages at 165 kB/s. The Playwright browsers and their system packages (`.github/actions/setup`) are therefore saved from `main` only, and pull requests restore main's entries.

## Secrets

`SHADCN_BYPASS` is the Vercel protection bypass for the shadcn-ui port's preview deployments. Only workflows that run on `workflow_dispatch` read it (today the dead-control probe, `.github/workflows/probe-dead-controls.yml`), never one that runs on `push` or `pull_request`, so a fork's run cannot read it. It is sent only as the `x-vercel-protection-bypass` header on requests to the port's host. GitHub masks it in logs, and no step prints it. It was set on 2026-10-28 from the bypass file the shadcn workers use. To rotate it, regenerate the bypass in the Vercel project and run `gh secret set SHADCN_BYPASS < <file>`.


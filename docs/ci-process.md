# CI process

CI is green on `main` or the next push to `main` is the fix. A failing check is classified before anything is changed: a regression, environment or config drift, a failure that was already there, or nondeterminism. Nondeterminism gets its cause fixed (awaited readiness, random ports, no wall-clock races). A check is never made to pass by skipping it, loosening it or retrying it.

## Browsers

`check` measures the slow network in Chromium, Firefox and WebKit by default. Every workflow job that runs `check` installs all three (`.github/actions/setup` with `browsers: chromium firefox webkit`), and with `CI` set, `check` exits 2 before checking anything if one of them is missing. `--slow-network-browser` narrows the browsers on purpose.

## The real-site check workflow

`check.yml` checks a 25-route build of ui.shadcn.com on thirteen runners, with the slow network in Chromium, Firefox and WebKit, and is dispatched against any port. Its self-test ran on every pull request that touched the workflow or its scripts, about 1,000 runner-minutes a run, while the org's other jobs queued behind it. It now runs nightly on `main` when `check.yml`, `.github/actions`, `scripts/check-shards.ts` or `deploy/shadcn-ui/ci-serve.sh` changed since the last green night, and on dispatch. To try a change before merging, run `gh workflow run check.yml --ref <branch>`. `convert.yml` keeps its two-runner self-test on pull requests, but saves the old site's 1.4 GB build only from `main` or a dispatch: a pull request's copy is visible to that pull request alone.

## Quarantine

A nondeterministic failure whose cause is not fixed yet is listed here with its evidence, an owner and an expiry date at most two weeks out. The test keeps running. A red run of a listed test may be rerun once, and the rerun is noted on the PR. A listed failure in any other test, or a second red on rerun, is treated as a real failure. On the expiry date the entry is either fixed or reviewed and renewed with what was learned.

| Test | What fails | Evidence | Owner | Expires |
| --- | --- | --- | --- | --- |
| `test/coverage.test.ts`: an identical new app is green only when every interactive element was exercised | The new side of two identical apps reports an in-between view lasting seconds when the settings dialog is opened again ("shows 2 views in between for 5778 ms (part of the page gone)"), or an answer missing after "click checkbox Dark mode". Not reproduced locally in 6 runs. The view sampler reads the page text once a frame, only after a DOM mutation, so a stalled renderer stretches the last sampled view up to the final read. | CI runs 40395866035 (Unit 3/4) and 40259842683 (Unit 1/4): 2 of the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/e2e/next-app.test.ts` (shard 1/6, sometimes 3/6 and 4/6): an independent rebuild of the same source is green on every route | On the new side, after an in-place arrival by link ("after arriving from /fr/about by link Accueil"), the language link of the next step is "not on the page"; or the first click on the Arabic "More" button gets no answer (focus moves, nothing opens), as if the click landed before the page's handlers were attached. | CI runs 40275320980, 40269511329, 40216482612, 40210170912, 40203464536, 40193553502: 7 next-app failures in the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/e2e/radix-dialog-port.test.ts`: shows what Radix shows at every compared moment of 100 generated action sequences | A real port defect that only some random seeds reach. Open the sheet, close it, reopen it from script while it fades out, click outside, then Shift+Tab 261 ms later: Radix focuses its end focus guard, the port focuses the sheet's close button. Radix removes the backdrop node, which resets where the browser's Tab navigation starts; the port only hides it. Reproduce with `DIALOG_SEED=-1113089783`. | CI run 40252581398 | thejackshelton | 2026-11-09 |

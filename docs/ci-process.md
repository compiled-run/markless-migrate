# CI process

CI is green on `main` or the next push to `main` is the fix. A failing check is classified before anything is changed: a regression, environment or config drift, a failure that was already there, or nondeterminism. Nondeterminism gets its cause fixed (awaited readiness, random ports, no wall-clock races). A check is never made to pass by skipping it, loosening it or retrying it.

## What runs where

| Lane | What it proves | Pull request | Merge queue | Push to `main` |
| --- | --- | --- | --- | --- |
| Typecheck | the whole repository typechecks | always | always | always |
| Unit tests | `test/*.test.ts` | the files the change can reach, in up to 4 shards | all, 4 shards | none when the merge queue already passed this commit, else all |
| E2E suites | `test/e2e/*.test.ts`, one job per suite or shard; slow-network and late-fonts measure Chromium, Firefox and WebKit on small fixtures | the suites the change can reach | all | as unit tests |
| Warm caches | refreshes the Playwright caches that only `main` saves | no | no | when the merge queue already tested the commit |
| `check.yml`, `convert.yml`, `page-load.yml` | the real-site check, convert and Lighthouse runs on deployed ports, every route, Chromium, Firefox and WebKit across the slow networks | when their own workflow or scripts change | no | dispatched |

`CI passed` is the required check. It is red unless typecheck passed and the unit and e2e lanes passed, or were skipped because the plan gave them nothing to run.

`scripts/ci-plan.ts` decides what a pull request runs. A test file's inputs are its static imports, followed through the repository, the workspace fixture packages it imports by name, and the paths its test-side files name in string literals or in the leading string segments of `join(...)` and `resolve(...)` calls. A change to dependencies, `tsconfig.json`, `ci.yml`, `.github/actions/` or `scripts/ci-*` runs everything. On the last 60 merged pull requests this would have run 55% of the e2e jobs and 41% of the unit files. A dependency the plan cannot see (a path built at run time from variables alone) is still run by the merge queue before the pull request merges, so a miss costs a merge-queue ejection, not a red `main`. `test/ci-plan.test.ts` fails if a suite file in `test/e2e/` has no CI job.

Merging goes through the merge queue (`gh pr merge <number> --squash`, or the button). It tests the pull request on top of `main` and everything ahead of it in the queue, with every test.

## Browsers

`check` measures the slow network in Chromium, Firefox and WebKit by default. Every workflow job that runs `check` installs all three (`.github/actions/setup` with `browsers: chromium firefox webkit`), and with `CI` set, `check` exits 2 before checking anything if one of them is missing. `--slow-network-browser` narrows the browsers on purpose.

## Quarantine

A nondeterministic failure whose cause is not fixed yet is listed here with its evidence, an owner and an expiry date at most two weeks out. The test keeps running. A red run of a listed test may be rerun once, and the rerun is noted on the PR. A listed failure in any other test, or a second red on rerun, is treated as a real failure. On the expiry date the entry is either fixed or reviewed and renewed with what was learned.

| Test | What fails | Evidence | Owner | Expires |
| --- | --- | --- | --- | --- |
| `test/coverage.test.ts`: an identical new app is green only when every interactive element was exercised | The new side of two identical apps reports an in-between view lasting seconds when the settings dialog is opened again ("shows 2 views in between for 5778 ms (part of the page gone)"), or an answer missing after "click checkbox Dark mode". Not reproduced locally in 6 runs. The view sampler reads the page text once a frame, only after a DOM mutation, so a stalled renderer stretches the last sampled view up to the final read. | CI runs 40395866035 (Unit 3/4) and 40259842683 (Unit 1/4): 2 of the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/e2e/next-app.test.ts` (shard 1/6, sometimes 3/6 and 4/6): an independent rebuild of the same source is green on every route | On the new side, after an in-place arrival by link ("after arriving from /fr/about by link Accueil"), the language link of the next step is "not on the page"; or the first click on the Arabic "More" button gets no answer (focus moves, nothing opens), as if the click landed before the page's handlers were attached. Shards 3/6 and 4/6 also fail the mutation cases ("extra-js turns weight red and nothing else", "noise-word", "form-path") in runs 40193553502, 40203464536 and 40220168901, each green on rerun. | CI runs 40275320980, 40269511329, 40216482612, 40210170912, 40203464536, 40193553502: 7 next-app failures in the last 300 CI runs | thejackshelton | 2026-11-09 |
| `test/parts-browser.test.ts`: "recharts: a pointer already over the chart when it loads gets the tooltip from its first move, with no pointerover" (and once the radar tooltip test beside it) | No tooltip after the first move: fails in 100 to 120 ms, or at the 5 s wait. Passed on rerun of the same commit every time. | CI runs 40150075018, 40154107729, 40155916375, 40181630228, 40185459836, 40193605347, 40080146341 (first attempts, 2026-10-24 to 25) | thejackshelton | 2026-11-09 |
| `test/memory.test.ts`: "a check holds the same memory however many routes it has done" | Fails after 170 to 270 s on a 4-core runner; the heap reading depends on when the collector last ran. | CI runs 39987451167, 40152670480, 40154963672 | thejackshelton | 2026-11-09 |
| `test/dead-controls.test.ts`: "a page of a large site is exercised on its own, though its template group shares its layout and kinds of control" | Fails after 130 to 160 s; passes on rerun. | CI runs 40059317302, 40062232215 | thejackshelton | 2026-11-09 |
| `test/source-stacks.test.ts`: "source scan of the laravel, django and wordpress fixture finds exactly its routes ..." | All three fail together within 60 ms, then pass on rerun of the same commit, so a shared input was missing or half-written when the shard started. | CI runs 40247771966, 40370442531 | thejackshelton | 2026-11-09 |
| `test/e2e/page-load.test.ts`: "a page behind a render-blocking script ... is red on paint times" and "the same page on both sides is not red, in a full check" | Lighthouse paint times on a shared runner land on the wrong side of the noise band. | CI runs 40031480175, 40053431040 (first), 40160913456, 40229407705 (second) | thejackshelton | 2026-11-09 |
| `test/e2e/dev-builds.test.ts`: "svelte-dev" and "vue-dev: the changed heading is traced to src/App.* through the framework's dev hook" | The trace does not reach the source line within the wait. | CI runs 39999725809, 40174435458 | thejackshelton | 2026-11-09 |
| `test/e2e/motion.test.ts`: "an accordion panel whose height variable is left at auto and that leaves at once on close is red on both" | Fails after 45 to 54 s; last seen 2026-10-23, so it may already be fixed: drop the entry if it stays green to expiry. | CI runs 39667727244, 39769418018, 39832965168, 39920003180, 40031480175 | thejackshelton | 2026-11-09 |
| `test/e2e/radix-dialog-port.test.ts`: shows what Radix shows at every compared moment of 100 generated action sequences | A real port defect that only some random seeds reach. Open the sheet, close it, reopen it from script while it fades out, click outside, then Shift+Tab 261 ms later: Radix focuses its end focus guard, the port focuses the sheet's close button. Radix removes the backdrop node, which resets where the browser's Tab navigation starts; the port only hides it. Reproduce with `DIALOG_SEED=-1113089783`. | CI run 40252581398 | thejackshelton | 2026-11-09 |

## Caches

The repository's Actions caches share one 10 GB limit, and a cache saved by a pull request is visible to that pull request alone. On 2026-10-27 the caches stood at 10.5 GB, five of them 1.4 GB copies of the same old-site build saved from pull requests, so GitHub evicted entries main's runs had saved and jobs went back to the runners' apt mirror: one slow-network job spent 12 of its 16 minutes downloading 119 MB of browser system packages at 165 kB/s. The Playwright browsers and their system packages (`.github/actions/setup`) are therefore saved from `main` only, and pull requests restore main's entries.

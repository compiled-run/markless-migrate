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
- The merge queue (ruleset "main protection", on since 2026-10-31) squashes, requires every check green, gives a group 240 minutes, builds up to 2 groups at once, merges up to 10 pull requests per group and waits 1 minute to fill one. Merge with `gh pr merge <n> --squash`, which adds the pull request to the queue.
- The merge queue tests the exact commit `main` will become, with every suite, before it lands. A push to `main` whose commit passed the merge queue at that SHA does not run them again; the Changes job links the queue's run. A push that did not come through the queue runs everything.
- No e2e suite reads `examples/`, `deploy/` or `docs/`, so a pull request that only touches those, or Markdown, skips the e2e jobs.
- Every push to `main` and every merge queue group gets a run of its own that the next merge does not cancel. In one shared group, merges a few minutes apart cancelled each waiting run, and `main` went hours without a finished one.
- At most two full-site runs go at once across `convert.yml`, `check.yml`, `pipeline.yml`, `probe-dead-controls.yml` and `probe-measure.yml`. A run is full-site when it names 50 routes or more, or no route list (every page). Its first job, `full-site gate` (`scripts/full-site-gate.ts`), waits on one runner until fewer than two full-site runs are ahead of it: every admitted one, and every older one still waiting. So runs start oldest first and none is cancelled. A gate still waiting after 330 minutes fails. `gh run rerun <id> --failed` then waits again in the same place, because a run keeps its creation time. Subset runs, and check.yml when the pipeline calls it, pass straight through. On 2026-10-31 parallel full-site dispatches had one convert with 21 of 24 shards queued.
- A pipeline or check run dispatched with `-f priority=deploy` (the night's deploy run) skips the full-site gate and does not count against its two slots.
- Not on today: a paid larger-runner pool for capture shards during proof-heavy stretches. A full-site capture is about 1,400 to 1,500 runner-minutes, about $9 on a 2-core larger runner at $0.006/min. If it is ever wanted, capture's `runs-on` would read a repository variable (`${{ vars.CAPTURE_RUNNER || 'ubuntu-latest' }}`), so it is switched on and off without a code change.
- `check.yml` and `convert.yml` run at most 10 shards at once. `check.yml` no longer runs on pull requests; try a change to it with `gh workflow run check.yml --ref <branch>`.

## Slow-network verdicts

`test/e2e/slow-network.test.ts` ("a resource only Firefox requests ...") compares a page against an identical copy in 9 cells (3 browsers, 3 gated times), 4 runs a side. It went red 7 times between 2026-10-21 and 2026-10-28 (CI runs 40592884982, 40576060649, 40447488442, 40603280988, 40636265801, and the runs of main b37f5234, #365 and #367), each a 10 to 20 ms gap: with 4 runs a side the one-sided Mann-Whitney test's two smallest p values, 0.014 and 0.029, are both under 0.05, so one slow run made an identical page significant. `check` now also needs the median to be later by at least max(33 ms, 5% of the old median, the noise band, the instrument's step); `test/slow-network-verdicts.test.ts` deals the measured runs of two such pages into every 4-against-4 split (140) and finds none red, and every split red with 100 ms added to the new side. The test came off the quarantine list after 10 of 10 green runs of it on a Mac at load average 7 to 11 (2026-10-28) and a green pull request run on CI. It went red once more on #455 (CI run 41136076115: Firefox Regular 3G first frame 0.15 s later at p = 0.029). The cause was the rule, not the timing: each cell had its own 0.05, so a route's 9 cells went red together about 1 time in 5 on identical pages. Since then a route's cells share one significance (Holm's step-down per gated time, `routeVerdicts` in `src/check/slow-network-verdicts.ts`). Whether identical pages stay green is a rate, so it is asserted where it is exact: a seeded simulation in `test/slow-network-verdicts.test.ts` runs the product's verdict code over 1,000 routes of 9 cells and finds 2.9% red on identical pages and 99.8% red with the first frame 0.3 s later in one cell (22.1% red on identical pages under the old rule). The live test now checks the wiring only: Firefox alone fetches the resource, and its cell is red (missed about 0.04% of runs even if 1 run in 20 stalls a second).

## Bug corpus

Every bug the owner found by hand in the ui.shadcn.com port is in `deploy/shadcn-ui/corpus/bugs.json`, with its route, the gesture that shows it and the finding check must report for it. Two gates keep check reporting them:

- `test/e2e/corpus.test.ts` puts each bug back into a micro-site page built like the original's widget (`test/corpus/site.ts`) and runs the check CLI on it, as one page of a site larger than 20 pages, so the page is not its template's representative. It runs in the merge queue and on `main` (the mutation job). A case is caught only by a finding of its own class that names its control; a control the run never used names nothing. Cases listed as pending in the test are not caught yet and say which work takes them.
- `.github/workflows/corpus.yml` checks the real routes on the kept port builds that still have the bugs (release assets, never redeployed), against the original built from source, on every push to `main` that changes the checker. `scripts/corpus.ts verify` fails the run when a bug's route was checked and no finding names it, or when the route could not be checked.

A new hand-found bug goes into both: its route and build in `bugs.json`, and a case in `site.ts` that is red on the checker before the fix that catches it.

## Caches

The repository's Actions caches share one 10 GB limit, and a cache saved by a pull request is visible to that pull request alone. On 2026-10-27 the caches stood at 10.5 GB, five of them 1.4 GB copies of the same old-site build saved from pull requests, so GitHub evicted entries main's runs had saved and jobs went back to the runners' apt mirror: one slow-network job spent 12 of its 16 minutes downloading 119 MB of browser system packages at 165 kB/s. The Playwright browsers and their system packages (`.github/actions/setup`) are therefore saved from `main` only, and pull requests restore main's entries.

## Secrets

`SHADCN_BYPASS` is the Vercel protection bypass for the shadcn-ui port's preview deployments. Only workflows that run on `workflow_dispatch` read it (today the dead-control probe, `.github/workflows/probe-dead-controls.yml`), never one that runs on `push` or `pull_request`, so a fork's run cannot read it. It is sent only as the `x-vercel-protection-bypass` header on requests to the port's host. GitHub masks it in logs, and no step prints it. It was set on 2026-10-28 from the bypass file the shadcn workers use. To rotate it, regenerate the bypass in the Vercel project and run `gh secret set SHADCN_BYPASS < <file>`.


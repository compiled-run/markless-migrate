# Migration log: Hacker News on Next.js App Router + React Server Components to Markless

[nextjs/next-react-server-components](https://github.com/nextjs/next-react-server-components) at `e5cdd85` (Next
14.2.35, React 18.3.1: a Hacker News clone reading the live Firebase API from React Server Components; the news list
at `/` and `/news/:page`, item pages with the whole comment tree, a comment form, vote and collapse toggles) ported to
Markless 0.9.0 (published packages, `create-markless --starter app`) by Claude Code, and checked with
`markless-migrate check`.

The goal was to prove Markless under heavy server data fetching: a list page makes 31 upstream requests, an item
page one per comment (291 on a 290-comment thread, 680 on the largest thread of the day), fanned out level by level
and rendered as a recursive tree.

Result: **0 of 6 checked routes green** (`/`, `/news/1`, `/news/2`, `/news/18`, a 290-comment item, an 8-comment
item; the 680-comment item ran out of time). The rendered text of every page is the same as the old app's, line for
line (1,076 lines on the 290-comment item), and three kinds of difference are accepted (23 entries, below). What
keeps the routes red is real: Lighthouse mobile load times, the first use of a comment toggle and some in-place
navigations at 4x CPU, and a set of in-place navigations that did nothing in the checker's runs (below). Ten Markless
defects were found and reduced to repros. Six markless-migrate problems were found: five fixed in five PRs, all
merged, one left to another worker's PR that does the same (#147).

## Deployed

| What | URL |
| --- | --- |
| Old app (Next.js, source unchanged, built on Vercel) | https://mm-hn-rsc-old.vercel.app |
| New app (Markless) | https://mm-hn-rsc-new.vercel.app |

`deploy/hn-rsc/deploy.sh old|new` builds and deploys each; `new` builds in a copy (`deploy/hn-rsc/.build-new`) so a
local server running the app for a check is not changed under it. Both read the live Hacker News API. The front door
(`deploy.sh front`) is not deployed: no route is green, `switch` refuses a red route, and forcing them would put red
routes in front of visitors, so every path would go to the old app anyway.

## What the old app is

| Route | Old app | Upstream requests per render |
| --- | --- | --- |
| `/` (rewritten to `/news/1`), `/news/:page` | `topstories`, then the page's 30 items in parallel; no Suspense boundary, so nothing is sent until all 30 answer | 31 |
| `/item/:id` | the layout awaits the story, the page awaits `getComments`, which fetches every comment level by level (`Promise.all` per level) under `loading.tsx` | 1 + one per comment |
| anything else | Next's 404 | 0 |

The source suggests `/item` streams its comments behind three skeleton bars. It does not on a document load: both
routes are ISR pages (`revalidate: 10`; `generateStaticParams` prerenders `/news/1` and the top 30 items), and an
ISR render, cached or not, is sent whole. On `next start`, an uncached 290-comment item sends its first byte at
381 ms with everything in it, a cached one at 8 ms. The skeletons only show on an in-place navigation, while the
router fetches the RSC payload.

The other nav items (`new`, `past`, `show`, `ask`, `jobs`, `submit`, `login`) are plain text in the old app and
there are no user pages, so there is nothing more to port. `plan` finds 517 routes: `/`, `/news/1` to `/news/19`
(18 and 19 are past the last story) and the 497 items they link to.

## Set-up

1. Old app: a clone at `e5cdd85`, `pnpm install`, `next build`, `next start -p 47410` with the request recorder
   (`NODE_OPTIONS=--require=.../src/check/record-server.cjs`). Source unchanged.
2. New app: `npm create markless@0.9.0 -- hn-rsc-markless --yes --starter app --agents claude-code --no-git
   --no-workspace`, `vp build`, `node .output/server/index.mjs` on port 47431 with the same recorder.
3. `plan --old http://127.0.0.1:47410 --source /tmp/hn-rsc-old` (after migrator fix 1).
4. `check --data record` once for the checked routes, then `check --data replay`, so both apps render the same
   recorded Hacker News responses (after migrator fixes 2 and 4; the browser clock set to the run's start with
   `--time`).

## How the port is built

- `pages/index.tsrx`, `pages/news/[page].tsrx` and `pages/item/[id].tsrx` each read their data with one async
  `computed()` and show it in one `@try`/`@pending`/`@catch`. There are no loaders, effects or status flags.
  `lib/hn.ts` is the old `lib/` (`fetch-data`, `get-item`, `get-comments`) as plain functions that return view
  data; the item page's one value is the story and its whole comment tree.
- HN comment text is HTML. Markless has no way to insert an HTML string (an `innerHTML={...}` attribute is written
  out as an attribute), so `lib/rich-text.ts` parses it with parse5, as a browser parses `innerHTML`, into the
  blocks and inline runs HN writes (text, `<p>`, `<pre>`, `<i>`, `<a>`, `<code>`), and `components/comment.tsrx`
  renders them with row-level `@if`. parse5 is imported behind `import.meta.env.SSR`, so it never ships.
- The comment tree is one recursive component (`components/comment.tsrx`, a `@for` over its own replies).
  Collapsing a comment sets `hidden` on its text and replies instead of removing them with `@if`: an `@if` around
  child components that hold state cannot be rebuilt (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`).
- The footer and the "Rendered at" line are inside each page's `@try`, so streamed content lands above them and
  never pushes them down (with them outside, Lighthouse measured a CLS of 0.161 on `/news/1`).
- CSS modules became `<style>` blocks in each component (scoped by Markless); `app/globals.css` is
  `styles/global.css`; the skeleton's shimmer stops under `prefers-reduced-motion`, since the port shows it on a
  document load and the old app never does.
- `middleware/request.ts` answers a trailing slash with Next's 308.

## Markless defects found (repros)

Each is reduced to a page in `hn-rsc-markless/repros/`, a separate Markless 0.9.0 app. Build it, start it, and
`node witness.mjs http://127.0.0.1:<port>` prints expected and actual for each. All of these reproduce on a
production build except 5, which only fails under `vp dev`. The framework was not edited.

| # | Defect | Repro | Expected | Actual (production build) | What the port does |
| --- | --- | --- | --- | --- | --- |
| 1 | An async `computed()` in a component imported by a page is never resolved on the server | `pages/async-in-child.tsrx` | the server streams `item 1` into the response | the response has only `loading 1` and ends; the browser runs the recipe itself (a second trip for data) | every async value lives in the page component |
| 2 | Async components inside a streamed boundary's `@for` never resolve, on the server or in the browser | `pages/nested-async.tsrx` | `item 1 item 2` | `loading 1 loading 2`, for good | the list page loads all 30 stories in one value (`Promise.all`) instead of a boundary per story |
| 3 | A `@try` nested in another `@try` in one component: the outer one is never streamed | `pages/nested-try.tsrx` | `outer inner` | `loading outer`, for good (only the inner arm is in the response) | the item page has one boundary for the story and its comments, so the story arrives with the comments rather than first |
| 4 | A text binding that mixes a prop with state reads the prop as `undefined` once the state changes | `pages/prop-text.tsrx` | `solo [+9]` after a click | `[+undefined]` (the label is gone too) | `[+N]` is computed on the server into one prop, read alone in the binding |
| 5 | (dev only) A component with its own async value and state: the state binding is lost | `pages/stateful-async-child.tsrx` | the class changes on click | `vp dev`: "Markless DOM update expected graph node state:voted", then "Unknown async symbol symbol:0"; the click does nothing. Production works | not needed once 1 is avoided |
| 6 | Two streamed boundaries: an `@if` followed by an attribute binding in the first breaks resume of the second's rows | `pages/two-boundaries.tsrx` | the first `[-]` toggles | "Resume locator r:1:c1:h1 expected `<span>` at DOM order index 2 but found `<div>`"; no toggle on the page answers | `Story` shows its "(host)" with `hidden` instead of `@if`; in the port this killed all 290 comment toggles |
| 7 | A recursive component's props carry its whole subtree again at every level: the resume payload grows with nodes times depth | `pages/recursive-payload.tsrx` | a payload near the size of the tree (12 kB of JSON for 255 nodes) | 628 kB, 52 times the tree | none possible; see the weight table: a 290-comment page is 2.1 MB (old 252 kB), a 680-comment page 7.0 MB (old 630 kB) |
| 8 | A value that fails to settle on the server (here, a prop the child's `@for` reads is left out) leaves the page on `@pending` | `pages/settle-failure.tsrx` | the `@catch` content, or an error response | server log `MARKLESS_COMPOSED_READ_UNMAPPED`; production ends the response with the `@pending` content and status 200; `vp dev` sends an empty "aborted" error page | found when a refactor dropped the `comments` prop: every item page hung on its skeleton. Nothing at build time reports a missing prop (the type check is the editor's only) |
| 9 | Streamed content is held back until 200 ms after the first paint | `pages/arm-delay.tsrx` | shown when its part of the response arrives | response ended at 65 ms, first paint 24 ms, shown at 226 ms. The inline arm scheduler waits `max(FCP + 200, last + 300)` | none. On `/news/1` the list arrives at 95 ms and shows at 232 ms (old: 108 ms); Lighthouse mobile counts 2.4 s of render delay on the LCP |
| 10 | The first click's cost grows with the page | `pages/toggle-few.tsrx` vs `pages/recursive-payload.tsrx` | about the same on 7 and 255 nodes (4x CPU) | 10 ms vs 41 ms; on the 290-comment page the first `[-]` takes 153 ms at 4x CPU (old 40 ms), a 94 ms long task in the resume chunk | none |

Limitations hit, not defects:

- One `@try` may read only one async value (`MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT`), so the item page
  returns the story and its comments as one value.
- The router cannot wait for a page's data before sending it, so the port shows a skeleton on a document load
  where the old (ISR) app shows nothing until it is complete.
- No HTML-string insertion: comment HTML is parsed on the server into elements (above).
- Markless writes adjacent text as one text node; React writes `26<!-- --> <!-- -->comments`. Chrome names the
  old link `26comments` and lays the text out a sub-pixel differently, so two accepted differences come from it.

## markless-migrate problems found and fixed

Each was fixed with a red-first test, in its own PR, separate from the port.

1. **`plan` crawled 10,000 pages.** The "More" link never ends: past the last story every `/news/N` is the same empty
   list linking to `/news/N+1`. `plan --limit 60` fetched its whole crawl bound (9,500 `/news` pages, each a server
   render), and `check --all` would have checked them all. Fixed: a page that shows what an earlier page of its
   route shows apart from its numbers, and links on to an unseen page of the same shape, ends the crawl there
   (`/news/19 shows what /news/18 shows ...`). The crawl is now 517 pages. compiled-run/markless-migrate#116, merged.
2. **`check --data record` saw nothing the old app fetched.** Next answers an ISR page, and any `fetch` in its data
   cache, without running it: 0 server requests recorded on `x-nextjs-cache: HIT`/`STALE`, 30 of 31 on a miss (the
   story list came from the data cache). So replay could not give both apps the same data. Fixed: with `--data`, the
   recorder adds the build's own draft-mode cookie (`.next/prerender-manifest.json`) to each check load, and Next
   renders on demand (31 of 31 recorded). compiled-run/markless-migrate#117, merged.
3. **A 290-comment page ran out of the journey budget.** The `[-]` toggles are found by their click listeners, and
   such controls were never grouped, so each was a journey of its own on a fresh load of a 2 MB page; 900 s were
   spent and hundreds were unused. Fixed: alike clickables are used in turn in one session, last on the page first
   (a toggle that renames itself and hides the replies after it cannot then move or hide those still to come).
   compiled-run/markless-migrate#168, merged.
4. **Replay served only the route's own recording.** The item page's journeys arrive from `/`, which then loaded
   live: the story list had moved on, the link at that position led to another item on each side, and both apps
   fetched that one live. Fixed: a request the route's recording lacks is answered from every other route's
   recording (newest first), pushed to each server once per run. compiled-run/markless-migrate#169, merged.
5. **Times disagreed for reasons outside the port.** The browser is frozen at 2026-01-15, so the old app's
   browser-side "N hours ago" (after an in-place navigation) read `-282 days ago`; and the two servers rendered a
   minute apart, so a story was `8 hours ago` on one and `7 hours ago` on the other. A fix (both clocks at the
   data's moment, the server's pinned through the recorder) went up as compiled-run/markless-migrate#170 and was
   closed as a duplicate of #147 (another worker's opt-in `--server-clock`, opened first); the follow-up idea is in
   #170. In the port's own checks the browser clock is set to the time of the run (`--time`).
6. **A route that took longer than `--timeout` was blamed on the network.** The 680-comment thread stopped after
   2400 s with "an infrastructure failure (not the app's) ... a server that stops answering part way through does
   this", while both apps had answered every request. Fixed: with no request waiting and an answer just before the
   deadline the route is red, "ran out of time"; a request that really stalled is still an infrastructure failure,
   and now named. compiled-run/markless-migrate#186, merged.

Not fixed, noted:

- The check of a 680-comment page needs well over 40 minutes (both sides explore every toggle, each step compared
  on a 2,400-line accessibility tree). With fix 3 they run in one session, but a step on a page that size is slow.
- The main branch's CI rarely finished a run while these PRs were open: each new merge cancelled the previous
  run (concurrency group), and one red run on `fe1d41ee` was a recharts test that passed on a rerun.

## Iterations

| # | Run | Result | What it caught, and what changed |
| --- | --- | --- | --- |
| 1 | `plan` | 10,000 pages crawled | the endless "More" pagination (migrator fix 1) |
| 2 | `check --data record`, 7 routes | 0 of 7 | recording saw no server requests on cached pages (fix 2, found before this run); `.text :global(p)` from the CSS module did nothing in a Markless `<style>` (now `.text p`); CLS 0.161 from streamed stories pushing the footer down (footer moved inside the `@try`); the reduced-motion check saw the skeleton shimmer; a cross-request fetch dedupe in `lib/hn.ts` filed one page's requests under another (removed: the item page chains its two reads instead); the 680-comment page ran out of journey budget (fix 3) |
| 3 | `check --data replay`, 7 routes, fix 3 | 0 of 7 | network green; journeys arriving from `/` loaded it live and went to other items (fix 4); `-282 days ago` and `8`/`7 hours ago` from the clocks (fix 5); the 680-comment route stopped at 2400 s and was called a network failure (fix 6); the two-boundary item page killed every comment toggle (defect 6) |
| 4 | replay, 6 routes, fixes 3-5 | 0 of 6 | with both clocks pinned to the recording's moment, every in-place navigation on the new app did nothing; fix 5 was dropped (closed as a duplicate anyway) |
| 5 | replay, 6 routes, fixes 3-4, `--time` = the run's start | 0 of 6 | the final run below; 23 differences accepted afterwards |

Claude Code converted every page itself. The migrator's own `run` with an agent was not tried: the machine-wide
queue was full with other workers' checks for most of the session, and each check run here already waited for a slot.

Each check run waited from 20 minutes to an hour for a slot in the machine-wide queue (other workers' checks and
builds), and the 290-comment route alone takes about 25 minutes.

## Final check (run 5)

`check --old http://127.0.0.1:47410 --new http://127.0.0.1:47431 --route / --route /news/1 --route /news/2 --route
/news/18 --route /item/50224916 --route /item/50227356 --data replay --time <run start> --source /tmp/hn-rsc-old
--new-source .`, both apps production builds on one machine with the request recorder.

| Dimension | Result |
| --- | --- |
| http, seo, css, fonts, assets, network, coverage of what each page links | green |
| rendered | green apart from Next's route announcer, accepted automatically |
| a11y | red only for the link names React splits (accepted, below) |
| visual | red only for sub-pixel anti-aliasing of the same text (accepted, below) |
| weight | red for JavaScript downloaded (accepted, below); run at load is 8-19 kB against 138-260 kB |
| behaviour | red: on `/news/2` and the 8-comment item, every journey that arrives in place (from `/` by "More" or by a story link) found the new page still on `/`: the click did not navigate. Not reproduced outside the checker (the same journeys through `explore()` and `replay()` navigate); it only appeared once the run served every route's recording (fix 4). The vote batch on `/news/1` reports the whole page "disappearing" at one step, also not reproduced alone. Listed, not accepted |
| responsiveness | red: first use of a comment toggle 137 ms against 48 ms at 4x CPU (defect 10); navigation from the item page's links 140-181 ms against 46-72 ms at 4x CPU |
| load | red: Lighthouse mobile, see below |
| navigation | red: an in-place navigation shows a few frames with only the footer (streamed content not yet applied, defect 9) |

## Accepted differences

Accepted by the converting agent under the owner's brief, with `by: Claude Code (converting agent), per the owner's
brief`; the entries are in `hn-rsc-markless/migrate-accepted.json` (copy it to `.migrate/accepted.json`).

| What | Where | Why it cannot be removed |
| --- | --- | --- |
| Link name `196 comments` against the old `196comments` (focus order) | every page with stories | React writes `196`, ` `, `comments` as three text nodes between `<!-- -->` markers and Chrome drops the space from the accessible name; Markless writes one text node, and the port's name is what the link shows. Markless cannot write split text nodes. |
| 150-300 pixels of anti-aliasing on story meta lines (0.01-0.04%) | list pages, every viewport | the same split: Chrome places glyphs a fraction of a pixel differently across text nodes. Same text, same boxes. |
| JavaScript downloaded is higher (217-419 kB against 99-101 kB, uncompressed) | every page | Markless modulepreloads its router and resume runtime (chunks of about 120, 81 and 68 kB). JavaScript run at load falls from 138-260 kB to 8-19 kB. |

## Measurements

Both apps as production builds on one machine (old: `next start`; new: the Nitro server), five runs, median, unless
noted. "Old, cached" is what visitors of the deployed old app get almost always (ISR, `s-maxage=10`); "old,
rendered" is a render on demand (Next's draft mode), the cost of a cache miss.

Time to first byte and streaming order (`deploy/hn-rsc/stream.mjs`):

| Page | Old, cached | Old, rendered | New |
| --- | --- | --- | --- |
| `/news/1` | 3 ms, all at once (53 kB) | 108 ms, all at once | first byte 14 ms (header), stories 95 ms, end 96 ms (109 kB) |
| 290-comment item | 8 ms, all at once (252 kB) | 381 ms, all at once | first byte 14 ms with the skeleton, story and comments 485-635 ms, end 639 ms (2.1 MB) |
| 680-comment item | | 1,505 ms, all at once (630 kB) | first byte 13 ms, story and comments 923-1,459 ms (7.0 MB) |

On Vercel (warm, five runs, median): before the port sent a cache header, new `/news/1` was 114 ms to first byte
with the stories at 172 ms (old 132 ms, from its ISR cache), and the 290-comment item 144 ms with the comments at
830 ms (old 61 ms), rendered on every request. The port now sends the old app's `cache-control: s-maxage=10,
stale-while-revalidate`, and Vercel's CDN caches it the same way (`x-vercel-cache: HIT`): new `/news/1` 54 ms, all
by 55 ms (old 67 / 80 ms); the 290-comment item 119 ms, all by 157 ms (old 59 / 75 ms), 2.35 MB against 294 kB.

From the final check (uncompressed):

| Route | JS run at load, kB (old → new) | JS downloaded, kB | First interaction, 4x CPU | Lighthouse mobile score, FCP, LCP (old → new) |
| --- | --- | --- | --- | --- |
| `/`, `/news/1`, `/news/2` | 164-166 → 19 | 101 → 405-419 | 24-48 → 32 ms | 100 → 95; 0.91 → 1.50 s; 1.66 → 2.85 s |
| `/news/18` | 141 → 8.6 | 99 → 217 | | 100 → 96; 0.90 → 1.05 s; 1.65 → 2.70 s |
| 290-comment item | 260 → 9.0 | 101 → 405 | 48 → 137 ms (toggle) | 99 → 55; 1.20 → 12.45 s; 2.10 → 14.86 s |
| 8-comment item | 155 → 9.0 | 101 → 405 | 48 → 55 ms | 99 → 79; 0.90 → 2.40 s; 1.95 → 4.81 s |

Responsiveness summary: first interaction old 48 → new 137 ms at 4x CPU (desktop 48 → 62 ms); navigation old 398 →
new 181 ms at 4x CPU (desktop 167 → 154 ms).

Why the item pages lose on Lighthouse: the HTML carries a resume payload that repeats each comment's subtree at every
level (defect 7: 2.1 MB for 290 comments, 7.0 MB for 680), and streamed content is held until 200 ms after the
first paint (defect 9). Lighthouse simulates slow 4G, where 2 MB is about 10 s. The list pages lose about 0.6 s of
FCP for the same reasons on a smaller scale (109 kB of HTML against 53 kB, four stylesheets against two).

Server load: on a list page the router fetches a few visible links ahead of a click once the browser is idle (8
fragments on `/news/1`). Each is a full server render of an item page, so one visit can fan out to several hundred
Hacker News requests.

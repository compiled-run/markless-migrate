#!/usr/bin/env node
import { convert, summarizeConvert } from './convert/index.ts';
import { readOverrides, rulesOff } from './overrides.ts';
import { EMBEDS_DIR, EMBEDS_FILE, readEmbeds } from './embed/file.ts';
import { ADAPTERS, installAdapter, staleAdapter } from './embed/adapters/index.ts';
import { describeActivation } from './embed/check.ts';
import { embedBrief, embedsByRoute } from './embed/detect.ts';
import { studyEmbed } from './embed/study.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { PSI_KEY_ENV, PSI_NOTICE, psiKey, userEnvFile } from './check/psi.ts';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { measureSlowNetwork, NETWORK_BROWSERS, networkTables, shortNames, type NetworkBrowser } from './check/slow-network.ts';
import { NETWORK_PROFILES } from './check/throttle.ts';
import { AGENTS, detectAgents, findBinary, type HostEnv, type ServerCommand } from './agents/registry.ts';
import { applySetup, describeChanges, planSetup, undoSetup, writeUndo } from './agents/setup.ts';
import { renderStatusPage } from './check/html.ts';
import { openFile } from './check/open.ts';
import { readAuthFile } from './check/auth.ts';
import { bypassOptions } from './check/blocked.ts';
import { DATA_DIR } from './check/data.ts';
import { RECORDER, recorderEnv } from './check/recorder.ts';
import { jsonReportParts, runCheck, writePieces, writeReport, type CheckOptions } from './check/run.ts';
import { loadSourceFacts } from './check/source-facts.ts';
import { partialLine, summarize } from './check/summary.ts';
import { TEMPLATE_THRESHOLD } from './check/templates.ts';
import { chromium } from 'playwright';
import { defaultEnv } from './check/browser.ts';
import { DEFAULT_FREEZE } from './check/freeze.ts';
import { VIEWPORTS } from './check/types.ts';
import { discoverEndpoints, redirectTargets, UNKNOWN_PATH } from './check/endpoints.ts';
import { readSamples, routeTargets } from './plan/routes.ts';
import { writeStarterAuth } from './plan/auth.ts';
import { plan, plannedRoutes, summarizeInventory, writeInventory } from './plan/inventory.ts';
import { copiedLogin, DRIVERS, driver } from './run/drivers.ts';
import { startAppServer } from './run/server.ts';
import { applyIfPlanned, CACHE_USAGE, cacheCommand, planAndWrite } from './cache/cli.ts';
import { readCachingPlan } from './cache/plan.ts';
import { cachingRegressions, formatRegression } from './cache/regressions.ts';
import { runRoutes, summarizeRun } from './run/loop.ts';
import { acceptedLabel } from './check/automatic.ts';
import { readCoverage, readInventory, readResults, recordResults, STATE_DIR, status, summarizeStatus } from './status.ts';
import { changedSince, gitHead, selectChanged } from './check/changed.ts';
import { VERSION } from './version.ts';
import { buildAssets, nitroSnippet, notServedBy, pageAssets, vercelConfig } from './switch/deploy.ts';
import { startProxy } from './switch/proxy.ts';
import { AGENT_ENV, missingUnder, readSwitched, switchRoute, unswitchRoute } from './switch/state.ts';
import { ACCEPTED_FILE, acceptFailure, readAccepted, writeAccepted } from './check/accepted.ts';
import { decisionLine, LIBRARIES_FILE, planLibraries, readLibraries, summarizeParity, writeParity } from './library/index.ts';
import type { RouteState } from './status.ts';
import { CLI_CONFIG, CLI_REPORT, readCliConfig, runCliCheck, summarizeCli } from './check/cli/conform.ts';
import { implementations, planUsage, readUsage, readUsageMap, routeBrief, scanUsage, summarizeUsage, usagePages, writeUsage } from './usage/index.ts';
import { guardPages, readAllowances, scanBuild, summarizeBuild } from './client/index.ts';
import { acceptUpgrade, findUi, summarizeUpgrade, upgrade, writeUpgrade } from './upgrade/index.ts';
import { scanLibraries } from './library/index.ts';

const USAGE = `markless-migrate ${VERSION}

  plan    --old <origin> [--source <path>] [--auth <file>] [--limit <n>] [--crawl-limit <n>] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>] [--no-caching]
          Inventory the old app's routes, SEO, assets and locales into .migrate/inventory.json,
          then each route's caching into .migrate/caching.json (see cache plan; --no-caching skips it).
          Every route of the old site is listed with where it was found: the sitemaps (indexes
          followed), robots.txt, feeds, a same-origin link crawl of every page (pagination and
          redirects followed, at most --crawl-limit pages, default 10000), the source's routes with
          --source, and the non-page endpoints. --limit caps only the pages loaded in the browser for
          their SEO tags and assets (default 100). --auth (as for check) crawls again as each role,
          in the browser and by links, so routes only a signed-in visitor reaches are listed too, with
          the roles that reach them. Source routes with dynamic segments take their values from the
          crawl or .migrate/samples.json.
          With --source, auth guards propose roles and the login route in a starter .migrate/auth.json,
          and every library the old app imports goes in .migrate/libraries.json: the exact surface used,
          each usage site, and whether it maps to @markless/ui, stays as-is, needs a port, or draws
          its own UI (a grid, chart or editor). For those, plan decides by measured rules whether to port
          the parts the app uses or to use the library directly, loaded when needed, and says why; a
          framework wrapper (ag-grid-react) is always ported. .migrate/overrides.json may change it.
          A webpack app's pages are what HtmlWebpackPlugin and CopyPlugin emit, linked to their entries.
          Usage: every page's markup (served, or --built <dir> for the old build output), the syntax
          tree of every script it runs, the theme config and the library scan are read into
          .migrate/usage.json: each behaviour the old site uses (an htmx attribute and its trigger,
          swap and target; an Alpine directive; a _hyperscript feature; a theme feature such as the
          colour-mode toggle; a library component and its props; what each plain script listens for,
          stores, fetches and writes), with where it lives and the routes that use it, plus the
          checks each must pass in .migrate/obligations.json. Another framework's runtime is never
          kept: what the pages use of it is implemented in Markless. Only static assets (CSS, fonts,
          images, SVG, media) are copied byte for byte.
  convert --old <origin> [--source <path>] [--only <file of routes>] [--fallthrough <old deployment>] [--no-reveal] [--concurrency <n>]
          Turn every planned HTML route into a Markless page in the current app: each page as a visitor's
          browser holds it once settled (loaded as check loads it), without the old framework's runtime;
          shared regions (header, sidebar, footer) as components; what controls reveal (menus, dialogs,
          tab panels) captured from the old page as inert templates; the library parts the old source
          renders (from .migrate/usage.json) bound to Markless ports of those libraries, delegated from
          each page's root; static assets copied byte for byte. With --source, the old config's
          redirects and rewrites and its route handlers answer through a generated Nitro middleware.
          Writes .migrate/convert/report.json: what was left out and why, the shared components, the
          endpoints and how each is answered, and the library parts no port implements yet.
${CACHE_USAGE}  check   --old <origin> --new <origin> [--route <path>]... [--json] [--open]
          [--source <path>] [--old-hash-routes] [--data record|replay] [--live-window <seconds>] [--staging] [--block <host>]... [--allow <host>]...
          [--no-freeze] [--time <iso>] [--server-clock] [--seed <n>] [--timezone <tz>] [--locale <tag>]
          [--auth <file>] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>]
          [--all] [--allow-unchecked] [--new-source <path>] [--concurrency <n>] [--changed]
          [--journey-budget <seconds>] [--max-journeys <n>] [--journey-depth <steps>] [--timeout <seconds>]
          [--no-responsiveness] [--interaction-budget <ms>] [--cpu-throttle <rate>] [--network-latency <ms>] [--interaction-controls <n>] [--no-motion] [--no-embeds] [--no-probes] [--no-cache] [--resume]
          [--no-navigation] [--nav-entries <n>] [--nav-destinations <n>] [--no-load] [--load-runs <n>] [--load-cpu calibrated|<n>]
          [--psi-key <key>] [--psi-runs <n>] [--no-psi]
          Compare routes old vs new (default: every route of the old site plan listed). Exits 1 when any is red.
          Coverage: every route of the old site must exist on the new app, with the same status class
          and the same redirect target, or carry an accepted difference (accept <id>); each missing
          route is red and listed. An HTML page counts only when the new app's Markless code renders it
          (Markless's route marker names its page file); one without it is "served by the old app",
          listed apart, and, like a missing route, not ported: status is not done and switch refuses it.
          --only coverage measures just that, for every route.
          A hash-routed old app (its router keeps the route after #, as React Router's hashHistory) is
          loaded at /#<route> and compared with the new app at <route>; plan --source records it, and
          --old-hash-routes says so without a plan. Each such route is also opened on the new app by its
          old address /#<route>, which must land on <route>, so links saved from the old app keep working.
          The old side's loads and journeys are reused from .migrate/cache while every response the old
          page loaded is unchanged (ETag, Last-Modified or content hash); --no-cache loads them again.
          Each route's result is written to .migrate/check-progress as it finishes; --resume takes the
          results an earlier run of the same check (same origins, routes and options) wrote, so a run that
          stopped carries on where it was.
          --route checks only the routes named, for iterating: such a run (and --changed) is a partial
          run, "partial run: N of M routes", never overall green; it exits 4 when what it checked is green.
          Above ${TEMPLATE_THRESHOLD} pages, every page gets every check except visual, responsiveness
          and motion, which run on one representative per template group (grouped by URL pattern,
          page layout and the kinds of control each page renders); the report lists the groups. --every-dimension runs them on every page.
          Every interactive element of the old page (including those a click reveals, such as a
          dialog's controls) must be used by a journey, or the route stays red, on every page whatever its template:
          journeys are explored main content first (tables, forms), until each element is used or
          --journey-budget (default 120 s per route, or 3 s for each control the page shows, at most 15 min) runs out; --max-journeys caps their number and
          --journey-depth (default 4) how many steps deep a journey goes (nested menus, sidebars). A
          control in a shared header, nav, sidebar or footer is exercised by the first route of the
          run that has it, and the others carry its result. Each step is compared by what the page
          shows and keeps after it, and by how it answered: the viewport's pixels before and after it
          (outside the used control's own box) and its widgets' state (values, selections, what opened,
          a track that moved or scrolled). A step the old page answers and the new page does not is red,
          and so is one where the new page shifts its layout more (layout-shift entries, with scrollbars
          shown) or first changes more than 100 ms and 1.5x later after the input. Pages with a contents
          list are scrolled to each section; surfaces that answer the pointer (charts) are pointed at
          across their width; and up to 30 journeys run again after arriving in place from another page.
          --all adds every route the source scan knows (dynamic segments filled from crawled paths or
          .migrate/samples.json; check exits 1 while any is left unchecked, unless --allow-unchecked),
          a path no app has (the not-found page), redirects (the config's own and the other
          trailing-slash form of every page, compared by status and redirect chain) and the non-page endpoints: robots.txt, sitemaps, feeds, the manifest,
          /.well-known files and JSON route handlers, compared as data.
          Responsiveness: each control the journeys used and each internal link they followed is used
          once on a fresh page load, old then new, at desktop speed and on a phone-sized page with the
          CPU slowed (--cpu-throttle, default 4x). A first interaction must stay within max(16 ms, 10%)
          of the old app at both speeds, answer within --interaction-budget (default 200 ms) at the
          slow speed and fetch no code; a link must show the next page within max(16 ms, 10%) of the
          old app at the slow speed. --interaction-controls caps the controls timed per route (16).
          The network is the same on both sides while timing: each response is fetched from the app
          once, and every timed page gets it --network-latency (default 40 ms) after asking, so the
          times compare the apps, not the hosts; each page's server time is reported apart.
          --no-responsiveness leaves it out.
          Motion: the last step of every journey that stays on the page, and each later use of its control
          that stays there too (the second click that closes what the first opened), is replayed old then new with
          motion allowed, recording each transition and animation it starts (element, properties,
          duration, delay, easing, iterations) and frames at fixed offsets across the longest one; an
          animation missing on new (it jumps), timed differently (beyond max(20 ms, 10%)) or only on new
          is red. The same runs again with prefers-reduced-motion: reduce, where both must agree, and
          hovering and focusing each control is compared the same way. --no-motion leaves it out.
          Widget probes: one control of each kind is driven through its class's sequence on both apps at
          once, read after every step (focus and its ring, state attributes, what is open, toasts, tab
          stops, scroll lock): a click then Escape and Tab, Tab then the pointer moving; what it opens
          pointed along, closed by a click outside, Escape and its close button, reopened, chosen from and
          typed into; the pointer resting on it; sliders, handles and carousels dragged; a button that shows
          a toast used three times; a composite tabbed into and arrowed through; a right-click menu opened,
          closed and reopened; a checkbox, switch or toggle button pressed with Enter and Space. The route
          is loaded again with the clock moved 40 days into Pacific/Auckland: text the old page changes with
          the clock must change on new.
          --no-probes leaves them out; --only probes runs them alone.
          Navigation: one page per page shape (layout and scripts, at most --nav-destinations, 40) is
          reached by clicking a real link on --nav-entries (2) other pages, other layouts first, and once
          more after the entry page's control that keeps its state in the browser (a theme switch); then
          its own controls are used (that switch twice, then one in the content), then back and forward.
          Each moment is compared with a fresh load of the same URL and kept state: <html>, <body> and
          head, stylesheets, DOM, key computed styles, a screenshot, the script files that ran, globals
          and console errors. A link that loads a new document is a fresh load already; a difference the
          old app shows too, reached the same way, is its own; <html> class and data-* attributes are
          compared with the old app's too. --no-navigation leaves it out.
          Page load: after every other check, each page (one per template group) is measured as PageSpeed
          Insights measures it, on the deployed URLs, and in a calibrated lab:
          - PageSpeed Insights (mobile and desktop, --psi-runs a side, default 5, old and new in turn),
            with the key in PSI_API_KEY or --psi-key; with a key its verdicts gate the route and real
            users' field data (Chrome UX Report) is shown. Without a key it runs on the shared keyless
            quota, best effort, and says "PSI unavailable (quota), using PageSpeed-equivalent (lab)"
            when Google refuses. A free key takes a minute: https://developers.google.com/speed/docs/insights/v5/get-started#APIKey
            (markless-migrate setup --psi-key <key> stores it). --no-psi leaves it out.
          - PageSpeed-equivalent (lab): Lighthouse mobile here with PageSpeed's settings (simulated slow 4G,
            4x CPU; --load-cpu calibrated derives the slowdown from this machine's benchmarkIndex instead),
            --load-runs a side (default 5; as many again when a metric is worse but within noise). It gates
            the route when PageSpeed Insights cannot, and can differ from it by 10 points or more.
          FCP, LCP, Speed Index, TBT, CLS and the score are compared by their medians: a metric is red when
          the new median is worse by more than max(100 ms, 5%) (TBT 50 ms, CLS 0.02, 3 score points) and the
          runs differ beyond noise (one-sided Mann-Whitney, p < 0.05). The failure names the LCP element, its
          breakdown and the requests that began before it, old and new. --no-load leaves page load out;
          --only load measures it alone (a partial run: every other dimension is not compared).
          --source and --new-source map each failing element to its old and new source file and line.
          --concurrency checks that many routes at once (default half the cores, at most 4).
          --timeout stops one route's check after that many seconds (default 1800, or five journey
          budgets when that is more). A page load that times out or cannot connect is tried again
          once, 2 s later; a route the network still fails, or that passes --timeout, is reported
          as not checked for an infrastructure failure (DNS, connection or timeout, named), not as
          red. check exits 3 when nothing is red but such a route was not checked.
          --changed checks only routes not green last time, and routes whose files in the new app
          (--new-source, else this directory) changed since the commit of their last check.
          Writes .migrate/report.json and .migrate/report.html; --open opens the HTML report.
          Pages load with a fixed clock, seeded randomness, a fixed timezone and locale, and trackers
          blocked. --source scans the old app's code for what varies and which handlers write.
          --data record saves what OLD fetched per route in .migrate/data/; --data replay serves it to
          both apps. Writes (form posts, non-GET requests) are sent only when both origins are on this
          machine or --staging; otherwise they are held back and compared unsent.
          --auth names roles (a login script or a Playwright storage state file each, see plan's
          .migrate/auth.json); every route is checked once per role and once anonymous. A route a bot
          wall answers is stopped as blocked; --header and --cookie send a bypass token to both apps.
  parity  <library> [--route <path>]... [--new-source <path>]
          Write a port skeleton for one library into lib/parity/<library>/ of the new app: exactly the
          components, props, hooks, options and fields the old app uses (narrowed to --route), plus
          behaviour.md and behaviour.json: what each usage site must do, and the recorded journeys that
          exercise it. Needs plan --source (it writes .migrate/libraries.json). Existing port files are kept.
          For a library markless-migrate ships a certified port of (Radix Dialog, AlertDialog), copies that
          port into lib/ports/<library>/ instead, with <module>.behaviour.md naming each used part's component.
  cli     [--config <file>] [--case <name>]... [--record] [--json]
          Compare the old and new command-line tool (default config .migrate/cli.json): each case runs
          the old tool twice and the new one once, each in fresh temporary directories with a clean
          environment and a temporary HOME, the case's files, args, env and stdin answers (each sent
          once its prompt shows). Exit codes, stdout and stderr, every file written (tree and
          contents) and every request made must match; paths, colours, durations, versions and
          timestamps are normalised, and what varied between the two old runs may vary. Node tools
          get their fetch answered from .migrate/cli-network/<case>.json; --record first runs the old
          tool against the real network to write it. Writes .migrate/cli-report.json; exits 1 when a
          case differs.
  accept  <failure-id> --reason <why> [--by <name>]
          Record a failure as an intended difference in .migrate/accepted.json: from then on it shows as
          accepted (with the reason), not red. An expert's tool, never needed to finish a migration;
          ids are printed with every failure. check also accepts on its own, labelled "accepted
          automatically", the old framework's scripts the new page no longer loads, markup the old
          framework adds for itself when the accessibility tree and announcements otherwise match,
          live content in a third-party embed both pages show, a control neither page lets a visitor
          use for the same reason, and storage keys only the old framework writes (htmx's history
          cache, Laravel's sealed cookies) when no journey differs (each rule may be turned off under
          "automatic" in .migrate/overrides.json).
  recorder
          Print the NODE_OPTIONS that loads the request recorder into a Node server, so check compares
          what the server fetches while rendering and can replay recorded data to it.
  status  Show every planned route as green, red, not ported or not checked yet, which are switched
          (and which were forced without proof), and whether the migration is done.
  setup   [--agent <id>]... [--dry-run] [--undo]
          Register the MCP server and install the migration skill for your coding agents. Applies
          straight away (running it is the request), backs up every file it changes and prints what
          changed. --dry-run only shows what it would change; --undo puts every file setup changed back
          as it was before setup first changed it. --yes is accepted and changes nothing.
          Agents: ${AGENTS.map((a) => a.id).join(', ')}.
  mcp     Run the MCP server on stdio (started by your agent).
  switch  <route> [--force --by <name> --reason <why>]
          Serve a route from the new app: refused unless its last check (every role) is green, and
          refused, even with --force, while it would send a route the new app lacks there (a catch-all
          front door such as /*rest before coverage is measured, or with any route missing). --force
          is an expert override for a route that is not, with --by and --reason, or confirmed at a
          terminal; never from an agent that run drives. A forced route is recorded in .migrate/switched.json
          and shown in red as "forced, not proven" in status and the report. A route may be a pattern
          (/blog/:slug, /docs/*rest).
  unswitch <route>
          Send a route back to the old app.
  network <url>... [--profile <name>]... [--browser <name>]... [--runs <n>] [--control <selector>]... [--concurrency <n>] [--timeout <s>] [--json <file>]
          Loads each page cold over a slow network, as a visitor on it would, and clicks a control on it
          until it answers, the pages taken in turn, --runs a page (default 5). Every byte crosses one
          shaped link through a local proxy, so Chromium, Firefox and WebKit are throttled alike: the
          profile's bandwidth shared by all connections, and its round-trip time on every packet, so a new
          connection pays for its handshakes. Profiles:
          ${Object.values(NETWORK_PROFILES).map((p) => `${p.name} (${p.label.replace(/^[^(]+\(|\)$/g, '')})`).join(', ')};
          default regular-3g. --browser chromium (default), firefox, webkit. The control is clicked every 250 ms
          from when it is on screen; --control is a Playwright selector (one for all pages, or one per
          page in order), default the first unselected tab or closed disclosure. Prints the medians:
          time to first byte, first and largest paint, load event, first click answered and painted to
          answered, bytes downloaded and JavaScript downloaded (compressed) by the answer and in all,
          and JavaScript executed by the answer (Chromium). "In all" is once the network has been quiet
          for 2 s, at most 60 s after the answer. A run gives up after --timeout seconds (default 120).
          --concurrency loads that many pages at once, each over its own link (default 1).
          --json writes every run with its requests.
  proxy   --old <origin> --new <origin> [--port <n>] [--host <addr>]
          One origin in front of both apps: switched routes from NEW, everything else from OLD, with
          method, body, headers and cookies passed through, redirects to either app pointed back at the
          proxy, cookie Domains that would not apply dropped, and each asset taken from the app that
          served the page it was loaded from (falling back to the other app).
  config  --old <deployment> --new <deployment> [--vercel <file>] [--nitro <file>] [--new-build <dir>] [--index <file>]
          Production routing for the switched routes: a vercel.json (switched routes and the assets
          their pages load to NEW, the rest to OLD) and Nitro routeRules for the Markless app in front
          (every inventoried route and asset not switched yet proxied to OLD). Every file of the new
          build (--new-build, default .output/public or .vercel/output/static) goes to NEW unless the
          old app serves that file itself; an SPA's index.html answer to every path does not count.
          --index writes the front door's status page: every planned route, what serves it, and what
          is not ported yet.
  usage   [--old <origin>] [--built <dir>] [--source <path>] [--new-source <path>] [--json]
          Coverage of the usage inventory: behaviours used, implemented in Markless (declared in
          .migrate/usage-map.json as { "<behaviour id>": { "by": "<file or @markless/ui family>" } }
          and found in the new app) and checked (every obligation is one this checker performs).
          With --old or --built it scans again first; otherwise it reads .migrate/usage.json.
  guard   build [--dir <path>]
          Fails when a page of the new app's build output (default .output, else .vercel/output) loads
          or runs another framework's runtime (React, Vue, Svelte, htmx, Alpine, _hyperscript, jQuery...),
          read from each script's syntax tree. Evidence that a page loads a file: the app's bundles or
          built pages name its URL, or a file they load does. A file nothing names is a download and is
          allowed (listed). JavaScript-only libraries (Chart.js, Leaflet, Monaco...) are kept and listed.
          foreignRuntimeGuard() from src/client/guard.ts fails vite build the same way.
  guard   page --old <origin> --new <origin> [--route <path>]...
          On each route (default: the pages plan listed): every static asset the old page loads must
          load on the new page with the same bytes, every <style> the old page is served with must be
          kept, inline style attributes must be the same, every frame and sized element must keep its
          box within 1 px, and the new page may run no other framework's runtime. What differs between
          two loads of the old page is left out. An intended addition is listed, not red, when
          .migrate/guard-allow.json covers it: { "allow": [{ "subject": "div.port-attribution*",
          "reason": "licence badge for this demo copy" }] } (optional "kind" and "route"; a reason is
          required; a foreign runtime is never allowed). Writes .migrate/guard.json; exits 1 on a difference.
  upgrade --new <origin> [--route <path>]... [--limit <n>] [--new-source <path>] [--build <dir>] [--ui <dir>] [--no-load] [--load-runs <n>]
          After the routes are green. Measures, per route at 4x CPU on a phone-sized page, what each
          JavaScript-only library the port kept costs (bytes downloaded, JS run at load, main-thread
          time, and the first use of its own controls) and what each port of a headless library
          (lib/parity/<library>: Radix, Headless UI, Base UI, React Aria, Ark, Melt, Bits...) costs, and
          ranks the Markless ports worth making: measured cost, the features the site uses, expected
          saving, risk and size. A headless port is suggested as a swap to its @markless/ui family only
          when every part, prop, state, key, ARIA attribute and behaviour the old site used is covered
          (read from the family's API manifest and source, --ui or the app's @markless/ui); otherwise it
          is listed as "not yet: missing ...". A page whose largest text paints with a web font it finds
          only in its stylesheet (nothing preloads it) gets a font preload, measured with Lighthouse mobile
          (--load-runs a side) with and without it through a local proxy; it is suggested only when the
          LCP comes sooner beyond noise. --no-load leaves that out. Nothing is applied. Writes .migrate/upgrade.json.
  upgrade accept <id> [--baseline <origin>]
          Writes the agent task for one suggestion to .migrate/upgrades/<id>.md: what to build, and the
          check it must pass against the pre-upgrade version (--baseline serves it).
  run     --agent <id> --old <origin> --new <origin> [--route <path>]... [--all] [--attempts <n>] [--model <name>]
          [--source <path>] [--new-source <path>] [--auth <file>] [--header <name:value>]... [--cookie <name=value>]...
          [--serve <command>] [--build <command>] [--restart-on <path>] [--agent-timeout <minutes>] [--only load]
          Drive your agent's own CLI headless, one route at a time, until each route is green or is
          left red after n attempts (default 3), then go on with the next; it never waits for an answer.
          An attempt that runs past --agent-timeout (default 30 minutes) is stopped and counts as one.
          It ends with one report: green routes, library decisions, automatic acceptances, and what to
          look at if you care. Logs to .migrate/run.log. Each route is checked
          with the same --source, --new-source, --auth and bypass flags as check (--all as in check),
          and the prompt names them. --serve makes run own the new app's server: it runs --build and
          restarts the server after every attempt and waits until --new answers; with --restart-on it
          also restarts whenever that file changes, so the agent's own builds are served.
          It passes the MCP server to codex and claude on the command line and refuses a CODEX_HOME
          that holds a copy of ~/.codex/auth.json (refresh tokens are single-use).
          Agents: ${DRIVERS.map((d) => d.id).join(', ')}.
`;

const out = (text: string) => process.stdout.write(text);
const err = (text: string) => process.stderr.write(text);

function fail(message: string): never {
	err(`markless-migrate: ${message}\n`);
	process.exit(2);
}

function journeyOptions(budget: string | undefined, max: string | undefined, depth?: string): NonNullable<CheckOptions['journeys']> {
	const seconds = budget === undefined ? undefined : Number(budget);
	if (seconds !== undefined && !(seconds > 0)) fail('--journey-budget must be a number of seconds above 0');
	const cap = max === undefined ? undefined : Number(max);
	if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) fail('--max-journeys must be a whole number of at least 1');
	const steps = depth === undefined ? undefined : Number(depth);
	if (steps !== undefined && (!Number.isInteger(steps) || steps < 1)) fail('--journey-depth must be a whole number of at least 1');
	return { ...(seconds !== undefined ? { budgetMs: seconds * 1000 } : {}), ...(cap !== undefined ? { maxJourneys: cap } : {}), ...(steps !== undefined ? { maxDepth: steps } : {}) };
}

function timeoutOption(value: string | undefined): { timeoutMs?: number } {
	if (value === undefined) return {};
	const seconds = Number(value);
	if (!(seconds > 0)) fail('--timeout must be a number of seconds above 0');
	return { timeoutMs: seconds * 1000 };
}

const TIMING_FLAGS = {
	'no-responsiveness': { type: 'boolean' },
	'interaction-budget': { type: 'string' },
	'cpu-throttle': { type: 'string' },
	'network-latency': { type: 'string' },
	'interaction-controls': { type: 'string' },
	'no-motion': { type: 'boolean' },
	'no-embeds': { type: 'boolean' },
	'no-probes': { type: 'boolean' },
	'no-navigation': { type: 'boolean' },
	'no-load': { type: 'boolean' },
	'load-runs': { type: 'string' },
	'load-cpu': { type: 'string' },
	'psi-key': { type: 'string' },
	'psi-runs': { type: 'string' },
	'no-psi': { type: 'boolean' },
	'nav-entries': { type: 'string' },
	'nav-destinations': { type: 'string' },
} as const;

function navigationOptions(values: { 'no-navigation'?: boolean; 'nav-entries'?: string; 'nav-destinations'?: string }, routes: readonly string[] | undefined): CheckOptions['navigation'] {
	if (values['no-navigation']) return undefined;
	const count = (flag: 'nav-entries' | 'nav-destinations') => {
		const raw = values[flag];
		if (raw === undefined) return undefined;
		const n = Number(raw);
		if (!Number.isInteger(n) || n < 1) fail(`--${flag} must be a whole number above 0`);
		return n;
	};
	const entries = count('nav-entries');
	const destinations = count('nav-destinations');
	return { ...(entries ? { entries } : {}), ...(destinations ? { destinations } : {}), ...(routes?.length ? { routes } : {}) };
}

function loadOptions(values: { 'no-load'?: boolean; 'load-runs'?: string; 'load-cpu'?: string; 'psi-key'?: string; 'psi-runs'?: string; 'no-psi'?: boolean }): CheckOptions['load'] {
	if (values['no-load']) return undefined;
	const count = (flag: 'load-runs' | 'psi-runs') => {
		const raw = values[flag];
		if (raw === undefined) return undefined;
		const n = Number(raw);
		if (!Number.isInteger(n) || n < 4) fail(`--${flag} must be a whole number of at least 4: with fewer runs a side, no difference can be told from noise`);
		return n;
	};
	const runs = count('load-runs');
	const psiRuns = count('psi-runs');
	const cpuFlag = values['load-cpu'];
	const cpu = cpuFlag === undefined ? undefined : cpuFlag === 'calibrated' ? ('calibrated' as const) : Number(cpuFlag);
	if (typeof cpu === 'number' && !(cpu >= 1)) fail('--load-cpu takes calibrated or a CPU slowdown of at least 1 (default 4)');
	const psi = values['no-psi'] ? false : { ...(values['psi-key'] ? { key: values['psi-key'] } : {}), ...(psiRuns ? { runs: psiRuns } : {}) };
	return { ...(runs ? { runs } : {}), ...(cpu ? { cpu } : {}), psi };
}

function timingOptions(values: { 'no-responsiveness'?: boolean; 'interaction-budget'?: string; 'cpu-throttle'?: string; 'network-latency'?: string; 'interaction-controls'?: string }): CheckOptions['responsiveness'] {
	if (values['no-responsiveness']) return undefined;
	const number = (flag: 'interaction-budget' | 'cpu-throttle' | 'network-latency' | 'interaction-controls', test: (n: number) => boolean, what: string) => {
		const raw = values[flag];
		if (raw === undefined) return undefined;
		const n = Number(raw);
		if (!test(n)) fail(`--${flag} must be ${what}`);
		return n;
	};
	const budgetMs = number('interaction-budget', (n) => n > 0, 'a number of milliseconds above 0');
	const cpu = number('cpu-throttle', (n) => n >= 1, 'a slowdown rate of at least 1');
	const maxControls = number('interaction-controls', (n) => Number.isInteger(n) && n >= 1, 'a whole number of at least 1');
	const latencyMs = number('network-latency', (n) => n >= 0, 'a number of milliseconds, 0 or more');
	return { ...(budgetMs !== undefined ? { budgetMs } : {}), ...(cpu !== undefined ? { cpu } : {}), ...(latencyMs !== undefined ? { latencyMs } : {}), ...(maxControls !== undefined ? { maxControls } : {}) };
}

function timingFlags(values: Partial<Record<keyof typeof TIMING_FLAGS, string | boolean>>): string[] {
	return Object.keys(TIMING_FLAGS).flatMap((flag) => {
		const value = values[flag as keyof typeof TIMING_FLAGS];
		return value === undefined || value === false ? [] : value === true ? [`--${flag}`] : [`--${flag}`, value];
	});
}

async function firstDir(cwd: string, dirs: readonly string[]): Promise<string | undefined> {
	const { stat } = await import('node:fs/promises');
	for (const dir of dirs) if (await stat(join(cwd, dir)).then((s) => s.isDirectory(), () => false)) return dir;
	return undefined;
}

function serverCommand(): ServerCommand {
	const cli = fileURLToPath(import.meta.url);
	if (cli.includes('/_npx/')) return { command: 'npx', args: ['-y', `@markless/migrate@${VERSION}`, 'mcp'] };
	return { command: process.execPath, args: [cli, 'mcp'] };
}

/** A forced switch is an expert override: named with --by and --reason, or confirmed at a terminal. */
async function forceDecision(route: string, reason: string | undefined, by: string | undefined): Promise<{ reason: string; by: string }> {
	if (process.env[AGENT_ENV]) fail('switch --force is for a person: an agent run by markless-migrate run may not force a route');
	if (reason?.trim() && by?.trim()) return { reason: reason.trim(), by: by.trim() };
	if (!process.stdin.isTTY || !process.stderr.isTTY) fail('switch --force needs --by <name> and --reason <why> (or a terminal to confirm at): a forced route is served from the new app without proof that it works');
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		err(`Forcing ${route} serves it from the new app although its check is not green. The report will show it as "forced, not proven".\n`);
		const why = reason?.trim() || (await rl.question('Why? ')).trim();
		const who = by?.trim() || (await rl.question('Your name: ')).trim();
		const typed = (await rl.question(`Type the route (${route}) to confirm: `)).trim();
		if (!why || !who || typed !== route) fail('not forced: a reason, a name and the route typed back are all needed');
		return { reason: why, by: who };
	} finally {
		rl.close();
	}
}

/** Writes PSI_API_KEY to the user's markless-migrate env file (mode 600), or to the project's .env, kept out of git. */
async function storePsiKey(key: string, project: string | undefined, home: string): Promise<string> {
	if (!/^[\w-]{20,}$/.test(key)) throw new Error('--psi-key takes the API key Google shows after creating it (letters, digits, - and _)');
	const { readFile: read, writeFile: write, mkdir: dir, chmod } = await import('node:fs/promises');
	const file = project ? join(project, '.env') : userEnvFile(home);
	await dir(dirname(file), { recursive: true });
	const lines = (await read(file, 'utf8').catch(() => '')).split('\n').filter((l) => l && !l.startsWith(`${PSI_KEY_ENV}=`));
	await write(file, `${[...lines, `${PSI_KEY_ENV}=${key}`].join('\n')}\n`, { mode: 0o600 });
	await chmod(file, 0o600);
	if (project) {
		const ignore = join(project, '.gitignore');
		const listed = (await read(ignore, 'utf8').catch(() => '')).split('\n').some((l) => l.trim() === '.env' || l.trim() === '/.env' || l.trim() === '.env*');
		if (!listed) await write(ignore, `${(await read(ignore, 'utf8').catch(() => '')).replace(/\n?$/, '\n')}.env\n`);
	}
	return file;
}

async function setup(args: string[]): Promise<number> {
	const { values } = parseArgs({ args, options: { agent: { type: 'string', multiple: true }, yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, undo: { type: 'boolean' }, 'psi-key': { type: 'string' }, project: { type: 'boolean' } } });
	const host: HostEnv = { home: process.env.HOME || homedir(), env: process.env };
	if (values['psi-key'] !== undefined) {
		const where = await storePsiKey(values['psi-key'], values.project ? process.cwd() : undefined, host.home).catch((error: Error) => fail(error.message));
		out(`Saved the PageSpeed Insights key to ${where}. check, run and upgrade now verify page load on PageSpeed Insights.\n`);
		return 0;
	}
	const tilde = (path: string) => (path.startsWith(host.home) ? `~${path.slice(host.home.length)}` : path);
	if (values.undo) {
		const undone = await undoSetup(host.home);
		if (!undone) {
			out('Nothing to undo: no setup has changed anything here.\n');
			return 0;
		}
		for (const u of undone) out(`  ${u.outcome.padEnd(9)} ${tilde(u.path)}\n`);
		out('\nUndone. Restart your agents so they drop the markless-migrate server and skill.\n');
		return undone.some((u) => u.outcome.startsWith('kept')) ? 1 : 0;
	}
	const detected = await detectAgents(host);
	let ids = values.agent ?? [];
	if (!ids.length) {
		if (!detected.length) {
			out(`No supported agent found. Name one with --agent <id> (${AGENTS.map((a) => a.id).join(', ')}).\n`);
			return 1;
		}
		ids = detected.map((d) => d.agent.id);
		out(`Found: ${detected.map((d) => `${d.agent.label} (${d.evidence[0]})`).join(', ')}\n\n`);
	}
	const changes = await planSetup(host, ids, serverCommand());
	if (changes.some((c) => c.action === 'blocked')) {
		out(`${describeChanges(changes, host.home)}\nSetup is blocked by the files marked "blocked" above. Nothing was written.\n`);
		return 1;
	}
	if (changes.every((c) => c.action === 'unchanged')) {
		out(`${describeChanges(changes, host.home)}\nEverything is already set up.\n`);
		return 0;
	}
	if (values['dry-run']) {
		out(`Would change (nothing written):\n${describeChanges(changes, host.home)}`);
		return 0;
	}
	const applied = await applySetup(changes);
	out(`Changed:\n${describeChanges(changes, host.home)}`);
	for (const { change, backup } of applied) if (change.action !== 'unchanged') out(`  wrote ${tilde(change.path)}${backup ? ` (the file before: ${tilde(backup)})` : ' (new file)'}\n`);
	await writeUndo(host.home, applied);
	out('\nDone. Restart your agents so they load the markless-migrate server and skill.\nTo undo it: markless-migrate setup --undo\n');
	return 0;
}

async function run(args: string[], cwd: string): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			agent: { type: 'string' },
			old: { type: 'string' },
			new: { type: 'string' },
			route: { type: 'string', multiple: true },
			routes: { type: 'string' },
			attempts: { type: 'string' },
			model: { type: 'string' },
			source: { type: 'string' },
			'new-source': { type: 'string' },
			auth: { type: 'string' },
			all: { type: 'boolean' },
			header: { type: 'string', multiple: true },
			cookie: { type: 'string', multiple: true },
			serve: { type: 'string' },
			build: { type: 'string' },
			'restart-on': { type: 'string' },
			'agent-timeout': { type: 'string' },
			only: { type: 'string' },
			'journey-budget': { type: 'string' },
			'max-journeys': { type: 'string' },
			'journey-depth': { type: 'string' },
			timeout: { type: 'string' },
			...TIMING_FLAGS,
		},
	});
	const deadline = timeoutOption(values.timeout);
	const journeys = journeyOptions(values['journey-budget'], values['max-journeys'], values['journey-depth']);
	const timing = timingOptions(values);
	if (!values.agent) fail(`run needs --agent <id> (${DRIVERS.map((d) => d.id).join(', ')})`);
	if (!values.old || !values.new) fail('run needs --old <origin> and --new <origin>');
	const attempts = values.attempts ? Number(values.attempts) : 3;
	if (!Number.isInteger(attempts) || attempts < 1) fail('--attempts must be a whole number of at least 1');
	const agentMinutes = values['agent-timeout'] ? Number(values['agent-timeout']) : undefined;
	if (agentMinutes !== undefined && !(agentMinutes > 0)) fail('--agent-timeout must be a number of minutes above 0');
	if ((values.build || values['restart-on']) && !values.serve) fail('--build and --restart-on need --serve <command>, the command that serves the new app');
	if (values.only !== undefined && values.only !== 'load' && values.only !== 'embeds') fail('run --only takes load (page load alone) or embeds (the embed step alone)');
	if (values.only === 'load' && values['no-load']) fail('--only load and --no-load leave nothing to check');
	const agent = driver(values.agent);
	const home = process.env.HOME || homedir();
	if (!(await findBinary(agent.binary, { home, env: process.env }))) fail(`${agent.binary} is not on PATH; install it and sign in first`);
	const copied = await copiedLogin(agent.id, process.env, home);
	if (copied) fail(copied);
	let bypass: ReturnType<typeof bypassOptions> = {};
	try {
		bypass = bypassOptions(values.header, values.cookie);
	} catch (error) {
		fail((error as Error).message);
	}
	const auth = values.auth ? await readAuthFile(values.auth).catch((error: Error) => fail(error.message)) : undefined;
	const source = values.source ? resolve(values.source) : undefined;
	const newSource = values['new-source'] ? resolve(values['new-source']) : undefined;
	const facts = source ? (await loadSourceFacts(source)).facts : undefined;
	const named = [...(values.route ?? []), ...(values.routes?.split(',').map((r) => r.trim()).filter(Boolean) ?? [])];
	const inventory = await readInventory(cwd);
	let routes = named.length ? named : inventory ? plannedRoutes(inventory) : undefined;
	let unchecked: CheckOptions['unchecked'] = [];
	let redirects = new Set<string>();
	if (values.all) {
		if (!inventory) fail('run --all needs .migrate/inventory.json: run plan first');
		const all = routeTargets(inventory, await readSamples(join(cwd, STATE_DIR)));
		redirects = new Set(redirectTargets(all.pages, inventory.source?.redirects));
		routes = [...new Set([...named, ...all.pages, UNKNOWN_PATH, ...(await discoverEndpoints(defaultEnv(values.old, bypass), all.pages, all.endpoints)), ...redirects])];
		unchecked = all.needsSample;
	}
	if (!routes?.length) fail('no routes: pass --route <path> or run plan first');
	const navigation = navigationOptions(values, routes);
	const load = loadOptions(values);
	const { old, new: next } = values;
	const server = values.serve ? await startAppServer({ cwd, serve: values.serve, ...(values.build ? { build: values.build } : {}), beforeBuild: async () => void (await applyIfPlanned(cwd, resolve(cwd, values['new-source'] ?? '.'))), ...(values['restart-on'] ? { restartOn: values['restart-on'] } : {}), origin: next, log: (line) => out(`server: ${line}\n`) }).catch((error: Error) => fail(error.message)) : undefined;
	const mcp = serverCommand();
	const automatic = new Map<string, string>();
	const stateDir = join(cwd, STATE_DIR);
	const usage = await readUsage(stateDir);
	const implementedNow = async () => (usage ? implementations(usage.behaviours, await readUsageMap(stateDir), newSource ?? cwd) : []);
	let buildGuard: string | undefined;
	try {
		const outcomes = await runRoutes({
			cwd,
			driver: agent,
			old,
			new: next,
			routes,
			attempts,
			model: values.model,
			...(agentMinutes ? { timeoutMs: agentMinutes * 60_000 } : {}),
			cli: [mcp.command, ...mcp.args.slice(0, -1)].join(' '),
			mcp,
			context: { ...(source ? { source } : {}), ...(newSource ? { newSource } : {}), ...(values.auth ? { auth: resolve(values.auth) } : {}), flags: [...(values.header ?? []).flatMap((h) => ['--header', h]), ...(values.cookie ?? []).flatMap((c) => ['--cookie', c]), ...(values['journey-budget'] ? ['--journey-budget', values['journey-budget']] : []), ...(values['max-journeys'] ? ['--max-journeys', values['max-journeys']] : []), ...(values['journey-depth'] ? ['--journey-depth', values['journey-depth']] : []), ...timingFlags(values), ...(values.only ? ['--only', values.only] : [])] },
			...(server ? { server, serving: { ...(values.build ? { build: values.build } : {}), ...(values['restart-on'] ? { restartOn: values['restart-on'] } : {}) } } : {}),
			progress: out,
			...(usage ? { notes: async (route: string) => [routeBrief(usage, await implementedNow(), route), embedBrief(usage.embeds ?? [], route, join(stateDir, EMBEDS_DIR), [mcp.command, ...mcp.args.slice(0, -1)].join(' '), new Set((await Promise.all(Object.values(ADAPTERS).map(async (a) => ((await staleAdapter(a, resolve(newSource ?? cwd))) ? a.id : '')))).filter(Boolean)))].filter(Boolean).join('\n\n') || undefined } : {}),
			check: async (route) => {
				const report = await runCheck({
					oldOrigin: old,
					newOrigin: next,
					routes: redirects.has(route) ? [] : [route],
					...(redirects.has(route) ? { redirects: [route] } : {}),
					locales: inventory?.locales,
					accepted: await readAccepted(join(cwd, STATE_DIR, ACCEPTED_FILE)),
					automaticOff: rulesOff(await readOverrides(join(cwd, STATE_DIR))),
					...(facts ? { source: facts } : {}),
					...(source || newSource ? { sourceDirs: { ...(source ? { old: source } : {}), ...(newSource ? { new: newSource } : {}) } } : {}),
					...(auth ? { auth, authStateDir: join(cwd, STATE_DIR, 'auth') } : {}),
					...bypass,
					journeys,
					...deadline,
					...(timing ? { responsiveness: timing } : {}),
				...(values['no-motion'] ? {} : { motion: {} }),
				...(values['no-embeds'] ? {} : { embeds: { dir: join(stateDir, EMBEDS_DIR) } }),
					...(values['no-probes'] ? {} : { probes: {} }),
					...(navigation ? { navigation } : {}),
					...(load ? { load } : {}),
					...(values.only === 'load' || values.only === 'embeds' ? { only: values.only } : {}),
					switched: (await readSwitched(cwd)).routes.map((r) => r.route),
					partial: { total: inventory ? plannedRoutes(inventory).length : null },
				});
				await recordResults(cwd, report);
				await writeReport(report, join(cwd, STATE_DIR), await status(cwd));
				const open = [...report.routes.flatMap((r) => r.failures), ...(report.logins ?? []).flatMap((l) => l.failures)].filter((f) => !f.accepted).map((f) => `${f.dimension}: ${f.check}${f.viewport ? ` (${f.viewport})` : ''}${f.id ? ` [${f.id}]` : ''}`);
				for (const f of report.routes.flatMap((r) => r.failures)) if (f.accepted?.automatic) automatic.set(`${f.route} ${f.dimension}: ${f.check}`, `${f.route} ${f.dimension}: ${f.check}, ${acceptedLabel(f.accepted)} (${f.accepted.reason})`);
				const network = report.routes.flatMap((r) => (r.infrastructure ? [r.infrastructure.message] : []));
				let summary = summarize(report);
				let guarded = true;
				const page = !redirects.has(route) && !/\.[a-z0-9]{2,5}$/i.test(route.split('?')[0]!) && route !== UNKNOWN_PATH;
				if (page && !network.length) {
					const guard = await guardPages({ old, new: next, routes: [route], allow: await readAllowances(stateDir), ...(bypass.headers ? { headers: bypass.headers } : {}) });
					summary += guard.text;
					// A run scoped to page load or the embeds is held to the guard's foreign-runtime findings alone; the full check holds the rest.
					const gating = guard.findings.filter((f) => f.red && (!values.only || /runtime/.test(f.kind)));
					guarded &&= values.only ? gating.length === 0 : guard.ok;
					open.push(...gating.map((f) => `guard: ${f.kind} ${f.subject}`));
				}
				const plan = page ? await readCachingPlan(stateDir) : undefined;
				const regressions = plan ? await cachingRegressions(plan, newSource ?? cwd, plan.routes.map((r) => r.route)) : [];
				const others = regressions.filter((r) => r.route !== route).map((r) => r.route);
				for (const r of regressions.filter((r) => r.route === route)) {
					summary += formatRegression(r, others);
					guarded = false;
					open.push(`caching: ${r.old} on the old site, ${r.new} in the port (${r.reads[0]})`);
				}
				const dir = await firstDir(cwd, ['.output', '.vercel/output']);
				if (dir) {
					const built = await scanBuild(resolve(cwd, dir));
					buildGuard = summarizeBuild(dir, built).trimEnd();
					if (built.hits.length) {
						summary += `${buildGuard}\n`;
						guarded = false;
						open.push(...built.hits.slice(0, 5).map((h) => `guard: foreign runtime in ${h.file}`));
					}
				}
				return { ok: (report.checkedOk ?? report.ok) && guarded, summary, open: [...new Set(open)], ...(network.length && !open.length ? { infrastructure: network.join('; ') } : {}) };
			},
		});
		const red = outcomes.filter((o) => o.outcome === 'left red');
		const libraries = (await readLibraries(join(cwd, STATE_DIR)))?.libraries.flatMap((l) => (l.decision ? [`${l.name}: ${decisionLine(l)}`] : [])) ?? [];
		out(`\n${summarizeRun(outcomes, { libraries, automatic: [...automatic.values()], needsSample: unchecked?.map((u) => u.route), ...(usage ? { usage: summarizeUsage(usage, await implementedNow()) } : {}), ...(buildGuard ? { guards: [buildGuard] } : {}), log: join(cwd, STATE_DIR, 'run.log') })}`);
		if (named.length && !red.length) out(`${partialLine({ checked: routes.length, total: inventory ? plannedRoutes(inventory).length : null })}\n`);
		return red.length || unchecked?.length ? 1 : outcomes.some((o) => o.outcome === 'not checked') ? 3 : named.length ? 4 : 0;
	} finally {
		await server?.stop();
	}
}

async function main(argv: string[]): Promise<number> {
	const [command, ...rest] = argv;
	const cwd = process.cwd();
	switch (command) {
		case undefined:
		case 'help':
		case '--help':
		case '-h':
			out(USAGE);
			return 0;
		case 'plan': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, source: { type: 'string' }, built: { type: 'string' }, limit: { type: 'string' }, 'crawl-limit': { type: 'string' }, header: { type: 'string', multiple: true }, cookie: { type: 'string', multiple: true }, 'user-agent': { type: 'string' }, auth: { type: 'string' }, 'no-caching': { type: 'boolean' } } });
			if (!values.old) fail('plan needs --old <origin>');
			const crawlBound = values['crawl-limit'] === undefined ? undefined : Number(values['crawl-limit']);
			if (crawlBound !== undefined && (!Number.isInteger(crawlBound) || crawlBound < 1)) fail('--crawl-limit must be a whole number of at least 1');
			let bypass: ReturnType<typeof bypassOptions> = {};
			try {
				bypass = bypassOptions(values.header, values.cookie);
			} catch (error) {
				fail((error as Error).message);
			}
			const planAuth = values.auth ? await readAuthFile(values.auth).catch((error: Error) => fail(error.message)) : undefined;
			const inventory = await plan({ origin: values.old, source: values.source ? resolve(values.source) : undefined, limit: values.limit ? Number(values.limit) : undefined, ...(crawlBound ? { crawlBound } : {}), ...bypass, ...(values['user-agent'] ? { userAgent: values['user-agent'] } : {}), ...(planAuth ? { auth: planAuth } : {}), samples: await readSamples(join(cwd, STATE_DIR)) });
			const path = await writeInventory(inventory, join(cwd, STATE_DIR));
			out(`${summarizeInventory(inventory)}Wrote ${path}\n`);
			if (!values['no-caching']) {
				const caching = await planAndWrite(cwd, inventory, { headers: bypass.headers ?? {} });
				out(`${caching.text}Wrote ${caching.path}\n`);
			}
			let libraries: Awaited<ReturnType<typeof planLibraries>> | undefined;
			if (inventory.source) {
				libraries = await planLibraries(inventory.source, join(cwd, STATE_DIR), cwd);
				out(`${libraries.text}Wrote ${libraries.path}\n`);
			}
			const usage = await planUsage({ inventory, stateDir: join(cwd, STATE_DIR), newSource: cwd, ...(values.built ? { built: resolve(values.built) } : {}), ...(libraries ? { libraries: libraries.file } : {}), ...(bypass.headers ? { headers: bypass.headers } : {}) });
			out(`${usage.text}Wrote ${usage.paths.usage} and ${usage.paths.obligations}\n`);
			const authPath = join(cwd, STATE_DIR, 'auth.json');
			if (inventory.auth) out((await writeStarterAuth(authPath, inventory.auth)) ? `Wrote ${authPath}: set the credentials it names in the environment, check its login steps, then pass --auth ${authPath} to check.\n` : `Kept ${authPath} (already there); roles found: ${Object.keys(inventory.auth.roles).join(', ')}.\n`);
			if (!psiKey()) out(`\n${PSI_NOTICE}\n`);
			return 0;
		}
		case 'check': {
			const { values } = parseArgs({
				args: rest,
				options: {
					old: { type: 'string' },
					new: { type: 'string' },
					route: { type: 'string', multiple: true },
					json: { type: 'boolean' },
					open: { type: 'boolean' },
					source: { type: 'string' },
					'old-hash-routes': { type: 'boolean' },
					data: { type: 'string' },
					'live-window': { type: 'string' },
					staging: { type: 'boolean' },
					block: { type: 'string', multiple: true },
					allow: { type: 'string', multiple: true },
					'no-freeze': { type: 'boolean' },
					'server-clock': { type: 'boolean' },
					time: { type: 'string' },
					seed: { type: 'string' },
					timezone: { type: 'string' },
					locale: { type: 'string' },
					auth: { type: 'string' },
					header: { type: 'string', multiple: true },
					cookie: { type: 'string', multiple: true },
					'user-agent': { type: 'string' },
					all: { type: 'boolean' },
					'allow-unchecked': { type: 'boolean' },
					changed: { type: 'boolean' },
					concurrency: { type: 'string' },
					'new-source': { type: 'string' },
					'journey-budget': { type: 'string' },
					'max-journeys': { type: 'string' },
					'journey-depth': { type: 'string' },
					timeout: { type: 'string' },
					only: { type: 'string' },
					'every-dimension': { type: 'boolean' },
					'no-cache': { type: 'boolean' },
					resume: { type: 'boolean' },
					targets: { type: 'string' },
					'write-targets': { type: 'string' },
					...TIMING_FLAGS,
				},
			});
			const deadline = timeoutOption(values.timeout);
			if (!values.old || !values.new) fail('check needs --old <origin> and --new <origin>');
			if (values.only !== undefined && values.only !== 'coverage' && values.only !== 'load' && values.only !== 'embeds' && values.only !== 'probes') fail('--only takes coverage (whether every route of the old site exists on the new app), load (page load alone), embeds (the embed step alone) or probes (the widget probes alone)');
			if (values.only === 'probes' && values['no-probes']) fail('--only probes and --no-probes leave nothing to check');
			const coverageOnly = values.only === 'coverage';
			const loadOnly = values.only === 'load';
			const embedsOnly = values.only === 'embeds';
			const probesOnly = values.only === 'probes';
			if (loadOnly && values['no-load']) fail('--only load and --no-load leave nothing to check');
			const journeys = journeyOptions(values['journey-budget'], values['max-journeys'], values['journey-depth']);
			const timing = timingOptions(values);
			let bypass: ReturnType<typeof bypassOptions> = {};
			try {
				bypass = bypassOptions(values.header, values.cookie);
			} catch (error) {
				fail((error as Error).message);
			}
			const auth = values.auth ? await readAuthFile(values.auth).catch((error: Error) => fail(error.message)) : undefined;
			if (values.data && values.data !== 'record' && values.data !== 'replay') fail('--data must be record or replay');
			const time = values.time ? Date.parse(values.time) : undefined;
			if (time !== undefined && Number.isNaN(time)) fail('--time must be a date, for example 2026-01-15T12:00:00Z');
			const seed = values.seed ? Number(values.seed) : undefined;
			if (seed !== undefined && !Number.isInteger(seed)) fail('--seed must be a whole number');
			const inventory = await readInventory(cwd);
			const planned = inventory ? plannedRoutes(inventory) : undefined;
			if (coverageOnly && !planned?.length) fail('check --only coverage needs .migrate/inventory.json with the old site\'s routes: run plan first');
			let routes = coverageOnly ? [] : values.route?.length ? values.route : planned;
			let targets: { endpoints: string[]; unchecked: CheckOptions['unchecked']; redirects: string[] } | undefined;
			if (values.all && !coverageOnly) {
				if (!inventory) fail('check --all needs .migrate/inventory.json: run plan first');
				const all = routeTargets(inventory, await readSamples(join(cwd, STATE_DIR)));
				routes = [...new Set([...(values.route ?? []), ...(planned ?? []).filter((r) => !all.endpoints.includes(r)), ...all.pages, UNKNOWN_PATH])];
				targets = { endpoints: await discoverEndpoints(defaultEnv(values.old), all.pages, all.endpoints), unchecked: all.needsSample, redirects: redirectTargets(all.pages, inventory.source?.redirects) };
			}
			if (values['write-targets']) {
				if (!values.all || !routes) fail('--write-targets writes what --all checks: pass --all');
				await writeFile(resolve(values['write-targets']), `${JSON.stringify({ routes, endpoints: targets?.endpoints ?? [], redirects: targets?.redirects ?? [], unchecked: targets?.unchecked ?? [] }, null, '\t')}\n`);
				out(`Wrote ${values['write-targets']}: ${routes.length} pages, ${targets?.endpoints.length ?? 0} endpoints, ${targets?.redirects.length ?? 0} redirects.\n`);
				return 0;
			}
			if (values.targets) {
				if (values.all || values.route?.length) fail('--targets names the routes itself: leave out --all and --route');
				const file = JSON.parse(await readFile(resolve(values.targets), 'utf8')) as { routes: string[]; endpoints?: string[]; redirects?: string[]; unchecked?: CheckOptions['unchecked'] };
				routes = file.routes;
				targets = { endpoints: file.endpoints ?? [], redirects: file.redirects ?? [], unchecked: file.unchecked ?? [] };
			}
			if (!coverageOnly && !routes?.length && !targets?.endpoints.length) fail('no routes: pass --route <path> or run plan first');
			const partial = !coverageOnly && Boolean(values.route?.length || values.targets || values.changed || loadOnly || embedsOnly);
			const navigation = navigationOptions(values, partial ? planned : undefined);
			const load = loadOptions(values);
			const concurrency = values.concurrency ? Number(values.concurrency) : undefined;
			if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) fail('--concurrency must be a whole number of at least 1');
			const newDir = resolve(values['new-source'] ?? cwd);
			const commit = await gitHead(newDir);
			if (values.changed) {
				const previous = (await readResults(cwd)) ?? {};
				const picked = await selectChanged([...(routes ?? []), ...(targets?.endpoints ?? []), ...(targets?.redirects ?? [])], previous, (since) => changedSince(newDir, since));
				const keep = new Set(picked.check);
				routes = (routes ?? []).filter((r) => keep.has(r));
				if (targets) targets = { ...targets, endpoints: targets.endpoints.filter((r) => keep.has(r)), redirects: targets.redirects.filter((r) => keep.has(r)) };
				out(`--changed: ${picked.check.length} route${picked.check.length === 1 ? '' : 's'} to check, ${picked.skipped.length} green and unchanged since their last check${picked.skipped.length ? ` (${picked.skipped.join(', ')})` : ''}.\n`);
				if (!picked.check.length) return 0;
			}
			let source: CheckOptions['source'];
			if (values.source) {
				const scanned = await loadSourceFacts(resolve(values.source));
				if (scanned.error) err(`markless-migrate: --source ignored: ${scanned.error}\n`);
				source = scanned.facts;
			}
			const freeze = values['no-freeze'] ? false : { ...(time !== undefined ? { time } : {}), ...(seed !== undefined ? { seed } : {}), ...(values.timezone ? { timezone: values.timezone } : {}), ...(values.locale ? { locale: values.locale } : {}) };
			const report = await runCheck({
				oldOrigin: values.old,
				newOrigin: values.new,
				routes: routes ?? [],
				locales: inventory?.locales,
				freeze,
				...(values['server-clock'] ? { serverClock: true } : {}),
				block: { add: values.block ?? [], allow: values.allow ?? [] },
				...(values.staging ? { staging: { old: true, new: true } } : {}),
				...(source ? { source } : {}),
				...(values['old-hash-routes'] || inventory?.source?.routing === 'hash' || source?.routing === 'hash' ? { oldRouting: 'hash' as const } : {}),
				...(values.data ? { data: { mode: values.data as 'record' | 'replay', dir: join(cwd, STATE_DIR, DATA_DIR), ...(values['live-window'] ? { liveWindowMs: Number(values['live-window']) * 1000 } : {}) } } : {}),
				...bypass,
				...(values['user-agent'] ? { userAgent: values['user-agent'] } : {}),
				...(auth ? { auth, authStateDir: join(cwd, STATE_DIR, 'auth') } : {}),
				...(targets ? { endpoints: targets.endpoints, unchecked: targets.unchecked, redirects: targets.redirects } : {}),
				...(values.source || values['new-source'] ? { sourceDirs: { ...(values.source ? { old: resolve(values.source) } : {}), ...(values['new-source'] ? { new: resolve(values['new-source']) } : {}) } } : {}),
				accepted: await readAccepted(join(cwd, STATE_DIR, ACCEPTED_FILE)).catch((error: Error) => fail(error.message)),
				automaticOff: rulesOff(await readOverrides(join(cwd, STATE_DIR)).catch((error: Error) => fail(error.message))),
				...(concurrency ? { concurrency } : {}),
				journeys,
				...deadline,
				...(timing ? { responsiveness: timing } : {}),
				...(values['no-motion'] ? {} : { motion: {} }),
				...(values['no-embeds'] ? {} : { embeds: { dir: join(cwd, STATE_DIR, EMBEDS_DIR) } }),
				...(values['no-probes'] ? {} : { probes: {} }),
				...(navigation && !probesOnly ? { navigation } : {}),
				...(load && !coverageOnly && !probesOnly ? { load } : {}),
				...(loadOnly ? { only: 'load' as const } : embedsOnly ? { only: 'embeds' as const } : probesOnly ? { only: 'probes' as const } : {}),
				switched: (await readSwitched(cwd)).routes.map((r) => r.route),
				...(!values['new-source'] && !values.changed ? {} : { sourceDirs: { ...(values.source ? { old: resolve(values.source) } : {}), new: newDir } }),
				...(partial ? { partial: { total: planned?.length ?? null } } : planned?.length ? { coverage: planned } : {}),
				templates: values['every-dimension'] ? false : { patterns: inventory?.source?.routes.map((r) => r.path) ?? [] },
				...(values['no-cache'] ? {} : { cacheDir: join(cwd, STATE_DIR, 'cache') }),
				artifactsDir: join(cwd, STATE_DIR),
				progress: { dir: join(cwd, STATE_DIR), resume: Boolean(values.resume) },
			});
			await recordResults(cwd, report, commit ? { commit } : {});
			const path = await writeReport(report, join(cwd, STATE_DIR), await status(cwd));
			const html = join(dirname(path), 'report.html');
			if (values.json) await writePieces(process.stdout, jsonReportParts(report));
			else out(`${summarize(report)}Report: ${path}\nVisual report: ${html}\n`);
			if (values.open) await openFile(html);
			const needSample = report.unchecked?.filter((u) => !u.reason) ?? [];
			if (report.ok && needSample.length && !values['allow-unchecked']) {
				err(`markless-migrate: ${needSample.length} route${needSample.length === 1 ? '' : 's'} not checked for want of a sample value; add them to .migrate/samples.json, or pass --allow-unchecked.\n`);
				return 1;
			}
			if (report.ok) return 0;
			const red = report.routes.some((r) => !r.ok && !r.infrastructure) || (report.logins ?? []).some((l) => !l.ok) || Boolean(report.coverage?.missing.length) || Boolean(report.coverage?.servedByOld?.length);
			if (report.partial && !red && report.routes.every((r) => r.ok)) {
				err(`markless-migrate: every route this run checked is green, but it was a partial run (${report.partial.total === null ? `${report.partial.checked} routes, no plan` : `${report.partial.checked} of ${report.partial.total} routes`}): not an overall green. Run check without --route to check every route.\n`);
				return 4;
			}
			if (!red) err(`markless-migrate: nothing is red, but ${report.routes.filter((r) => r.infrastructure).length} route check(s) could not be done for an infrastructure failure; check them again.\n`);
			return red ? 1 : 3;
		}
		case 'status':
			out(summarizeStatus(await status(cwd)));
			return 0;
		case 'parity': {
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { route: { type: 'string', multiple: true }, 'new-source': { type: 'string' } } });
			if (positionals.length !== 1) fail('parity needs one library name, as plan lists it (for example parity recharts)');
			const libraries = await readLibraries(join(cwd, STATE_DIR));
			if (!libraries) fail(`no ${join(STATE_DIR, LIBRARIES_FILE)}: run plan --source <old app> first`);
			const result = await writeParity(libraries, positionals[0]!, { newApp: resolve(values['new-source'] ?? cwd), ...(values.route?.length ? { routes: values.route } : {}), journeysDir: join(cwd, STATE_DIR, 'journeys') }).catch((error: Error) => fail(error.message));
			out(summarizeParity(result));
			return 0;
		}
		case 'cli': {
			const { values } = parseArgs({ args: rest, options: { config: { type: 'string' }, case: { type: 'string', multiple: true }, record: { type: 'boolean' }, json: { type: 'boolean' } } });
			const path = resolve(cwd, values.config ?? join(STATE_DIR, CLI_CONFIG));
			const config = await readCliConfig(path).catch((error: Error) => fail(error.message));
			const report = await runCliCheck({ config, base: dirname(path), fixturesDir: join(cwd, STATE_DIR, 'cli-network'), ...(values.case?.length ? { only: values.case } : {}), ...(values.record ? { record: true } : {}) });
			if (values.case?.length && report.cases.length !== values.case.length) fail(`no case named ${values.case.filter((n) => !report.cases.some((c) => c.name === n)).join(', ')} in ${path}`);
			await writeFile(join(cwd, STATE_DIR, CLI_REPORT), `${JSON.stringify(report, null, '\t')}\n`);
			out(values.json ? `${JSON.stringify(report, null, '\t')}\n` : `${summarizeCli(report)}Wrote ${join(cwd, STATE_DIR, CLI_REPORT)}\n`);
			return report.ok ? 0 : 1;
		}
		case 'convert': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, source: { type: 'string' }, only: { type: 'string' }, fallthrough: { type: 'string' }, 'no-reveal': { type: 'boolean' }, concurrency: { type: 'string' } } });
			if (!values.old) fail('convert needs --old <origin>');
			const only = values.only ? (await readFile(resolve(values.only), 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean) : undefined;
			const report = await convert({ old: values.old, app: cwd, ...(values.source ? { source: resolve(values.source) } : {}), ...(only ? { only } : {}), ...(values.fallthrough ? { fallthrough: values.fallthrough } : {}), reveal: !values['no-reveal'], ...(values.concurrency ? { concurrency: Number(values.concurrency) } : {}), log: (line) => out(`${line}\n`) });
			out(`${summarizeConvert(report)}Wrote ${join(cwd, STATE_DIR, 'convert', 'report.json')}\n`);
			return report.routes.length ? 0 : 1;
		}
		case 'usage': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, built: { type: 'string' }, source: { type: 'string' }, 'new-source': { type: 'string' }, json: { type: 'boolean' }, route: { type: 'string', multiple: true } } });
			const stateDir = join(cwd, STATE_DIR);
			let inventory = await readUsage(stateDir);
			if (values.old || values.built) {
				const planned = await readInventory(cwd);
				const routes = values.route?.length ? values.route : planned ? usagePages(planned) : undefined;
				if (!routes?.length) fail('usage needs the pages to read: run plan first, or pass --route');
				const source = values.source ? resolve(values.source) : planned?.source?.path;
				inventory = await scanUsage({ routes, ...(values.old ? { origin: values.old } : planned ? { origin: planned.origin } : {}), ...(values.built ? { built: resolve(values.built) } : {}), ...(source ? { source } : {}), ...((await readLibraries(stateDir)) ? { libraries: (await readLibraries(stateDir))! } : {}) });
				await writeUsage(inventory, stateDir);
			}
			if (!inventory) fail(`no ${join(STATE_DIR, 'usage.json')}: run plan, or usage --old <origin>`);
			const implemented = await implementations(inventory.behaviours, await readUsageMap(stateDir), resolve(values['new-source'] ?? cwd));
			out(values.json ? `${JSON.stringify({ behaviours: inventory.behaviours.length, implemented, obligations: inventory.obligations.length }, null, '\t')}\n` : summarizeUsage(inventory, implemented, 20));
			return 0;
		}
		case 'embeds': {
			const [what = 'list', ...args] = rest[0]?.startsWith('-') ? ['list', ...rest] : rest;
			const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { old: { type: 'string' }, route: { type: 'string', multiple: true }, embed: { type: 'string', multiple: true }, 'new-source': { type: 'string' }, refresh: { type: 'boolean' }, json: { type: 'boolean' } } });
			const stateDir = join(cwd, STATE_DIR);
			const file = await readEmbeds(stateDir);
			if (!file) fail(`no ${join(STATE_DIR, EMBEDS_FILE)}: run plan (or usage --old <origin>) first`);
			const chosen = file.embeds.filter((e) => (!values.embed?.length || values.embed.includes(e.id)) && (!values.route?.length || e.routes.some((r) => values.route!.includes(r))));
			if (what === 'list') {
				out(values.json ? `${JSON.stringify(chosen, null, '\t')}\n` : embedsByRoute(chosen));
				return 0;
			}
			if (what === 'study') {
				const origin = values.old ?? (await readInventory(cwd))?.origin ?? (await readUsage(stateDir))?.origin;
				if (!origin) fail('embeds study needs the old app: --old <origin>');
				const browser = await chromium.launch();
				try {
					for (const use of chosen.filter((e) => e.form !== 'markup')) {
						const ordinal = file.embeds.filter((e) => e.provider === use.provider && e.routes.includes(use.routes[0]!)).indexOf(use);
						const study = await studyEmbed(browser, defaultEnv(origin, { freeze: DEFAULT_FREEZE }), use, VIEWPORTS, stateDir, Math.max(0, ordinal));
						out(`${use.id}: ${study.found ? `${study.shots.length} pictures, ${study.markup ? 'markup and ' : ''}data${study.activation ? `; a click: ${describeActivation(study.activation)}` : ''}` : study.notes.join('; ')} -> ${join(STATE_DIR, EMBEDS_DIR, use.id, 'study.md')}\n`);
					}
				} finally {
					await browser.close();
				}
				return 0;
			}
			if (what === 'install') {
				const [name] = positionals;
				const adapter = name ? ADAPTERS[name] : undefined;
				if (!adapter) fail(`embeds install needs an adapter: ${Object.keys(ADAPTERS).join(', ')}`);
				const app = resolve(values['new-source'] ?? cwd);
				const result = await installAdapter(adapter, file.embeds.filter((e) => e.adapter === adapter.id && chosen.includes(e)), app, join(stateDir, EMBEDS_DIR), { refresh: Boolean(values.refresh) });
				out(`${result.written.map((f) => `wrote ${f}`).join('\n')}\n${result.kept.map((f) => `kept ${f} (edited; the adapter is shared, so restore it)`).join('\n')}${result.kept.length ? '\n' : ''}${result.usage}\n`);
				return 0;
			}
			fail(`embeds ${what}: use list, study or install`);
		}
		case 'guard': {
			const [what, ...args] = rest;
			if (what === 'build') {
				const { values } = parseArgs({ args, options: { dir: { type: 'string' } } });
				const dir = values.dir ? resolve(values.dir) : await firstDir(cwd, ['.output', '.vercel/output']);
				if (!dir) fail('guard build needs the build output: pass --dir <path> (default .output or .vercel/output)');
				const result = await scanBuild(resolve(cwd, dir));
				out(summarizeBuild(dir, result));
				return result.hits.length ? 1 : 0;
			}
			if (what === 'page') {
				const { values } = parseArgs({ args, options: { old: { type: 'string' }, new: { type: 'string' }, route: { type: 'string', multiple: true }, header: { type: 'string', multiple: true }, cookie: { type: 'string', multiple: true } } });
				if (!values.old || !values.new) fail('guard page needs --old <origin> and --new <origin>');
				const planned = await readInventory(cwd);
				const routes = values.route?.length ? values.route : planned ? usagePages(planned) : undefined;
				if (!routes?.length) fail('no routes: pass --route <path> or run plan first');
				const bypass = bypassOptions(values.header, values.cookie);
				const result = await guardPages({ old: values.old, new: values.new, routes, stateDir: join(cwd, STATE_DIR), allow: await readAllowances(join(cwd, STATE_DIR)).catch((error: Error) => fail(error.message)), ...(bypass.headers ? { headers: bypass.headers } : {}) });
				out(`${result.text}Wrote ${join(STATE_DIR, 'guard.json')}\n`);
				return result.ok ? 0 : 1;
			}
			fail('guard takes build or page');
		}
		case 'upgrade': {
			if (rest[0] === 'accept') {
				const { values, positionals } = parseArgs({ args: rest.slice(1), allowPositionals: true, options: { baseline: { type: 'string' } } });
				if (positionals.length !== 1) fail('upgrade accept needs one suggestion id, as upgrade printed it');
				const file = await acceptUpgrade(join(cwd, STATE_DIR), positionals[0]!, values.baseline).catch((error: Error) => fail(error.message));
				out(`Wrote ${file}: the task for your agent (markless-migrate run, or by hand). Nothing else changed.\n`);
				return 0;
			}
			const { values } = parseArgs({ args: rest, options: { new: { type: 'string' }, route: { type: 'string', multiple: true }, limit: { type: 'string' }, 'new-source': { type: 'string' }, build: { type: 'string' }, ui: { type: 'string' }, 'no-load': { type: 'boolean' }, 'load-runs': { type: 'string' }, 'load-cpu': { type: 'string' }, 'psi-key': { type: 'string' }, 'psi-runs': { type: 'string' }, 'no-psi': { type: 'boolean' } } });
			if (!values.new) fail('upgrade needs --new <origin>, the migrated site');
			const newSource = resolve(values['new-source'] ?? cwd);
			const inventory = await readInventory(cwd);
			const limit = values.limit ? Number(values.limit) : 6;
			const routes = values.route?.length ? values.route : inventory ? usagePages(inventory).slice(0, limit) : undefined;
			if (!routes?.length) fail('no routes: pass --route <path> or run plan first');
			const buildDir = resolve(newSource, values.build ?? '.output');
			out(`reading what the new app imports (${newSource})\n`);
			const newLibraries = await scanLibraries(newSource, {});
			const uiDir = await findUi(newSource, values.ui ? resolve(values.ui) : undefined);
			const usage = await readUsage(join(cwd, STATE_DIR));
			const oldLibraries = await readLibraries(join(cwd, STATE_DIR));
			const report = await upgrade({ origin: values.new, routes, newSource, buildDir, newLibraries, ...(oldLibraries ? { oldLibraries } : {}), ...(usage ? { usage } : {}), ...(uiDir ? { uiDir } : {}), fonts: loadOptions(values) ?? false, progress: (line) => out(`${line}\n`) });
			const path = await writeUpgrade(report, join(cwd, STATE_DIR));
			out(`\n${summarizeUpgrade(report)}Wrote ${path}\n`);
			return 0;
		}
		case 'recorder':
			out(`Start each Node server (old and new) with the request recorder loaded:\n\n  export NODE_OPTIONS='${recorderEnv().NODE_OPTIONS}'\n\nIt records what the server fetches while rendering each page check loads (fetch: method, URL, body and response; node:http and node:https: method, URL, request body and status), and serves recordings on --data replay. It answers loopback callers only; set MARKLESS_MIGRATE_TOKEN in both the server and check environments to reach a remote server.\nModule: ${RECORDER.pathname}\n`);
			return 0;
		case 'setup':
			return setup(rest);
		case 'mcp': {
			const { serveStdio } = await import('./mcp/server.ts');
			await serveStdio(cwd);
			return -1;
		}
		case 'run':
			return run(rest, cwd);
		case 'accept': {
			if (process.env[AGENT_ENV]) fail('accept is for a person: an agent run by markless-migrate run may not accept a difference');
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { reason: { type: 'string' }, by: { type: 'string' } } });
			if (positionals.length !== 1) fail('accept needs one failure id, as printed in [brackets] after a failure');
			if (!values.reason?.trim()) fail('accept needs --reason: why this difference is intended');
			const id = positionals[0]!;
			const results = JSON.parse(await readFile(join(cwd, STATE_DIR, 'results.json'), 'utf8').catch(() => '{}')) as Record<string, RouteState>;
			const measured = await readCoverage(cwd);
			const found = [...Object.values(results), ...(measured ? [{ old: measured.old, new: measured.new, failures: measured.failures }] : [])].flatMap((r) => (r.failures ?? []).filter((f) => f.id === id).map((failure) => ({ failure, r })))[0];
			if (!found) fail(`no failure with id ${id} in ${join(STATE_DIR, 'results.json')}: run check first and copy an id from its output`);
			const path = join(cwd, STATE_DIR, ACCEPTED_FILE);
			const accepted = await readAccepted(path);
			if (accepted.some((a) => a.id === id)) {
				out(`${id} is already accepted.\n`);
				return 0;
			}
			const by = values.by ?? process.env.GIT_AUTHOR_NAME ?? process.env.USER ?? 'unknown';
			const entry = acceptFailure(found.failure, { old: found.r.old, new: found.r.new }, values.reason.trim(), by);
			await writeAccepted(path, [...accepted, entry]);
			out(`Accepted ${entry.route} ${entry.dimension}: ${entry.check} (${entry.reason}). ${path}\n`);
			return 0;
		}
		case 'switch': {
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { force: { type: 'boolean' }, reason: { type: 'string' }, by: { type: 'string' } } });
			if (positionals.length !== 1) fail('switch needs one route, for example switch /about/');
			const route = positionals[0]!;
			const force = values.force ? await forceDecision(route, values.reason, values.by) : undefined;
			const outcome = await switchRoute(cwd, route, force ? { force } : {});
			if (!outcome.ok) {
				err(`markless-migrate: ${outcome.reason}\n`);
				return 1;
			}
			out(`${outcome.already ? 'Still switched' : 'Switched'} ${outcome.entry.route} to the new app${outcome.entry.forced ? ` (forced by ${outcome.entry.forced.by}, not proven: ${outcome.entry.forced.reason}; last check ${outcome.entry.checks.join('; ') || 'none'})` : ''}. ${outcome.path}\n`);
			return 0;
		}
		case 'unswitch': {
			const { positionals } = parseArgs({ args: rest, allowPositionals: true, options: {} });
			if (positionals.length !== 1) fail('unswitch needs one route');
			const { removed, path } = await unswitchRoute(cwd, positionals[0]!);
			out(removed ? `${positionals[0]} goes to the old app again. ${path}\n` : `${positionals[0]} was not switched.\n`);
			return 0;
		}
		case 'network': {
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { profile: { type: 'string', multiple: true }, browser: { type: 'string', multiple: true }, runs: { type: 'string' }, control: { type: 'string', multiple: true }, concurrency: { type: 'string' }, json: { type: 'string' }, timeout: { type: 'string' } } });
			if (!positionals.length) fail('network needs the URLs of the pages to load');
			for (const url of positionals) if (!URL.canParse(url)) fail(`not a URL: ${url}`);
			const profiles = values.profile ?? ['regular-3g'];
			for (const name of profiles) if (!NETWORK_PROFILES[name]) fail(`unknown --profile ${name}: one of ${Object.keys(NETWORK_PROFILES).join(', ')}`);
			const browsers = (values.browser ?? ['chromium']) as NetworkBrowser[];
			for (const name of browsers) if (!NETWORK_BROWSERS.includes(name)) fail(`unknown --browser ${name}: one of ${NETWORK_BROWSERS.join(', ')}`);
			const whole = (flag: string, value: string | undefined) => {
				if (value === undefined) return undefined;
				const n = Number(value);
				if (!Number.isInteger(n) || n < 1) fail(`--${flag} must be a whole number of at least 1`);
				return n;
			};
			const runs = whole('runs', values.runs);
			const concurrency = whole('concurrency', values.concurrency);
			const timeout = whole('timeout', values.timeout);
			const controls = values.control ?? [];
			if (controls.length > 1 && controls.length !== positionals.length) fail('--control takes one selector for all pages, or one per page in order');
			const sides = await measureSlowNetwork(positionals, {
				profiles,
				browsers,
				...(runs ? { runs } : {}),
				...(concurrency ? { concurrency } : {}),
				...(timeout ? { timeoutMs: timeout * 1000 } : {}),
				...(controls.length ? { controls: Object.fromEntries(positionals.map((url, i) => [url, controls[controls.length > 1 ? i : 0]!])) } : {}),
				onRun: (label, run) => err(`${label}: ${run.error ?? `answered at ${run.answered} ms`}\n`),
			});
			if (values.json) await writeFile(values.json, `${JSON.stringify(sides, null, '\t')}\n`);
			out(`${networkTables(sides, shortNames(positionals))}\n`);
			return sides.every((s) => s.cells.every((c) => c.unavailable || c.runs.some((r) => !r.error))) ? 0 : 1;
		}
		case 'proxy': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, new: { type: 'string' }, port: { type: 'string' }, host: { type: 'string' }, quiet: { type: 'boolean' } } });
			if (!values.old || !values.new) fail('proxy needs --old <origin> and --new <origin>');
			const port = values.port ? Number(values.port) : 4300;
			if (!Number.isInteger(port) || port < 0) fail('--port must be a whole number');
			const proxy = await startProxy({ old: values.old, new: values.new, port, host: values.host ?? '127.0.0.1', switched: async () => (await readSwitched(cwd)).routes.map((r) => r.route), ...(values.quiet ? {} : { log: (line: string) => out(`${line}\n`) }) });
			const switched = (await readSwitched(cwd)).routes.map((r) => r.route);
			out(`${proxy.origin}\nSwitched to NEW (${values.new}): ${switched.join(', ') || 'none yet'}; everything else from OLD (${values.old}).\n`);
			return -1;
		}
		case 'cache':
			return cacheCommand(rest, cwd, out);
		case 'config': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, new: { type: 'string' }, vercel: { type: 'string' }, nitro: { type: 'string' }, 'new-build': { type: 'string' }, index: { type: 'string' } } });
			if (!values.old || !values.new) fail('config needs --old <deployment> and --new <deployment>');
			if (values.index) await writeFile(values.index, renderStatusPage(await status(cwd), { old: values.old, new: values.new }));
			const buildDir = values['new-build'] ?? (await firstDir(cwd, ['.output/public', '.vercel/output/static']));
			const switched = (await readSwitched(cwd)).routes.map((r) => r.route);
			for (const route of switched) {
				const lacking = await missingUnder(cwd, route);
				if (lacking) fail(`no front door written: .migrate/switched.json lists ${route}, and ${lacking.replace(/^not switching [^:]+: /, '')}`);
			}
			const inventory = await readInventory(cwd);
			const concrete = switched.filter((r) => !/[:*]/.test(r));
			const built = buildDir ? await buildAssets(resolve(cwd, buildDir)) : [];
			const newAssets = await notServedBy(values.old, [...new Set([...(await pageAssets(values.new, concrete)), ...built])].sort());
			const oldPaths = [...new Set(inventory?.routes.flatMap((r) => r.assets.map((a) => a.url)).filter((u) => u.startsWith('/')) ?? [])].sort();
			const oldAssets = await notServedBy(values.new, oldPaths);
			const input = { old: values.old, new: values.new, switched, newAssets, oldAssets, oldPaths, oldRoutes: [...new Set([...(inventory?.routes.map((r) => r.route) ?? []), ...(inventory?.source?.routes.map((r) => r.path) ?? [])])] };
			const vercel = `${JSON.stringify(vercelConfig(input), null, '\t')}\n`;
			const nitro = nitroSnippet(input);
			if (values.vercel) await writeFile(values.vercel, vercel);
			if (values.nitro) await writeFile(values.nitro, nitro);
			if (!values.vercel && !values.nitro && !values.index) out(`vercel.json:\n${vercel}\nNitro routeRules:\n${nitro}`);
			else out(`Wrote ${[values.vercel, values.nitro, values.index].filter(Boolean).join(' and ')} for ${switched.length} switched route${switched.length === 1 ? '' : 's'}.\n`);
			return 0;
		}
		default:
			err(`Unknown command "${command}".\n\n${USAGE}`);
			return 2;
	}
}

const code = await main(process.argv.slice(2)).catch((error: unknown) => {
	err(`markless-migrate: ${error instanceof Error ? error.message : String(error)}\n`);
	return 1;
});
if (code >= 0) process.exitCode = code;

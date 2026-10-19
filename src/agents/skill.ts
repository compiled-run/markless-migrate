import { createHash } from 'node:crypto';

const MARKER = /^<!-- markless-migrate-managed sha256:([a-f0-9]{64}) -->\n/m;

const PAYLOAD = `---
name: markless-migrate
description: Use when moving an existing web app (Next.js, Vite, or another framework) to Markless with @markless/migrate, or when the user asks to migrate, port or convert a site to Markless. Plans the routes, then converts and proves one route at a time.
---

# Migrating an app to Markless

You convert the code. \`markless-migrate\` takes stock of the old app and proves each converted route
matches it in a real browser. A route is done when its check is green, not when it looks right.

The person who asked for the migration wants their app migrated and is not there to answer technical
questions. Never ask them anything and never wait for an answer or an approval during the migration:
every choice below has a default the tool or this skill decides. Work through every route, then report
once at the end.

## Port every route

A migration that drops routes is not a migration. \`plan\` lists every route of the old site (sitemaps,
a crawl of every link, the source, robots.txt, feeds and the non-page endpoints) in
\`.migrate/inventory.json\`; every one of them must exist on the new app. Never stop at a sample, a
showcase set or "the main pages": \`check\` without \`--route\` checks every route and reports
"routes ported N of M" with every missing route listed as red, and \`switch\` refuses a front door while
any route is missing.

- Content-driven sites (docs, blogs, changelogs, marketing pages written in markdown, MDX or a CMS): build
  the pages from the original content source, not by hand. Write one rule-based importer per template (a
  docs page, a blog post, a tag listing, a changelog entry) that reads every content file or CMS entry and
  emits that template's pages, so every page of the template exists and a new post needs no new code.
  Port each template once, prove it on its representative, then let the importer produce the rest.
- Pagination, tag and category listings, feeds, redirects and old URLs that still answer are routes too.
- \`--route\` is for iterating on one route. A run limited by it is a partial run ("partial run: N of M
  routes"): it is never overall green and never proves the migration. Finish with a run of \`check\`
  without \`--route\`.

## Implement what the old site uses, in Markless

\`plan\` reads every page's markup, the syntax tree of every script the pages run, the theme config and the
library scan into \`.migrate/usage.json\`: each behaviour the old site uses, with where it lives and the routes
that use it. An htmx attribute with its trigger, swap and target; an Alpine directive; a _hyperscript feature; a
class-tools timeline; a documentation theme's colour-mode toggle, search dialog, sidebar or tabs; a library
component with the props each site passes; what each plain script listens for, stores, fetches and writes.
\`.migrate/obligations.json\` lists the checks each one must pass ("theme toggle: click it 3 times under OS light
and dark", "dialog: close by Escape, the backdrop and the close button, during and after the open animation").

- Implement every behaviour of a route in Markless: a shared part where one exists (a @markless/ui family),
  otherwise the new app's own Markless code. When one is done, record where in \`.migrate/usage-map.json\`:
  \`{ "<behaviour id>": { "by": "components/theme-toggle.tsrx" } }\` (or \`"by": "@markless/ui modal"\`).
  \`markless-migrate usage\` prints used / implemented / checked.
- Never ship another framework's or library's runtime: no React, Vue, Svelte, htmx.js, alpine.js,
  _hyperscript, jQuery or a framework's component bundle, in the build or loaded by a page.
  \`markless-migrate guard build\` fails a build that carries one.
- Copy the old site's static assets byte for byte, at the same URLs: CSS (and the old page's own \`<style>\`
  blocks), fonts, images, SVG, media. Never retype a size, a colour or an inline style the old page gets from a
  file or from a script's measurement: \`markless-migrate guard page\` compares the bytes of every static asset,
  every inline style and the box of every frame and sized element (a third-party button framed at 51 px where the
  old page's own script sized it 101 px is red).

## The loop

1. Run the old app and note its origin (for example \`http://localhost:3000\`).
2. Call the \`plan\` tool (or \`markless-migrate plan --old <origin> --source <path>\`). It writes
   \`.migrate/inventory.json\`: every route, its SEO tags, assets and locales.
3. Pick one route from the inventory. Convert it, and what it depends on, in the Markless app.
4. Run the Markless app and call \`check_route\` with both origins and the route
   (or \`markless-migrate check --old <origin> --new <origin> --route <route>\`).
5. Every failure names the route, the dimension, the expected and actual values and a likely fix.
   Fix them and check again until the route is green. A "not exercised" failure means no journey
   used that control on the old page: port it (a dialog, a menu, a table control left out shows up
   here) and raise \`--journey-budget\` if check ran out of time before reaching it.
6. When the route is green, call \`switch_route\` (or \`markless-migrate switch <route>\`) so the proxy
   (\`markless-migrate proxy\`) and the deploy config (\`markless-migrate config\`) serve it from Markless.
   Never pass \`--force\`: a route that is not green stays on the old app and goes in the final report.
7. Call \`status\` to see which routes are green, red, not ported or not checked yet, then repeat from
   step 3 until every route of the old site is ported. The migration is not done while any planned
   route is missing or not ported: run \`check\` without \`--route\` to measure "routes ported N of M". A
   route you cannot make green goes in the final report; move on to the next one.
8. At the end, write one report: routes ported N of M (from \`status\`), which routes are green and switched, how each library was handled
   (plan's "decided" lines), what was accepted automatically, and a section "What to look at if you care":
   each route still red with its failure ids, what differs, what you tried and what you think it needs.
   Mention \`.migrate/report.html\` for anything visual.

## Rules

- Never edit the old app to make a check pass; the old app is the reference.
- Do not weaken or skip a failing dimension. If you think a failure is wrong, keep going and put it in
  the final report's "What to look at if you care" with the failure id and your evidence.
- check accepts some differences automatically when its evidence proves they are no user-visible
  regression: the old framework's own scripts the new page no longer loads, markup the old framework adds
  for itself (Next's route announcer) when the accessibility tree and announcements otherwise match,
  live content (counts, timestamps) inside a third-party embed both pages show, a control neither page
  lets a visitor use for the same reason, and storage keys only the old framework writes (htmx's history
  cache, Laravel's sealed cookies) when no journey differs. They are labelled
  "accepted automatically: <rule>" with the evidence. Any other difference stays red until it is fixed:
  never write \`.migrate/accepted.json\` and never run \`accept\`; list the difference, with its id
  (printed in [brackets]) and why you think it is intended, in the final report instead.
- Never carry the old framework's runtime markers into the port: hydration flags (\`data-has-hydrated\`,
  \`data-reactroot\`, \`data-server-rendered\`, \`data-v-app\`), head-manager attributes (\`data-rh\`), framework
  data scripts (\`__NEXT_DATA__\`, \`__NUXT_DATA__\`, \`self.__next_f\`), Astro's component
  wrapper elements, and its \`<meta name="generator">\` (the port is not built by Docusaurus, VitePress or
  WordPress). They mean nothing in a Markless page. When an old stylesheet or script keys off one,
  give it the port's own condition: drop the condition when the behaviour is always on in the port, or key
  it off an attribute the port's own code sets, with a neutral name. check fails a page that carries one ("old framework runtime marker").
- Name what you write after what it does. Never call anything "islands" (files, folders, identifiers,
  scripts, comments), and never describe the port in terms of hydration; Markless does not hydrate.
- \`visual\` failures that come with \`css\` or \`rendered\` failures usually disappear once those are
  fixed: fix the DOM and CSS failures first.
- \`css\` failures name the old rule (selector, file, line) that set the value; port that rule's intent.
- \`behaviour\` failures come from replaying recorded interactions (\`.migrate/journeys/\`): match what
  appears, the URL, the requests and the focus after each step, not just the final screen.
- \`responsiveness\` failures time the first use of a control on a fresh page load, and following an
  internal link, at desktop speed and with the CPU slowed 4x on a phone-sized page. The failure names the
  control, old and new milliseconds and the likely cause. An interaction must never fetch code: make the
  handler run from code the page already has. A long task names its top script; a big gap between the
  first and the second use is start-up work the first interaction pays for. For a link, a full page load
  where the old app navigated in the page, a cold server function, or a missing prefetch are the usual
  causes. Never raise \`--interaction-budget\` to make it pass.
- \`motion\` is checked: every interaction that stays on the page is replayed with motion allowed, and each
  transition and animation it starts (element, properties, duration, delay, easing, iterations), each one hovering,
  focusing or scrolling starts, and each sound it plays is compared with the old page's. Port every animation and
  transition by rule from the original source, with the same durations and easings: a sidebar category, a
  dropdown, a drawer or a toast that animates on the old page and jumps on the new one is red, and so is one
  timed differently or one the old page never ran. Port the old \`@media (prefers-reduced-motion)\` rules and any
  script that reads that media query too: with reduced motion on, both pages must agree. The same end state is
  not enough; the filmstrip in \`.migrate/report.html\` shows both pages at the same moments of the animation.
- \`network\` failures compare the requests each page makes, in the browser and (when the servers run
  the request recorder, see \`markless-migrate recorder\`) while the server renders it: the same
  endpoints, query parameters, body fields and number of calls, and the response fields the old page
  showed. A request the old server made and the new one does not usually means data was hardcoded.
- Pages load with a fixed clock, seeded \`Math.random\`, a fixed timezone and locale and trackers
  blocked, so anything that still varies comes from the server; the report's noise section names it.
- When the two apps read different data (another CMS, staging vs production), check once with
  \`--data record\` and then with \`--data replay\` (or the \`data\` argument of \`check_route\`) so both
  see the old app's responses.
- Writes (form posts, non-GET requests) are held back as "would POST ..." unless both origins are on
  this machine or marked \`--staging\` (\`staging: true\`). Never mark a production origin as staging.
  Sign out and Delete controls are exercised too (last, each in a fresh session), and the login steps of
  the \`--auth\` file are always sent.
- A route reported as not checked for an infrastructure failure (DNS, connection, timeout) is the
  network's, not the app's: check it again; do not change the app for it.
- Logged-in pages: \`plan --source\` writes a starter \`.migrate/auth.json\` with the roles and login route it
  found; fill in the login steps (credentials as \`\${ENV}\`) and pass it as \`--auth\` (\`auth\`). Every route is
  then checked once per role and anonymous; \`auth\` failures mean the new app lets a role in, keeps it out,
  sends it elsewhere, or sets the session cookie differently than the old app did. When the credentials it
  names are not in the environment, check the routes anonymous and list the roles left unchecked in the final report.
- A route reported as blocked was answered by bot protection, not the app: point the check at a staging
  URL or pass the bypass token with \`--header\`/\`--cookie\` (\`header\`/\`cookie\`); never weaken the wall.
  With neither at hand, list the route as blocked in the final report and go on with the next one.
- \`a11y\` and \`i18n\` failures are as blocking as visual ones; check every locale the inventory lists.
- \`.migrate/report.html\` shows old, new and diff images; open it yourself when a failure is visual, and
  point to it in the final report.
- Pass the old app's source (\`source\`, \`--source\`) and the Markless app's (\`new_source\`, \`--new-source\`):
  each failing element then carries a \`where\` line naming the old file and line that renders it and the
  \`.tsrx\` file and line that renders it now, or the \`.tsrx\` page that is missing it. Start there.
- Convert in the order \`plan\` prints (shared layouts and components first); \`status\` shows progress
  in that order. \`check --all\` also checks routes only the source knows and the non-page endpoints
  (robots.txt, sitemaps, feeds, the manifest, \`/.well-known\`, JSON routes); a route whose dynamic
  segment has no value is listed as "needs a sample": add one to \`.migrate/samples.json\`.

## Libraries

\`plan --source\` lists every library the old app imports in \`.migrate/libraries.json\`, with exactly what it
uses of each (components and their props and variants, hooks with the options passed and the fields read
back, every usage site) and what to do with it:

- **@markless/ui**: a family does the same job (a Radix or shadcn/ui dialog is \`modal\`, tabs are \`tabs\`, a
  toast is \`toaster\`). Render the family and give it the old classes; translate selectors on the library's
  own attributes (\`data-[state=open]\`) to the family's (\`[ui-open]\`). When the installed @markless/ui
  lacks the family, port it like a library below and name the missing family in the final report.
- **as-is**: framework-agnostic and renders nothing (zod, date-fns, clsx, a table or query core). Import it unchanged.
- **dom**: draws its own UI into the page (AG Grid, Handsontable, Chart.js, ECharts, Monaco, Leaflet), alone or
  under a React or Vue wrapper. \`plan\` has already decided what to do; follow its "decided" line (also in
  \`behaviour.md\`). A wrapper (ag-grid-react, react-chartjs-2, @monaco-editor/react) is always replaced by a
  Markless port of what the app uses. The library underneath is either ported too (AG Grid's grid: the parts
  this app uses become Markless code) or used directly as an ordinary JavaScript library from Markless code
  (Chart.js, Leaflet, Monaco): import it with \`await import(...)\` inside an \`onVisible\` (or \`onIdle\`)
  handler on the element it draws into and create it there, so it never loads with the page.
- **port**: bound to the old framework (react-hook-form, recharts, a React hook). Run
  \`markless-migrate parity <library> --route <route>\` (MCP \`parity\`): it writes
  \`lib/parity/<library>/\` with a skeleton of exactly the used surface and \`behaviour.md\`, what every usage
  site must do and the recorded journeys that exercise it. Fill the skeleton in with Markless state,
  computed values and plain DOM; keep the library's framework-agnostic core (\`core\` in the file) as-is.
- Port only the used surface: the same names, the props and options the app passes, the fields it reads,
  nothing more. Never render React, Vue, Svelte or any other UI framework inside the Markless app, and never
  load a framework-bound library in the browser to "bridge" it. The route's check proves the port at every
  place it is used.
`;

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

export function managedSkill(): string {
	return PAYLOAD.replace('---\n\n#', `---\n<!-- markless-migrate-managed sha256:${sha256(PAYLOAD)} -->\n\n#`);
}

export function skillBody(): string {
	return PAYLOAD.slice(PAYLOAD.indexOf('\n#') + 1);
}

export function isManagedSkill(contents: string): boolean {
	const match = contents.match(MARKER);
	return Boolean(match && sha256(contents.replace(match[0], '')) === match[1]);
}

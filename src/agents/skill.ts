import { createHash } from 'node:crypto';

const MARKER = /^<!-- markless-migrate-managed sha256:([a-f0-9]{64}) -->\n/m;

const PAYLOAD = `---
name: markless-migrate
description: Use when moving an existing web app (Next.js, Vite, or another framework) to Markless with @markless/migrate, or when the user asks to migrate, port or convert a site to Markless. Plans the routes, then converts and proves one route at a time.
---

# Migrating an app to Markless

You convert the code. \`markless-migrate\` takes stock of the old app and proves each converted route
matches it in a real browser. A route is done when its check is green, not when it looks right.

## The loop

1. Run the old app and note its origin (for example \`http://localhost:3000\`).
2. Call the \`plan\` tool (or \`markless-migrate plan --old <origin> --source <path>\`). It writes
   \`.migrate/inventory.json\`: every route, its SEO tags, assets and locales.
3. Pick one route from the inventory. Convert it, and what it depends on, in the Markless app.
4. Run the Markless app and call \`check_route\` with both origins and the route
   (or \`markless-migrate check --old <origin> --new <origin> --routes <route>\`).
5. Every failure names the route, the dimension, the expected and actual values and a likely fix.
   Fix them and check again until the route is green. A "not exercised" failure means no journey
   used that control on the old page: port it (a dialog, a menu, a table control left out shows up
   here) and raise \`--journey-budget\` if check ran out of time before reaching it.
6. When the route is green, call \`switch_route\` (or \`markless-migrate switch <route>\`) so the proxy
   (\`markless-migrate proxy\`) and the deploy config (\`markless-migrate config\`) serve it from Markless.
   Never pass \`--force\`: only a human switches a route that is not green.
7. Call \`status\` to see which routes are green, red, not ported or not checked yet, then repeat from
   step 3. The migration is not done while any planned route is not ported.

## Rules

- Never edit the old app to make a check pass; the old app is the reference.
- Do not weaken or skip a failing dimension. If you think a failure is wrong, say so and show the
  evidence to the user.
- A difference the user intends (a redesigned heading, a dropped tracker) can be accepted, but only by a
  human: propose it to the user with the failure's id (printed in [brackets]) and your reason, and let
  them run \`markless-migrate accept <id> --reason "..."\`. Never write \`.migrate/accepted.json\`
  yourself. Accepted failures show as "accepted" with the reason; an accepted difference that no longer
  matches anything is listed as stale.
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
  causes. Do not raise \`--interaction-budget\` to make it pass; that is a person's call.
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
- Logged-in pages: \`plan --source\` writes a starter \`.migrate/auth.json\` with the roles and login route it
  found; fill in the login steps (credentials as \`\${ENV}\`) and pass it as \`--auth\` (\`auth\`). Every route is
  then checked once per role and anonymous; \`auth\` failures mean the new app lets a role in, keeps it out,
  sends it elsewhere, or sets the session cookie differently than the old app did.
- A route reported as blocked was answered by bot protection, not the app: point the check at a staging
  URL or pass the bypass token with \`--header\`/\`--cookie\` (\`header\`/\`cookie\`); never weaken the wall.
- \`a11y\` and \`i18n\` failures are as blocking as visual ones; check every locale the inventory lists.
- \`.migrate/report.html\` shows old, new and diff images; tell the user to open it when a failure is visual.
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
  lacks the family, port it like a library below and tell the user which family was missing.
- **as-is**: framework-agnostic (zod, date-fns, clsx, a table or query core). Import it unchanged.
- **port**: bound to the old framework (react-hook-form, recharts, a React hook). Run
  \`markless-migrate parity <library> --route <route>\` (MCP \`parity\`): it writes
  \`lib/parity/<library>/\` with a skeleton of exactly the used surface and \`behaviour.md\`, what every usage
  site must do and the recorded journeys that exercise it. Fill the skeleton in with Markless state,
  computed values and plain DOM; keep the library's framework-agnostic core (\`core\` in the file) as-is.
- Port only the used surface: the same names, the props and options the app passes, the fields it reads,
  nothing more. Never render React, Vue or Svelte inside the Markless app, and never load the old library
  in the browser to "bridge" it. The route's check proves the port at every place it is used.
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

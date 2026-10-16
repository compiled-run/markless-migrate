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
   Fix them and check again until the route is green.
6. When the route is green, call \`switch_route\` (or \`markless-migrate switch <route>\`) so the proxy
   (\`markless-migrate proxy\`) and the deploy config (\`markless-migrate config\`) serve it from Markless.
   Never pass \`--force\`: only a human switches a route that is not green.
7. Call \`status\` to see which routes are green, red or not checked yet, then repeat from step 3.

## Rules

- Never edit the old app to make a check pass; the old app is the reference.
- Do not weaken or skip a failing dimension. If you think a failure is wrong, say so and show the
  evidence to the user.
- \`visual\` failures that come with \`css\` or \`rendered\` failures usually disappear once those are
  fixed: fix the DOM and CSS failures first.
- \`css\` failures name the old rule (selector, file, line) that set the value; port that rule's intent.
- \`behaviour\` failures come from replaying recorded interactions (\`.migrate/journeys/\`): match what
  appears, the URL, the requests and the focus after each step, not just the final screen.
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

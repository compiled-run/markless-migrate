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
6. Call \`status\` to see which routes are green, red or not checked yet, then repeat from step 3.

## Rules

- Never edit the old app to make a check pass; the old app is the reference.
- Do not weaken or skip a failing dimension. If you think a failure is wrong, say so and show the
  evidence to the user.
- \`visual\` failures that come with \`css\` or \`rendered\` failures usually disappear once those are
  fixed: fix the DOM and CSS failures first.
`;

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

export function managedSkill(): string {
	return PAYLOAD.replace('---\n\n#', `---\n<!-- markless-migrate-managed sha256:${sha256(PAYLOAD)} -->\n\n#`);
}

export function isManagedSkill(contents: string): boolean {
	const match = contents.match(MARKER);
	return Boolean(match && sha256(contents.replace(match[0], '')) === match[1]);
}

# @markless/migrate: plan

The developer's own agent (Claude Code, Cursor, Codex) converts the app. Markless supplies the
inventory, the conformance suite and the cut-over, so "done" is a green report, not the agent's word.

## The loop

1. `markless-migrate plan <old-app>` inventories the old app and writes `migration/inventory.json`,
   `migration/plan.md` and an agent skill (through the existing agents.ts skill writer).
2. The agent converts one route (and what it depends on).
3. `markless-migrate check <route|--all>` runs the conformance suite old-vs-new and writes a report the
   agent reads: every failing check names the route, the dimension, the diff and the likely fix.
4. Green route: `markless-migrate switch <route>` moves it from the pass-through to Markless.
5. Repeat until every route is green and switched; then the pass-through is removed.

During the whole migration the new app runs in front and forwards unswitched routes to the old one
(Nitro routeRules proxy; the markless router already passes routeRules through to Nitro), so it
ships on day one.

## Your own agent, on your own subscription

This tool never calls a model or holds an API key. The developer's agent does the converting, signed
in with their own plan:

- `npx @markless/migrate setup` registers an MCP server and installs the migration skill for each agent
  it finds (the REA pattern: review the changes, approve, backups kept): Claude Code, Codex, Cursor,
  Gemini CLI, GitHub Copilot (VS Code agent mode and CLI), Windsurf, Cline/Roo, Zed, Amp, opencode,
  Kiro, Grok Build. Markless's own create CLI already writes skills for several of these (agents.ts);
  share that code.
- The MCP server exposes the loop as tools: plan, next route, check route, explain failure, switch route,
  status. Every result is evidence plus a fix the agent can act on.
- Unattended mode: `markless-migrate run --agent claude|codex|gemini|cursor|copilot|opencode` drives the
  agent's own CLI headless (claude -p, codex exec, gemini -p, cursor-agent, copilot -p, opencode run)
  route by route until every route is green or a route needs a human. It uses whatever login that CLI
  already has, so it runs on the developer's subscription.

## Drop-in replacement: what the inventory finds and the suite checks

The bar is that a user, a crawler, a screen reader and the backend cannot tell which app served a route.

| Dimension | Inventory (old app) | Conformance check (old vs new) |
| --- | --- | --- |
| Routes | router config, file routes, sitemap, crawl of internal links, redirects | every URL: status, redirects, response headers, content type |
| Rendered page | server HTML per route | normalised DOM and accessibility tree equal; screenshots per viewport within a threshold |
| Interactive behaviour | automatic exploration in a real browser: every button, link, form, menu, keyboard path, recorded as replayable scripts | replay each script on the new app: same resulting DOM, URL, focus, network requests |
| CSS | every stylesheet, parsed with yuku-css: rules, custom properties, @media/@container/@layer, fonts, keyframes | computed styles per element and state (hover, focus, open, each breakpoint) equal; stylesheets compared structurally with yuku-css, ignoring hashed class names and rule order, so a missing or changed rule is named, not just seen as pixels |
| Assets | images, fonts, icons, favicons, manifest, downloads, public/ files | every asset served at the same URL (or redirected), same bytes or same decoded image, same content type and cache headers |
| Internationalisation | locales, locale routing (prefix/domain/cookie/Accept-Language), message catalogues, date/number/currency formats, RTL, hreflang | every route in every locale: same text, same formats, same locale negotiation and redirects, same dir and lang attributes |
| Accessibility | axe results, accessibility tree, focus order, landmarks, live regions, reduced-motion and contrast media | same accessibility tree and focus order per route and per state; axe no worse; same keyboard paths; same announcements in live regions |
| Behaviour over time | client navigation, history and scroll restoration, prefetching, loading and error states, optimistic UI, timers, websockets | replayed journeys across routes give the same URLs, history entries, scroll positions, loading and error states, and the same live updates |
| SEO metadata | title, meta, Open Graph, canonical, hreflang, robots, JSON-LD, sitemap.xml, robots.txt | byte-for-byte equal after normalisation, per route |
| Bundler plugins | vite/webpack/next config: SVG/image imports, MDX, CSS modules, Tailwind/PostCSS, env vars, aliases | each mapped to a Markless equivalent or flagged; assets resolve, styles apply, env reads match |
| CMS and data wiring | fetch calls and SDKs (Contentful, Sanity, Strapi, Shopify...), env keys, preview mode, revalidation/webhooks | the same upstream requests during render; content parity on every CMS-driven route; preview and revalidation still fire |
| Component libraries | dependency scan (MUI, Radix, shadcn, Headless UI, Chakra...) | mapped to @markless/ui families or flagged; keyboard and accessibility behaviour of each instance matches |
| Forms, auth, cookies | actions, API routes, middleware, cookies set | same requests, same cookies, same redirects |
| Browser storage | cookies, localStorage, sessionStorage, IndexedDB, service worker, cache | same keys written with the same values and cookie attributes; existing visitors' storage still read correctly after the switch |
| Errors and edge routes | 404, 500, redirects, trailing slashes, case, query strings, auth walls | same status codes and pages for unknown, broken and protected routes |
| Third-party scripts | analytics, tag managers, chat widgets | present, loaded, firing the same events |
| Weight | JavaScript executed at load per route | reported before/after; never worse is a check, the drop is the headline |

## Build order

0. Proof apps: one React + Vite app and one Next.js App Router app with a CMS, chosen from public repos.
1. Inventory + routes + rendered page + SEO, and `check` on one route. Proves the loop end to end.
2. Pass-through proxy and `switch`.
3. Interaction exploration and replay.
4. Bundler-plugin and component-library mapping.
5. CMS/network contracts, forms/auth, third-party scripts.
6. Agent skill and agent-facing diagnostics polished against real migrations by Claude Code and Codex.

## Decisions

- Markless-only, published as `@markless/migrate` from this separate repo (fixtures for every framework).
- Open source, MIT.
- The developer's own agent converts; this tool never calls a model.

## Open, with recommendations

- First source framework: Next.js App Router (see notes/hosts.md).
- How strict "matches" is: accessibility tree, text, metadata and network requests must match;
  screenshots within a small pixel threshold.
- Proof apps: Next.js Commerce and a Contentful or Sanity blog starter.

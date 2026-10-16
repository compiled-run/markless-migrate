# Prior art (researched 2026-10-16)

No shipped project combines the three parts: conversion by the developer's own agent, an old-vs-new
check across routes, interactions, SEO and network in a real browser, and switching routes over only
when green. The closest, all public between July and October 2026:

- **AWS Transform custom, Angular to React** (Oct 5 2026). AWS's own agent converts; Playwright
  scenarios and per-route screenshots before and after. Angular to React only, all-or-nothing,
  mocked backend, no SEO/CSS/network checks.
- **Omnia `website-migration` skill** (Oct 7 2026, MIT). The user's own agent; strong SEO and content
  parity. Astro is the only target; the agent writes the check scripts each time; no interaction
  replay; one DNS switch.
- **Meticulous** ($15M Series A, Jul 2026). Best interaction replay; compares two commits of one repo,
  never two different apps; network mocked by design.

Also relevant: CobuildX cbx-plugins (strangler-fig workflow, but parity is an LLM reading code);
Vercel/Cloudflare incremental-migration routing (switchover with no conformance gate); visual
regression tools (pixels only); SEO crawl comparison tools (Screaming Frog, Lumar); Twitter Diffy and
GitHub Scientist (response diffing for APIs, never HTML); REA (morluto/rea, reverse engineering with
agents; shows the expected `npx ... setup` + MCP + skills packaging).

Known hard problems: nondeterminism (timestamps, A/B tests, ads), logged-in routes and test data,
write actions that cannot be replayed against production, framework DOM noise, interaction state
explosion, proxies leaking cookies and absolute asset paths (Shopify Hydrogen's proxy broke cart and
consent), and conversion being the smaller part of the work (state, services, third-party libraries).

CSS: stylesheet text legitimately differs after a migration, so computed styles in the browser are the
real check. yuku-css earns its place by listing every state the old CSS styles (hover, focus,
breakpoints, dark mode) so the check forces each one, by listing every font/image/url() for asset
parity, and by mapping a computed-style difference back to the rule that caused it.

Decision: Markless-only (`@markless/migrate`), separate repo because of the framework fixtures. Keep
the checking code free of Markless imports so it could be split out later.

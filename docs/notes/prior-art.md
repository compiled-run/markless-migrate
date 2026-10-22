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

## Embeds (researched 2026-10-21)

- **astro-embed** (delucis/astro-embed, MIT): components for YouTube, Vimeo, X, Bluesky, Mastodon, gists, link
  previews and Baseline status, fetched at build time through oEmbed or official APIs (YouTube's thumbnail URL with
  no fetch, Vimeo's v2 JSON, publish.twitter.com/oembed, Bluesky's public AppView, a Mastodon server's
  /api/v1/statuses, the gist .json endpoint, Open Graph tags for link previews), cached only in an in-memory LRU per
  build, with fetch errors logged and swallowed. Its X post renders the oEmbed blockquote with its own CSS, so it is
  not the widget's look. markless-migrate takes its provider list, its data sources and its URL matchers as the
  starting point; the components are its own, and are held to the old embed pixel for pixel.
- **lite-youtube-embed** (Paul Irish, Apache-2.0): the facade pattern. A link or button that becomes the real
  iframe with autoplay=1 on click, a preconnect on hover, focus moved into the iframe, the iframe kept in a noscript
  for indexing; Safari and mobile need the iframe API to autoplay.
- **github-buttons** (ntkme, BSD-2-Clause): buttons.js. Draws into a closed shadow root, or an iframe when
  attachShadow is not native, reads counts from api.github.com and formats them with comma groups. The
  github-button adapter reproduces its markup and palettes.

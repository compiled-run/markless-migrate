import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectEmbeds, EmbedUses } from '../src/embed/detect.ts';
import { parseHtml } from '../src/usage/html.ts';

const PAGE = `<!doctype html><html><head><script async src="https://platform.twitter.com/widgets.js"></script></head><body>
<div class="github-stars"><a class="github-button" href="https://github.com/bigskysoftware/htmx" data-icon="octicon-star" data-show-count="true" aria-label="Star bigskysoftware/htmx on GitHub">star</a></div>
<div class="full-width-youtube-video"><iframe width="560" height="315" src="https://www.youtube.com/embed/EKvvptbTx6k?si=EZ-rFJn4pDW3tUvp" title="YouTube video player" frameborder="0" allowfullscreen></iframe></div>
<template data-live-video><iframe src="https://www.youtube-nocookie.com/embed/bmWQqAKLgT4?controls=0&autoplay=1&enablejsapi=1"></iframe></template>
<article class="yt-lite" data-title="Explain Like I'm 5: Docusaurus" style="background-image: url('https://img.youtube.com/vi_webp/_An9EsKPhp0/maxresdefault.webp')"><button class="lty-playbtn"></button></article>
<blockquote class="twitter-tweet"><p>Hello</p>&mdash; Someone <a href="https://twitter.com/someone/status/1234567890?ref_src=twsrc">May 1, 2024</a></blockquote>
<blockquote class="bluesky-embed" data-bluesky-uri="at://did:plc:abc/app.bsky.feed.post/3k"><p>post</p></blockquote>
<script src="https://gist.github.com/octocat/6cad326836d38bd3a7ae.js"></script>
<iframe src="https://iframe.mediadelivery.net/embed/12345/0a1b2c3d-video" loading="lazy" allowfullscreen></iframe>
<iframe src="https://player.example-cdn.com/v/abc"></iframe>
<iframe src="/same-origin-frame"></iframe>
<iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"></iframe>
<script src="https://widget.intercom.io/widget/abc123"></script>
<script async src="https://cdn.carbonads.com/carbon.js?serve=X&placement=y" id="_carbonads_js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script async defer src="https://buttons.github.io/buttons.js"></script>
</body></html>`;

test('every embed on a page is found by its frame address, its placeholder or facade markup, or its loader, each with its provider and what the migration does with it', () => {
	const found = detectEmbeds(parseHtml(PAGE), '/', 'https://site.example');
	const byId = new Map(found.map((e) => [e.id, e]));
	assert.deepEqual([...byId.keys()].sort(), [
		'ads-cdn-carbonads-com',
		'bluesky-at-did-plc-abc-app-bsky-feed-post-3k',
		'bunny-12345-0a1b2c3d-video',
		'chat-widget-intercom-io',
		'gist-6cad326836d38bd3a7ae',
		'github-button-bigskysoftware-htmx-star',
		'host-player-example-cdn-com-v-abc',
		'spotify-track-4uLU6hMCjMI75M1A2tKUQC',
		'twitter-1234567890',
		'youtube-EKvvptbTx6k',
		'youtube-_An9EsKPhp0',
		'youtube-bmWQqAKLgT4',
	]);
	const star = byId.get('github-button-bigskysoftware-htmx-star')!;
	assert.deepEqual([star.form, star.adapter, star.url, star.keep], ['script', 'github-button', 'https://github.com/bigskysoftware/htmx', undefined]);
	assert.equal(byId.get('youtube-EKvvptbTx6k')!.form, 'iframe');
	assert.equal(byId.get('youtube-_An9EsKPhp0')!.form, 'facade', 'react-lite-youtube-embed markup is a facade the old site already uses');
	assert.equal(byId.get('youtube-bmWQqAKLgT4')!.keep?.reason, 'autoplay', 'the /live player plays at load and the page drives it');
	assert.equal(byId.get('twitter-1234567890')!.url, 'https://twitter.com/someone/status/1234567890?ref_src=twsrc');
	assert.equal(byId.get('twitter-1234567890')!.terms.study, false, 'X forbids scraping: its post is rebuilt from oEmbed alone');
	assert.deepEqual([byId.get('bunny-12345-0a1b2c3d-video')!.adapter, byId.get('bunny-12345-0a1b2c3d-video')!.keep], [undefined, undefined], 'Bunny Stream has no adapter: it goes through the study, write and check loop');
	assert.equal(byId.get('host-player-example-cdn-com-v-abc')!.providerName, 'player.example-cdn.com', 'an unknown provider is its host');
	assert.equal(byId.get('spotify-track-4uLU6hMCjMI75M1A2tKUQC')!.keep?.reason, 'terms');
	assert.equal(byId.get('chat-widget-intercom-io')!.keep?.reason, 'live-at-load');
	assert.equal(byId.get('ads-cdn-carbonads-com')!.keep?.reason, 'ads');
	assert.ok(!found.some((e) => e.provider === 'youtube' && e.form === 'api'), 'the iframe API loader belongs to the page\'s YouTube frames, not a separate embed');
});

test('a loader with no placeholder on the page is an embed the page\'s own code drives, and is kept', () => {
	const [api] = detectEmbeds(parseHtml(`<div id="player"></div><script src="https://www.youtube.com/iframe_api"></script>`), '/', 'https://site.example');
	assert.deepEqual([api!.form, api!.keep?.reason], ['api', 'driven-by-page']);
});

test('the same embed on many pages is one use with every route', () => {
	const uses = new EmbedUses();
	const header = `<a class="github-button" href="https://github.com/bigskysoftware/htmx" data-show-count="true">star</a><script src="https://buttons.github.io/buttons.js"></script>`;
	uses.add(detectEmbeds(parseHtml(header), '/', 'https://htmx.org'), '/');
	uses.add(detectEmbeds(parseHtml(header), '/docs/', 'https://htmx.org'), '/docs/');
	const [star] = uses.list();
	assert.deepEqual(star!.routes, ['/', '/docs/']);
	assert.deepEqual(star!.loaders, ['https://buttons.github.io/buttons.js']);
});

test('robots.txt is honoured before a page is read for its Open Graph tags: the longest matching rule of the * group wins', async () => {
	const { robotsTxtAllows } = await import('../src/embed/data.ts');
	const txt = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/open\n';
	assert.equal(robotsTxtAllows(txt, '/blog/post'), true);
	assert.equal(robotsTxtAllows(txt, '/private/x'), false);
	assert.equal(robotsTxtAllows(txt, '/private/open/y'), true);
	assert.equal(robotsTxtAllows('', '/anything'), true);
});

test('embed data is read from the provider once and cached; a failed refresh keeps the last answer and says why', async () => {
	const { mkdtemp } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { embedData } = await import('../src/embed/data.ts');
	const [star] = detectEmbeds(parseHtml(`<a class="github-button" href="https://github.com/bigskysoftware/htmx" data-show-count="true">star</a><script src="https://buttons.github.io/buttons.js"></script>`), '/', 'https://htmx.org');
	const use = { ...star!, routes: ['/'], sites: [] };
	const cacheDir = await mkdtemp(join(tmpdir(), 'mm-embed-data-'));
	let calls = 0;
	const ok = (async (url: string) => {
		calls++;
		assert.equal(url, 'https://api.github.com/repos/bigskysoftware/htmx');
		return new Response(JSON.stringify({ stargazers_count: 49579, html_url: 'https://github.com/bigskysoftware/htmx' }), { headers: { 'content-type': 'application/json' } });
	}) as typeof fetch;
	const first = await embedData(use, { cacheDir, fetch: ok, env: {} });
	assert.equal(first.fields.stars, 49579);
	await embedData(use, { cacheDir, fetch: ok, env: {} });
	assert.equal(calls, 1, 'the second read is the cache');
	const down = (async () => new Response('rate limited', { status: 403, statusText: 'Forbidden' })) as unknown as typeof fetch;
	const again = await embedData(use, { cacheDir, fetch: down, env: {}, refresh: true });
	assert.equal(again.fields.stars, 49579);
	assert.match(again.errors![0]!, /403 Forbidden; kept the answer from/);
});

test('the GitHub button adapter reads what buttons.js reads: the link, its text and icon, the colour scheme and the count it links to', async () => {
	const { GITHUB_BUTTON, colorScheme } = await import('../src/embed/adapters/github-button/adapter.ts');
	const [star] = detectEmbeds(parseHtml(`<a class="github-button" href="https://github.com/bigskysoftware/htmx" data-color-scheme="no-preference: light; light: light; dark: dark;" data-icon="octicon-star" data-show-count="true" aria-label="Star bigskysoftware/htmx on GitHub">star</a>`), '/', 'https://htmx.org');
	const props = GITHUB_BUTTON.props({ ...star!, routes: ['/'], sites: [] }, { fetchedAt: '', sources: [], fields: { stars: 49579, htmlUrl: 'https://github.com/bigskysoftware/htmx' } });
	assert.deepEqual(props, { embed: 'github-button-bigskysoftware-htmx-star', href: 'https://github.com/bigskysoftware/htmx', text: 'star', ariaLabel: 'Star bigskysoftware/htmx on GitHub', icon: 'octicon-star', scheme: { none: 'light', light: 'light', dark: 'dark' }, count: 49579, countHref: 'https://github.com/bigskysoftware/htmx', countNoun: 'stargazers' });
	assert.deepEqual(colorScheme(undefined), { none: 'light', light: 'light', dark: 'light' }, 'buttons.js is light everywhere without data-color-scheme');
	const [frame] = detectEmbeds(parseHtml(`<iframe src="https://buttons.github.io/buttons.html#href=https%3A%2F%2Fgithub.com%2Fbigskysoftware%2Fhtmx&data-icon=octicon-star&data-text=star&data-show-count=true"></iframe>`), '/', 'https://htmx.org');
	assert.equal(frame!.id, 'github-button-bigskysoftware-htmx-star', 'the frame buttons.js falls back to is the same embed');
});

test('the run prompt names each embed on the route, its study and adapter, where the check writes its images, and when to keep it', async () => {
	const { embedBrief } = await import('../src/embed/detect.ts');
	const uses = new EmbedUses();
	uses.add(detectEmbeds(parseHtml(PAGE), '/', 'https://site.example'), '/');
	const brief = embedBrief(uses.list(), '/', '/app/.migrate/embeds', 'markless-migrate')!;
	assert.match(brief, /- github-button-bigskysoftware-htmx-star: GitHub button \(script\)/);
	assert.match(brief, /Study it first: markless-migrate embeds study --embed bunny-12345-0a1b2c3d-video/);
	assert.match(brief, /Pre-built: markless-migrate embeds install github-button/);
	assert.match(brief, /\/app\/\.migrate\/embeds\/github-button-bigskysoftware-htmx-star\/check\//);
	assert.match(brief, /- spotify-track-4uLU6hMCjMI75M1A2tKUQC: .*keep as it is: Spotify's developer terms/);
	assert.equal(embedBrief(uses.list(), '/other', '/x', 'm'), undefined);
});

test('the page-level accessibility tree leaves an embed\'s inside to the embed step: its own lines and bare frames are dropped, the rest kept in order', async () => {
	const { withoutEmbeds } = await import('../src/check/embeds.ts');
	const page = ['- heading "Vite 6"', '- paragraph: Watch the keynote', '- generic:', '  - \'button "Play video: Keynote"\'', '  - link "ViteConf":', '    - /url: https://www.youtube.com/@viteconf', '- iframe', '- paragraph: Next'];
	const component = ['- generic:', '  - \'button "Play video: Keynote"\'', '  - link "ViteConf":', '    - /url: https://www.youtube.com/@viteconf'];
	assert.deepEqual(withoutEmbeds(page, [component]), ['- heading "Vite 6"', '- paragraph: Watch the keynote', '- paragraph: Next']);
});

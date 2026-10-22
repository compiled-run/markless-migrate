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

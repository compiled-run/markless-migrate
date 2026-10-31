import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEnv } from '../src/check/browser.ts';
import { selfUrlFailures, selfUrlsInHtml } from '../src/check/self-urls.ts';

// The live shadcn port's /docs/components/radix/button, served for the check on 127.0.0.1:3000.
const LIVE = { 'meta:og:url': 'http://127.0.0.1:63451/docs/components/radix/button', canonical: 'https://ui.shadcn.com/docs/components/radix/button', title: 'Button' };
const env = defaultEnv('http://127.0.0.1:3000');
const none = async () => undefined;

test('an og:url on a loopback host other than the one the page was served from is red outright', async () => {
	const failures = await selfUrlFailures('/docs/components/radix/button', LIVE, env, { seo: { 'meta:og:url': '{origin}/docs/components/radix/button' }, origin: 'http://localhost:4000' }, none);
	assert.deepEqual(failures.map((f) => [f.dimension, f.check, f.actual]), [['seo', 'meta:og:url', 'http://127.0.0.1:63451/docs/components/radix/button: a loopback address']]);
});

test("a self-address equal to the serving origin is red when the page names it again at another name for the host, and not when it follows the request", async () => {
	const seo = { 'meta:og:url': '{origin}/docs', 'hreflang:fr': '{origin}/fr/docs', 'jsonld[0].url': '{origin}/docs' };
	const baked = '<meta property="og:url" content="http://127.0.0.1:3000/docs"><link rel="alternate" hreflang="fr" href="http://127.0.0.1:3000/fr/docs"><script type="application/ld+json">{"url":"http://127.0.0.1:3000/docs"}</script>';
	const asked: string[] = [];
	const red = await selfUrlFailures('/docs', seo, env, undefined, async (url) => (asked.push(url), baked));
	assert.deepEqual(asked, ['http://localhost:3000/docs']);
	assert.deepEqual(red.map((f) => f.check).sort(), ['hreflang:fr', 'jsonld[0].url', 'meta:og:url']);
	const followed = baked.replaceAll('127.0.0.1', 'localhost');
	assert.deepEqual(await selfUrlFailures('/docs', seo, env, undefined, async () => followed), []);
});

test('public self-addresses, and pages served from a public origin, are left to the comparison with the original', async () => {
	assert.deepEqual(await selfUrlFailures('/docs', { 'meta:og:url': 'https://mm-shadcn-ui-new.vercel.app/docs', canonical: 'https://ui.shadcn.com/docs' }, env, undefined, none), []);
	assert.deepEqual(await selfUrlFailures('/docs', { 'meta:og:url': '{origin}/docs' }, defaultEnv('https://mm-shadcn-ui-new.vercel.app'), undefined, none), []);
});

test("an original that names the same loopback host is the same fault: the port keeping it is parity, not a new red", async () => {
	// Next.js resolves a relative canonical against http://localhost:3000 when the app sets no metadataBase.
	const seo = { canonical: 'http://localhost:3000/en/about' };
	assert.deepEqual(await selfUrlFailures('/en/about', seo, defaultEnv('http://127.0.0.1:4100'), { seo, origin: 'http://127.0.0.1:4000' }, none), []);
	assert.equal((await selfUrlFailures('/en/about', seo, defaultEnv('http://127.0.0.1:4100'), { seo: { canonical: 'https://site.example/en/about' }, origin: 'http://127.0.0.1:4000' }, none)).length, 1);
});

test('the self-addresses of an HTML document are read as the page capture keys them', () => {
	const html = `<meta property="og:url" content="https://x.test/a?b=1&amp;c=2"><meta name="twitter:url" content='https://x.test/a'><link rel="canonical" href="https://x.test/a"><link rel="alternate" hreflang="EN" href="https://x.test/en/a"><script type="application/ld+json">{"@id":"https://x.test/#site","publisher":{"url":"https://x.test/"}}</script>`;
	assert.deepEqual([...selfUrlsInHtml(html)], [['meta:og:url', 'https://x.test/a?b=1&c=2'], ['meta:twitter:url', 'https://x.test/a'], ['canonical', 'https://x.test/a'], ['hreflang:en', 'https://x.test/en/a'], ['jsonld[0].@id', 'https://x.test/#site'], ['jsonld[0].publisher.url', 'https://x.test/']]);
});

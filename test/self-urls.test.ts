import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEnv } from '../src/check/browser.ts';
import { selfUrlFailures, selfUrlsInHtml } from '../src/check/self-urls.ts';

// The live shadcn port's /docs/components/radix/button, served for the check on 127.0.0.1:3000.
const LIVE = { 'meta:og:url': 'http://127.0.0.1:63451/docs/components/radix/button', canonical: 'https://ui.shadcn.com/docs/components/radix/button', title: 'Button' };
const env = defaultEnv('http://127.0.0.1:3000');
const none = async () => undefined;

test('an og:url on a loopback host other than the one the page was served from is red outright', async () => {
	const failures = await selfUrlFailures('/docs/components/radix/button', LIVE, env, none);
	assert.deepEqual(failures.map((f) => [f.dimension, f.check, f.actual]), [['seo', 'meta:og:url', 'http://127.0.0.1:63451/docs/components/radix/button: a loopback address']]);
});

test("a self-address equal to the serving origin is red when the page names it again at another name for the host, and not when it follows the request", async () => {
	const seo = { 'meta:og:url': '{origin}/docs', 'hreflang:fr': '{origin}/fr/docs', 'jsonld[0].url': '{origin}/docs' };
	const baked = '<meta property="og:url" content="http://127.0.0.1:3000/docs"><link rel="alternate" hreflang="fr" href="http://127.0.0.1:3000/fr/docs"><script type="application/ld+json">{"url":"http://127.0.0.1:3000/docs"}</script>';
	const asked: string[] = [];
	const red = await selfUrlFailures('/docs', seo, env, async (url) => (asked.push(url), baked));
	assert.deepEqual(asked, ['http://localhost:3000/docs']);
	assert.deepEqual(red.map((f) => f.check).sort(), ['hreflang:fr', 'jsonld[0].url', 'meta:og:url']);
	const followed = baked.replaceAll('127.0.0.1', 'localhost');
	assert.deepEqual(await selfUrlFailures('/docs', seo, env, async () => followed), []);
});

test('public self-addresses, and pages served from a public origin, are left to the comparison with the original', async () => {
	assert.deepEqual(await selfUrlFailures('/docs', { 'meta:og:url': 'https://mm-shadcn-ui-new.vercel.app/docs', canonical: 'https://ui.shadcn.com/docs' }, env, none), []);
	assert.deepEqual(await selfUrlFailures('/docs', { 'meta:og:url': '{origin}/docs' }, defaultEnv('https://mm-shadcn-ui-new.vercel.app'), none), []);
});

test("an original that names a loopback host is no excuse: the original's origin is its own build's business, the port's must be public", async () => {
	// Next.js resolves a relative canonical against http://localhost:3000 when the app sets no metadataBase.
	const seo = { canonical: 'http://localhost:3000/en/about' };
	assert.equal((await selfUrlFailures('/en/about', seo, defaultEnv('http://127.0.0.1:4100'), none)).length, 1);
});

test('the self-addresses of an HTML document are read as the page capture keys them', () => {
	const html = `<meta property="og:url" content="https://x.test/a?b=1&amp;c=2"><meta name="twitter:url" content='https://x.test/a'><link rel="canonical" href="https://x.test/a"><link rel="alternate" hreflang="EN" href="https://x.test/en/a"><script type="application/ld+json">{"@id":"https://x.test/#site","publisher":{"url":"https://x.test/"}}</script>`;
	assert.deepEqual([...selfUrlsInHtml(html)], [['meta:og:url', 'https://x.test/a?b=1&c=2'], ['meta:twitter:url', 'https://x.test/a'], ['canonical', 'https://x.test/a'], ['hreflang:en', 'https://x.test/en/a'], ['jsonld[0].@id', 'https://x.test/#site'], ['jsonld[0].publisher.url', 'https://x.test/']]);
});

test("self-addresses compare by path: the port on its public origin against an original naming http://localhost:4000 is not red, a loopback port still is", async () => {
	const { createServer } = await import('node:http');
	const { chromium } = await import('playwright');
	const { runCheck } = await import('../src/check/run.ts');
	const page = (self: string) => `<!doctype html><html lang="en"><head><title>Docs</title><meta property="og:url" content="${self}/docs"><link rel="canonical" href="${self}/docs"></head><body><main><h1>Docs</h1><p>Read the guide.</p></main></body></html>`;
	const serve = (html: string) => new Promise<import('node:http').Server>((done) => { const s = createServer((req, res) => res.writeHead(req.url === '/docs' ? 200 : 404, { 'content-type': 'text/html' }).end(html)); s.listen(0, '127.0.0.1', () => done(s)); });
	const at = (s: import('node:http').Server) => `http://127.0.0.1:${(s.address() as import('node:net').AddressInfo).port}`;
	const browser = await chromium.launch();
	const servers = [await serve(page('http://localhost:4000')), await serve(page('https://mm-shadcn-ui-new.vercel.app')), await serve(page('http://127.0.0.1:63451'))];
	try {
		const seo = async (next: import('node:http').Server) => (await runCheck({ oldOrigin: at(servers[0]!), newOrigin: at(next), routes: ['/docs'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, journeys: { budgetMs: 1 }, responsiveness: undefined, motion: undefined, load: undefined })).routes[0]!.failures.filter((f) => f.dimension === 'seo').map((f) => `${f.check}: ${f.actual}`);
		assert.deepEqual(await seo(servers[1]!), []);
		assert.deepEqual((await seo(servers[2]!)).sort(), ['canonical: http://127.0.0.1:63451/docs: a loopback address', 'meta:og:url: http://127.0.0.1:63451/docs: a loopback address']);
	} finally {
		await browser.close();
		for (const s of servers) s.close();
	}
});

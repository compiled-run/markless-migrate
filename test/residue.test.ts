import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { originalRuntimeFailures, residueFailures, runtimeMarkers } from '../src/check/residue.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type PageCapture } from '../src/check/types.ts';

// The old site is a Docusaurus-like page: its runtime flags <html> as hydrated once it has run.
function site(html: string, script = ''): Promise<Server> {
	const server = createServer((req, res) => {
		if (new URL(req.url ?? '/', 'http://x').pathname !== '/') return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html lang="en"${html}><title>Docs</title><main><h1>Docs</h1><p>Read the guide.</p></main>${script}`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});
const at = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const check = async (old: Server, next: Server) => {
	servers.push(old, next);
	return (await runCheck({ oldOrigin: at(old), newOrigin: at(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser })).routes[0]!;
};
const residue = (r: Awaited<ReturnType<typeof check>>) => r.failures.filter((f) => f.check.startsWith('old framework runtime marker'));

test('a port whose served HTML carries data-has-hydrated fails with that marker named', async () => {
	const route = await check(await site(' data-has-hydrated="true"'), await site(' data-has-hydrated="false"'));
	const found = residue(route);
	assert.deepEqual(found.map((f) => [f.dimension, f.check]), [['http', 'old framework runtime marker data-has-hydrated']]);
	assert.match(found[0]!.actual, /Docusaurus.*HTML the server sends/);
	assert.equal(found[0]!.accepted, undefined);
	assert.ok(!route.ok);
});

test('a port that sets the marker from its own script once loaded fails too', async () => {
	const route = await check(await site(''), await site('', `<script>document.documentElement.setAttribute('data-has-hydrated', 'true')</script>`));
	assert.deepEqual(residue(route).map((f) => f.actual), ['data-has-hydrated (Docusaurus) in the page once it has loaded']);
});

test('the old page carrying the marker and the new page without it is no difference', async () => {
	const route = await check(await site(' data-has-hydrated="true"', '<script id="__NEXT_DATA__" type="application/json">{}</script>'), await site(''));
	assert.ok(route.ok, route.failures.map((f) => `${f.dimension} ${f.check}: ${f.actual}`).join('; '));
});

test('a marker only mentioned in text or quoted in code is not carried', () => {
	const html = '<pre><code>&lt;html data-has-hydrated="true"&gt;</code></pre><script>const x = \'<astro-island data-reactroot>\';</script><!-- <html data-rh="true"> -->';
	assert.deepEqual(runtimeMarkers(html, 'served'), []);
	const carried = runtimeMarkers('<html data-rh="lang"><astro-island uid="1"></astro-island><script id="__NEXT_DATA__">{}</script><script>self.__next_f.push([1])</script>', 'served');
	assert.deepEqual(carried.map((m) => m.marker).sort(), ['<astro-island>', '<script id="__NEXT_DATA__">', 'data-rh', 'self.__next_f']);
});

test("a port that serves the old framework's generator meta fails; the old page serving it is no difference", async () => {
	const generator = '<meta name="generator" content="Docusaurus v4.0.0">';
	const port = await check(await site('', generator), await site('', generator));
	assert.deepEqual(residue(port).map((f) => f.check), ['old framework runtime marker <meta name="generator" content="Docusaurus v4.0.0">']);
	const clean = await check(await site('', generator), await site(''));
	assert.ok(clean.ok, clean.failures.map((f) => `${f.dimension} ${f.check}: ${f.actual}`).join('; '));
});

test('a page that runs the framework itself, a rebuild rather than a port, carries its markers as its own', () => {
	const residue = runtimeMarkers('<script id="__NEXT_DATA__">{}</script><link rel="stylesheet" data-precedence="next"><html data-has-hydrated="true">', 'served');
	const page = (runtime?: string) => ({ viewport: 'desktop', residue, assets: runtime ? [{ url: '/a.js', type: 'script', status: 200, contentType: 'text/javascript', bytes: 1, fingerprinted: true, runtime }] : [] }) as unknown as PageCapture;
	assert.deepEqual(residueFailures('/', page('Next.js')).map((f) => f.check), ['old framework runtime marker data-has-hydrated'], "Docusaurus's flag is never Next's own");
	assert.equal(residueFailures('/', page()).length, 3);
});

test("a Markless page that loads the original's own scripts and runs its framework is red; the same page without them, and the original against itself, are not", () => {
	const script = (url: string, runtime?: string) => ({ url, type: 'script', status: 200, contentType: 'text/javascript', bytes: 1000, fingerprinted: true, ...(runtime ? { runtime } : {}) });
	// The original's /charts/line, and the candidate port's: 201 of the original's Next.js chunks beside the Markless route marker.
	const nextChunks = Array.from({ length: 201 }, (_, i) => script(`/_next/static/chunks/${i}.js`, i === 0 ? 'Next.js' : i === 1 ? 'React' : undefined));
	const old = { viewport: 'desktop', assets: nextChunks } as unknown as PageCapture;
	const port = { viewport: 'desktop', routeFile: 'pages/charts/line.tsrx', assets: [script('/build/chunk-a.js'), ...nextChunks] } as unknown as PageCapture;
	const [f] = originalRuntimeFailures('/charts/line', old, port);
	assert.equal(f?.check, "runs the original's framework");
	assert.match(f!.actual, /^Next\.js, React runs on the port: 201 of the original's own script files load \(\/_next\/static\/chunks\/0\.js, .*\), carrying the Next\.js and React runtime$/);
	assert.deepEqual(originalRuntimeFailures('/charts/line', old, { ...port, assets: [script('/build/chunk-a.js')] } as PageCapture), []);
	assert.deepEqual(originalRuntimeFailures('/charts/line', old, { viewport: 'desktop', assets: nextChunks } as unknown as PageCapture), [], 'a page Markless did not render is the original itself, never this red');
});

test("the original's stylesheets and images under /_next (cut sheets, next/image URLs) are not its framework: only scripts count", () => {
	const asset = (url: string, type: string) => ({ url, type, status: 200, contentType: type === 'image' ? 'image/webp' : 'text/css', bytes: 1000, fingerprinted: true });
	// /blocks on d24ccda5: ten next/image URLs and cut stylesheets under /_next, no script of the original's.
	const shared = [asset('/_next/static/css/3n2_4ok5y-nmk.used-0a1b2c.css', 'stylesheet'), ...Array.from({ length: 10 }, (_, i) => asset(`/_next/image?url=%2Fr%2Fstyles%2Fnew-york-v4%2Fblock-${i}.png&w=3840&q=75`, 'image'))];
	const old = { viewport: 'desktop', assets: [...shared, { ...asset('/_next/static/chunks/main.js', 'script'), contentType: 'text/javascript', runtime: 'Next.js' }] } as unknown as PageCapture;
	const port = { viewport: 'desktop', routeFile: 'pages/blocks.tsrx', assets: shared } as unknown as PageCapture;
	assert.deepEqual(originalRuntimeFailures('/blocks', old, port), []);
});

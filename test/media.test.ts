import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { judgeMedia, type Picture } from '../src/check/media-compare.ts';
import { checkNavigation } from '../src/check/nav-parity.ts';
import { runCheck } from '../src/check/run.ts';

const WEBM = readFileSync(new URL('../fixtures/media/red.webm', import.meta.url));
const png = (size: number) => {
	const p = new PNG({ width: size, height: size });
	for (let i = 0; i < p.data.length; i += 4) p.data.set([200, 40, 40, 255], i);
	return PNG.sync.write(p);
};
const PNG40 = png(40);

type Answer = { status?: number; type: string; body: string | Buffer };
function serve(answer: (path: string, req: IncomingMessage) => Answer | undefined): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((req, res) => {
			const a = answer(new URL(req.url ?? '/', 'http://x').pathname, req);
			if (!a) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
			res.writeHead(a.status ?? 200, { 'content-type': a.type, 'cache-control': 'no-store' }).end(a.body);
		});
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

// A picture below the first screen that a scroll listener loads as it comes into view (no capture scrolls, so none loads it), an avatar whose host fails for both pages, and a video; the port serves the picture and the video broken.
const PAGE = `<!doctype html><html lang="en"><head><title>Team</title></head><body><main><h1>Team</h1><img src="/gone.png" alt="Avatar" width="40" height="40"><video src="/red.webm" preload="auto" muted width="160" height="90"></video><div style="height: 2400px">The story</div><img data-src="/below.png" alt="Office" width="40" height="40"></main><script>addEventListener("scroll", () => { for (const img of document.querySelectorAll("img[data-src]")) if (img.getBoundingClientRect().top < innerHeight) { img.src = img.dataset.src; img.removeAttribute("data-src"); } });</script></body></html>`;

test('a lazy picture below the first screen the port fails to serve, a picture broken on both sides and a video the port cannot play are red', { timeout: 300_000 }, async () => {
	const old = await serve((path) => (path === '/' ? { type: 'text/html', body: PAGE } : path === '/below.png' ? { type: 'image/png', body: PNG40 } : path === '/red.webm' ? { type: 'video/webm', body: WEBM } : undefined));
	const next = await serve((path) => (path === '/' ? { type: 'text/html', body: PAGE } : path === '/below.png' ? { type: 'image/png', body: 'not a picture' } : path === '/red.webm' ? { type: 'video/webm', body: 'not a video' } : undefined));
	const browser = await chromium.launch();
	try {
		const route = (await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, journeys: { maxJourneys: 0, budgetMs: 1 } })).routes[0]!;
		const lines = route.failures.map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n');
		assert.ok(route.failures.some((f) => f.check === 'image #2 /below.png (every picture loaded)' && f.expected === '40x40' && f.actual === 'broken'), lines);
		assert.ok(route.failures.some((f) => f.check === 'image #1 /gone.png (every picture loaded)' && /broken on both sides/.test(f.actual)), lines);
		assert.ok(route.failures.some((f) => f.check === 'embed #1 <video>' && /its source never loaded/.test(f.actual) && !/never loaded/.test(f.expected)), lines);
	} finally {
		await browser.close();
		old.server.close();
		next.server.close();
	}
});

test('judgeMedia: another file of the srcset, or another drawn size, is red; what the old page varies between its loads is not', () => {
	const pic = (src: string, width = 40, box = { x: 0, y: 0, width: 40, height: 40 }): Picture => ({ src, naturalWidth: width, naturalHeight: width, broken: false, picks: true, box });
	const row = (olds: Picture[][], next: Picture[]) => ({ viewports: [{ viewport: 'mobile', olds, next }] });
	assert.deepEqual(judgeMedia('/', row([[pic('/a-640.png')]], [pic('/a-640.png')])), []);
	assert.deepEqual(judgeMedia('/', row([[pic('/a-640.png')]], [pic('/a-1080.png')])).map((f) => `${f.check}: ${f.expected} / ${f.actual}`), ['image #1 /a-640.png: the file its srcset picks (every picture loaded): a-640.png / a-1080.png']);
	assert.deepEqual(judgeMedia('/', row([[pic('/a.png')]], [pic('/a.png', 40, { x: 0, y: 0, width: 80, height: 80 })])).map((f) => f.check), ['image #1 /a.png: drawn size (every picture loaded)']);
	assert.deepEqual(judgeMedia('/', row([[pic('/a.png')], [pic('/a.png', 40, { x: 0, y: 0, width: 80, height: 80 })]], [pic('/a.png', 40, { x: 0, y: 0, width: 80, height: 80 })])), []);
});

// After an in-place arrival the router's adopted picture does not decode (here the server answers it with no picture once the router has run, with a 200, so no request failed), while every line of the page reads as a fresh load's.
const doc = (body: string) => `<!doctype html><html lang="en"><head><title>Site</title><script src="/router.js" defer></script></head><body><header><nav><a href="/">Home</a> <a href="/about/">About</a></nav></header>${body}</body></html>`;
const PAGES: Record<string, string> = { '/': doc('<main><h1>Home</h1></main>'), '/about/': doc('<main><h1>About</h1><img src="/team.png" alt="" width="16" height="16"></main>') };
const ROUTER = `document.addEventListener('click', async (e) => { const a = e.target.closest('a[href]'); if (!a) return; e.preventDefault(); document.cookie = 'swapped=1; path=/'; history.pushState(null, '', a.href); const html = await (await fetch('/_markless/fragment' + new URL(a.href).pathname)).text(); const next = new DOMParser().parseFromString(html, 'text/html'); document.title = next.title; document.body.replaceChildren(...next.body.childNodes); });`;

test('a picture that does not load once the page is reached in place, though every line reads as a fresh load, is red', { timeout: 300_000 }, async () => {
	const site = await serve((path, req) => {
		const page = PAGES[path.replace(/^\/_markless\/fragment(?=\/)/, '')];
		if (page) return { type: 'text/html', body: page };
		if (path === '/router.js') return { type: 'text/javascript', body: ROUTER };
		if (path === '/team.png') return { type: 'image/png', body: /swapped=1/.test(req.headers.cookie ?? '') ? 'not a picture' : png(16) };
		return undefined;
	});
	const browser = await chromium.launch();
	try {
		const result = await checkNavigation(browser, defaultEnv(site.origin), ['/', '/about/'], { concurrency: 2, toggle: false });
		const dom = result.failures.find((f) => f.route === '/about/' && /: DOM$/.test(f.check));
		assert.ok(dom, result.failures.map((f) => `${f.route} ${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
		assert.match(`${dom.expected}\n${dom.actual}`, /\{image broken\}/);
	} finally {
		await browser.close();
		site.server.close();
	}
});

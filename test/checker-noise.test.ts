import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { unreachableCandidate } from '../src/check/automatic.ts';
import { defaultEnv } from '../src/check/browser.ts';
import { readPage } from '../src/check/collect.ts';
import { explore, snapshotName } from '../src/check/journeys.ts';
import { runCheck, type CheckOptions } from '../src/check/run.ts';
import { VIEWPORTS, type Failure } from '../src/check/types.ts';

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

// `hang`: the request is never answered.
function serve(handler: (path: string) => { type?: string; body: string } | 'hang' | undefined): Promise<string> {
	const server = createServer((req, res) => {
		const out = handler(new URL(req.url ?? '/', 'http://x').pathname);
		if (out === 'hang') return;
		if (!out) return void res.writeHead(404).end('not found');
		res.writeHead(200, { 'content-type': out.type ?? 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(out.body);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

const html = (body: string, head = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title>${head}</head><body><main><h1>Page</h1>${body}</main></body></html>`;
const desktop = [VIEWPORTS[0]!];
const check = (oldOrigin: string, newOrigin: string, more: Partial<CheckOptions> = {}) => runCheck({ oldOrigin, newOrigin, routes: ['/'], viewports: desktop, browser, journeys: { budgetMs: 20_000 }, ...more });
const open = (failures: readonly Failure[]) => failures.filter((f) => !f.accepted).map((f) => `${f.dimension}: ${f.check}: ${f.actual}`);

test('a name with a colon, which the aria snapshot quotes as YAML, is read back, so the control is found and used on the old page', async () => {
	assert.equal(snapshotName(`- 'link "Anchor link for: tips"':`), 'Anchor link for: tips');
	assert.equal(snapshotName(`- 'link "It''s: here"'`), "It's: here");
	assert.equal(snapshotName('- link "plain \\"q\\" name":'), 'plain "q" name');
	assert.equal(snapshotName('- link:'), '');
	const site = await serve(() => ({ body: html('<h2 id="tips"><a href="#tips" aria-label="Anchor link for: tips">Tips</a></h2><p style="height: 2000px">x</p>') }));
	const { elements } = await explore(browser, defaultEnv(site), '/', desktop[0]!);
	const anchor = elements.find((e) => e.element === 'link "Anchor link for: tips"');
	assert.equal(anchor?.by, 'click link "Anchor link for: tips"', JSON.stringify(elements));
});

test('a control check cannot drive on the old page is judged the same way on the new page, never red only because the old side was unreachable', () => {
	const old = 'it could not be used on the old page: link "x" could not be used: missing: it is not on the page';
	assert.equal(unreachableCandidate('missing', old, undefined, true)?.rule, 'undrivable-on-old');
	assert.equal(unreachableCandidate('timeout', old, { failed: 'timeout', unreachable: 'missing' })?.rule, 'undrivable-on-old');
	assert.equal(unreachableCandidate('missing', old, { failed: 'covered', unreachable: 'occluded' }), undefined, 'the new page refusing it for a reason of its own stays red');
	assert.equal(unreachableCandidate('occluded', old, undefined, true), undefined, 'a control the old page covers and the new page lets through is a real difference');
});

// The embed changes its colour, fetches with a new query and posts its own log events a different number of times every load, as a live video player does.
async function embedHost(): Promise<string> {
	return serve((path) => (path === '/frame' ? { body: `<!doctype html><body style="margin:0;background:hsl(${Math.floor(Math.random() * 360)},80%,50%)"><script>fetch('/ping?r=' + Math.random() + '&t=' + performance.now()); for (let i = 0; i < ${Math.floor(Math.random() * 3)}; i++) fetch('/log', { method: 'POST', body: JSON.stringify({ at: Date.now() }) });</script><img src="/still.svg?v=${Math.random()}">` } : path === '/still.svg' ? { type: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' } : path === '/ping' ? { type: 'application/json', body: '{}' } : undefined));
}

test('a live third-party embed compares by what the page controls: its content, frames and subrequests are the third party\'s', async () => {
	const embed = await embedHost();
	const frame = (attrs: string, src = `${embed}/frame`) => html(`<p>Watch:</p><iframe src="${src}" ${attrs} title="Player"></iframe><p>After</p>`);
	const old = await serve(() => ({ body: frame('width="300" height="150" loading="lazy"') }));
	const same = await serve(() => ({ body: frame('width="300" height="150" loading="lazy"') }));
	const report = await check(old, same);
	assert.deepEqual(open(report.routes[0]!.failures), []);

	const resized = await serve(() => ({ body: frame('width="320" height="150" loading="lazy"') }));
	const eager = await serve(() => ({ body: frame('width="300" height="150"') }));
	const swapped = await serve(() => ({ body: frame('width="300" height="150" loading="lazy"', `${embed}/other`) }));
	const dropped = await serve(() => ({ body: html('<p>Watch:</p><p>After</p>') }));
	for (const [label, next, expected] of [
		['resized', resized, /^<iframe> http:\/\/127\.0\.0\.1:\d+\/frame 324x154 at \(\d+, \d+\) width="320" height="150" loading="lazy"/],
		['eager', eager, /^<iframe> http:\/\/127\.0\.0\.1:\d+\/frame 304x154 at \(\d+, \d+\) width="300" height="150" title="Player"$/],
		['swapped', swapped, /^<iframe> http:\/\/127\.0\.0\.1:\d+\/other 304x154/],
		['dropped', dropped, /^\(absent\)$/],
	] as const) {
		const route = (await check(old, next)).routes[0]!;
		const failure = route.failures.find((f) => f.check === 'embed #1 <iframe>');
		assert.ok(failure && !failure.accepted, `${label}: ${open(route.failures).join('\n')}`);
		assert.match(failure.actual, expected, label);
		assert.equal(route.ok, false, label);
	}
});

const toggling = (start: number, loop = true) =>
	html(
		`<div id="demo" class="demo">Toggle Demo</div><p id="clock">0</p>`,
		`<style>.demo { opacity: 1; transition: opacity 300ms ease-out; } .demo.faded { opacity: 0.3; }</style>${loop ? `<script>setTimeout(() => setInterval(() => { document.getElementById('demo').classList.toggle('faded'); const c = document.getElementById('clock'); c.textContent = String(Number(c.textContent) + 1); }, 250), ${start});</script>` : ''}`,
	);

test('a looping animation is captured at the same phase on both sides, and a port that drops the loop is red in motion', async () => {
	const old = await serve(() => ({ body: toggling(0) }));
	const shifted = await serve(() => ({ body: toggling(130) }));
	const report = await check(old, shifted);
	assert.deepEqual(open(report.routes[0]!.failures), []);

	const still = await serve(() => ({ body: toggling(0, false) }));
	const route = (await check(old, still)).routes[0]!;
	const lost = open(route.failures);
	assert.ok(lost.some((f) => /^motion: loop on generic "Toggle Demo".*\(no loop changes it\)$/.test(f)), lost.join('\n'));
	assert.ok(!lost.some((f) => /^(visual|css|rendered)/.test(f)), lost.join('\n'));
});

test('styles go out of the page interned, and come back as the same computed styles, each element with its tag position', async () => {
	const site = await serve(() => ({ body: html('<div><span>a</span><b>b</b><span style="color: rgb(1, 2, 3)">c</span></div>') }));
	const page = await browser.newPage();
	try {
		await page.goto(site);
		const { elements } = await readPage(page, { origin: site, full: true });
		const third = elements.find((e) => e.text === 'c')!;
		assert.equal(third.chain, 'html:1>body:1>main:1>div:1>span:2');
		assert.equal(third.style.color, 'rgb(1, 2, 3)');
		const direct = await page.evaluate(() => {
			const el = [...document.querySelectorAll('span')][1]!;
			const s = getComputedStyle(el);
			return Object.fromEntries([...s].filter((p) => !p.startsWith('--') && !['width', 'height', 'inline-size', 'block-size', 'transform-origin', 'perspective-origin'].includes(p)).map((p) => [p, s.getPropertyValue(p)]));
		});
		assert.deepEqual({ ...third.style }, direct);
		assert.ok(Object.isFrozen(third.style));
	} finally {
		await page.close();
	}
});

test('the old side is reused from the cache while nothing the old page loads has changed, and loaded again when a response changes', async () => {
	let title = 'Kept';
	const old = await serve((path) => (path === '/app.css' ? { type: 'text/css', body: 'h1 { color: rgb(0, 0, 0); }' } : { body: html(`<p>${title}</p>`, '<link rel="stylesheet" href="/app.css">') }));
	const next = await serve((path) => (path === '/app.css' ? { type: 'text/css', body: 'h1 { color: rgb(0, 0, 0); }' } : { body: html('<p>Kept</p>', '<link rel="stylesheet" href="/app.css">') }));
	const cacheDir = await mkdtemp(join(tmpdir(), 'mm-cache-'));
	const first = await check(old, next, { cacheDir });
	assert.equal(first.routes[0]!.ok, true, open(first.routes[0]!.failures).join('\n'));
	assert.deepEqual(first.cache, { hit: 0, miss: 2, changed: 0, 'stale-checker': 0 });
	const second = await check(old, next, { cacheDir });
	assert.equal(second.routes[0]!.ok, true);
	assert.equal(second.cache?.hit, 2, 'captures and journeys');
	assert.deepEqual(second.routes[0]!.failures.length, first.routes[0]!.failures.length);
	title = 'Changed';
	const third = await check(old, next, { cacheDir });
	assert.equal(third.cache?.changed, 2, 'the page changed: captured and explored again');
	assert.equal(third.routes[0]!.ok, false, 'and the change is seen');
});

test('a third-party widget gets the same answer on every load of a run, so its API rate limit cannot make one side differ, also against an old side from the cache', async () => {
	let calls = 0;
	// Like the GitHub star button: the first call answers, later ones are rate limited and the widget falls back.
	const api = await serve((path) => {
		if (path === '/widget.js') return { type: 'text/javascript', body: `fetch(new URL('/repo', document.currentScript.src)).then((r) => r.json()).then((d) => { document.getElementById('star').textContent = d.stars ? d.stars + ' stars' : 'Star (rate limited)'; });` };
		if (path === '/repo') return { type: 'application/json', body: JSON.stringify(++calls <= 1 ? { stars: 47_000 } : { message: 'API rate limit exceeded' }) };
		return undefined;
	});
	const page = html(`<p id="star">Star</p><script src="${api}/widget.js"></script>`);
	const old = await serve(() => ({ body: page }));
	const next = await serve(() => ({ body: page }));
	const cwd = await mkdtemp(join(tmpdir(), 'mm-widget-'));
	// Each run is its own process, as from the command line: the second shares nothing with the first but the cache.
	const run = () => new Promise<string>((done) => {
		const child = spawn(process.execPath, [join(import.meta.dirname, '../src/cli.ts'), 'check', '--old', old, '--new', next, '--route', '/', '--no-responsiveness', '--no-motion', '--journey-budget', '20'], { cwd });
		let out = '';
		child.stdout.on('data', (c) => (out += c));
		child.on('exit', () => done(out));
	});
	const first = await run();
	assert.match(first, /pass +\/ /, first);
	assert.equal(calls, 1, 'one fetch answered every load');
	const second = await run();
	assert.match(second, /Old side from the cache \(\.migrate\/cache\): 2 reused/, second);
	assert.match(second, /pass +\/ /, 'the new side read what the cached old side read, not the rate-limited answer');
	assert.equal(calls, 1);
});

// A top loading bar that fades out after the page's own short timers: at once on one app, after two 900 ms timers on the other.
const loadingBar = (wait: number) =>
	html(
		'<div id="bar" role="progressbar" aria-label="Loading" class="bar"></div><p>Body</p>',
		`<style>.bar { height: 4px; background: rgb(0, 0, 200); opacity: 1; transition: opacity 300ms linear; } .bar.done { opacity: 0; }</style><script>setTimeout(() => setTimeout(() => document.getElementById('bar').classList.add('done'), ${wait}), ${wait});</script>`,
	);

test('a fade the page load starts after its own short timers is waited out before capturing, on both sides', async () => {
	const old = await serve(() => ({ body: loadingBar(0) }));
	const late = await serve(() => ({ body: loadingBar(900) }));
	const route = (await check(old, late)).routes[0]!;
	assert.deepEqual(open(route.failures), []);
});

test('a page that keeps navigating while it is captured fails only its own route; the run goes on', async () => {
	// It reloads itself every 250 ms, and its lazy image never arrives, so a capture waiting on the image is cut off by a navigation.
	const site = await serve((path) => (path === '/jumpy' ? { body: `${html('<p style="height: 2000px">Jumpy</p><img src="/never.png" loading="lazy" width="10" height="10" alt="">')}<script>setTimeout(() => location.replace('/jumpy?n=' + Math.random()), 250)</script>` } : path === '/fine' ? { body: html('<p>Fine</p>') } : path === '/never.png' ? 'hang' : undefined));
	const report = await runCheck({ oldOrigin: site, newOrigin: site, routes: ['/jumpy', '/fine'], viewports: desktop, browser, journeys: { budgetMs: 5_000 } });
	const [jumpy, fine] = report.routes;
	assert.equal(fine!.ok, true, open(fine!.failures).join('\n'));
	assert.equal(jumpy!.ok, false);
	assert.match(jumpy!.failures[0]!.actual, /^it stopped: /);
	assert.equal(jumpy!.failures[0]!.check, 'the check of this route');
});

// A chart whose bars answer clicks but have no text or label, as chart libraries draw them.
const chart = (values: readonly string[]) =>
	html(`<figure><svg width="300" height="100">${values.map((_, i) => `<rect x="${i * 60}" y="10" width="40" height="80" fill="rgb(0, 0, 200)"></rect>`).join('')}</svg></figure><p id="picked">none</p><script>document.querySelectorAll('rect').forEach((r, i) => r.addEventListener('click', () => (document.getElementById('picked').textContent = ${JSON.stringify(values)}[i])));</script>`);

test('controls with no text or label are found again by structure and position, said in their names, and compared', async () => {
	const old = await serve(() => ({ body: chart(['North', 'South', 'East']) }));
	const same = await serve(() => ({ body: chart(['North', 'South', 'East']) }));
	const report = await check(old, same);
	const route = report.routes[0]!;
	assert.deepEqual(open(route.failures), []);
	const bars = route.coverage!.elements.filter((e) => e.element.startsWith('clickable <rect>'));
	assert.deepEqual(bars.map((e) => e.element), [1, 2, 3].map((n) => `clickable <rect> #${n} in main>figure>svg (no name: matched by structure and position)`));
	assert.ok(bars.every((e) => e.by), JSON.stringify(bars));

	const swapped = await serve(() => ({ body: chart(['North', 'East', 'South']) }));
	const red = (await check(old, swapped)).routes[0]!;
	assert.ok(open(red.failures).some((f) => /^behaviour: click clickable <rect> #2 in main>figure>svg \(no name: matched by structure and position\): /.test(f)), open(red.failures).join('\n'));
});

test('a file the new app does not answer at all (the connection times out) leaves the route not checked, not red for a missing file', async () => {
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64').toString('latin1');
	const old = await serve((path) => (path === '/a.png' ? { type: 'image/png', body: png } : path === '/' ? { body: html('<img src="/a.png" width="1" height="1" alt="dot">') } : undefined));
	const next = await serve((path) => (path === '/a.png' ? 'hang' : path === '/' ? { body: html('<img src="/a.png" width="1" height="1" alt="dot" loading="lazy" style="display: none">') } : undefined));
	const cwd = await mkdtemp(join(tmpdir(), 'mm-probe-'));
	const out = await new Promise<string>((done) => {
		const child = spawn(process.execPath, [join(import.meta.dirname, '../src/cli.ts'), 'check', '--old', old, '--new', next, '--route', '/', '--no-responsiveness', '--no-motion', '--journey-budget', '5'], { cwd, env: { ...process.env, MARKLESS_MIGRATE_REQUEST_TIMEOUT_MS: '1500' } });
		let text = '';
		child.stdout.on('data', (c) => (text += c));
		child.on('exit', () => done(text));
	});
	assert.match(out, /not checked/i, out);
	assert.doesNotMatch(out, /assets.*\/a\.png/, out);
});

// Content a helper's timer wrapper swaps in at the end of a short chain (as a fake server answering a lazy load does): at once on one app, after two 900 ms steps on the other.
const lazy = (wait: number) =>
	html(
		'<p id="graph">Loading...</p>',
		`<script>const later = (fn, ms) => setTimeout(function () { fn(); }, ms); later(() => later(() => later(() => (document.getElementById('graph').textContent = 'Tokyo Climate'), ${wait}), ${wait}), 0);</script>`,
	);

test('a chain of timers through one wrapper is waited out, not held as a loop: only code that keeps scheduling itself with the same delay is a loop', async () => {
	const old = await serve(() => ({ body: lazy(0) }));
	const slow = await serve(() => ({ body: lazy(900) }));
	const route = (await check(old, slow)).routes[0]!;
	assert.deepEqual(open(route.failures), []);
});

test('a third-party file that fails for the old page too (a rate limit answering both) is not the port\'s missing file', async () => {
	const api = await serve(() => undefined);
	const page = html(`<p>Stars</p><script src="${api}/repos/x?callback=_"></script>`);
	const old = await serve(() => ({ body: page }));
	const next = await serve(() => ({ body: page }));
	const route = (await check(old, next)).routes[0]!;
	assert.deepEqual(open(route.failures).filter((f) => f.startsWith('assets')), []);
});

test('an embed a widget draws inside an open shadow root is the same embed, masked and compared like one in the page', async () => {
	const embed = await embedHost();
	const attrs = `src="${embed}/frame" width="300" height="150" title="Player"`;
	const old = await serve(() => ({ body: html(`<p>Watch:</p><span id="host" style="display: inline-block"><iframe ${attrs}></iframe></span><p>After</p>`) }));
	const shadowed = await serve(() => ({ body: html(`<p>Watch:</p><span id="host" style="display: inline-block"></span><p>After</p><script>document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<iframe ${attrs}></iframe>';</script>`) }));
	const route = (await check(old, shadowed)).routes[0]!;
	assert.deepEqual(open(route.failures).filter((f) => /^(visual|rendered: embed|network|weight)/.test(f)), []);
});

// A poll (htmx's `every 1s`): each run schedules the next with the same delay and sets the colour from a separate short timer (a fake server answering); a click starts a fade of its own.
const polling = (offset: number, fade = 1500) =>
	html(
		'<div id="demo">Color Swap Demo</div><button id="go">Go</button><p id="out">Ready</p>',
		`<style>#demo { color: rgb(255, 0, 0); transition: color 1s ease-in; } #out { opacity: 1; transition: opacity ${fade}ms linear; } #out.dim { opacity: 0.4; }</style><script>addEventListener('DOMContentLoaded', () => { const demo = document.getElementById('demo'); const colors = ['rgb(0, 128, 0)', 'rgb(255, 165, 0)']; let n = 0; const poll = () => setTimeout(function () { setTimeout(() => (demo.style.color = colors[n++ % 2]), 80); poll(); }, 1000); setTimeout(poll, ${offset}); document.getElementById('go').onclick = () => document.getElementById('out').classList.add('dim'); });</script>`,
	);

test('a poll is held at the same phase on both sides before an interaction is recorded, whatever its phase at load', async () => {
	const { openPage } = await import('../src/check/browser.ts');
	const { settleAndHoldLoops } = await import('../src/check/loops.ts');
	const { motionEnv } = await import('../src/check/motion.ts');
	const colours: string[] = [];
	for (const offset of [0, 900]) {
		const site = await serve(() => ({ body: polling(offset) }));
		const { context, page } = await openPage(browser, motionEnv(defaultEnv(site), false), desktop[0]!, { loops: true });
		try {
			await page.goto(site);
			await settleAndHoldLoops(page);
			const before = await page.evaluate(() => getComputedStyle(document.getElementById('demo')!).color);
			const moved = await page.evaluate(
				() =>
					new Promise<number>((done) => {
						let n = 0;
						addEventListener('transitionrun', () => n++, true);
						new MutationObserver((r) => (n += r.length)).observe(document.getElementById('demo')!, { attributes: true });
						setTimeout(() => done(n), 2500);
					}),
			);
			assert.equal(moved, 0, `offset ${offset}: the poll ran after it was held`);
			colours.push(before);
		} finally {
			await context.close();
		}
	}
	assert.equal(colours[0], colours[1], 'both loads are held after the same number of polls');
});

test('a poll at another phase on the new page moves nothing during an interaction, and the interaction\'s own different fade stays red', async () => {
	const old = await serve(() => ({ body: polling(0) }));
	const late = await serve(() => ({ body: polling(900) }));
	const same = await check(old, late, { motion: { maxHovers: 0, maxInteractions: 3 }, journeys: { budgetMs: 8_000 } });
	assert.deepEqual(open(same.routes[0]!.failures).filter((f) => f.startsWith('motion')), []);
	const quicker = await serve(() => ({ body: polling(900, 500) }));
	const red = open((await check(old, quicker, { motion: { maxHovers: 0, maxInteractions: 3 }, journeys: { budgetMs: 8_000 } })).routes[0]!.failures);
	assert.ok(red.some((f) => /^motion: click button "Go".*opacity/.test(f)), red.join('\n'));
});

test('a frame is one stop in the focus order: Tab goes on past it however many stops its own document has', async () => {
	let n = 0;
	const embed = await serve((path) => (path === '/w' ? { body: `<!doctype html><body>${n++ % 2 ? '<a href="#s">Star</a>' : '<a href="#s">Star</a> <a href="#c">12,345</a>'}` } : undefined));
	const page = (after: boolean) => html(`<p><a href="#a">Before</a></p><iframe src="${embed}/w" title="Widget" width="200" height="40"></iframe>${after ? '<p><a href="#b">After</a></p>' : ''}`);
	const old = await serve(() => ({ body: page(true) }));
	const same = await serve(() => ({ body: page(true) }));
	assert.deepEqual(open((await check(old, same)).routes[0]!.failures).filter((f) => f.startsWith('a11y')), []);
	const dropped = await serve(() => ({ body: page(false) }));
	const red = open((await check(old, dropped)).routes[0]!.failures);
	assert.ok(red.some((f) => /^a11y: focus order/.test(f)), red.join('\n'));
});

test('an embed\'s data from a third party is one answer per run, and the new page gets the answer a cached old capture read, not a later one', async () => {
	let calls = 0;
	const api = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }).end(++calls <= 1 ? '1' : '1234567'));
	servers.push(api);
	const apiOrigin = await new Promise<string>((done) => api.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(api.address() as AddressInfo).port}`)));
	const embed = await serve((path) => (path === '/w' ? { body: `<!doctype html><body><span id="c"></span><script>fetch('${apiOrigin}/repos/x').then((r) => r.text()).then((t) => { document.getElementById('c').textContent = t; parent.postMessage(t.length, '*'); });</script>` } : undefined));
	const page = html(`<p>Stars</p><iframe id="f" src="${embed}/w" title="Count" style="width: 50px; height: 20px"></iframe>`, `<script>addEventListener('message', (e) => (document.getElementById('f').style.width = 20 + 10 * e.data + 'px'));</script>`);
	const old = await serve(() => ({ body: page }));
	const next = await serve(() => ({ body: page }));
	const cacheDir = await mkdtemp(join(tmpdir(), 'mm-cache-'));
	assert.deepEqual(open((await check(old, next, { cacheDir })).routes[0]!.failures), []);
	assert.equal(calls, 1, 'every load of the run, old and new, got the one answer');
	const again = await check(old, next, { cacheDir });
	assert.equal(again.cache?.changed, 0, JSON.stringify(again.cache));
	assert.deepEqual(open(again.routes[0]!.failures), []);
	assert.equal(calls, 1, 'the new page read what the cached old page read');
});

test('a video is not painted while a masked screenshot is taken, so a frame drawn off its box cannot differ outside the mask, and its own style comes back after', async () => {
	const { maskedShot } = await import('../src/check/embeds.ts');
	const site = await serve(() => ({ body: html('<video controls style="visibility: visible; width: 200px; height: 100px"></video><iframe src="about:blank" title="x"></iframe>') }));
	const page = await browser.newPage();
	try {
		await page.goto(site);
		const during: string[] = [];
		const { embeds } = await maskedShot(page, async () => {
			during.push(await page.evaluate(() => getComputedStyle(document.querySelector('video')!).visibility));
			return Buffer.alloc(0);
		});
		assert.deepEqual([during, embeds.map((e) => e.tag)], [['hidden'], ['video']]);
		assert.deepEqual(await page.evaluate(() => [document.querySelector('video')!.getAttribute('style'), document.querySelectorAll('[data-markless-migrate-embed]').length]), ['visibility: visible; width: 200px; height: 100px;', 0]);
	} finally {
		await page.close();
	}
});

test('motion that differs once on the new page and not when it is recorded again is not red; a difference both recordings show is', async () => {
	const { checkMotion } = await import('../src/check/motion.ts');
	const page = (fade: boolean) => html('<button id="go">Go</button><p id="out">Ready</p>', `<style>#out { opacity: 1; ${fade ? 'transition: opacity 400ms linear;' : ''} } #out.dim { opacity: 0.4; }</style><script>addEventListener('DOMContentLoaded', () => (document.getElementById('go').onclick = () => document.getElementById('out').classList.add('dim')));</script>`);
	const old = await serve(() => ({ body: page(false) }));
	// Loads of the new page in checkMotion: one to learn its loops, then the recording, then the recording again.
	let loads = 0;
	const once = await serve(() => ({ body: page(++loads === 2) }));
	const always = await serve(() => ({ body: page(true) }));
	const journey = { name: 'click button "Go"', steps: [{ action: 'click' as const, target: { role: 'button', name: 'Go', nth: 0 } }], expected: [{ url: '/', navigated: false, added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'button "Go"', storage: [] }] };
	const run = (next: string) => checkMotion(browser, { old: defaultEnv(old), new: defaultEnv(next) }, '/', desktop[0]!, [journey] as never, { maxHovers: 0 });
	const flaky = await run(once);
	assert.ok(loads >= 3, `the new page was recorded again (${loads} loads)`);
	assert.deepEqual(flaky.failures.map((f) => f.check), []);
	const red = await run(always);
	assert.ok(red.failures.some((f) => /click button "Go"/.test(f.check) && /opacity/.test(f.actual)), JSON.stringify(red.failures));
});

test('what a poll\'s own follow-up timer changed is undone with the poll when it is held, so a page captured at another phase of it looks the same', async () => {
	const { openPage } = await import('../src/check/browser.ts');
	const { holdLoops } = await import('../src/check/loops.ts');
	const colours: string[] = [];
	for (const wait of [1300, 2300]) {
		const site = await serve(() => ({ body: polling(0) }));
		const { context, page } = await openPage(browser, defaultEnv(site), desktop[0]!, { loops: true });
		try {
			await page.goto(site);
			await page.waitForTimeout(wait);
			await page.evaluate(holdLoops);
			colours.push(await page.evaluate(() => document.getElementById('demo')!.style.color));
		} finally {
			await context.close();
		}
	}
	assert.deepEqual(colours, ['', ''], 'the colour each poll\'s answer set is undone');
});

test('a style pointing at a gradient, filter or marker by a generated id compares by where that element is, so React useId ids do not differ, but pointing at another element does', async () => {
	const svg = (id: string, use = id) => `<svg width="40" height="40"><defs><linearGradient id="${id}"><stop offset="0" stop-color="red"></stop></linearGradient><linearGradient id="${id}-other"><stop offset="0" stop-color="blue"></stop></linearGradient></defs><rect width="40" height="40" fill="url(#${use})"></rect></svg>`;
	const read = async (body: string) => {
		const site = await serve(() => ({ body: html(body) }));
		const page = await browser.newPage();
		await page.goto(site);
		const read = await readPage(page, { origin: site, full: true });
		await page.close();
		return read.elements.find((e) => e.tag === 'rect')!.style.fill;
	};
	const react = await read(svg('_R_17htldeh_'));
	assert.equal(react, await read(svg('mm-mastodon-1')));
	assert.notEqual(react, await read(svg('mm-mastodon-1', 'mm-mastodon-1-other')));
});

test('a held loop scheduling a bound method stays held, and a frame callback scheduled after the hold still runs (Rive draws with requestAnimationFrame(this.draw.bind(this)); the checker waits on requestAnimationFrame(resolve), and both read as native code)', async () => {
	const { openPage } = await import('../src/check/browser.ts');
	const { holdLoops } = await import('../src/check/loops.ts');
	const site = await serve(() => ({ body: html('<p id="n">0</p><script>class R { n = 0; draw() { document.getElementById("n").textContent = String(++this.n); requestAnimationFrame(this.draw.bind(this)); } } new R().draw();</script>') }));
	const { context, page } = await openPage(browser, defaultEnv(site), desktop[0]!, { loops: true });
	try {
		await page.goto(site);
		await page.waitForTimeout(300);
		assert.equal(await page.evaluate(holdLoops), 1);
		const frames = await Promise.race([page.evaluate(() => new Promise<string>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done('ran'))))), new Promise<string>((done) => setTimeout(() => done('never ran'), 3000))]);
		assert.equal(frames, 'ran');
		const native = await Promise.race([page.evaluate(() => new Promise((done) => requestAnimationFrame(done)).then(() => 'ran')), new Promise<string>((done) => setTimeout(() => done('never ran'), 3000))]);
		assert.equal(native, 'ran');
		const shown = await page.evaluate(() => document.getElementById('n')!.textContent);
		await page.waitForTimeout(300);
		assert.equal(await page.evaluate(() => document.getElementById('n')!.textContent), shown, 'the loop drew nothing after it was held');
	} finally {
		await context.close();
	}
});

test('--journey-depth lets exploring go past four steps, so a link revealed by a fourth click (categories nested four deep) is used', async () => {
	const nested = (n: number): string => (n === 0 ? '<a href="#deep">Deepest link</a>' : `<div><button type="button" onclick="this.nextElementSibling.hidden=false">Level ${n}</button><div hidden>${nested(n - 1)}</div></div>`);
	const site = await serve(() => ({ body: html(nested(4)) }));
	const reach = async (maxDepth?: number) => (await explore(browser, defaultEnv(site), '/', desktop[0]!, { budgetMs: 30_000, ...(maxDepth ? { maxDepth } : {}) })).elements.find((e) => e.element.startsWith('link "Deepest link"'));
	assert.match((await reach())?.reason ?? '', /deeper than check explores: raise --journey-depth/);
	assert.ok((await reach(5))?.by, 'used by a journey at depth 5');
});

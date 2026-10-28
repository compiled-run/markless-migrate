import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { compareJourneys, explore, replayAll } from '../src/check/journeys.ts';
import { runCheck } from '../src/check/run.ts';
import { summarize } from '../src/check/summary.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A disclosure button; on the port its click handler holds the main thread past the 1.5 s a click may take to be acknowledged, as a busy runner can.
const page = (busyMs: number) =>
	`<!doctype html><html lang="en"><head><title>Menu</title></head><body><nav aria-label="Main"><button aria-expanded="false" aria-controls="more">More</button><ul id="more" hidden><li><a href="/a">Wholesale</a></li></ul></nav><script>
	const button = document.querySelector('button');
	button.addEventListener('click', () => {
		const open = button.getAttribute('aria-expanded') !== 'true';
		button.setAttribute('aria-expanded', String(open));
		document.getElementById('more').hidden = !open;
		const start = performance.now();
		while (performance.now() - start < ${busyMs});
	});
	</script></body></html>`;

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		const side = new URL(req.url ?? '/', 'http://x').pathname;
		if (side === '/old' || side === '/new') return res.writeHead(200, { 'content-type': 'text/html' }).end(page(side === '/new' ? 2_500 : 0));
		return res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser?.close();
	server?.close();
});

test('a click the page acknowledges after the click timeout has landed: it is not sent again, so a toggle opens once', async () => {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const viewport = VIEWPORTS[0]!;
	const { journeys } = await explore(browser, defaultEnv(origin), '/old', viewport);
	const olds = [await replayAll(browser, defaultEnv(origin), '/old', viewport, journeys)];
	const next = await replayAll(browser, defaultEnv(origin), '/new', viewport, journeys);
	const failures = compareJourneys('/', olds, journeys, next);
	assert.deepEqual(failures.filter((f) => f.actual.startsWith('nothing changed on the port')).map((f) => `${f.check}: ${f.actual}`), []);
});

test('the widget probe sends a click the page acknowledged late only once: the menu answers as on the original', async () => {
	const serve = (busyMs: number) =>
		new Promise<Server>((done) => {
			const s = createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(page(busyMs)) : res.writeHead(404).end()));
			s.listen(0, '127.0.0.1', () => done(s));
		});
	const [fast, slow] = await Promise.all([serve(0), serve(2_500)]);
	try {
		const at = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
		const report = await runCheck({ oldOrigin: at(fast), newOrigin: at(slow), routes: ['/'], browser, probes: {} });
		const probe = report.routes.flatMap((r) => r.failures).filter((f) => /probe/.test(f.check));
		assert.deepEqual(probe.map((f) => `${f.check}: ${f.actual}`), [], summarize(report));
	} finally {
		fast.close();
		slow.close();
	}
});

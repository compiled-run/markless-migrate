import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { bypassForOrigins, startChromium } from '../src/check/load.ts';

// The app answers only with the token; a third-party host the page loads must never see it.
test("the load browser sends an app's bypass token to that app's origin alone", async () => {
	const seen: { host: string; path: string; headers: IncomingHttpHeaders }[] = [];
	const third = createServer((req, res) => {
		seen.push({ host: 'third', path: req.url ?? '', headers: req.headers });
		res.setHeader('content-type', 'image/svg+xml');
		res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
	});
	await new Promise<void>((done) => third.listen(0, '127.0.0.1', done));
	const thirdOrigin = `http://127.0.0.1:${(third.address() as AddressInfo).port}`;
	const app = createServer((req, res) => {
		seen.push({ host: 'app', path: req.url ?? '', headers: req.headers });
		if (req.headers['x-bypass'] !== 'secret' || !/session=on/.test(req.headers.cookie ?? '')) return void res.writeHead(403).end('challenge');
		if (req.url === '/app.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end('document.title = "ran"');
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<p>app</p><script src="/app.js"></script><img src="${thirdOrigin}/pixel.svg">`);
	});
	await new Promise<void>((done) => app.listen(0, 'localhost', done));
	const appOrigin = `http://localhost:${(app.address() as AddressInfo).port}`;
	const browser = await startChromium();
	const stop = await bypassForOrigins(browser.port, { origins: [appOrigin], headers: { 'x-bypass': 'secret' }, cookies: [{ name: 'session', value: 'on' }] });
	try {
		const { webSocketDebuggerUrl } = (await (await fetch(`http://127.0.0.1:${browser.port}/json/version`)).json()) as { webSocketDebuggerUrl: string };
		const socket = new WebSocket(webSocketDebuggerUrl);
		await new Promise((done) => socket.addEventListener('open', done, { once: true }));
		// As Lighthouse does: a new blank page, then a navigation in it.
		const replies = new Map<number, any>();
		socket.addEventListener('message', (event) => {
			const m = JSON.parse(String(event.data));
			if (m.id) replies.set(m.id, m.result);
		});
		const call = async (id: number, method: string, params: object, sessionId?: string) => {
			socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
			while (!replies.has(id)) await new Promise((done) => setTimeout(done, 10));
			return replies.get(id);
		};
		const { targetId } = await call(1, 'Target.createTarget', { url: 'about:blank' });
		const { sessionId } = await call(2, 'Target.attachToTarget', { targetId, flatten: true });
		await call(3, 'Page.navigate', { url: `${appOrigin}/` }, sessionId);
		const deadline = Date.now() + 15_000;
		while (Date.now() < deadline && !(seen.some((s) => s.path === '/app.js') && seen.some((s) => s.host === 'third'))) await new Promise((done) => setTimeout(done, 50));
		socket.close();
		// Chromium may also ask the app for /favicon.ico, on its own schedule: an app request like the others.
		const fromApp = seen.filter((s) => s.host === 'app');
		assert.deepEqual(fromApp.filter((s) => s.path !== '/favicon.ico').map((s) => [s.path, s.headers['x-bypass']]), [['/', 'secret'], ['/app.js', 'secret']]);
		assert.ok(fromApp.every((s) => s.headers['x-bypass'] === 'secret'), 'every request to the app carries its token');
		const fromThird = seen.filter((s) => s.host === 'third');
		assert.equal(fromThird.length, 1, 'the third-party image was loaded');
		assert.equal(fromThird[0]!.headers['x-bypass'], undefined);
		assert.doesNotMatch(fromThird[0]!.headers.cookie ?? '', /session/);
	} finally {
		stop();
		await browser.close();
		app.close();
		third.close();
	}
});

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { compareLogin } from '../src/check/auth.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// The page remembers the theme and a cart, opens a database, and remembers that the banner was dismissed.
function app(keys: { session: string; dismissed: string; store: string }): Promise<Server> {
	const page = `<!doctype html><html lang="en"><title>Shop</title><main><h1>Shop</h1><button type="button" onclick="localStorage.setItem('${keys.dismissed}', '1')">Dismiss</button></main>
<script>localStorage.setItem('theme', 'dark'); sessionStorage.setItem('${keys.session}', '[]'); const open = indexedDB.open('shop', 1); open.onupgradeneeded = () => open.result.createObjectStore('${keys.store}');</script>`;
	const server = createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'visit=1; Path=/; SameSite=Lax' }).end(page) : res.writeHead(404).end()));
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
let old: Server;
let same: Server;
let renamed: Server;
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
before(async () => {
	browser = await chromium.launch();
	[old, same, renamed] = await Promise.all([app({ session: 'cart', dismissed: 'seen-banner', store: 'products' }), app({ session: 'cart', dismissed: 'seen-banner', store: 'products' }), app({ session: 'basket', dismissed: 'seenBanner', store: 'items' })]);
});
after(async () => {
	await browser?.close();
	for (const s of [old, same, renamed]) s?.close();
});

const check = (next: Server) => runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser });

test('the keys a page keeps in the browser after loading and after each step are compared', async () => {
	const report = await check(renamed);
	const failures = report.routes[0]!.failures.filter((f) => /storage|kept in the browser/.test(`${f.check} ${f.expected}`));
	const load = failures.find((f) => f.check === 'browser storage after the page loads');
	assert.ok(load, report.routes[0]!.failures.map((f) => f.check).join('\n'));
	assert.equal(load!.dimension, 'behaviour');
	assert.match(load!.actual, /missing indexedDB shop\/products, sessionStorage cart; extra indexedDB shop\/items, sessionStorage basket/);
	const step = report.routes[0]!.failures.find((f) => f.check === 'click button "Dismiss"');
	assert.match(step!.expected, /kept in the browser: cookie visit SameSite=Lax session, indexedDB shop\/products, localStorage seen-banner, localStorage theme, sessionStorage cart/);
	assert.match(step!.actual, /localStorage seenBanner/);
});

test('an app that keeps the same keys has no storage failure', async () => {
	const report = await check(same);
	assert.deepEqual(report.routes[0]!.failures.filter((f) => /storage/.test(f.check) || /kept in the browser/.test(f.expected)), []);
});

test("signing in compares the local storage keys each app leaves, as part of the role's sign-in", () => {
	const state = (origin: string, names: string[]) => ({ cookies: [], origins: [{ origin, localStorage: names.map((name) => ({ name, value: 'x' })) }] });
	const login = compareLogin('member', '/login', state('http://old.test', ['jwtToken']), state('http://new.test', ['token']), 'http://old.test', 'http://new.test');
	assert.deepEqual(login.failures.map((f) => [f.dimension, f.check, f.actual]), [['auth', 'browser storage after signing in as member', 'missing localStorage jwtToken; extra localStorage token']]);
});

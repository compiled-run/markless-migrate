import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { signIn } from '../src/check/auth.ts';
import { defaultEnv } from '../src/check/browser.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';
import { lanAddress } from './e2e/harness.ts';

interface Site {
	readonly server: Server;
	readonly origin: string;
	readonly log: string[];
}

// Signing in posts the form and sets the session cookie; /account turns away a visitor without it.
function site(host: string, options: { hangFirstLogin?: boolean } = {}): Promise<Site> {
	const log: string[] = [];
	let logins = 0;
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		log.push(`${req.method} ${path}`);
		const signedIn = /(?:^|; )sid=ok/.test(req.headers.cookie ?? '');
		const html = (body: string) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html lang="en"><title>Shop</title><main>${body}</main>`);
		if (path === '/login' && req.method === 'GET') {
			if (options.hangFirstLogin && logins++ === 0) return;
			return html('<h1>Sign in</h1><form method="post" action="/session"><label>Email <input name="email"></label><button>Sign in</button></form>');
		}
		if (path === '/session' && req.method === 'POST') return void res.writeHead(303, { location: '/account', 'set-cookie': 'sid=ok; Path=/; HttpOnly' }).end();
		if (path === '/account') return signedIn ? html('<h1>Your account</h1>') : void res.writeHead(303, { location: '/login' }).end();
		html('<h1>Home</h1>');
	});
	return new Promise((done) => server.listen(0, host, () => done({ server, origin: `http://${host}:${(server.address() as AddressInfo).port}`, log })));
}

let browser: Browser;
const sites: Site[] = [];
const open = async (host: string, options?: Parameters<typeof site>[1]) => {
	const s = await site(host, options);
	sites.push(s);
	return s;
};
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of sites) {
		s.server.closeAllConnections();
		s.server.close();
	}
});

const login = [{ goto: '/login' }, { fill: { label: 'Email' }, value: 'ada@example.com' }, { click: { role: 'button', name: 'Sign in' } }, { wait: '!/login' }] as const;

test('against deployments, where every other write is held back, the auth file\'s login steps still post and sign in', async () => {
	const host = lanAddress();
	const [old, next] = await Promise.all([open(host), open(host)]);
	const report = await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/account'], viewports: [VIEWPORTS[0]!], browser, auth: { dir: '.', loginRoute: '/login', roles: { member: { login } } } });
	assert.equal(report.writes, 'held back');
	assert.deepEqual(report.logins?.map((l) => [l.role, l.ok]), [['member', true]]);
	for (const s of [old, next]) assert.ok(s.log.includes('POST /session'), s.log.join(', '));
	const member = report.routes.find((r) => r.role === 'member')!;
	assert.deepEqual(member.failures.filter((f) => f.dimension === 'auth'), []);
	assert.equal(member.dimensions.rendered, 'pass', 'the signed-in page was compared, not the login page it would redirect to');
});

test('a login the network fails once (a cold deployment) is run again after a backoff', async () => {
	const cold = await open('127.0.0.1', { hangFirstLogin: true });
	const state = await signIn(browser, defaultEnv(cold.origin), 'old', 'member', { login }, '.', { stepTimeout: 800, backoffMs: 100 });
	assert.deepEqual(state.cookies.map((c) => c.name), ['sid']);
	assert.equal(cold.log.filter((l) => l === 'GET /login').length, 2);
});

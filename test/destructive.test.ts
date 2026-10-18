import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Report } from '../src/check/types.ts';
import { lanAddress } from './e2e/harness.ts';

interface Notes {
	readonly server: Server;
	readonly origin: string;
	/** Every request that reached the server, `METHOD /path`, in order. */
	readonly log: string[];
	readonly sessions: Set<string>;
	/** Session tokens in the order they were issued. */
	readonly issued: string[];
}

// A notes page: a note with a Delete button that asks first, a Sign Out form, a Log out link, and a harmless Wave button.
// Sessions live on the server, so signing out ends that session for every browser holding its cookie.
function notes(options: { host?: string; name?: string; deletePath?: string; confirm?: boolean } = {}): Promise<Notes> {
	const log: string[] = [];
	const sessions = new Set<string>();
	const issued: string[] = [];
	const deletePath = options.deletePath ?? '/api/notes/1';
	const ask = options.confirm === false ? 'true' : "confirm('Delete this note?')";
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		log.push(`${req.method} ${url.pathname}`);
		const sid = /(?:^|; )sid=([\w-]+)/.exec(req.headers.cookie ?? '')?.[1];
		const who = sid && sessions.has(sid) ? 'signed in as Ada' : 'signed out';
		if (req.method === 'POST' && url.pathname === '/session') {
			const token = randomUUID();
			sessions.add(token);
			issued.push(token);
			return void res.writeHead(303, { location: '/', 'set-cookie': `sid=${token}; Path=/; HttpOnly` }).end();
		}
		if ((req.method === 'POST' && url.pathname === '/logout') || url.pathname === '/signout') {
			if (sid) sessions.delete(sid);
			return void res.writeHead(303, { location: '/', 'set-cookie': 'sid=; Path=/; Max-Age=0' }).end();
		}
		if (req.method === 'DELETE') return void res.writeHead(204).end();
		if (url.pathname === '/login') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html lang="en"><title>Sign in</title><main><h1>Sign in</h1><form method="post" action="/session"><button>Sign in</button></form></main>');
		if (url.pathname === '/' || url.pathname === '/other') {
			const page = url.pathname === '/'
				? `<ul><li id="n1">Groceries <button onclick="if (${ask}) fetch('${deletePath}', { method: 'DELETE' }).then(() => document.getElementById('n1').remove())">Delete note</button></li></ul>
<button onclick="document.getElementById('who').textContent += '!'">Wave</button>
<form method="post" action="/logout"><button>Sign Out</button></form>
<a href="/signout">Log out</a>`
				: '';
			return void res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html lang="en"><title>Notes</title><main><h1>Notes</h1><p id="who">${who}</p>${page}</main>`);
		}
		res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
	});
	const host = options.host ?? '127.0.0.1';
	return new Promise((done) => server.listen(0, host, () => done({ server, origin: `http://${options.name ?? host}:${(server.address() as AddressInfo).port}`, log, sessions, issued })));
}

let browser: Browser;
const opened: Notes[] = [];
const app = async (options?: Parameters<typeof notes>[0]) => {
	const n = await notes(options);
	opened.push(n);
	return n;
};
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const n of opened) {
		n.server.closeAllConnections();
		n.server.close();
	}
});

const check = (old: Notes, next: Notes, extra: Partial<Parameters<typeof runCheck>[0]> = {}) => runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, ...extra });
const element = (report: Report, name: string, role = report.routes[0]!.role) => report.routes.find((r) => r.role === role)!.coverage!.elements.find((e) => e.element.startsWith(name))!;
const open = (report: Report) => report.routes.flatMap((r) => r.failures).filter((f) => !f.accepted).map((f) => `${f.check}: ${f.actual}`);

test('on this machine, Sign Out, Delete and a log-out link are pressed for real, last, and count as exercised', async () => {
	const [old, next] = await Promise.all([app(), app()]);
	const report = await check(old, next);
	assert.deepEqual(open(report), []);
	for (const name of ['button "Sign Out"', 'button "Delete note"', 'link "Log out"']) assert.ok(element(report, name).by, `${name} exercised`);
	assert.equal(report.routes[0]!.coverage!.exercised, report.routes[0]!.coverage!.total);
	// /signout is not switched, so the front door sends the new side's click on it to the old app.
	assert.equal(old.log.filter((l) => l === 'GET /signout').length, 2);
	assert.ok(!next.log.includes('GET /signout'));
	for (const side of [old, next]) {
		assert.ok(side.log.includes('POST /logout') && side.log.includes('DELETE /api/notes/1'), side.log.join(', '));
		const firstRisky = side.log.findIndex((l) => /POST \/logout|DELETE|\/signout/.test(l));
		assert.ok(side.log.slice(firstRisky).every((l) => /POST \/logout|DELETE|\/signout|GET \/$/.test(l)), `nothing but destructive journeys after the first: ${side.log.slice(firstRisky).join(', ')}`);
	}
	const deleting = report.routes[0]!.journeys!.find((j) => j.name === 'click button "Delete note"')!;
	assert.deepEqual(deleting.expected[0]!.dialogs, ['confirm: Delete this note?']);
	assert.deepEqual(deleting.expected[0]!.requests, ['DELETE /api/notes/1']);
});

test('a changed delete request or a missing confirm dialog is a difference', async () => {
	const [old, next] = await Promise.all([app(), app({ deletePath: '/api/note/1', confirm: false })]);
	const [f] = (await check(old, next)).routes[0]!.failures.filter((f) => f.check === 'click button "Delete note"');
	assert.match(f!.expected, /requests: DELETE \/api\/notes\/1/);
	assert.match(f!.actual, /requests: DELETE \/api\/note\/1/);
	assert.match(f!.expected, /dialogs: confirm: Delete this note\?/);
	assert.match(f!.actual, /dialogs: \(none\)/);
});

test('elsewhere every request they make is held back and compared as what it would send, and they still count as exercised', async () => {
	const host = lanAddress();
	const [old, next] = await Promise.all([app({ host }), app({ host })]);
	const report = await check(old, next);
	assert.equal(report.writes, 'held back');
	assert.deepEqual(open(report), []);
	for (const side of [old, next]) assert.deepEqual(side.log.filter((l) => !l.startsWith('GET /') || l === 'GET /signout'), [], 'nothing destructive reached the app');
	assert.match(element(report, 'button "Sign Out"').by!, /held back and compared unsent: would POST \/logout/);
	assert.match(element(report, 'button "Delete note"').by!, /held back and compared unsent: would DELETE \/api\/notes\/1/);
	assert.match(element(report, 'link "Log out"').by!, /held back and compared unsent: would GET \/signout/);
});

test('a signed-in role signs in afresh for each journey that signs out, so the shared session still works for every later journey and route', async () => {
	// Different host names, so the old session's cookie goes only to the old app, also when the front door sends a new page's link there.
	const [old, next] = await Promise.all([app(), app({ name: 'localhost' })]);
	const auth = { dir: '.', loginRoute: '/login', roles: { member: { login: [{ goto: '/login' }, { click: { role: 'button', name: 'Sign in' } }, { wait: '!/login' }] } } };
	const report = await check(old, next, { routes: ['/', '/other'], auth });
	assert.deepEqual(open(report), []);
	const other = report.routes.find((r) => r.route === '/other' && r.role === 'member')!;
	assert.ok(other.ok);
	for (const side of [old, next]) {
		assert.ok(side.log.filter((l) => l === 'POST /session').length >= 3, `signed in once for the role and again per sign-out journey: ${side.log.join(', ')}`);
		assert.ok(side.sessions.has(side.issued[0]!), "the role's own session was never ended");
	}
});

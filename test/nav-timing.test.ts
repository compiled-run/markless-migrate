import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { measureNavTiming } from '../src/check/nav-timing.ts';
import { navRows, navTimingFailures, navTimingUnmeasured } from '../src/check/nav-timing-verdicts.ts';

// In-place routers over the same pages, each page's data 150 ms from the server. Every page has the same site title in an
// <h1>: the content that changes is the main landmark. `ahead` fetches a page when its link is hovered and keeps it;
// `plain` fetches only on the click and keeps nothing; `stuck` changes the address and never the content.
type Kind = 'ahead' | 'plain' | 'stuck' | 'spent';
const router = (kind: Kind) => `
${kind === 'spent' ? "performance.mark('test:budget-spent', { detail: { page: location.pathname, bytes: 3000000 } }); const mark = () => performance.mark('test:budget-spent', { detail: { page: location.pathname, bytes: 3000000 } }); const push = history.pushState.bind(history); history.pushState = (...a) => { push(...a); mark(); };" : ''}
const kept = new Map();
const ahead = ${kind === 'ahead'};
const data = (path) => { const hit = ahead && kept.get(path); if (hit) return hit; const p = fetch(path + '.data').then((r) => r.json()); if (ahead) kept.set(path, p); return p; };
if (ahead) document.addEventListener('mouseover', (e) => { const a = e.target.closest('a[href]'); if (a) data(new URL(a.href).pathname); });
document.addEventListener('click', async (e) => {
	const a = e.target.closest('a[href]');
	if (!a) return;
	e.preventDefault();
	const page = await data(new URL(a.href).pathname);
	history.pushState(null, '', a.href);
	if (${kind !== 'stuck'}) document.querySelector('main').innerHTML = '<h2>' + page.title + '</h2><p>' + page.title + ' body</p>';
});`;

function site(kind: Kind): Server {
	return createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path.endsWith('.data')) return void setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ title: path.slice(1, -5) })), 150);
		const links = ['alpha', 'beta', 'gamma'].map((n) => `<li><a href="/${n}">${n}</a></li>`).join('');
		const name = path.slice(1) || 'home';
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><body><header><h1>Site</h1></header><aside><ul>${links}</ul></aside><main><h2>${name}</h2><p>${name} body</p></main><script>${router(kind)}</script></body></html>`);
	});
}

const servers = new Map<string, Server>();
const origin: Record<string, string> = {};
before(async () => {
	for (const [name, kind] of [['ahead', 'ahead'], ['ahead2', 'ahead'], ['plain', 'plain'], ['stuck', 'stuck'], ['spent', 'spent']] as const) {
		const server = site(kind);
		await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
		servers.set(name, server);
		origin[name] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	}
});
after(() => {
	for (const s of servers.values()) {
		s.closeAllConnections();
		s.close();
	}
});

const cells = [{ browser: 'chromium', profile: 'fast', mode: 'dwell-250' }] as const;
const options = { cells, runs: 7, layouts: 1 };

test('a port that fetches only on the click is red against a router that fetched on hover, and its revisits are red as fetched again, though every page has the same heading', async () => {
	const timing = await measureNavTiming({ old: origin.ahead!, new: origin.plain! }, '/home', options);
	const rows = navRows(timing);
	const first = rows.find((r) => r.kind === 'first')!;
	const revisit = rows.find((r) => r.kind === 'revisit')!;
	assert.equal(first.verdict, 'slower', JSON.stringify(first));
	assert.equal(first.cause, 'not prefetched');
	assert.ok(first.served.old > 0.9 && first.served.new < 0.1, JSON.stringify(first.served));
	assert.ok(first.gap! >= 120, `the port waits on the 150 ms server: ${first.gap} ms`);
	assert.equal(revisit.verdict, 'slower', JSON.stringify(revisit));
	assert.equal(revisit.cause, 'refetched on revisit');
	assert.ok(navTimingFailures('/home', timing).length >= 2);
});

test('the same router on both sides is green', async () => {
	const timing = await measureNavTiming({ old: origin.ahead!, new: origin.ahead2! }, '/home', options);
	assert.deepEqual(navTimingFailures('/home', timing), []);
	assert.equal(navTimingUnmeasured(timing), undefined);
	assert.ok(navRows(timing).every((r) => r.verdict === 'same' || r.verdict === 'faster'), JSON.stringify(navRows(timing)));
});

test('a port that changes the address and never the content is red as did not arrive, and stops after two runs', async () => {
	const started = Date.now();
	const timing = await measureNavTiming({ old: origin.ahead!, new: origin.stuck! }, '/home', options);
	const first = navRows(timing).find((r) => r.kind === 'first')!;
	assert.equal(first.verdict, 'slower');
	assert.equal(first.cause, 'did not arrive');
	assert.match(first.reason!, /address changed to \/[a-z]+ but the page's content did not/);
	assert.equal(timing.cells[0]!.new.length, 2);
	assert.ok(Date.now() - started < 120_000);
});

test('an original that never shows the next page leaves the route not checked, never green', async () => {
	const timing = await measureNavTiming({ old: origin.stuck!, new: origin.ahead! }, '/home', options);
	assert.deepEqual(navTimingFailures('/home', timing), []);
	assert.match(navTimingUnmeasured(timing)!, /not checked .*the original/);
});

test('the deadline stops the route with what it has, and what it did not reach is not checked', async () => {
	const timing = await measureNavTiming({ old: origin.ahead!, new: origin.ahead2! }, '/home', { ...options, deadlineMs: 1 });
	assert.match(navTimingUnmeasured(timing)!, /deadline/);
});

test('a port whose router marks its budget spent on the page shown is red as budget spent, the mark names given as the router exports them', async () => {
	const timing = await measureNavTiming({ old: origin.ahead!, new: origin.spent! }, '/home', { ...options, marks: ['test:budget-spent', 'test:skipped'] });
	const first = navRows(timing).find((r) => r.kind === 'first')!;
	assert.equal(first.verdict, 'slower', JSON.stringify(first));
	assert.equal(first.cause, 'budget spent');
	assert.deepEqual(timing.marks, ['test:budget-spent', 'test:skipped']);
});

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { measureNavTiming } from '../src/check/nav-timing.ts';
import { navRows, navTimingFailures } from '../src/check/nav-timing-verdicts.ts';

// Two in-place routers over the same pages, each page's data 150 ms from the server: the original fetches a page when its
// link is hovered and keeps what it fetched; the port fetches only on the click and keeps nothing.
const router = (ahead: boolean) => `
const kept = new Map();
const data = (path) => { const hit = ${ahead} && kept.get(path); if (hit) return hit; const p = fetch(path + '.data').then((r) => r.json()); ${ahead} && kept.set(path, p); return p; };
${ahead ? "document.addEventListener('mouseover', (e) => { const a = e.target.closest('a[href]'); if (a) data(new URL(a.href).pathname); });" : ''}
document.addEventListener('click', async (e) => {
	const a = e.target.closest('a[href]');
	if (!a) return;
	e.preventDefault();
	const page = await data(new URL(a.href).pathname);
	history.pushState(null, '', a.href);
	document.querySelector('h1').textContent = page.title;
});`;

function site(ahead: boolean): Server {
	return createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path.endsWith('.data')) return void setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ title: path.slice(1, -5) })), 150);
		const links = ['alpha', 'beta', 'gamma'].map((n) => `<li><a href="/${n}">${n}</a></li>`).join('');
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><body><aside><ul>${links}</ul></aside><main><h1>${path.slice(1) || 'home'}</h1></main><script>${router(ahead)}</script></body></html>`);
	});
}

const servers: Server[] = [];
const origins: string[] = [];
before(async () => {
	for (const ahead of [true, false, true]) {
		const server = site(ahead);
		await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
		servers.push(server);
		origins.push(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
	}
});
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

const cells = [{ browser: 'chromium', profile: 'fast', mode: 'dwell-250' }] as const;

test('a port that fetches only on the click is red against an original that fetched on hover, and its revisits red as fetched again', async () => {
	const timing = await measureNavTiming({ old: origins[0]!, new: origins[1]! }, '/home', { cells, runs: 4 });
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
	const timing = await measureNavTiming({ old: origins[0]!, new: origins[2]! }, '/home', { cells, runs: 4 });
	assert.deepEqual(navTimingFailures('/home', timing), []);
	assert.ok(navRows(timing).every((r) => r.verdict === 'same' || r.verdict === 'faster'), JSON.stringify(navRows(timing)));
});

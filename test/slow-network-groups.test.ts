// check measures a slow-network cell once for routes alike on the critical path: the same files on both sides, the measured
// route's new HTML the largest and old HTML the smallest; when that route is red, every route it stood for is measured too.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { criticalPathOf, networkGroups, type CriticalPath } from '../src/check/slow-network-groups.ts';
import { measureRoutesNetwork, type NetworkRun } from '../src/check/slow-network.ts';

const page = (files: string[], body = '') => `<!doctype html><html><head>${files.map((f) => (f.endsWith('.css') ? `<link rel="stylesheet" href="${f}">` : `<script type="module" src="${f}"></script>`)).join('')}<link rel="icon" href="/favicon.ico"></head><body>${body}<img src="/hero.png"><img loading="lazy" src="/below.png"></body></html>`;

test("a page's critical path is the scripts, stylesheets, preloads and eager images it names, and its size", () => {
	const html = page(['/a.css', '/app.js'], 'x'.repeat(100));
	assert.deepEqual(criticalPathOf(html), { bytes: Buffer.byteLength(html), files: ['stylesheet /a.css', 'script /app.js', 'img /hero.png'] });
});

test('routes with the same files on both sides are measured once, by the one with the largest new HTML, for those it dominates', () => {
	const at = (oldBytes: number, newBytes: number, newFiles = ['script /p.js']): { old: CriticalPath; new: CriticalPath } => ({ old: { bytes: oldBytes, files: ['script /old.js'] }, new: { bytes: newBytes, files: newFiles } });
	const groups = networkGroups(
		new Map<string, { old?: CriticalPath; new?: CriticalPath }>([
			['/a', at(500, 300)],
			['/b', at(520, 290)],
			['/c', at(400, 280)],
			['/d', at(600, 310, ['script /other.js'])],
			['/e', {}],
		]),
	);
	assert.deepEqual(groups, [
		{ route: '/a', members: ['/b'] },
		{ route: '/c', members: [] },
		{ route: '/d', members: [] },
		{ route: '/e', members: [] },
	]);
});

const servers: Server[] = [];
const origins = { old: '', new: '' };
before(async () => {
	for (const side of ['old', 'new'] as const) {
		const server = createServer((request, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page([`/${side}.css`, `/${side}.js`], side === 'new' && request.url === '/big' ? 'x'.repeat(1000) : '')));
		await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
		servers.push(server);
		origins[side] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	}
});
after(() => servers.forEach((s) => s.close()));

const run = (answered: number): NetworkRun => ({ firstFrame: answered / 2, lcp: answered / 2, answered, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });

test('a green measured route stands for its group; a red one has each route it stood for measured too', async () => {
	for (const newAt of [18_000, 200_000]) {
		const taken = new Set<string>();
		const side = (url: string) => (url.startsWith(origins.old) ? 'old' : 'new');
		const runner = async (url: string): Promise<NetworkRun> => (taken.add(`/${side(url)}${new URL(url).pathname}`), run(side(url) === 'old' ? 110_000 : newAt));
		const measured = await measureRoutesNetwork(origins, ['/one', '/big', '/two'], { profiles: ['regular-2g'], browsers: ['chromium'], runs: 5, runner });
		if (newAt === 18_000) {
			assert.deepEqual([...taken].sort(), ['/new/big', '/old/big'], 'the largest new page is measured for all three');
			assert.deepEqual(measured.get('/big')!.standsFor, ['/one', '/two']);
			assert.equal(measured.get('/one')!.measuredAs, '/big');
		} else {
			assert.deepEqual([...taken].sort(), ['/new/big', '/new/one', '/new/two', '/old/big', '/old/one', '/old/two']);
			assert.equal(measured.get('/one')!.measuredAs, undefined);
		}
	}
});

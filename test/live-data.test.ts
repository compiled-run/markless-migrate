import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { dataFile } from '../src/check/data.ts';
import { applyUpdate, recordDatabases, valueAt, type LiveRecording } from '../src/check/live-data.ts';
import { runCheck } from '../src/check/run.ts';

const push = (path: string, d: unknown, a = 'd') => JSON.stringify({ t: 'd', d: { b: { p: path, d }, a } });
const listen = (r: number, path: string) => JSON.stringify({ t: 'd', d: { r, a: 'q', b: { p: `/${path}`, h: '' } } });
const ok = (r: number) => JSON.stringify({ t: 'd', d: { r, b: { s: 'ok', d: {} } } });

test("each listened path's first value is the snapshot and every later push an update, split frames joined", () => {
	const big = push('v0/item/2', { id: 2, text: 'x'.repeat(40) });
	const dbs = recordDatabases([
			{
				url: 'wss://hn.firebaseio.com/.ws?v=5',
				frames: [
					{ sent: false, text: JSON.stringify({ t: 'c', d: { t: 'h', d: { ts: 1, v: '5', h: 'hn.firebaseio.com', s: 'x' } } }), at: 0 },
					{ sent: true, text: listen(1, 'v0/item/1'), at: 1 },
					{ sent: false, text: push('v0/item/1', { id: 1, kids: { 0: 2 } }), at: 5 },
					{ sent: false, text: ok(1), at: 5 },
					{ sent: true, text: listen(2, 'v0/item/2'), at: 6 },
					{ sent: false, text: '2', at: 9 },
					{ sent: false, text: big.slice(0, 20), at: 9 },
					{ sent: false, text: big.slice(20), at: 9 },
					{ sent: false, text: push('v0/item/1/kids', { 0: 2, 1: 3 }), at: 900 },
					{ sent: false, text: push('v0/item/1', { score: 5 }, 'm'), at: 950 },
				],
			},
			{ url: 'wss://other.example/socket', frames: [{ sent: false, text: push('v0/x', 1), at: 0 }] },
		]);
	assert.deepEqual(dbs, [
		{
			host: 'hn.firebaseio.com',
			snapshot: { 'v0/item/1': { id: 1, kids: { 0: 2 } }, 'v0/item/2': { id: 2, text: 'x'.repeat(40) } },
			updates: [
				{ path: 'v0/item/1/kids', data: { 0: 2, 1: 3 }, at: 900 },
				{ path: 'v0/item/1', data: { score: 5 }, merge: true, at: 950 },
			],
		},
	]);
});

test('an update lands in the listened path above it, replaces the paths below it, and merges only the children it names', () => {
	const state = new Map<string, unknown>([['v0/item/1', { id: 1, kids: [2] }], ['v0/item/1/kids', [2]], ['v0/top', [1]]]);
	applyUpdate(state, { path: 'v0/item/1/kids', data: [2, 3] });
	assert.deepEqual(state.get('v0/item/1'), { id: 1, kids: [2, 3] });
	applyUpdate(state, { path: 'v0/item/1', data: { score: 9 }, merge: true });
	assert.deepEqual(state.get('v0/item/1'), { id: 1, kids: [2, 3], score: 9 });
	applyUpdate(state, { path: 'v0/item/1', data: { id: 1, kids: [4] } });
	assert.deepEqual(state.get('v0/item/1/kids'), [4]);
	assert.deepEqual(valueAt(state, 'v0/item/1/id'), 1);
	assert.equal(valueAt(state, 'v0/item/9'), null);
});

// A list read live from a Firebase database; items above the highest id shown on the first visit are marked new, as react-hn does.
const CLIENT = `
const ws = new WebSocket('wss://markless-migrate-test.firebaseio.com/.ws?v=5');
let r = 0, items = {};
const draw = () => {
	const ids = Object.keys(items).map(Number).sort((a, b) => a - b);
	const seen = FORGET ? 0 : Number(localStorage.seen || 0);
	document.querySelector('ul').innerHTML = ids.map((id) => '<li' + (seen && id > seen ? ' class="new"' : '') + '>' + items[id] + (seen && id > seen ? ' (new)' : '') + '</li>').join('');
	if (ids.length) localStorage.seen = localStorage.seen || String(ids.at(-1));
};
ws.onopen = () => ws.send(JSON.stringify({ t: 'd', d: { r: ++r, a: 'q', b: { p: '/v0/items', h: '' } } }));
ws.onmessage = (event) => {
	const m = JSON.parse(event.data);
	if (m.t !== 'd' || !m.d.b || typeof m.d.b.p !== 'string') return;
	const p = m.d.b.p.replace(/^\\//, '');
	if (p === 'v0/items' && m.d.a === 'd') { if (LIVE || !Object.keys(items).length) items = { ...(m.d.b.d || {}) }; }
	else if (p === 'v0/items' && m.d.a === 'm') { if (LIVE) items = { ...items, ...m.d.b.d }; }
	else if (p.startsWith('v0/items/') && LIVE) items = { ...items, [p.split('/')[2]]: m.d.b.d };
	draw();
};`;

function app(options: { live?: boolean; forget?: boolean } = {}): Promise<Server> {
	const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Live list</title></head><body><main><h1>Live list</h1><ul></ul></main><script>const LIVE = ${options.live !== false}, FORGET = ${options.forget === true};${CLIENT}</script></body></html>`;
	const server = createServer((req, res) => {
		if (new URL(req.url ?? '/', 'http://x').pathname === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(page);
		else res.writeHead(404).end();
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const RECORDING: LiveRecording = {
	firebase: [
		{
			host: 'markless-migrate-test.firebaseio.com',
			snapshot: { 'v0/items': { 1: 'Apples', 2: 'Pears' } },
			updates: [
				{ path: 'v0/items/3', data: 'Plums', at: 500 },
				{ path: 'v0/items', data: { 2: 'Ripe pears' }, merge: true, at: 900 },
			],
		},
	],
};

const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

async function replay(next: Server) {
	const old = await app();
	servers.push(old, next);
	const dir = await mkdtemp(join(tmpdir(), 'live-data-'));
	await mkdir(dir, { recursive: true });
	await writeFile(dataFile(dir, '/'), JSON.stringify({ route: '/', recordedFrom: origin(old), at: new Date(0).toISOString(), responses: [], live: RECORDING }));
	return runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: ['/'], browser, data: { mode: 'replay', dir }, viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }] });
}

const failures = (route: { failures: readonly { dimension: string; check: string; expected: string; actual: string }[] }) => route.failures.map((f) => `${f.dimension} ${f.check}: ${f.expected} -> ${f.actual}`).join('\n');

test('both apps are served the recorded snapshot and sent the same updates, then reloaded', async () => {
	const report = await replay(await app());
	const route = report.routes[0]!;
	assert.equal(route.ok, true, failures(route));
	const names = route.journeys?.map((j) => j.name) ?? [];
	assert.ok(names.some((name) => /receive the 2 updates/.test(name)) && names.some((name) => /come back after the 2 updates/.test(name)), JSON.stringify(names));
});

test('a port that shows only the first value it is sent is red at the live update step', async () => {
	const report = await replay(await app({ live: false }));
	const route = report.routes[0]!;
	assert.equal(route.ok, false);
	assert.ok(route.failures.some((f) => f.dimension === 'behaviour' && /receive 1 live update/.test(f.check)), failures(route));
});

test('a port that forgets the last visit is red when the page comes back after updates it did not hear', async () => {
	const report = await replay(await app({ forget: true }));
	const route = report.routes[0]!;
	assert.equal(route.ok, false);
	assert.ok(route.failures.some((f) => /come back after the 2 updates/.test(f.check) && /reload/.test(f.check)), failures(route));
});

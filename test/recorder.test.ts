import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startCms, type Cms } from '../fixtures/cms/server.ts';
import { defaultEnv, pushRecording, RECORDER_HEADER, recorderTag, serverRecords, writeReason, requestLine } from '../src/check/browser.ts';
import { recorderEnv } from '../src/check/recorder.ts';
import { writesAllowed } from '../src/check/run.ts';
import { writeHandler } from '../src/check/source-facts.ts';

// A Node server that renders from the CMS with fetch and pings it with node:http, as a framework server would.
const APP = `
import http from 'node:http';
const server = http.createServer(async (req, res) => {
	const news = await (await fetch(process.env.CMS_URL + '/walks/news?fields=title')).json();
	await new Promise((done) => http.get(process.env.CMS_URL + '/walks/settings', (r) => { r.resume(); r.on('end', done); }));
	res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>' + news.items.map((i) => i.title).join(', ') + '</h1>');
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
`;

let cms: Cms;
let child: ChildProcess;
let origin: string;

before(async () => {
	cms = await startCms();
	child = spawn(process.execPath, ['--input-type=module', '-e', APP], { env: { ...process.env, CMS_URL: cms.origin, ...recorderEnv('') }, stdio: ['ignore', 'pipe', 'inherit'] });
	origin = await new Promise((resolve) => child.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
});
after(async () => {
	child?.kill();
	await cms?.stop();
});

test('the server recorder files what the server fetched under the page load that caused it', async () => {
	const env = defaultEnv(origin);
	const html = await (await fetch(origin, { headers: { [RECORDER_HEADER]: 'load=one' } })).text();
	assert.match(html, /Winter timetable/);
	await fetch(origin);
	const records = await serverRecords(env, 'one');
	assert.deepEqual(records!.map((r) => `${r.side} ${r.method} ${new URL(r.url).pathname}${new URL(r.url).search} ${r.status}`), ['server GET /walks/news?fields=title 200', 'server GET /walks/settings 200']);
	assert.match(records![0]!.body!, /"title":"Winter timetable/);
	assert.deepEqual(await serverRecords(env, 'never-seen'), []);
	assert.equal(await serverRecords(defaultEnv(cms.origin), 'one'), undefined, 'a server without the recorder has no records');
});

// A CommonJS server on an old Node (16 has no fetch, and refuses --import in NODE_OPTIONS), reading the CMS with node:http.
const OLD_NODE_APP = `
const http = require('node:http');
const server = http.createServer((req, res) => {
	http.get(process.env.CMS_URL + '/walks/settings', (r) => { r.resume(); r.on('end', () => res.writeHead(200, { 'content-type': 'text/plain' }).end('fetch is ' + typeof globalThis.fetch)); });
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
`;

test('a server on an old Node loads the recorder from NODE_OPTIONS and still has no fetch', async () => {
	const { NODE_OPTIONS } = recorderEnv('');
	assert.doesNotMatch(NODE_OPTIONS, /--import|--loader/, 'Node 16 refuses --import in NODE_OPTIONS, so the old app would not start');
	const dir = mkdtempSync(join(tmpdir(), 'mm-old-node-'));
	const noFetch = join(dir, 'no-fetch.cjs');
	writeFileSync(noFetch, 'delete globalThis.fetch;\n');
	const app = spawn(process.execPath, ['-e', OLD_NODE_APP], { env: { ...process.env, CMS_URL: cms.origin, NODE_OPTIONS: `--require=${noFetch} ${NODE_OPTIONS}` }, stdio: ['ignore', 'pipe', 'inherit'] });
	try {
		const at = await new Promise<string>((resolve) => app.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
		const text = await (await fetch(at, { headers: { [RECORDER_HEADER]: 'load=old-node' } })).text();
		assert.equal(text, 'fetch is undefined', 'the recorder must not give an app a fetch it does not have');
		const records = await serverRecords(defaultEnv(at), 'old-node');
		assert.deepEqual(records!.map((r) => `${r.method} ${new URL(r.url).pathname} ${r.status}`), ['GET /walks/settings 200']);
	} finally {
		app.kill();
	}
});

// A server that posts a GraphQL query to an API with node:http, as isomorphic-unfetch and Apollo's HttpLink do on Node 16.
const HTTP_POST_APP = `
const http = require('node:http');
http.createServer((req, res) => {
	const out = http.request(process.env.CMS_URL + '/graphql', { method: 'POST', headers: { 'content-type': 'application/json' } }, (r) => { r.resume(); r.on('end', () => res.end('ok')); });
	out.write('{"operationName":"Feed",');
	out.end('"query":"query Feed { feed { id } }"}');
}).listen(0, '127.0.0.1', function () { console.log('http://127.0.0.1:' + this.address().port); });
`;

test('a POST a server sends with node:http is filed with its body, as fetch\'s are', async () => {
	const app = spawn(process.execPath, ['-e', HTTP_POST_APP], { env: { ...process.env, CMS_URL: cms.origin, ...recorderEnv('') }, stdio: ['ignore', 'pipe', 'inherit'] });
	try {
		const at = await new Promise<string>((resolve) => app.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
		await (await fetch(at, { headers: { [RECORDER_HEADER]: 'load=http-post' } })).text();
		const [post] = (await serverRecords(defaultEnv(at), 'http-post'))!;
		assert.equal(post!.method, 'POST');
		assert.equal(post!.requestType, 'application/json');
		assert.equal(post!.requestBody, '{"operationName":"Feed","query":"query Feed { feed { id } }"}');
	} finally {
		app.kill();
	}
});

// node-fetch 2 (isomorphic-unfetch on Node 16) sets each header as an array of values.
const ARRAY_HEADER_APP = HTTP_POST_APP.replace("headers: { 'content-type': 'application/json' }", "headers: { 'content-type': ['application/json'] }");

test('a node:http request whose headers are arrays, as node-fetch sets them, still goes out and is filed', async () => {
	const app = spawn(process.execPath, ['-e', ARRAY_HEADER_APP], { env: { ...process.env, CMS_URL: cms.origin, ...recorderEnv('') }, stdio: ['ignore', 'pipe', 'pipe'] });
	try {
		const at = await new Promise<string>((resolve) => app.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
		const answer = await fetch(at, { headers: { [RECORDER_HEADER]: 'load=array-header' }, signal: AbortSignal.timeout(5000) }).then((r) => r.text(), (error: Error) => `failed: ${error.message}`);
		assert.equal(answer, 'ok', 'the recorder must never break the request it files');
		const [post] = (await serverRecords(defaultEnv(at), 'array-header'))!;
		assert.equal(post!.requestType, 'application/json');
		assert.equal(post!.requestBody, '{"operationName":"Feed","query":"query Feed { feed { id } }"}');
	} finally {
		app.kill();
	}
});

// A server that prints the time it renders at, as "posted 3 hours ago" pages do.
const CLOCK_APP = `
const http = require('node:http');
http.createServer((req, res) => { const now = Date.now(); const date = new Date().toISOString(); setTimeout(() => res.end(JSON.stringify({ now, date, later: Date.now(), parsed: new Date('2020-01-01T00:00:00Z').toISOString(), nodeDate: require('node:fs').statSync('.').mtime instanceof Date })), 40); }).listen(0, '127.0.0.1', function () { console.log('http://127.0.0.1:' + this.address().port); });
`;

test('with --server-clock a page load check tags reads the frozen clock on the server too; other requests and dates the code names keep theirs', async () => {
	const app = spawn(process.execPath, ['-e', CLOCK_APP], { env: { ...process.env, ...recorderEnv('') }, stdio: ['ignore', 'pipe', 'inherit'] });
	try {
		const at = await new Promise<string>((resolve) => app.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
		const before = await (await fetch(at, { headers: { [RECORDER_HEADER]: recorderTag(defaultEnv(at), 'plain') } })).json();
		assert.ok(Math.abs(before.now - Date.now()) < 60_000, 'a load without --server-clock reads the real clock');
		const env = defaultEnv(at, { serverClock: true });
		const tag = recorderTag(env, 'clock');
		assert.equal(recorderTag(defaultEnv(at), 'x').includes('time='), false, 'off unless asked for: sessions the server issues would expire by the frozen clock');
		assert.match(tag, new RegExp(`time=${env.freeze && env.freeze.time}`));
		const frozen = await (await fetch(at, { headers: { [RECORDER_HEADER]: tag } })).json();
		const time = env.freeze ? env.freeze.time : 0;
		assert.ok(frozen.now >= time && frozen.now - time < 1000, 'the render starts at the frozen instant');
		assert.ok(Math.abs(Date.parse(frozen.date) - frozen.now) < 50);
		assert.ok(frozen.later - frozen.now >= 30, 'and the clock runs on from there: a server timing its own work (a streaming deadline) still sees time pass');
		assert.equal(frozen.parsed, '2020-01-01T00:00:00.000Z');
		assert.equal(frozen.nodeDate, true, "a Date Node makes is still instanceof Date");
		const real = await (await fetch(at)).json();
		assert.ok(Math.abs(real.now - Date.now()) < 60_000, 'a request check did not tag keeps the real clock');
		assert.equal(recorderTag(defaultEnv(at, { freeze: false, serverClock: true }), 'x').includes('time='), false, '--no-freeze leaves the server clock alone');
	} finally {
		app.kill();
	}
});

test('pushed recordings are served instead of the network for loads that ask for them', async () => {
	const env = { ...defaultEnv(origin), replay: { set: 's1', responses: [{ side: 'server' as const, method: 'GET', url: 'http://elsewhere.test/walks/news?fields=title', status: 200, contentType: 'application/json', body: '{"items":[{"title":"Recorded headline"}]}' }] } };
	assert.equal(await pushRecording(env), true);
	const asked = cms.requests.length;
	const html = await (await fetch(origin, { headers: { [RECORDER_HEADER]: 'load=two; data=s1' } })).text();
	assert.match(html, /Recorded headline/);
	assert.deepEqual(cms.requests.slice(asked), ['GET /walks/settings'], 'only the request missing from the recording went to the CMS');
	const [news] = (await serverRecords(env, 'two'))!;
	assert.equal(news!.replayed, true);
	assert.equal(news!.recordedUrl, 'http://elsewhere.test/walks/news?fields=title');
	assert.equal(await pushRecording({ ...defaultEnv(cms.origin), replay: env.replay }), false, 'nothing is pushed to a server without the recorder');
});

test('writes: non-GET requests, server actions and handlers the source marks as writing', () => {
	const facts = [
		{ method: 'GET', path: '/account/logout', handler: { file: 'app/account/logout/route.ts', line: 4 }, via: 'route-handler' },
		{ method: 'POST', path: '/api/cart/:id', handler: { file: 'app/api/cart/[id]/route.ts', line: 9 }, via: 'route-handler', touches: ['prisma', 'stripe'] },
		{ method: '*', path: '/admin/*rest', handler: { file: 'server.ts', line: 40 }, via: 'route' },
		{ method: 'SDK', path: '/api/orders', handler: { file: 'lib/orders.ts', line: 2 }, via: 'sdk' },
		{ method: 'POST', path: null, handler: { file: 'app/actions.ts', line: 1 }, via: 'server-action' },
	];
	const url = (path: string) => new URL(path, 'http://127.0.0.1:3000');
	assert.equal(writeReason('GET', url('/about'), 'http://127.0.0.1:3000', facts), undefined);
	assert.equal(writeReason('GET', url('/account/logout'), 'http://127.0.0.1:3000', facts), 'writes per the source: route-handler at app/account/logout/route.ts:4');
	assert.equal(writeReason('POST', url('/api/cart/42'), 'http://127.0.0.1:3000', facts), 'writes per the source: route-handler at app/api/cart/[id]/route.ts:9, touches prisma, stripe');
	assert.equal(writeReason('GET', url('/admin/users/7'), 'http://127.0.0.1:3000', facts), 'writes per the source: route at server.ts:40', '`*` is any method');
	assert.equal(writeReason('GET', url('/api/orders'), 'http://127.0.0.1:3000', facts), undefined, 'an SDK write is not a request');
	assert.equal(writeReason('POST', url('/en'), 'http://127.0.0.1:3000', [], { 'next-action': 'abc' }), 'server action');
	assert.equal(writeReason('DELETE', new URL('https://pay.example/v1/cards/1'), 'http://127.0.0.1:3000', facts), 'DELETE request');
	assert.equal(writeHandler(facts, 'POST', '/api/cart'), undefined);
	assert.equal(requestLine('POST', new URL('https://pay.example/v1/charge?x=1'), 'http://127.0.0.1:3000', '{"amount":5}', 'application/json'), 'POST https://pay.example/v1/charge?x {"amount":"number"}');
	assert.equal(requestLine('POST', new URL('http://127.0.0.1:3000/login?_data=routes%2Flogin'), 'http://127.0.0.1:3000', 'email=a%40b.c', 'application/x-www-form-urlencoded'), requestLine('POST', new URL('http://127.0.0.1:3000/login'), 'http://127.0.0.1:3000', 'email=a%40b.c', 'application/x-www-form-urlencoded'));
});

test('writes are sent only when both apps are staging or on this machine', () => {
	assert.equal(writesAllowed({ oldOrigin: 'http://localhost:3000', newOrigin: 'http://127.0.0.1:5173' }), true);
	assert.equal(writesAllowed({ oldOrigin: 'https://www.shop.example', newOrigin: 'http://127.0.0.1:5173' }), false);
	assert.equal(writesAllowed({ oldOrigin: 'https://staging.shop.example', newOrigin: 'http://127.0.0.1:5173', staging: { old: true } }), true);
	assert.equal(writesAllowed({ oldOrigin: 'https://staging.shop.example', newOrigin: 'https://next.shop.example', staging: { old: true } }), false);
});

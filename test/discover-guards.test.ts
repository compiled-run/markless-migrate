// What discovery never lets a press do to the original (write, leave, open), what it never presses, and what its report
// says when a page is cut short, fails or is read back.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { discoveryReport, draftReport } from '../src/discover/convert.ts';
import { recordDiscovery, type DiscoverFacts } from '../src/discover/record.ts';
import { discoveryMarkdown, type RouteDiscovery } from '../src/discover/report.ts';

const GUARDS = `<!doctype html><html><body>
<p id="out">0</p>
<button id="g-request" type="button">Send request</button>
<button id="g-beacon" type="button">Beacon</button>
<button id="g-submit" type="button">Form submit</button>
<button id="g-request-submit" type="button">Request submit</button>
<button id="g-native" type="button">Native submit</button>
<button id="g-socket" type="button">Socket</button>
<button id="g-worker" type="button">Worker</button>
<button id="g-frame" type="button">Frame</button>
<button id="g-open" type="button">Open window</button>
<button id="g-download" type="button">Download</button>
<button id="g-ask" type="button">Ask</button>
<button id="g-step" type="button">Next step</button>
<button id="g-slow" type="button">Load slowly</button><p id="slow"></p>
<form id="f" method="post" action="/f"><input name="a"></form>
<form id="f2" method="post" action="/f2"><button type="submit">Send</button></form>
<button type="submit">Submit outside</button>
<button type="button" style="display: none">Hidden one</button>
<button type="button" disabled>Disabled one</button>
<div aria-hidden="true"><button type="button">Under aria-hidden</button></div>
<div inert><button type="button">Under inert</button></div>
<button type="button"><svg width="10" height="10"></svg></button>
<button type="button"><svg width="10" height="10"><title>Delete row</title></svg></button>
<span id="lbl">Remove item</span><button type="button" aria-labelledby="lbl">x</button>
<button type="button" title="Sign out"><svg width="10" height="10"></svg></button>
<script>
const out = (t) => { document.getElementById('out').textContent = t; };
const on = (id, f) => { document.getElementById(id).onclick = f; };
on('g-request', () => fetch(new Request('/r', { method: 'POST', body: 'x' })).then(() => out('sent'), () => {}));
on('g-beacon', () => { navigator.sendBeacon('/b', 'x'); out('beaconed'); });
on('g-submit', () => document.getElementById('f').submit());
on('g-request-submit', () => document.getElementById('f').requestSubmit());
on('g-native', () => document.querySelector('#f2 button').click());
on('g-socket', () => { const w = new WebSocket(location.origin.replace('http', 'ws') + '/ws'); try { w.send('x'); } catch {} out('socket'); });
on('g-worker', () => { const w = new Worker(URL.createObjectURL(new Blob(["fetch('" + location.origin + "/w', { method: 'POST', body: 'x' }).catch(() => {})"], { type: 'text/javascript' }))); out('worker'); });
on('g-frame', () => { const f = document.createElement('iframe'); document.body.append(f); f.contentWindow.fetch('/i', { method: 'POST', body: 'x' }).catch(() => {}); });
on('g-open', () => window.open('/other'));
on('g-download', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['x'])); a.download = 'x.txt'; document.body.append(a); a.click(); });
on('g-ask', () => { if (confirm('Sure?')) out('yes'); });
on('g-slow', () => fetch('/slow').then((r) => r.text()).then((t) => { document.getElementById('slow').textContent = t; }));
let step = 0; on('g-step', () => out('step ' + ++step));
</script></body></html>`;

const SMALL = (n: number) => `<!doctype html><html><body><p id="out">0</p>${Array.from({ length: n }, (_, i) => `<button type="button" id="s${i}">Item ${i}</button>`).join('')}<script>document.querySelectorAll('button').forEach((b) => (b.onclick = () => (document.getElementById('out').textContent = b.id)));</script></body></html>`;

// A clock in a box: pressing what changes only the clock is no change, pressing what grows its box beside it is one.
const DRIFT = `<!doctype html><html><body><div id="box"><p id="clock">0</p><p id="note"></p></div>
<button type="button" id="tick">Tick</button><button type="button" id="grow">Grow</button>
<script>let t = 0; setInterval(() => { document.getElementById('clock').textContent = String(++t); }, 300);
document.getElementById('tick').onclick = () => { document.getElementById('clock').textContent = String(++t); };
document.getElementById('grow').onclick = () => { document.getElementById('note').textContent = 'A longer note than before'; };</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
let dir: string;
const writes: string[] = [];
before(async () => {
	browser = await chromium.launch({ args: ['--host-resolver-rules=MAP away.test 127.0.0.1'] });
	dir = await mkdtemp(join(tmpdir(), 'mm-discover-guards-'));
	server = createServer((req, res) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET')) writes.push(`${req.method} ${req.url}`);
		const url = new URL(req.url ?? '/', 'http://x');
		if (url.pathname === '/slow') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/plain' }).end('the slow answer'), 1500);
		if (url.pathname === '/away') return void res.writeHead(302, { location: `http://away.test:${(server.address() as AddressInfo).port}/small` }).end();
		const html = url.pathname === '/' ? GUARDS : url.pathname === '/drift' ? DRIFT : url.pathname === '/one' ? SMALL(1) : url.pathname.startsWith('/small') ? SMALL(3) : '<!doctype html><p>Other</p>';
		res.writeHead(200, { 'content-type': 'text/html' }).end(html);
	});
	server.on('upgrade', (req, socket) => {
		writes.push(`upgrade ${req.url}`);
		socket.destroy();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser?.close();
	await new Promise((done) => server?.close(done));
	await rm(dir, { recursive: true, force: true });
});

test('no press writes to the original, by any way a page can send, and each is named; what leaves or opens is stopped', async () => {
	const facts = await recordDiscovery(browser, origin, '/', dir);
	const by = (name: string) => facts.controls.find((c) => c.name === name);
	assert.equal(facts.error, undefined);
	for (const [name, why] of [
		['Send request', /POST \/r/],
		['Beacon', /POST \/b/],
		['Form submit', /POST \/f/],
		['Request submit', /POST \/f/],
		['Native submit', /POST \/f2/],
		['Socket', /WebSocket \/ws/],
		['Worker', /POST .*\/w/],
		['Frame', /POST \/i/],
	] as const) {
		assert.equal(by(name)?.shape, 'blocked', name);
		assert.match(by(name)?.why ?? '', why, name);
	}
	assert.deepEqual(writes.filter((w) => !w.startsWith('upgrade')), [], 'nothing but a GET reached the server');
	assert.equal(by('Open window')?.shape, 'window');
	assert.equal(by('Download')?.shape, 'download');
	assert.equal(by('Ask')?.shape, 'dialog');
	assert.equal(by('Next step')?.shape, 'sequence', 'four presses and no state came back');
	assert.equal(by('Next step')?.states, 5);
	assert.ok(by('Load slowly')?.changes?.some((c) => c.what === 'text' && c.after === 'the slow answer'), 'a request the press started is waited on before the page is read');
	assert.equal(facts.excluded['submit'], 1);
	assert.equal(facts.excluded['in a form'], 1);
	assert.equal(facts.excluded['hidden'], 2, 'not shown, and under aria-hidden');
	assert.equal(facts.excluded['disabled'], 2, 'disabled, and under inert');
	assert.equal(facts.excluded['no accessible name'], 1);
	assert.equal(facts.excluded['destructive name'], 3, "an svg's title, aria-labelledby and a title");
});

test('a page that redirects off this machine is refused after it loads, and the failure is not kept', async () => {
	const facts = await recordDiscovery(browser, origin, '/away', dir);
	assert.match(facts.error ?? '', /only against a local copy, not http:\/\/away\.test/);
	assert.equal(facts.controls.length, 0);
	const kept = await readdir(join(dir)).then((f) => f.length);
	const again = await recordDiscovery(browser, origin, '/away', dir);
	assert.match(again.error ?? '', /only against a local copy/);
	assert.equal(await readdir(dir).then((f) => f.length), kept);
});

test('a page past its press budget is cut at the same control every run; one that stops answering is an error, never kept', async () => {
	const own = await mkdtemp(join(tmpdir(), 'mm-discover-cut-'));
	const facts = await recordDiscovery(browser, origin, '/small-cut', own, { maxPresses: 1 });
	assert.equal(facts.cut, true);
	assert.equal(facts.controls.length, 1);
	assert.equal(facts.excluded['past 1 presses on the page'], 2);
	assert.equal((await readdir(own)).length, 1, 'a cut by the budget is the same next time: kept');
	const hung = await recordDiscovery(browser, origin, '/small-hang', own, { hangMs: 1 });
	assert.match(hung.error ?? '', /stopped after 0.001 s on the page/);
	assert.equal((await readdir(own)).length, 1, 'an error is recorded again next time');
	await rm(own, { recursive: true, force: true });
});

test('a recording is read back only for the same page of the original', async () => {
	const own = await mkdtemp(join(tmpdir(), 'mm-discover-key-'));
	const first = await recordDiscovery(browser, origin, '/one', own, { page: 'a' });
	assert.equal(first.controls.length, 1);
	const [file] = await readdir(own);
	const fake: DiscoverFacts & { page: string } = { ...first, controls: [], page: 'a' };
	await writeFile(join(own, file!), JSON.stringify(fake));
	assert.equal((await recordDiscovery(browser, origin, '/one', own, { page: 'a' })).controls.length, 0, 'the same page is read back');
	assert.equal((await recordDiscovery(browser, origin, '/one', own, { page: 'b' })).controls.length, 1, 'another page is recorded again');
	await writeFile(join(own, file!), '{"route": 3}');
	assert.equal((await recordDiscovery(browser, origin, '/one', own, { page: 'b' })).controls.length, 1, 'a file of another shape is recorded again');
	await rm(own, { recursive: true, force: true });
});

test('what the page changes by itself is taken back only from a press that changed that element alone', async () => {
	const own = await mkdtemp(join(tmpdir(), 'mm-discover-drift-'));
	const facts = await recordDiscovery(browser, origin, '/drift', own);
	const by = (name: string) => facts.controls.find((c) => c.name === name);
	assert.equal(by('Tick')?.shape, 'inert');
	assert.equal(by('Grow')?.shape, 'one-way');
	assert.ok(by('Grow')?.changes?.some((c) => c.what === 'text' && c.after === 'A longer note than before'));
	assert.ok(!by('Grow')?.changes?.some((c) => c.what === 'look' && c.at.startsWith('div')), 'the box only grew around the change');
	await rm(own, { recursive: true, force: true });
});

const route = (over: Partial<RouteDiscovery> = {}): RouteDiscovery => ({ candidates: 1, found: { role: 1, cursor: 0 }, pressed: 1, claimed: 0, inert: 0, dead: [], unknown: [], excluded: {}, seconds: 1, ...over });
const dead = (name: string, repeated?: number) => ({ name, sig: `button||${name}`, nth: 0, found: 'role' as const, shape: 'toggle' as const, what: 'switches', ...(repeated ? { repeated } : {}) });

test('the job passes with none, fails on dead or not looked at, and fails as missing with no report', async () => {
	assert.deepEqual(discoveryMarkdown(draftReport({ '/': route() })).failed, false);
	const some = discoveryMarkdown(draftReport({ '/': route({ dead: [dead('Copy', 18)] }) }));
	assert.equal(some.failed, true);
	assert.equal(some.missing, false);
	assert.match(some.text, /dead controls: 19 controls on 1 of 1/);
	const failed = discoveryMarkdown(draftReport({ '/': route({ error: 'net::ERR_CONNECTION_REFUSED' }) }));
	assert.equal(failed.failed, true, 'a route that failed fails the job');
	assert.match(failed.text, /Not looked at in full .*: \//);
	assert.equal(discoveryMarkdown(draftReport({ '/': route({ cut: true }) })).failed, true, 'so does one the time stop cut');
	assert.deepEqual([discoveryMarkdown(undefined).missing, discoveryMarkdown(draftReport({}, 'not local')).missing], [true, true]);
	assert.match(discoveryMarkdown({ ...draftReport({ '/': route() }), from: 'run 42' }).text, /the one run 42 made/);
});

test("a route not looked at in full clears none of its last findings, and the store's count is the one it keeps", async () => {
	const store = await mkdtemp(join(tmpdir(), 'mm-discover-store-'));
	const first = await discoveryReport(store, { '/a': route({ dead: [dead('Copy', 2)] }), '/b': route({ dead: [dead('Play')] }) });
	assert.equal(first.count, 4);
	const second = await discoveryReport(store, { '/a': route({ error: 'timed out' }), '/b': route() });
	assert.deepEqual(second.before, { count: 4, added: [], cleared: ['/b "Play"'] }, '/a failed: its Copy is not cleared');
	assert.deepEqual(second.incomplete, ['/a']);
	const third = await discoveryReport(store, { '/a': route({ cut: true }), '/b': route() });
	assert.equal(third.before?.count, 3, "what /a found before it failed stands; /b's Play was cleared");
	await rm(store, { recursive: true, force: true });
});

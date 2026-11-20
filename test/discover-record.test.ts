import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { assertLocal, recordDiscovery, type DiscoverFacts } from '../src/discover/record.ts';
import { claimed, discoveryReport, routeDiscovery } from '../src/discover/convert.ts';

// One page of plain scripts, each control a shape of what a press can do; no framework is named.
const PAGE = `<!doctype html><html><head><style>
.ring:focus { outline: 3px solid red } .hov:hover { background: yellow } .addon { cursor: text } [hidden] { display: none }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0) }
</style></head><body>
<p id="clock">0</p>
<div id="listen" role="img" aria-label="Processing audio"><canvas width="40" height="10"></canvas></div>
<button id="b-listen" type="button">Start Listening</button>
<button id="b-toggle" type="button">Show more</button><p id="more" hidden>More text</p>
<button id="b-once" type="button">Load reply</button><div id="reply"></div>
<button id="b-spin" type="button" class="ring">Create</button>
<button id="b-inert" type="button" class="ring hov">Nothing</button>
<button id="b-churn" type="button">Rerender</button><div id="panel" style="animation-duration: 0s">Panel</div>
<div class="group"><input id="search" placeholder="Search"><div class="addon" id="kbd">K</div></div>
<button id="b-drag" type="button">Drag to reorder</button><div class="sr" aria-live="assertive" id="live"></div>
<button id="b-post" type="button">Save</button>
<button id="b-go" type="button">Go elsewhere</button>
<button id="b-delete" type="button">Delete account</button>
<form><button id="b-form" type="button">Inside a form</button></form>
<button id="b-menu" type="button" aria-expanded="false">Menu</button>
<a href="#x"><span id="in-link" role="button">In a link</span></a>
<div style="height: 1500px"></div>
<script>
let tick = 0; setInterval(() => { document.getElementById('clock').textContent = String(++tick); }, 400);
const states = ['Processing audio', 'Live audio waveform', 'Audio waveform idle'];
let s = 0;
document.getElementById('b-listen').onclick = (e) => { s = (s + 1) % 3; document.getElementById('listen').setAttribute('aria-label', states[s]); e.target.textContent = s === 1 ? 'Stop Listening' : 'Start Listening'; };
document.getElementById('b-toggle').onclick = () => { const m = document.getElementById('more'); m.hidden = !m.hidden; };
document.getElementById('b-once').onclick = () => { document.getElementById('reply').textContent = 'The reply'; };
document.getElementById('b-spin').onclick = (e) => { e.target.textContent = 'Creating...'; setTimeout(() => { e.target.textContent = 'Create'; }, 800); };
document.getElementById('b-churn').onclick = () => { document.getElementById('panel').removeAttribute('style'); document.getElementById('panel').className = 'x'; };
document.getElementById('kbd').onclick = () => document.getElementById('search').focus();
document.getElementById('b-drag').onclick = () => { document.getElementById('live').textContent = 'Draggable item 1 was dropped.'; };
document.getElementById('b-post').onclick = () => { fetch('/save', { method: 'POST', body: 'x' }).then(() => { document.getElementById('reply').textContent = 'Saved'; }, () => {}); };
document.getElementById('b-go').onclick = () => { location.href = '/other'; };
document.getElementById('b-delete').onclick = () => { window.__deleted = true; document.body.dataset.deleted = '1'; };
document.getElementById('b-form').onclick = () => { window.__formPressed = true; };
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
let dir: string;
const writes: string[] = [];
before(async () => {
	browser = await chromium.launch();
	dir = await mkdtemp(join(tmpdir(), 'mm-discover-'));
	server = createServer((req, res) => {
		if (req.method !== 'GET') writes.push(`${req.method} ${req.url}`);
		res.writeHead(200, { 'content-type': 'text/html' }).end(req.url === '/other' ? '<!doctype html><p>Other</p>' : PAGE);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser?.close();
	await new Promise((done) => server?.close(done));
	await rm(dir, { recursive: true, force: true });
});

let facts: DiscoverFacts;
const byName = (name: string) => facts.controls.find((c) => c.name === name);

test('discovery presses only on a local copy of the original', () => {
	assert.throws(() => assertLocal('https://ui.shadcn.com'), /only against a local copy/);
	assert.throws(() => assertLocal('https://mm-shadcn-ui-old.example.workers.dev'), /only against a local copy/);
	for (const local of ['http://localhost:4000', 'http://127.0.0.1:3000', 'http://[::1]:4000']) assert.doesNotThrow(() => assertLocal(local));
});

test('each press is read as the shape of what it changed, past focus rings, hover styles, invisible style churn and a ticking clock', async () => {
	facts = await recordDiscovery(browser, origin, '/', dir);
	assert.equal(facts.error, undefined);
	assert.equal(byName('Start Listening')?.shape, 'cycle');
	assert.equal(byName('Start Listening')?.states, 3);
	assert.ok(byName('Start Listening')?.changes?.some((c) => c.what === 'attribute' && c.name === 'aria-label' && c.before === 'Processing audio' && c.after === 'Live audio waveform'));
	assert.equal(byName('Show more')?.shape, 'toggle');
	assert.equal(byName('Load reply')?.shape, 'one-way');
	assert.equal(byName('Create')?.shape, 'transient');
	assert.equal(byName('Nothing')?.shape, 'inert');
	assert.equal(byName('Rerender')?.shape, 'inert', 'a style that only drops animation-duration and a class with no look is not a change');
	assert.ok(facts.drift >= 1, 'the clock changes on its own');
});

test('a press that only moves focus, or only announces, is a change', () => {
	const kbd = byName('K');
	assert.equal(kbd?.found, 'cursor');
	assert.equal(kbd?.shape, 'one-way');
	assert.ok(kbd?.changes?.some((c) => c.what === 'focus'));
	assert.equal(kbd?.holder?.path, 'body>div4', 'the field and its addon are held by their group');
	assert.match(kbd?.holder?.at ?? '', /^div\|\|K#0$/);
	const drag = byName('Drag to reorder');
	assert.ok(drag?.changes?.some((c) => c.what === 'announced' || (c.what === 'text' && c.after === 'Draggable item 1 was dropped.')));
});

test('a press that writes to a server is blocked and not read; one that leaves the page is stopped', () => {
	assert.equal(byName('Save')?.shape, 'blocked');
	assert.match(byName('Save')?.why ?? '', /POST \/save/);
	assert.deepEqual(writes, []);
	assert.equal(byName('Go elsewhere')?.shape, 'navigates');
});

test('destructive names, forms, links and reveals are never pressed', () => {
	for (const name of ['Delete account', 'Inside a form', 'In a link', 'Menu']) assert.equal(byName(name), undefined, name);
	assert.equal(facts.excluded['destructive name'], 1);
	assert.equal(facts.excluded['in a form'], 1);
	assert.equal(facts.excluded['link'], 1);
	assert.equal(facts.excluded['a reveal uses it'], 1);
});

test('a recording is read back for the same page key, and claimed controls are not dead', async () => {
	const again = await recordDiscovery(browser, origin, '/', dir);
	assert.deepEqual(again, facts);
	const listen = byName('Start Listening')!;
	const none = { controls: new Set<string>(), holders: new Set<string>(), scenes: [], names: new Set<string>() };
	assert.equal(claimed(listen, none), false);
	assert.equal(claimed(listen, { ...none, controls: new Set([`${listen.sig}#${listen.nth}`]) }), true);
	const kbd = byName('K')!;
	assert.equal(claimed(kbd, { ...none, scenes: [{ holder: kbd.ancestors[0]!, labels: new Set([kbd.labelSig]) }] }), true);
	assert.equal(claimed(kbd, { ...none, holders: new Set([kbd.ancestors[0]!]) }), true);
	const route = routeDiscovery(facts, none);
	assert.deepEqual(route.dead.map((d) => d.name).sort(), ['Create', 'Drag to reorder', 'K', 'Load reply', 'Show more', 'Start Listening']);
	assert.deepEqual(route.unknown.map((u) => u.shape).sort(), ['blocked', 'navigates']);
	const store = await mkdtemp(join(tmpdir(), 'mm-discover-store-'));
	const first = await discoveryReport(store, { '/': route });
	assert.equal(first.count, 6);
	assert.equal(first.before, undefined);
	const second = await discoveryReport(store, { '/': { ...route, dead: route.dead.filter((d) => d.name !== 'Create') } });
	assert.deepEqual(second.before, { count: 6, added: [], cleared: ['/ "Create"'] });
	await rm(store, { recursive: true, force: true });
});

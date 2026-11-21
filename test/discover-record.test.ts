import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { assertLocal, recordDiscovery, type DiscoverFacts, type PressedControl } from '../src/discover/record.ts';
import { claimed, discoveryMarkdown, discoveryReport, draftReport, finishDiscovery, labelFilter, membersIn, lostUses, MAX_DEMO_ELEMENTS, noScene, partly, routeDiscovery, sceneUses, shortKey, type Claims, SCENE_CONTROLS, sceneHolders } from '../src/discover/convert.ts';
import { cutsOf } from '../src/discover/report.ts';

// One page of plain scripts, each control a shape of what a press can do; no framework is named.
const PAGE = `<!doctype html><html><head><style>
.ring:focus { outline: 3px solid red } .hov:hover { background: yellow } .addon { cursor: text } [hidden] { display: none }
@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 0.7s linear infinite }
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
<button id="b-xhr" type="button">Send report</button>
<button id="b-go" type="button">Go elsewhere</button>
<button id="b-delete" type="button">Delete account</button>
<form><button id="b-form" type="button">Inside a form</button></form>
<button id="b-menu" type="button" aria-expanded="false">Menu</button>
<button id="b-switch" type="button" role="switch" aria-checked="false">Wifi</button>
<div aria-expanded="false"><button type="button">Inner trigger</button></div>
<table role="grid"><tr><td><button type="button">15</button></td></tr></table>
<div><svg class="spin" width="16" height="16"><path d="M0 0h12v4H0z"/></svg><button type="button" id="b-gen">Generate</button></div>
<button type="button" class="tip">Hint</button><button type="button">Again</button><button type="button">Again</button><button type="button">Again</button>
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
document.getElementById('b-xhr').onclick = () => { const x = new XMLHttpRequest(); x.open('PUT', '/report'); x.onload = () => { document.getElementById('reply').textContent = 'Sent'; }; x.send('r'); };
document.getElementById('b-go').onclick = () => { location.href = '/other'; };
document.getElementById('b-delete').onclick = () => { window.__deleted = true; document.body.dataset.deleted = '1'; };
const tip = document.querySelector('.tip'); let shown;
tip.addEventListener('pointerenter', () => { shown = document.createElement('div'); shown.textContent = 'A hint'; document.body.append(shown); });
tip.addEventListener('pointerleave', () => { const s = shown; setTimeout(() => s?.remove(), 300); });
document.getElementById('b-form').onclick = () => { window.__formPressed = true; };
</script></body></html>`;

// Three Like in one box (the third an in-page repeat) and a Copy in each of three boxes (the third skipped once two did alike).
const REPEATS = `<!doctype html><html><body><p id="liked"></p><p id="copied"></p>
<div id="likes"><button type="button">Like</button><button type="button">Like</button><button type="button">Like</button></div>
<div id="c1"><button type="button">Copy</button></div><div id="c2"><button type="button">Copy</button></div><div id="c3"><button type="button">Copy</button></div>
<script>
const flip = (id) => { const p = document.getElementById(id); p.textContent = p.textContent ? '' : id; };
document.querySelectorAll('#likes button').forEach((b) => (b.onclick = () => flip('liked')));
document.querySelectorAll('[id^=c] button').forEach((b) => (b.onclick = () => flip('copied')));
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
		res.writeHead(200, { 'content-type': 'text/html' }).end(req.url === '/other' ? '<!doctype html><p>Other</p>' : req.url === '/repeats' ? REPEATS : PAGE);
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
	assert.equal(byName('Hint')?.shape, 'inert', 'what shows only while the pointer is on it is the hover');
	assert.equal(byName('Generate')?.shape, 'inert', 'a spinner beside it turns on its own: its box is never the same twice');
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
	assert.equal(byName('Send report')?.shape, 'blocked');
	assert.match(byName('Send report')?.why ?? '', /PUT \/report/);
	assert.deepEqual(writes, []);
	assert.equal(byName('Go elsewhere')?.shape, 'navigates');
});

test('destructive names, forms, links and reveals are never pressed', () => {
	for (const name of ['Delete account', 'Inside a form', 'In a link', 'Menu', 'Wifi']) assert.equal(byName(name), undefined, name);
	assert.equal(facts.excluded['left to the toggles'], 1);
	assert.equal(facts.excluded['left to the reveals'], 2, 'a trigger and the one button inside another');
	assert.deepEqual(facts.left?.map((l) => [l.to, l.name]), [['reveals', 'Menu'], ['toggles', 'Wifi'], ['reveals', 'Inner trigger'], ['grids', '15']]);
	assert.equal(byName('15'), undefined, "a grid's cells are its recorder's");
	assert.equal(facts.excluded['in a grid'], 1);
	assert.equal(facts.excluded['same as a control pressed'], 1);
	assert.equal(facts.controls.filter((c) => c.name === 'Again').length, 2);
	assert.deepEqual(facts.repeats, { 'button||Again#0': 1 });
	assert.equal(cutsOf({ excluded: { 'past 240 s on the page': 3 } }), '3 not reached (past 240 s on the page)');
	const none = { controls: new Set<string>(), holders: new Set<string>(), scenes: [], names: new Set<string>(), owned: new Map<string, string>() };
	assert.match(cutsOf(routeDiscovery(facts, none)), /1 same as a control pressed: 1 like "Again" \(button\|\|Again#0\)/);
	const unlooked = routeDiscovery(facts, { ...none, controls: new Set(['button||Menu#0']) }).unknown.filter((u) => u.why?.startsWith('left to'));
	assert.deepEqual(unlooked.map((u) => [u.name, u.why]), [['Wifi', 'left to the toggles, which recorded nothing for it'], ['Inner trigger', 'left to the reveals, which recorded nothing for it']], 'what the reveals recorded is theirs; the rest no one looked at');
	const grid = facts.left?.find((l) => l.to === 'grids');
	assert.ok(routeDiscovery(facts, none).unknown.some((u) => u.why === 'a grid of 1 cells no recording holds, its cells not pressed'));
	assert.ok(!routeDiscovery(facts, { ...none, holders: new Set([`${grid?.sig}#${grid?.nth}`]) }).unknown.some((u) => u.why?.startsWith('a grid')), 'a grid a recording holds is that recording\'s');
	assert.equal(facts.excluded['destructive name'], 1);
	assert.equal(facts.excluded['in a form'], 1);
	assert.equal(facts.excluded['link'], 1);
});

test('a recording is read back for the same page key, and claimed controls are not dead', async () => {
	const again = await recordDiscovery(browser, origin, '/', dir);
	assert.deepEqual(again, facts);
	const listen = byName('Start Listening')!;
	const none = { controls: new Set<string>(), holders: new Set<string>(), scenes: [], names: new Set<string>(), owned: new Map<string, string>() };
	assert.equal(claimed(listen, none), undefined);
	assert.equal(claimed(listen, { ...none, controls: new Set([`${listen.sig}#${listen.nth}`]) }), 'control');
	const kbd = byName('K')!;
	assert.equal(claimed(kbd, { ...none, scenes: [{ holder: kbd.ancestors[0]!, listed: 'div', labels: new Set([kbd.labelSig]) }] }), 'control');
	assert.equal(claimed(kbd, { ...none, holders: new Set([kbd.ancestors[0]!]) }), 'holder', 'a widget a recording ports whole leaves its other controls to the port to answer');
	assert.equal(routeDiscovery(facts, { ...none, holders: new Set([kbd.ancestors[0]!]) }).dead.find((d) => d.name === 'K')?.held, true);
	const route = routeDiscovery(facts, none);
	assert.deepEqual(route.dead.map((d) => d.name).sort(), ['Create', 'Drag to reorder', 'K', 'Load reply', 'Show more', 'Start Listening']);
	assert.deepEqual(route.unknown.filter((u) => !u.why?.startsWith('left to') && !u.why?.startsWith('a grid')).map((u) => u.shape).sort(), ['blocked', 'blocked', 'navigates']);
	const store = await mkdtemp(join(tmpdir(), 'mm-discover-store-'));
	const first = await discoveryReport(store, { '/': route });
	assert.equal(first.count, 6);
	assert.equal(first.before, undefined);
	const second = await discoveryReport(store, { '/': { ...route, dead: route.dead.filter((d) => d.name !== 'Create') } });
	assert.deepEqual(second.before, { count: 6, added: [], cleared: ['/ "Create"'] });
	await rm(store, { recursive: true, force: true });
});

test('both skips keep each repeat by its place, and the repeats of a control a recording takes are asked of the port, not dropped with it', async () => {
	const own = await mkdtemp(join(tmpdir(), 'mm-discover-claimed-'));
	const all = await recordDiscovery(browser, origin, '/repeats', own);
	assert.equal(all.error, undefined);
	assert.deepEqual(all.repeatsOf, {
		'button||Like#0': [{ sig: 'button||Like', nth: 2, labelSig: 'button||Like', pair: 2, name: 'Like', found: 'role' }],
		'button||Copy#0': [{ sig: 'button||Copy', nth: 2, labelSig: 'button||Copy', pair: 2, name: 'Copy', found: 'role' }],
	}, 'the in-page repeat past two in a box, and the same control once two of it did alike');
	const none = { controls: new Set<string>(), holders: new Set<string>(), scenes: [], names: new Set<string>() };
	const copy = all.controls.find((c) => c.name === 'Copy' && c.nth === 0)!;
	const byScene = routeDiscovery(all, { ...none, scenes: [{ holder: copy.ancestors[0]!, labels: new Set([copy.labelSig]) }] });
	assert.deepEqual(byScene.dead.filter((d) => d.name === 'Copy').map((d) => [d.nth, d.shape]), [[1, 'toggle'], [2, 'toggle']], 'the pressed Copy a recorded demo takes is its; its repeat is not');
	assert.match(byScene.dead.find((d) => d.name === 'Copy' && d.nth === 2)?.what ?? '', /a repeat of one a recording ports/);
	const likeClaim = { controls: ['button||Like#0'], names: [] };
	const skipped = await recordDiscovery(browser, origin, '/repeats', own, { claimed: likeClaim });
	assert.equal(skipped.claimedSkipped, 1);
	const route = routeDiscovery(skipped, { ...none, controls: new Set(likeClaim.controls) });
	assert.deepEqual(route.dead.filter((d) => d.name === 'Like').map((d) => [d.nth, d.shape]), [[1, 'toggle'], [2, 'not pressed']], 'the Like a recording takes was not pressed; the one in its place is asked of the port');
	assert.equal(routeDiscovery(skipped, { ...none, controls: new Set([...likeClaim.controls, 'button||Like#2']) }).dead.filter((d) => d.name === 'Like').length, 1, 'a repeat a recording takes too is its');
	await rm(own, { recursive: true, force: true });
});

test('a repeat kept with no place is dead on its own line, never handled with the one pressed', async () => {
	const app = await mkdtemp(join(tmpdir(), 'mm-discover-unasked-'));
	const files: Record<string, string> = {
		'pages/index.tsrx': `// Generated by markless-migrate convert from the old site; change the converter, not this file. (/)
export default function Page() @{
	<><main><button onClick={() => copy()}>Copy</button><button>Copy</button><button>Copy</button><button>Copy</button></main></>
}
`,
		'lib/parts/registry.ts': 'export const PARTS = [];\n',
	};
	for (const [file, text] of Object.entries(files)) {
		await mkdir(dirname(join(app, file)), { recursive: true });
		await writeFile(join(app, file), text);
	}
	const draft = draftReport({ '/': { candidates: 4, found: { role: 4, cursor: 0 }, pressed: 1, claimed: 0, inert: 0, dead: [{ name: 'Copy', sig: 'button||Copy', nth: 0, labelSig: 'button||Copy', found: 'role' as const, shape: 'transient' as const, what: '', repeated: 3 }], unknown: [], excluded: {}, seconds: 1 } });
	const done = await finishDiscovery(app, draft);
	const r = done.routes['/']!;
	assert.deepEqual(r.handled?.map((h) => [h.name, h.repeated ?? 0]), [['Copy', 0]], 'only the one pressed is answered');
	assert.deepEqual(r.dead.map((d) => [d.name, d.repeated ?? 0]), [['Copy', 2]]);
	assert.match(r.dead[0]!.what, /not asked of the port/);
	assert.equal(done.count, 3);
	await rm(app, { recursive: true, force: true });
});

test('every repeat of a dead control is asked of the port: one the port does not answer is dead, not counted as handled with the first', async () => {
	const app = await mkdtemp(join(tmpdir(), 'mm-discover-repeats-'));
	const files: Record<string, string> = {
		'pages/index.tsrx': `// Generated by markless-migrate convert from the old site; change the converter, not this file. (/)
export default function Page() @{
	<><main><button onClick={() => copy()}>Copy</button><button>Copy</button><button onClick={() => copy()}>Copy</button><button>Copy</button></main></>
}
`,
		'lib/parts/registry.ts': 'export const PARTS = [];\n',
	};
	for (const [file, text] of Object.entries(files)) {
		await mkdir(dirname(join(app, file)), { recursive: true });
		await writeFile(join(app, file), text);
	}
	const copy = (nth: number) => ({ sig: 'button||Copy', nth, labelSig: 'button||Copy' });
	const draft = draftReport({ '/': { candidates: 4, found: { role: 4, cursor: 0 }, pressed: 1, claimed: 0, inert: 0, dead: [{ name: 'Copy', ...copy(0), found: 'role' as const, shape: 'transient' as const, what: '', repeated: 3, repeatsOf: [copy(1), copy(2), copy(3)] }], unknown: [], excluded: {}, seconds: 1 } });
	assert.equal(draft.count, 4, 'before the port is asked, the repeats are dead with the one pressed');
	const done = await finishDiscovery(app, draft);
	const r = done.routes['/']!;
	assert.deepEqual(r.dead.map((d) => [d.name, d.nth]), [['Copy', 1], ['Copy', 3]], 'the repeats the port does not answer');
	assert.match(r.dead[0]!.what, /a repeat of the one pressed/);
	assert.deepEqual(r.handled?.map((h) => [h.name, h.repeated ?? 0]), [['Copy', 0], ['Copy', 0]], 'the pressed one and the one repeat the port answers');
	assert.equal(done.count, 2);
	assert.equal(done.handled, 2);
	await rm(app, { recursive: true, force: true });
});

test('the written port is asked about each control the recordings left dead: a site part or its own handler ports it', async () => {
	const app = await mkdtemp(join(tmpdir(), 'mm-discover-port-'));
	const files: Record<string, string> = {
		'pages/index.tsrx': `// Generated by markless-migrate convert from the old site; change the converter, not this file. (/)
import { behave, listen } from '../lib/parts/index.ts';
export default function Page() @{
	<><main onClick={(event) => behave(event)} onIdle={() => listen()}><button data-slot="copy-button">Copy</button><button onClick={() => more()}>Show more</button><button>Start Listening</button><div onClick={(event) => pick(event)}><button aria-label="Next month"></button></div><div onClick={(event) => play(event)}><button>Suggest</button></div></main></>
}
`,
		'lib/parts/index.ts': 'export function behave() {}\nexport function listen() {}\n',
		'lib/parts/registry.ts': `import { SITE_PARTS } from '../site/parts.ts';\nexport const PARTS = [...SITE_PARTS];\n`,
		'lib/site/parts.ts': `export const SITE_PARTS = [{ click(target) { return Boolean(target.closest('[data-slot="copy-button"]')); } }];\n`,
	};
	for (const [file, text] of Object.entries(files)) {
		await mkdir(dirname(join(app, file)), { recursive: true });
		await writeFile(join(app, file), text);
	}
	const dead = (name: string, slot = '', held = false) => ({ name, sig: `button|${slot}|${name}`, nth: 0, found: 'role' as const, shape: 'toggle' as const, what: '', ...(held ? { held } : {}) });
	const next = { ...dead('Next month', '', true), sig: 'button||', labelSig: 'button||Next month', pair: 0 };
	const draft = draftReport({ '/': { candidates: 5, found: { role: 5, cursor: 0 }, pressed: 5, claimed: 0, inert: 0, dead: [dead('Copy', 'copy-button', true), dead('Show more'), dead('Start Listening', '', true), next, dead('Suggest')], unknown: [], excluded: {}, seconds: 1 } });
	assert.equal(draft.count, 5);
	const done = await finishDiscovery(app, draft);
	assert.deepEqual(done.routes['/']!.dead.map((d) => d.name), ['Start Listening', 'Suggest'], 'a handler around a control answers it only for the widget it is held in');
	assert.match(done.routes['/']!.dead[0]!.what, /inside a widget a recording ports, which does not answer this press/);
	assert.deepEqual(done.routes['/']!.handled?.map((a) => [a.name, a.by.split(' ')[0]]), [['Copy', 'site-part'], ['Show more', 'markless'], ['Next month', 'markless']]);
	assert.equal(done.count, 2);
	assert.equal(done.handled, 3, 'a handler on the port is counted apart: its effect is not compared');
	await rm(app, { recursive: true, force: true });
});

test('a discovered demo\'s toggle is ported only with its recorded way back, followed by its place whatever its label', () => {
	const play: PressedControl = { sig: 'button||', nth: 0, labelSig: 'button||Play', name: 'Play', found: 'role', ancestors: ['div||Stopped#0'], shape: 'toggle', states: 2, path: 'body>div1>button1', changes: [{ at: 'x', what: 'attribute', name: 'aria-label', before: 'Play', after: 'Pause' }] };
	const none: Claims = { controls: new Set<string>(), holders: new Set<string>(), names: new Set<string>(), scenes: [], owned: new Map<string, string>() };
	const scene = (back: boolean) => ({ holder: 'div||Stopped#0', listed: SCENE_CONTROLS, labels: new Set(['button||Play', ...(back ? ['button||Pause'] : [])]), root: 'body>div1', usesAt: new Map([['button1', { recorded: back ? 2 : 1, skipped: 0, why: '', back }]]) });
	assert.equal(claimed(play, { ...none, scenes: [scene(false)] }), 'control');
	assert.match(partly(play, { ...none, scenes: [scene(false)] }) ?? '', /no use of it back to the state the demo loads in was recorded/);
	assert.equal(partly(play, { ...none, scenes: [scene(true)] }), undefined, 'Play and Pause both recorded: ported');
});

test('a scene is recorded around the outermost unported demo, or again over a recorded demo whose listing left the control out', () => {
	type Holder = NonNullable<PressedControl['holder']>;
	const control = (name: string, path: string, holder: string, ancestors: string[], over: Partial<PressedControl> & { h?: Partial<Holder> } = {}): PressedControl => {
		const { h, ...rest } = over;
		return { sig: `button||${name}`, nth: 0, labelSig: `button||${name}`, name, found: 'role', ancestors, shape: 'toggle', states: 2, path, holder: { path: holder, at: `${holder}#0`, canvas: name === 'Start Listening', size: 12, ancestors: ancestors.slice(1), inside: [], ...h }, changes: [{ at: 'x', what: 'text' }], ...rest };
	};
	const facts = (controls: PressedControl[]): DiscoverFacts => ({ route: '/', browser: 'chromium', candidates: controls.length, excluded: {}, drift: 0, reloads: 0, ms: 1, controls });
	const none: Claims = { controls: new Set<string>(), holders: new Set<string>(), names: new Set<string>(), scenes: [], owned: new Map<string, string>() };
	const recorded = { holder: 'div|preview|demo#0', listed: 'textarea', labels: new Set(['textarea||Ask']) };
	const page = facts([
		control('Start Listening', 'body>div1>div2>button1', 'body>div1', ['div||card#0', 'div||page#0']),
		control('Static', 'body>div1>div2>div3>button1', 'body>div1>div2', ['div||inner#0', 'div||card#0', 'div||page#0']),
		control('Fix the build', 'body>div3>div1>button2', 'body>div3>div1', ['div|preview|demo#0', 'div||docs#0'], { h: { at: 'div|preview|demo#0', ancestors: ['div||docs#0'] } }),
		control('K', 'body>div4>div1', 'body>div4', ['div|group|#0'], { changes: [{ at: 'x', what: 'focus' }] }),
	]);
	const holders = sceneHolders(page, { ...none, scenes: [recorded] });
	assert.deepEqual(
		holders.map((h) => [h.path, h.at, h.listed === SCENE_CONTROLS ? 'discovered' : h.listed, h.replaces ?? '', h.controls]),
		[
			['body>div1', 'body>div1#0', 'discovered', '', 2],
			['body>div3>div1', 'div|preview|demo#0', `textarea, ${SCENE_CONTROLS}`, 'div|preview|demo#0', 1],
		],
		'the outer holder takes the inner one: two controls in one scene',
	);
	assert.deepEqual(holders[1]?.labels, ['Ask'], "a recorded demo recorded again keeps its own controls' labels");
	assert.deepEqual(holders.map((h) => membersIn(h)), [['div2>button1', 'div2>div3>button1'], ['button2']], 'the dead controls are followed by their place in the holder, not their label');
	assert.equal(labelFilter(['Start Listening', 'Stop Listening', 'a+b']), '^(Start Listening|Stop Listening|a\\+b)$');
	const route = routeDiscovery(page, { ...none, scenes: [] }, holders);
	assert.ok(route.notes?.some((n) => /canvas .* not ported/.test(n)));
	assert.ok(route.notes?.some((n) => n.startsWith('"K" only moves focus')));
});

test('no scene is recorded over a widget, a page-sized or unsteady holder, what another recording owns, or for a transient press, and each is named', () => {
	const at = (path: string) => `div||${path}#0`;
	const control = (name: string, over: Partial<PressedControl> & { h?: Partial<NonNullable<PressedControl['holder']>> } = {}): PressedControl => {
		const { h, ...rest } = over;
		return { sig: `button||${name}`, nth: 0, labelSig: `button||${name}`, name, found: 'role', ancestors: [at('card'), at('page')], shape: 'toggle', states: 2, path: 'body>div1>button1', holder: { path: 'body>div1', at: at('card'), size: 12, ancestors: [at('page')], inside: [shortKey(at('card'))], ...h }, changes: [{ at: 'x', what: 'text' }], ...rest };
	};
	const none: Claims = { controls: new Set<string>(), holders: new Set<string>(), names: new Set<string>(), scenes: [], owned: new Map<string, string>() };
	const only = (c: PressedControl, claims = none) => ({ holders: sceneHolders({ route: '/', browser: 'chromium', candidates: 1, excluded: {}, drift: 0, reloads: 0, ms: 1, controls: [c] }, claims), note: routeDiscovery({ route: '/', browser: 'chromium', candidates: 1, excluded: {}, drift: 0, reloads: 0, ms: 1, controls: [c] }, claims).notes ?? [] });
	assert.equal(only(control('Fine')).holders.length, 1);
	const widget = only(control('Pick', { h: { widget: 'listbox' } }));
	assert.deepEqual([widget.holders.length, widget.note], [0, ['"Pick" got no scene: its presses change the inside of a listbox, which a part drives']]);
	const big = only(control('Big', { h: { size: MAX_DEMO_ELEMENTS + 1 } }));
	assert.equal(big.holders.length, 0);
	assert.match(big.note[0] ?? '', new RegExp(`of ${MAX_DEMO_ELEMENTS + 1} elements, over the ${MAX_DEMO_ELEMENTS}`));
	assert.match(only(control('Body', { h: { path: 'body' } })).note[0] ?? '', /reaches across the page/);
	assert.match(only(control('Dice', { unsteady: true })).note[0] ?? '', /left another page/);
	const owned = only(control('Over'), { ...none, owned: new Map([[shortKey(at('card')), 'the widget div|']]) });
	assert.deepEqual([owned.holders.length, owned.note[0]], [0, '"Over" got no scene: what holds it, div|, holds the widget div|, which another recording ports']);
	assert.equal(only(control('Copy', { shape: 'transient' })).holders.length, 0, 'a transient press is left to the port check');
	assert.equal(only(control('Copy', { shape: 'transient' })).note.length, 0);
});

test('a control a scene ports only in part is said so and fails the job: uses the bound cut, or a click only', () => {
	const scene = { edges: [{ from: 0, control: 'button||Fix the build#0', to: 1, frames: [] }, { from: 0, control: 'button||Ask#0', to: 2, frames: [] }], skippedUses: [{ control: 'button||Ask#0', from: 1, why: 'past 14 states' }] };
	const uses = sceneUses(scene);
	assert.deepEqual(uses.get('button||Ask'), { recorded: 1, skipped: 1, why: 'past 14 states' });
	const claims: Claims = { controls: new Set(), holders: new Set(), names: new Set(), owned: new Map(), scenes: [{ holder: 'div|preview|demo#0', listed: 'button', labels: new Set(['button||Ask', 'button||Fix the build', 'div||Open']), uses }] };
	const control = (name: string, sig = `button||${name}`): PressedControl => ({ sig, nth: 0, labelSig: sig, name, found: 'role', ancestors: ['div|preview|demo#0'], shape: 'one-way', changes: [{ at: 'x', what: 'text' }] });
	assert.equal(partly(control('Ask'), claims), 'ported for 1 of 2 uses: 1 not recorded (past 14 states)');
	assert.equal(partly(control('Fix the build'), claims), undefined);
	assert.match(partly(control('Open', 'div||Open'), claims) ?? '', /click only/);
	const route = routeDiscovery({ route: '/', browser: 'chromium', candidates: 3, excluded: {}, drift: 0, reloads: 0, ms: 1, controls: [control('Ask'), control('Fix the build'), control('Open', 'div||Open')] }, claims);
	assert.deepEqual(route.partly?.map((p) => p.name), ['Ask', 'Open']);
	assert.deepEqual(route.dead, [], 'neither is dead: each is its own class');
	assert.equal(discoveryMarkdown(draftReport({ '/': route })).failed, true, 'and the job fails on them as on a dead control');
});

test('a recorded demo is replaced only by a recording that keeps every use it had', () => {
	const edge = (control: string) => ({ from: 0, control, to: 1, frames: [] });
	assert.deepEqual(lostUses({ edges: [edge('textarea||Ask#0|fill'), edge('textarea||Ask#0|enter'), edge('button||Fix#0')] }, [{ edges: [edge('textarea||Ask#0|fill'), edge('button||Fix#0'), edge('button||New#0')] }]), ['textarea||Ask#0|enter']);
	assert.deepEqual(lostUses({ edges: [edge('button||Fix#0')] }, [{ edges: [edge('button||Fix#0'), edge('button||New#0')] }]), []);
});

test('a page region (main, a layout landmark, the body) is never a demo', () => {
	const c: PressedControl = { sig: 'button||Go', nth: 0, labelSig: 'button||Go', name: 'Go', found: 'role', ancestors: ['main||Go#0'], shape: 'one-way', path: 'body>main1>button1', holder: { path: 'body>main1', at: 'main||Go#0', size: 12, landmark: true }, changes: [{ at: 'x', what: 'text' }] };
	assert.match(noScene(c, { controls: new Set(), holders: new Set(), names: new Set(), scenes: [], owned: new Map() }) ?? '', /a page landmark, which is never a demo/);
});

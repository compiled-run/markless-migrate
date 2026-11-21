import { createHash } from 'node:crypto';
// What a demo's own controls did on the old page, recorded frame by frame (src/convert/scenes.ts), on a page whose Send
// shows a typing row, then streams a reply in, and whose Reset clears it.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { captureScenes, edgeLabel, type SceneNode } from '../src/convert/scenes.ts';
import { SCENE_CONTROLS, sceneUsesAt } from '../src/discover/convert.ts';

const PAGE = `<!doctype html><html><body><main>
<div data-slot="preview"><div role="log"><p>Hi</p></div><button data-slot="button" id="send">Send</button><button data-slot="button" id="reset" disabled>Reset</button></div>
<script>
const log = document.querySelector('[role=log]');
document.getElementById('send').addEventListener('click', () => {
	const typing = document.createElement('p');
	typing.textContent = '…';
	log.append(typing);
	setTimeout(() => {
		typing.remove();
		const reply = document.createElement('p');
		log.append(reply);
		let n = 0;
		const words = 'Hello there friend'.split(' ');
		const tick = () => { reply.textContent = words.slice(0, ++n).join(' '); if (n < words.length) setTimeout(tick, 60); else document.getElementById('reset').disabled = false; };
		tick();
	}, 200);
});
document.getElementById('reset').addEventListener('click', () => { log.replaceChildren(log.firstElementChild); document.getElementById('reset').disabled = true; });
</script></main></body></html>`;

const texts = (n: SceneNode): string => ('text' in n ? n.text : n.kids.map(texts).join('|'));

test('a demo\'s controls are used from every state they lead to, and each use is recorded frame by frame with its timing', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		const limits = { states: 3, depth: 2, settle: 400, max: 5000 };
		const { scenes } = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', limits);
		assert.equal(scenes.length, 1);
		// A docs preview's recording is the file, and the shape, it was before discovered demos: kept recordings stay valid.
		const file = `${createHash('sha256').update(`scenes:8:/|[data-slot="preview"] button|${JSON.stringify(limits)}`).digest('hex').slice(0, 16)}.json`;
		const kept = JSON.parse(await readFile(join(dir, file), 'utf8')).scenes[0];
		assert.deepEqual(Object.keys(kept), ['sig', 'nth', 'states', 'edges', 'skipped', 'skippedUses']);
		assert.ok(kept.skippedUses.every((u: { from: number; why: string }) => u.from === 2 && /past 2 uses deep/.test(u.why)), 'the state two uses deep is reached but not explored: its uses are named');
		const scene = scenes[0]!;
		const log = (n: SceneNode) => texts((n as Extract<SceneNode, { kids: unknown }>).kids[0]!);
		const reply = 'Hello there friend';
		assert.deepEqual(scene.states.map(log), ['Hi', `Hi|${reply}`, `Hi|${reply}|${reply}`]);
		const send = scene.edges.find((e) => e.from === 0 && e.control === 'button|button|Send#0')!;
		assert.equal(send.to, 1);
		assert.deepEqual(send.frames.map((f) => log(f.tree)), ['Hi|…', 'Hi|Hello', 'Hi|Hello there', 'Hi|Hello there friend']);
		assert.ok(send.frames[1]!.t >= 180 && send.frames[2]!.t - send.frames[1]!.t >= 40, `frame times ${send.frames.map((f) => f.t)}`);
		const reset = scene.edges.find((e) => e.from === 1 && e.control === 'button|button|Reset#0')!;
		assert.equal(reset.to, 0, 'Reset goes back to the state the page loaded in');
		// A node keeps its id across the frames of a use and across uses from the state it is in.
		const ids = (n: SceneNode): number[] => [n.id, ...('kids' in n ? n.kids.flatMap(ids) : [])];
		assert.ok(ids(reset.frames[0]!.tree).every((id) => ids(scene.states[1]!).includes(id)));
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

// Each load of this page sends one more row than the last: a state reached again by replay holds more than when it was recorded.
const GROWING = `<!doctype html><html><body><main>
<div data-slot="preview"><div role="log"><p>Hi</p></div><button data-slot="button" id="send">Send</button></div>
<script>
const loads = Number(localStorage.getItem('loads') ?? 0) + 1;
localStorage.setItem('loads', String(loads));
document.getElementById('send').addEventListener('click', () => {
	const log = document.querySelector('[role=log]');
	for (let i = 0; i < loads; i++) { const row = document.createElement('div'); row.innerHTML = '<p>Row</p>'; log.append(row); }
});
</script></main></body></html>`;

test('a state that a replay reaches holding more than it was recorded with is recorded from, not a failed capture', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(GROWING));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		const { scenes } = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', { states: 3, depth: 2, settle: 200, max: 2000 });
		assert.equal(scenes.length, 1);
		assert.ok(scenes[0]!.states.length >= 2);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('a listing that names its controls by text uses only those (Replay), leaving the demo\'s other buttons alone', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		const { scenes } = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', { states: 3, depth: 2, settle: 400, max: 5000 }, '^Send$');
		assert.deepEqual([...new Set(scenes[0]!.edges.map((e) => e.control))], ['button|button|Send#0']);
		const none = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', { states: 3, depth: 2, settle: 400, max: 5000 }, '^Replay$');
		assert.equal(none.scenes.length, 0, 'a demo with no such control is not captured');
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

// The AI Elements approval demos (confirmation, tool): Send message asks for approval, Approve or Deny answers, Reset starts over.
const APPROVAL = `<!doctype html><html><body><main>
<div data-slot="preview"><div id="log"></div><button data-slot="button" id="next">Send message</button></div>
<script>
const log = document.getElementById('log'), next = document.getElementById('next');
const answer = (text) => () => { log.lastElementChild.remove(); log.insertAdjacentHTML('beforeend', '<p>' + text + '</p>'); next.textContent = 'Reset'; next.hidden = false; };
next.addEventListener('click', () => {
	if (next.textContent === 'Reset') { log.replaceChildren(); next.textContent = 'Send message'; return; }
	next.hidden = true;
	log.insertAdjacentHTML('beforeend', '<p>Clean up the build folder.</p><div><button data-slot="button">Deny</button><button data-slot="button">Approve</button></div>');
	const [deny, approve] = log.querySelectorAll('button');
	deny.addEventListener('click', answer('Okay, I left the dist folder in place.'));
	approve.addEventListener('click', answer('Removed the dist folder.'));
});
</script></main></body></html>`;

test("the site's listing plays the AI Elements approval demos: Send message, then Approve or Deny, then Reset", async () => {
	const listed = (JSON.parse(await readFile(join(import.meta.dirname, '..', 'examples', 'shadcn-ui-markless', 'lib', 'site', 'controls.json'), 'utf8')) as { selector?: string; action: string; routes?: string; text?: string }[]).filter((c) => c.action === 'play');
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(APPROVAL));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		for (const route of ['/docs/ai-elements/aria/confirmation', '/docs/ai-elements/base/tool']) {
			const used = new Set<string>();
			for (const c of listed.filter((c) => c.selector && (!c.routes || new RegExp(c.routes).test(route)))) {
				const { scenes } = await captureScenes(browser, origin, route, dir, c.selector!, { states: 6, depth: 3, settle: 300, max: 5000 }, c.text);
				for (const e of scenes.flatMap((s) => s.edges)) used.add(e.control.replace(/^button\|button\|/, '').replace(/#\d+$/, ''));
			}
			assert.deepEqual([...used].sort(), ['Approve', 'Deny', 'Reset', 'Send message'], route);
		}
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

// Send adds a row its script fades in with element.animate (as motion does): no DOM change marks the animation.
const ANIMATED = `<!doctype html><html><body><main>
<div data-slot="preview"><div role="log"></div><button data-slot="button" id="send">Send</button></div>
<script>
document.getElementById('send').addEventListener('click', () => {
	const row = document.createElement('p');
	row.textContent = 'Hi';
	document.querySelector('[role=log]').append(row);
	row.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
}, { once: true });
</script></main></body></html>`;

test('a row a script animates in (element.animate) carries the animation\'s keyframes and timing in the frame it appears in', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ANIMATED));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		const { scenes } = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', { states: 2, depth: 1, settle: 500, max: 3000 });
		const send = scenes[0]!.edges.find((e) => e.control === 'button|button|Send#0')!;
		const row = (n: SceneNode): SceneNode | undefined => ('tag' in n ? (n.tag === 'p' ? n : n.kids.map(row).find(Boolean)) : undefined);
		const first = row(send.frames[0]!.tree) as Extract<SceneNode, { tag: string }>;
		const animate = JSON.parse(first.attrs.find(([k]) => k === '.animate')?.[1] ?? '[]');
		assert.deepEqual(animate.map((a: { k: { opacity: string }[]; d: number; e: string }) => [a.k.map((k) => k.opacity), a.d, a.e]), [[['0', '1'], 300, 'ease-out']]);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

// The AI Elements queue demo's stream: each step, then a pause longer than the quiet that ends a use, then the next.
const PAUSING = `<!doctype html><html><body><main>
<div data-slot="preview"><p id="step">0 of 3 done</p><button data-slot="button" id="replay">Replay</button></div>
<script>
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
document.getElementById('replay').addEventListener('click', async () => {
	for (let n = 1; n <= 3; n++) { await sleep(n === 1 ? 50 : 700); document.getElementById('step').textContent = n + ' of 3 done'; }
});
</script></main></body></html>`;

test('a use whose demo pauses on a timer of its own for longer than the quiet that ends a use is recorded to its end', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAUSING));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		const { scenes } = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', { states: 3, depth: 1, settle: 400, max: 5000 });
		const replay = scenes[0]!.edges.find((e) => e.from === 0)!;
		const step = (n: SceneNode) => texts((n as Extract<SceneNode, { kids: unknown }>).kids[0]!);
		assert.deepEqual(replay.frames.map((f) => step(f.tree)), ['1 of 3 done', '2 of 3 done', '3 of 3 done']);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

// A page-level demo, as on ui.shadcn.com's /preview pages: a card with no docs preview around it, found by the sig#nth discovery gave.
const CARD = `<!doctype html><html><body><main><h1>Preview</h1>
<div class="card"><div role="img" aria-label="Processing audio"><canvas width="40" height="10"></canvas></div>
<button type="button" id="listen">Start Listening</button><button type="button" aria-expanded="false">More</button></div>
<script>
const labels = ['Processing audio', 'Live audio waveform', 'Audio waveform idle'];
let s = 0;
document.getElementById('listen').onclick = (e) => { s = s === 1 ? 2 : 1; document.querySelector('[role=img]').setAttribute('aria-label', labels[s]); e.target.textContent = s === 1 ? 'Stop Listening' : 'Start Listening'; };
</script></main></body></html>`;

test('a page-level demo is recorded from the element discovery found around its control, with only the controls no ARIA mark claims', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(CARD));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		await assert.rejects(captureScenes(browser, origin, '/', dir, SCENE_CONTROLS, { states: 4, depth: 3, settle: 300, max: 3000 }, '', 'div||Gone#0'), /the demo div\|\|Gone#0 is not on \/ as it loads/);
		const { scenes } = await captureScenes(browser, origin, '/', dir, SCENE_CONTROLS, { states: 4, depth: 3, settle: 300, max: 3000 }, '', 'div||Start ListeningMore#0');
		assert.equal(scenes.length, 1);
		const scene = scenes[0]!;
		assert.match(scene.sig, /^div\|\|Start Listening/);
		const label = (n: SceneNode) => ((n as Extract<SceneNode, { kids: unknown }>).kids[0] as Extract<SceneNode, { attrs: unknown }>).attrs.find(([k]) => k === 'aria-label')?.[1];
		assert.deepEqual(scene.states.map(label), ['Processing audio', 'Live audio waveform', 'Audio waveform idle']);
		assert.ok(scene.edges.every((e) => e.control.startsWith('button||')), 'the disclosure is left to the reveals');
		assert.deepEqual(scene.edges.map((e) => [e.from, e.to]).sort(), [[0, 1], [1, 2], [2, 1]].sort());
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('a state the search reaches but does not explore counts its uses as skipped, so a control past the depth is ported only in part', async () => {
	const ROTATOR = '<!doctype html><html><body><div data-slot="preview"><p id="q">Quote 1</p><button type="button">Next</button></div><script>let n = 1; document.querySelector("button").onclick = () => { n = n % 6 + 1; document.getElementById("q").textContent = "Quote " + n; };</script></body></html>';
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ROTATOR));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		const { scenes } = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', { states: 8, depth: 4, settle: 200, max: 2000 });
		const scene = scenes[0]!;
		assert.equal(scene.states.length, 5, 'quotes 1 to 5: quote 5 is four uses deep');
		assert.equal(scene.edges.length, 4);
		assert.deepEqual(scene.skippedUses?.map((u) => [u.control, u.from]), [[scene.edges[0]!.control, 4]], 'Next from quote 5 is a use not recorded');
		assert.match(scene.skippedUses?.[0]?.why ?? '', /past 4 uses deep/);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('a discovered demo\'s controls are followed by their place in the demo, not their label, so an icon toggle\'s Pause is used too', async () => {
	const PLAYER = '<!doctype html><html><body><div class="player"><button type="button" aria-label="Play"><svg width="10" height="10"></svg></button><p id="s">Stopped</p></div><script>const b = document.querySelector("button"); b.onclick = () => { const on = b.getAttribute("aria-label") === "Play"; b.setAttribute("aria-label", on ? "Pause" : "Play"); document.getElementById("s").textContent = on ? "Playing" : "Stopped"; };</script></body></html>';
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PLAYER));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scenes-'));
	const browser = await chromium.launch();
	try {
		const { scenes } = await captureScenes(browser, origin, '/', dir, SCENE_CONTROLS, { states: 4, depth: 3, settle: 200, max: 2000 }, '', 'div||Stopped#0', ['button1']);
		const scene = scenes[0]!;
		assert.deepEqual(scene.edges.map((e) => [e.from, edgeLabel(e.control), e.at, e.to]), [[0, 'button||Play', 'button1', 1], [1, 'button||Pause', 'button1', 0]]);
		assert.ok(sceneUsesAt(scene).get('button1')?.back, 'its way back to the first state is recorded');
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

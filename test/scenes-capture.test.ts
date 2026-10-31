// What a demo's own controls did on the old page, recorded frame by frame (src/convert/scenes.ts), on a page whose Send
// shows a typing row, then streams a reply in, and whose Reset clears it.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { captureScenes, type SceneNode } from '../src/convert/scenes.ts';

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
		const { scenes } = await captureScenes(browser, origin, '/', dir, '[data-slot="preview"] button', { states: 3, depth: 2, settle: 400, max: 5000 });
		assert.equal(scenes.length, 1);
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

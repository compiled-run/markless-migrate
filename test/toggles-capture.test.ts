// What using each in-place control did on the old page (src/convert/toggles.ts captureToggles), on a page whose radio
// group is named by a caption and whose switch disables a field, and on one with groups of pressed buttons.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { captureToggles } from '../src/convert/toggles.ts';

const PAGE = `<!doctype html><html><body><main>
<div role="radiogroup"><button role="radio" aria-checked="true">Left</button><button role="radio" aria-checked="false">Center</button><button role="radio" aria-checked="false">Right</button></div>
<p>Align <code id="caption">left</code></p>
<button role="switch" aria-checked="false" id="voice">Voice</button><input id="field">
<p id="clock">0</p>
<script>
const radios = [...document.querySelectorAll('[role=radio]')];
for (const b of radios) b.addEventListener('click', () => {
	const next = b.getAttribute('aria-checked') !== 'true';
	for (const o of radios) o.setAttribute('aria-checked', String(o === b && next));
	document.getElementById('caption').textContent = next ? b.textContent.toLowerCase() : 'none';
});
const voice = document.getElementById('voice');
voice.addEventListener('click', () => {
	const on = voice.getAttribute('aria-checked') !== 'true';
	voice.setAttribute('aria-checked', String(on));
	document.getElementById('field').toggleAttribute('disabled', on);
});
let n = 0;
setInterval(() => (document.getElementById('clock').textContent = String(++n)), 50);
</script></main></body></html>`;

test('what a control\'s state drives elsewhere on the page is captured in each state; what changes on its own is not', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-'));
	const browser = await chromium.launch();
	try {
		const { groups } = await captureToggles(browser, origin, '/', dir);
		const radios = groups.find((g) => g.kind === 'radio')!;
		assert.equal(radios.clears, true);
		assert.deepEqual(radios.dependents?.map((d) => d.sig), ['code||left']);
		assert.deepEqual(Object.fromEntries(Object.entries(radios.dependents![0]!.states).map(([k, v]) => [k, v.inner])), { '0': 'left', '1': 'center', '2': 'right', '-1': 'none' });
		const voice = groups.find((g) => g.controls[0]!.sig === 'button||Voice')!;
		assert.deepEqual(voice.dependents?.map((d) => [d.sig, d.states['on']!.attrs['disabled'], d.states['off']!.attrs['disabled']]), [['input||', '', undefined]]);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

const CHOICE_PAGE = `<!doctype html><html><body><main>
<div role="group" data-orientation="horizontal" id="single"><button aria-pressed="true">Left</button><button aria-pressed="false">Center</button><button aria-pressed="false">Right</button></div>
<p>Align <code id="caption">left</code></p>
<div role="group" data-orientation="horizontal" id="multi"><button aria-pressed="false">Bold</button><button aria-pressed="false">Italic</button></div>
<script>
const single = [...document.querySelectorAll('#single button')];
for (const b of single) b.addEventListener('click', () => {
	const next = b.getAttribute('aria-pressed') !== 'true';
	for (const o of single) o.setAttribute('aria-pressed', String(o === b && next));
	document.getElementById('caption').textContent = next ? b.textContent.toLowerCase() : 'none';
});
for (const b of document.querySelectorAll('#multi button')) b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
</script></main></body></html>`;

test('pressed buttons that unpress each other are one choice, read by a caption; pressed buttons that do not are toggles each', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(CHOICE_PAGE));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-'));
	const browser = await chromium.launch();
	try {
		const { groups } = await captureToggles(browser, origin, '/', dir);
		const single = groups.find((g) => g.controls.some((c) => c.sig.endsWith('|Left')))!;
		assert.equal(single.kind, 'radio');
		assert.equal(single.clears, true);
		assert.deepEqual(single.controls.map((c) => [c.sig, c.initial]), [['button||Left', true], ['button||Center', false], ['button||Right', false]]);
		assert.equal(single.controls[1]!.on.attrs['aria-pressed'], 'true');
		assert.deepEqual(Object.fromEntries(Object.entries(single.dependents?.[0]?.states ?? {}).map(([k, v]) => [k, v.inner])), { '0': 'left', '1': 'center', '2': 'right', '-1': 'none' });
		assert.equal(single.dependents?.[0]?.sig, 'code||left');
		const multi = groups.filter((g) => g.controls.some((c) => /\|(Bold|Italic)$/.test(c.sig)));
		assert.deepEqual(multi.map((g) => [g.kind, g.controls.length, g.dependents]), [['toggle', 1, undefined], ['toggle', 1, undefined]]);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

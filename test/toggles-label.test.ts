// shadcn's RTL example shows its chip checkboxes clipped out of view until checked: a visitor uses them through their label.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureToggles } from '../src/convert/toggles.ts';

// `chip` is labelled through its hidden input, as Base UI's is; `bare` is clipped the same way with no label.
const PAGE = `<!doctype html><html><body><main>
<label for="chip-input"><div style="display: flex; overflow: hidden; width: 120px"><span role="checkbox" aria-checked="false" id="chip" style="display: inline-block; flex: none; width: 16px; height: 16px; margin-inline-start: -40px"></span><input id="chip-input" type="checkbox" aria-hidden="true" tabindex="-1" style="position: fixed; top: 0; left: 0; width: 1px; height: 1px; margin: -1px; clip-path: inset(50%)"><div>Search</div></div></label>
<div style="display: flex; overflow: hidden; width: 120px"><span role="checkbox" aria-checked="false" id="bare" style="display: inline-block; flex: none; width: 16px; height: 16px; margin-inline-start: -40px">Bare</span></div>
<script>
const chip = document.getElementById('chip');
const input = document.getElementById('chip-input');
input.addEventListener('click', () => {
	chip.setAttribute('aria-checked', String(input.checked));
	chip.style.marginInlineStart = input.checked ? '0' : '-40px';
});
</script></main></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => (request.url === '/' ? res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE) : res.writeHead(404).end()));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a checkbox a click cannot reach is used through its label, and both of its states are recorded', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-label-'));
	try {
		const capture = await captureToggles(browser, origin, '/', dir);
		const chip = capture.groups.find((g) => g.controls[0]!.sig === 'span||');
		assert.ok(chip, `chip recorded; skipped: ${JSON.stringify(capture.skipped)}`);
		assert.equal(chip.controls[0]!.initial, false);
		assert.equal(chip.controls[0]!.on.attrs['aria-checked'], 'true');
		assert.equal(chip.controls[0]!.off.attrs['aria-checked'], 'false');
		assert.equal(capture.unrecorded, undefined);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a checkbox a click cannot reach and that has no label stays a skip naming the failed click', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-label-'));
	try {
		const capture = await captureToggles(browser, origin, '/', dir);
		assert.ok(capture.skipped.some((s) => s.startsWith('span||Bare#0: could not click')), JSON.stringify(capture.skipped));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

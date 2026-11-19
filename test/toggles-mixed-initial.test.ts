// shadcn's /preview pages load a "Notify all" checkbox mixed; using it goes checked, then unchecked, and never mixed
// again. Capture failed those routes as "using it twice did not restore it".
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureToggles } from '../src/convert/toggles.ts';

// `all` cycles checked and unchecked from mixed; `stuck` goes checked, then unchecked, and stays unchecked.
const PAGE = `<!doctype html><html><body><main>
<span role="checkbox" aria-checked="mixed" data-indeterminate="" id="all">All</span>
<span role="checkbox" aria-checked="mixed" id="stuck">Stuck</span>
<script>
const all = document.getElementById('all');
all.addEventListener('click', () => {
	const on = all.getAttribute('aria-checked') !== 'true';
	all.setAttribute('aria-checked', String(on));
	all.removeAttribute('data-indeterminate');
	all.toggleAttribute('data-checked', on);
	all.toggleAttribute('data-unchecked', !on);
});
let uses = 0;
const stuck = document.getElementById('stuck');
stuck.addEventListener('click', () => stuck.setAttribute('aria-checked', String(++uses === 1)));
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

test('a checkbox that loads mixed and then switches between checked and unchecked is recorded with its mixed state', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-mixed-'));
	try {
		const capture = await captureToggles(browser, origin, '/', dir, PAGE);
		const all = capture.groups.find((g) => g.controls[0]!.sig === 'span||All')?.controls[0];
		assert.ok(all, `recorded; unrecorded: ${JSON.stringify(capture.unrecorded)}`);
		assert.equal(all.mixed?.attrs['aria-checked'], 'mixed');
		assert.equal(all.on.attrs['aria-checked'], 'true');
		assert.equal(all.off.attrs['aria-checked'], 'false');
		assert.equal(all.initial, false);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a checkbox that loads mixed but does not switch back on a third use still fails the capture', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-mixed-'));
	try {
		const capture = await captureToggles(browser, origin, '/', dir, PAGE);
		assert.deepEqual(capture.unrecorded, ['span||Stuck#0: using it twice did not restore it']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

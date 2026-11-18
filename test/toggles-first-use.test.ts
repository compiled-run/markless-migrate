// shadcn's Base UI checkbox page shipped its first checkbox dead: the recorder read it before React's effects wired its
// aria-labelledby, so its state after two uses differed from the one first read and it was skipped in silence.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureToggles, unrecordedToggles } from '../src/convert/toggles.ts';

// `terms` is labelled only once the page's client has run (LATE ms after load); `stuck` shows a check mark it never
// takes away; `inert` does nothing when used.
const LATE = 1500;
const page = (late: boolean) => `<!doctype html><html><body><main>
<span id="terms-label">Accept terms</span>
<span role="checkbox" aria-checked="false" id="terms" style="display: inline-block; width: 16px; height: 16px"${late ? '' : ' aria-labelledby="terms-label"'}></span>
<span role="checkbox" aria-checked="false" id="stuck">Stuck</span>
<span role="checkbox" aria-checked="false" id="inert">Inert</span>
<script>
${late ? `setTimeout(() => document.getElementById('terms').setAttribute('aria-labelledby', 'terms-label'), ${LATE});` : ''}
const flip = (el) => el.setAttribute('aria-checked', String(el.getAttribute('aria-checked') !== 'true'));
document.getElementById('terms').addEventListener('click', (e) => flip(e.currentTarget));
document.getElementById('stuck').addEventListener('click', (e) => { flip(e.currentTarget); e.currentTarget.innerHTML = '<svg data-check></svg>'; });
</script></main></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => (request.url === '/' ? res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(true)) : res.writeHead(404).end()));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('the first use waits until the controls are as the settled page shows them, so a control its client wires late is recorded', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-first-'));
	try {
		const capture = await captureToggles(browser, origin, '/', dir, page(false));
		const terms = capture.groups.find((g) => g.controls[0]!.sig === 'span||');
		assert.ok(terms, `terms recorded; skipped: ${JSON.stringify(capture.skipped)}`);
		assert.equal(terms.controls[0]!.off.attrs['aria-labelledby'], 'terms-label');
		assert.equal(terms.controls[0]!.on.attrs['aria-checked'], 'true');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a control the page visibly toggles but whose second use does not restore it fails the capture, which is not stored', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-first-'));
	try {
		const capture = await captureToggles(browser, origin, '/', dir, page(false));
		assert.deepEqual(capture.unrecorded, ['span||Stuck#0: using it twice did not restore it']);
		assert.match(unrecordedToggles(capture) ?? '', /span\|\|Stuck#0: using it twice did not restore it/);
		assert.deepEqual(await readdir(dir).catch(() => []), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a control the page itself does nothing with stays a skip and does not fail the capture', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-toggles-first-'));
	try {
		const capture = await captureToggles(browser, origin, '/', dir, page(false));
		assert.ok(capture.skipped.includes('span||Inert#0: using it changed nothing in place'));
		assert.ok(!capture.unrecorded?.some((u) => u.startsWith('span||Inert')));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

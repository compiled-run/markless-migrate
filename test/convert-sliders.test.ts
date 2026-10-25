import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { captureSliders } from '../src/convert/sliders.ts';

// Radix sliders render no attribute for their step: one at its max (the step is read going down), one in the middle.
const slider = (value: number, step: number) => `<span data-slot="slider" data-orientation="horizontal"><span role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" data-step="${step}" style="display:inline-block;width:10px;height:10px"></span></span>`;
const PAGE = `<!doctype html><body>${slider(100, 10)}${slider(40, 0.5)}<span data-slot="slider" data-rac=""><span role="slider" tabindex="0" aria-valuenow="5"></span></span><script>
for (const thumb of document.querySelectorAll('[data-step]')) thumb.addEventListener('keydown', (e) => {
	const step = Number(thumb.dataset.step), now = Number(thumb.getAttribute('aria-valuenow'));
	const next = Math.min(100, Math.max(0, now + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0)));
	thumb.setAttribute('aria-valuenow', String(next));
});
</script></body>`;

test("a Radix slider's step is what one arrow key does to it on the old page, which is undone", async () => {
	const server = createServer((_req, res) => void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-sliders-'));
	const browser = await chromium.launch();
	try {
		const { sliders } = await captureSliders(browser, origin, '/', dir);
		assert.deepEqual(sliders, [
			{ sig: 'span|slider|', nth: 0, step: 10 },
			{ sig: 'span|slider|', nth: 1, step: 0.5 },
		]);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

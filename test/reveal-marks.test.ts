// A mark a reveal capture writes on what a gesture added is versioned on its own: bumping it uses again only the controls
// whose content it reads, on one fresh load, and keeps every other reveal of the route as it was captured.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { missingMarks, type Mark } from '../src/convert/marks.ts';
import { captureReveals } from '../src/convert/reveal.ts';
import { VIEWPORTS } from '../src/check/types.ts';

let loads = 0;
const page = (load: number) => `<!doctype html><html><body><button id="a" aria-expanded="false">A</button><button id="b" aria-expanded="false">B</button><script>
for (const [id, cls] of [['a', 'hinted'], ['b', 'plain']]) {
	const button = document.getElementById(id);
	button.addEventListener('click', () => {
		button.setAttribute('aria-expanded', 'true');
		const shown = Object.assign(document.createElement('div'), { className: cls, textContent: id + ' on load ${load}' });
		document.body.append(shown);
		addEventListener('keydown', function close(event) {
			if (event.key !== 'Escape') return;
			shown.remove();
			button.setAttribute('aria-expanded', 'false');
			removeEventListener('keydown', close);
		});
	});
}
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url !== '/') return res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(++loads));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

const hinted = (version: number): Mark => ({ id: 'hinted', version, applies: (html) => html.includes('class="hinted"') });

test('a mark at a new version uses again only the controls whose content it reads, and keeps the others', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-marks-'));
	const shown = (capture: Awaited<ReturnType<typeof captureReveals>>) => Object.fromEntries(capture.reveals.map((r) => [r.key, r.added.map((a) => a.html).join('')]));
	try {
		const desktop = [VIEWPORTS[0]!];
		const first = await captureReveals(browser, origin, '/', dir, new Map(), desktop, [], undefined, [hinted(1)]);
		assert.deepEqual(shown(first), { a: '<div class="hinted">a on load 1</div>', b: '<div class="plain">b on load 1</div>' });
		assert.equal(loads, 1);
		await captureReveals(browser, origin, '/', dir, new Map(), desktop, [], undefined, [hinted(1)]);
		assert.equal(loads, 1, 'a capture holding every mark at its version is used as it is');
		const bumped = await captureReveals(browser, origin, '/', dir, new Map(), desktop, [], undefined, [hinted(2)]);
		assert.equal(loads, 2, 'one fresh load for the controls the bumped mark reads');
		assert.deepEqual(shown(bumped), { a: '<div class="hinted">a on load 2</div>', b: '<div class="plain">b on load 1</div>' });
		await captureReveals(browser, origin, '/', dir, new Map(), desktop, [], undefined, [hinted(2)]);
		assert.equal(loads, 2, 'the capture taken again records the mark at its new version');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a capture lacks only the marks that apply to it and were written at another version', () => {
	const marks: Mark[] = [{ id: 'x', version: 2, applies: (h) => h.includes('x') }, { id: 'y', version: 1, applies: (h) => h.includes('y') }];
	assert.deepEqual(missingMarks(['<p>x</p>'], { x: 1, y: 1 }, marks).map((m) => m.id), ['x']);
	assert.deepEqual(missingMarks(['<p>y</p>'], { x: 1, y: 1 }, marks).map((m) => m.id), []);
	assert.deepEqual(missingMarks(['<p>y</p>'], {}, marks).map((m) => m.id), ['y']);
});

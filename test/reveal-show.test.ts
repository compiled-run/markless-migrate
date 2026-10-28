// A control the site lists as showing something in place (a block viewer's file tree: a file shows its code and is
// marked active): what using it changed, recorded relative to the control, so the port can do the same.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureReveals, type ShownEffect } from '../src/convert/reveal.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const PAGE = `<!doctype html><html><body><div data-view="preview"><ul style="display:none">
<li><button data-slot="sidebar-menu-button" data-active="true">page.tsx</button></li>
<li><button data-slot="sidebar-menu-button" data-active="false">nav.tsx</button></li>
</ul><figure><figcaption>app/page.tsx</figcaption><pre><code>export default function Page() {}</code></pre></figure></div>
<script>
const code = { 'page.tsx': ['app/page.tsx', 'export default function Page() {}'], 'nav.tsx': ['components/nav.tsx', 'export function Nav() {}'] };
for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => {
	if (b.dataset.active === 'true') return;
	for (const o of document.querySelectorAll('button')) o.dataset.active = String(o === b);
	const [title, text] = code[b.textContent];
	document.querySelector('figure').innerHTML = '<figcaption>' + title + '</figcaption><pre><code>' + text + '</code></pre>';
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a listed "show" control records the content and attributes it changed, each by its place relative to the control', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-show-'));
	try {
		const capture = await captureReveals(browser, origin, '/', dir, [VIEWPORTS[0]!], [['[data-view] button[data-slot="sidebar-menu-button"]', 'show']], { controls: [], tag: 'listed-v2:' });
		const page = capture.reveals.find((r) => r.sig?.endsWith('|page.tsx'));
		assert.deepEqual(page?.added, [{ into: 'show', before: -1, html: '[]' }], 'the file already shown is recorded, changing nothing, so the port can show it again');
		const nav = capture.reveals.find((r) => r.sig?.endsWith('|nav.tsx'));
		assert.ok(nav, JSON.stringify(capture.reveals.map((r) => r.sig)));
		assert.equal(nav.added.length, 1);
		assert.equal(nav.added[0]!.into, 'show');
		const effects = JSON.parse(nav.added[0]!.html) as ShownEffect[];
		assert.deepEqual(effects, [
			{ up: 2, down: [0, 0], attrs: { 'data-active': 'false' } },
			{ up: 0, down: [], attrs: { 'data-active': 'true' } },
			{ up: 3, down: [1], html: '<figcaption>components/nav.tsx</figcaption><pre><code>export function Nav() {}</code></pre>' },
		]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('controls whose changes touch form a group, and each sets every place its group changes, from the first page where its own use did not', async () => {
	const { completeShown } = await import('../src/convert/shown.ts');
	// Two viewers: body > div#0|#1 > ul#0 > li#k > button#0, and the figure at div > #1.
	const nav = (v: number) => ({ key: `nav${v}`, path: [v, 0, 1, 0], effects: [{ up: 2, down: [0, 0], attrs: { 'data-active': 'false' } }, { up: 0, down: [], attrs: { 'data-active': 'true' } }, { up: 3, down: [1], html: `nav ${v}` }] });
	const page = (v: number) => ({ key: `page${v}`, path: [v, 0, 0, 0], effects: [] });
	const first = (path: readonly number[]) => ({ html: path[2] === undefined ? `page ${path[0]}` : '', attr: (n: string) => (n === 'data-active' ? String(path[2] === 0) : null) });
	const done = completeShown([page(0), nav(0), page(1), nav(1)], first);
	assert.deepEqual(done.get('page1'), [
		{ up: 0, down: [], attrs: { 'data-active': 'true' } },
		{ up: 2, down: [1, 0], attrs: { 'data-active': 'false' } },
		{ up: 3, down: [1], html: 'page 1' },
	]);
	assert.deepEqual(done.get('nav0'), [
		{ up: 2, down: [0, 0], attrs: { 'data-active': 'false' } },
		{ up: 0, down: [], attrs: { 'data-active': 'true' } },
		{ up: 3, down: [1], html: 'nav 0' },
	]);
});

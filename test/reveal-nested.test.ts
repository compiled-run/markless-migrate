// A file tree of collapsibles: each folder's content is mounted when it opens and holds folders of its own, which a capture
// of the page as it loads never reaches.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureNestedReveals, captureRouteReveals } from '../src/convert/reveal.ts';

const TREE: Record<string, string[]> = { components: ['ui', 'header.tsx'], ui: ['button.tsx', 'deep'], deep: ['x.ts'], lib: ['utils.ts'] };
const PAGE = `<!doctype html><html><body><div id="tree"></div><script>
const tree = ${JSON.stringify(TREE)};
const folder = (name) => '<div><button id="t-' + name + '" aria-expanded="false" aria-controls="p-' + name + '">' + name + '</button><div id="p-' + name + '" hidden></div></div>';
const file = (name) => '<span>' + name + '</span>';
document.getElementById('tree').innerHTML = folder('components') + folder('lib');
document.addEventListener('click', (event) => {
	const b = event.target.closest('button[aria-controls]');
	if (!b) return;
	const panel = document.getElementById(b.getAttribute('aria-controls'));
	const open = b.getAttribute('aria-expanded') === 'false';
	b.setAttribute('aria-expanded', String(open));
	panel.hidden = !open;
	panel.innerHTML = open ? tree[b.textContent].map((n) => (tree[n] ? folder(n) : file(n))).join('') : '';
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_request, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('the folders inside an opened folder are opened in turn, each after the one holding it, to three levels', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-nested-'));
	try {
		const own = await captureRouteReveals(browser, origin, '/', dir);
		assert.deepEqual(own.reveals.filter((r) => r.viewport === 'desktop').map((r) => r.key).sort(), ['t-components', 't-lib']);
		const nested = await captureNestedReveals(browser, origin, '/', dir, own.reveals);
		assert.deepEqual(nested.map((r) => r.key), ['t-ui', 't-deep']);
		const ui = nested[0]!;
		assert.match(ui.added.map((a) => a.html).join(''), /button\.tsx/);
		const components = own.reveals.find((r) => r.key === 't-components')!;
		const into = components.added[0]!.into as number[];
		assert.ok(into.every((v, i) => ui.path[i] === v) && ui.path.length > into.length, "ui's path is inside the content components revealed");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a capture cached under the reveal:2 key, which could hold another page\'s content for a shared control, is taken again', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-version-'));
	try {
		const stale = { route: '/', skipped: [], reveals: [{ key: 't-components', path: [0, 0, 0], action: 'click', viewport: 'desktop', added: [{ into: [0, 0, 1], before: -1, html: '<span>ANOTHER PAGE</span>' }] }] };
		await writeFile(join(dir, `${createHash('sha256').update('reveal:2:/').digest('hex').slice(0, 16)}.json`), JSON.stringify(stale));
		const own = await captureRouteReveals(browser, origin, '/', dir);
		const shown = own.reveals.flatMap((r) => r.added.map((a) => a.html)).join('');
		assert.doesNotMatch(shown, /ANOTHER PAGE/);
		assert.match(shown, /header\.tsx/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

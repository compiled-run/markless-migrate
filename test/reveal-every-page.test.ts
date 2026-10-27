// A control that portals the same content on several pages (a docs search palette) can still show other content on the
// next page: shadcn's palette lists the components of the page's own library (Radix, Base UI or React Aria).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureReveals } from '../src/convert/reveal.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const page = (library: string) => `<!doctype html><html><body><button id="search" aria-expanded="false">Search</button><script>
const button = document.getElementById('search');
button.addEventListener('click', () => {
	button.setAttribute('aria-expanded', 'true');
	const list = Object.assign(document.createElement('div'), { role: 'listbox' });
	list.innerHTML = '<div role="option">${library} Button</div>';
	document.body.append(list);
	addEventListener('keydown', function close(event) {
		if (event.key !== 'Escape') return;
		list.remove();
		button.setAttribute('aria-expanded', 'false');
		removeEventListener('keydown', close);
	});
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		const library = /^\/(aria|radix)\//.exec(request.url ?? '')?.[1];
		if (!library) return res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(library));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a control that showed the same content on several pages is still used on the next page, which can show other content', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-every-page-'));
	try {
		const desktop = [VIEWPORTS[0]!];
		const shown = async (route: string) => (await captureReveals(browser, origin, route, dir, desktop)).reveals.map((r) => r.added.map((a) => a.html).join('')).join('');
		for (const route of ['/aria/a', '/aria/b', '/aria/c']) assert.match(await shown(route), /aria Button/);
		assert.match(await shown('/radix/a'), /radix Button/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

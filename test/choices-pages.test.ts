// convert's capture of what choosing each option of a long list does (a docs search palette: every option goes to a page):
// the options are chosen on several pages at once, each page under the slots convert's captures share, and every
// option is recorded once, in the list's order, as one page choosing them all would.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureChoices } from '../src/convert/choices.ts';
import { limiter, type Limit } from '../src/convert/limit.ts';
import type { Reveal } from '../src/convert/reveal.ts';

const COUNT = 45;
const PAGE = `<!doctype html><html><body><button id="open" aria-expanded="false">Search</button><script>
document.getElementById('open').addEventListener('click', () => {
	const list = document.createElement('div');
	list.setAttribute('cmdk-list', '');
	for (let i = 0; i < ${COUNT}; i++) {
		const item = document.createElement('div');
		item.setAttribute('cmdk-item', '');
		item.setAttribute('data-value', 'doc-' + i);
		item.textContent = 'Doc ' + i;
		item.addEventListener('click', () => location.assign('/docs/' + (${COUNT} - i)));
		list.append(item);
	}
	document.body.append(list);
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

test('captureChoices chooses a long list of options on several pages at once, under the given limit, and records each once in order', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-pages-'));
	try {
		const slots = limiter(3);
		let running = 0;
		let peak = 0;
		const limit: Limit = (task) =>
			slots(async () => {
				peak = Math.max(peak, ++running);
				try {
					return await task();
				} finally {
					running--;
				}
			});
		const reveal: Reveal = { key: 'palette', path: [0], sig: 'button||Search', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div cmdk-list=""><div cmdk-item="" data-value="doc-0">Doc 0</div></div>' }] };
		const found = await captureChoices(browser, origin, '/', reveal, dir, () => {}, limit);
		assert.deepEqual(Object.keys(found), Array.from({ length: COUNT }, (_, i) => `doc-${i}`));
		assert.deepEqual(Object.values(found), Array.from({ length: COUNT }, (_, i) => ({ href: `/docs/${COUNT - i}` })));
		assert.equal(peak, 3);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

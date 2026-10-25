// convert's capture of what each Base UI Select option writes into the hidden input Select.Root renders after its
// trigger: the option's value, which nothing in the option's markup carries.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureChoices } from '../src/convert/choices.ts';
import type { Reveal } from '../src/convert/reveal.ts';

const OPTIONS = [['Eastern Standard Time', 'est'], ['Mountain Standard Time', 'mst']];
const PAGE = `<!doctype html><html><body><button id="t" role="combobox" aria-haspopup="listbox" aria-expanded="false">Select a timezone</button><input aria-hidden="true" tabindex="-1" value=""><script>
const t = document.getElementById('t');
t.addEventListener('click', () => {
	const portal = document.createElement('div');
	portal.innerHTML = '<div role="listbox">' + ${JSON.stringify(OPTIONS)}.map(([label, value]) => '<div role="option" data-v="' + value + '">' + label + '</div>').join('') + '</div>';
	for (const o of portal.querySelectorAll('[role=option]')) o.addEventListener('click', () => { t.nextElementSibling.value = o.dataset.v; t.textContent = o.textContent; portal.remove(); });
	document.body.append(portal);
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test("captureChoices records the value each option of a select gives the hidden input after its trigger", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-values-'));
	try {
		const reveal: Reveal = { key: 't', path: [0], sig: 'button|combobox|Select a timezone', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: `<div data-base-ui-portal=""><div role="listbox">${OPTIONS.map(([label]) => `<div role="option">${label}</div>`).join('')}</div></div>` }] };
		const found = await captureChoices(browser, origin, '/', reveal, dir);
		assert.deepEqual(found, { 'Eastern Standard Time': { value: 'est' }, 'Mountain Standard Time': { value: 'mst' } });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

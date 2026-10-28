// convert's capture of what choosing each Base UI Select option does: the value it writes into the hidden input
// Select.Root renders after its trigger, and the label Select.Value then shows; nothing in the option's markup carries
// either (an RTL month list shows ٠٢ while its trigger shows 02).
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

const OPTIONS = [['Eastern Standard Time', 'est', 'Eastern Standard Time'], ['٠٢', '02', '02']];
const PAGE = `<!doctype html><html><body><button id="t" role="combobox" aria-haspopup="listbox" aria-expanded="false"><span data-slot="select-value">Select</span></button><input aria-hidden="true" tabindex="-1" value=""><div role="menubar"><button role="menuitem">File</button></div><script>
const t = document.getElementById('t');
t.addEventListener('click', () => {
	const portal = document.createElement('div');
	portal.innerHTML = '<div role="listbox">' + ${JSON.stringify(OPTIONS)}.map(([label, value, shown]) => '<div role="option" data-v="' + value + '" data-shown="' + shown + '">' + label + '</div>').join('') + '</div>';
	for (const o of portal.querySelectorAll('[role=option]')) o.addEventListener('click', () => { t.nextElementSibling.value = o.dataset.v; t.firstElementChild.textContent = o.dataset.shown; portal.remove(); });
	document.body.append(portal);
	// The first time the list shows, something lies over it (an opening animation still running): a click cannot land.
	if (location.search === '?covered' && !sessionStorage.getItem('covered')) {
		sessionStorage.setItem('covered', '1');
		document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;z-index:9"></div>');
	}
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

test('captureChoices records the value each option of a select gives the hidden input after its trigger, and the label its trigger then shows', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-values-'));
	try {
		const reveal: Reveal = { key: 't', path: [0], sig: 'button|combobox|Select a timezone', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: `<div data-base-ui-portal=""><div role="listbox">${OPTIONS.map(([label]) => `<div role="option">${label}</div>`).join('')}</div></div>` }] };
		const found = await captureChoices(browser, origin, '/', reveal, dir);
		assert.deepEqual(found, { 'Eastern Standard Time': { value: 'est', shown: 'Eastern Standard Time' }, '٠٢': { value: '02', shown: '02' } });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('captureChoices chooses an option again on a fresh load when its click could not land, and never records the unchanged trigger as its choice', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-values-'));
	try {
		const reveal: Reveal = { key: 't', path: [0], sig: 'button|combobox|Select', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: `<div data-base-ui-portal=""><div role="listbox">${OPTIONS.map(([label]) => `<div role="option">${label}</div>`).join('')}</div></div>` }] };
		const found = await captureChoices(browser, origin, '/?covered', reveal, dir);
		assert.deepEqual(found, { 'Eastern Standard Time': { value: 'est', shown: 'Eastern Standard Time' }, '٠٢': { value: '02', shown: '02' } });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

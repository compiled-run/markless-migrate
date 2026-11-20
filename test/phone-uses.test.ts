// shadcn's SidebarProvider (useIsMobile, under 768 px): on a phone the sidebar trigger opens a Sheet and the desktop
// sidebar is not rendered; at desktop it switches the sidebar's attributes in place.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { body, parseDocument, walk, type Element } from '../src/convert/dom.ts';
import { LAYER_FILL, SERVED_LAYER_BYTES, layerTable } from '../src/convert/document.ts';
import { capturePhoneUses } from '../src/convert/phone-uses.ts';
import { PHONE } from '../parts/reveal.ts';
import { SwitchPlan } from '../src/convert/stateful.ts';
import { captureSwitches } from '../src/convert/toggles.ts';
import { emitElement } from '../src/convert/tsrx.ts';

// `sheet`: the phone's use opens a dialog layer; otherwise it switches the sidebar's state at every width.
const page = (sheet: boolean) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
.desk { display: none } @media (min-width: 768px) { .desk { display: block } }
</style></head><body><div id="root"></div><script>
const phone = matchMedia('(max-width: 767px)').matches && ${sheet};
document.getElementById('root').innerHTML = (phone ? '' : '<div class="desk" data-slot="sidebar" data-state="expanded">Nav</div>') + '<main><button data-slot="sidebar-trigger">Toggle Sidebar</button></main>';
document.querySelector('[data-slot="sidebar-trigger"]').addEventListener('click', () => {
	if (phone) {
		if (document.querySelector('[data-mobile]')) return;
		document.body.insertAdjacentHTML('beforeend', '<div data-slot="sheet-overlay" data-state="open"></div><div role="dialog" data-slot="sidebar" data-mobile="true" data-state="open"><a href="/x">Nav</a></div>');
		return;
	}
	const sb = document.querySelector('[data-slot="sidebar"]');
	sb.setAttribute('data-state', sb.getAttribute('data-state') === 'expanded' ? 'collapsed' : 'expanded');
	document.cookie = 'sidebar_state=' + (sb.getAttribute('data-state') === 'expanded') + '; path=/';
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const n of document.querySelectorAll('[data-slot="sheet-overlay"], [data-mobile]')) n.remove(); });
</script></body></html>`;

const SELECTORS = ['[data-slot="sidebar-trigger"]'];
let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(request.url === '/sheet')));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a switch whose use on a phone opens a layer is recorded there as a phone layer of the same control', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'phone-uses-'));
	try {
		const switches = (await captureSwitches(browser, origin, '/sheet', join(dir, 'toggles'), SELECTORS)).switches;
		assert.equal(switches.length, 1, 'the desktop use switches the sidebar');
		const got = await capturePhoneUses(browser, origin, '/sheet', join(dir, 'phone'), SELECTORS, switches);
		assert.equal(got.length, 1);
		const [phone] = got;
		assert.equal(phone!.viewport, 'mobile');
		assert.equal(`${phone!.sig}#${phone!.nth}`, `${switches[0]!.sig}#${switches[0]!.nth}`);
		assert.ok(phone!.added.some((a) => a.into === 'body' && a.html.includes('data-mobile="true"')), 'the Sheet is what it opened');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a switch that does the same on a phone has no phone layer', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'phone-uses-'));
	try {
		const switches = (await captureSwitches(browser, origin, '/same', join(dir, 'toggles'), SELECTORS)).switches;
		assert.equal(switches.length, 1);
		assert.deepEqual(await capturePhoneUses(browser, origin, '/same', join(dir, 'phone'), SELECTORS, switches), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a switch with a phone layer does nothing on a phone: its state and cookies are the desktop use only', () => {
	const doc = parseDocument('<body><div data-slot="sidebar" data-state="expanded"></div><button data-slot="sidebar-trigger"></button><button data-slot="sidebar-rail"></button></body>');
	const [sidebar, trigger, rail] = [...walk(body(doc))].filter((el) => el.tagName !== 'body') as [Element, Element, Element];
	const changes = [{ sig: 's', nth: 0, attr: 'data-state', before: 'expanded', after: 'collapsed' }];
	const cookies = [{ name: 'sidebar_state', value: 'false', path: '/' }];
	const plan = new SwitchPlan();
	plan.add([{ sig: 't', nth: 0, changes, cookiesOn: cookies, cookiesOff: cookies }, { sig: 'r', nth: 0, changes, cookiesOn: cookies, cookiesOff: cookies }], (sig) => ({ s: sidebar, t: trigger, r: rail })[sig as 's' | 't' | 'r'], new Set(['t#0']));
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<button data-slot="sidebar-trigger" onClick=\{\(\) => \{ if \(onPhone\(\)\) return; sw0 = !sw0; writeCookies\(/);
	assert.match(out, /<button data-slot="sidebar-rail" onClick=\{\(\) => \{ sw0 = !sw0; writeCookies\(/, 'a control with no phone layer switches at every width');
});

test('a served layer recorded at the phone viewport is preloaded and mounted only on a phone', () => {
	const shell = `<div data-mm-layer="p:1" hidden data-mm-viewport="mobile" role="dialog" data-mm-layer-fill="${LAYER_FILL}"></div>`;
	const markup = shell.padEnd(SERVED_LAYER_BYTES + 10, ' ');
	const table = layerTable(new Map([['/', [{ key: 'p:1', markup, shell, fill: `<p>${'x'.repeat(SERVED_LAYER_BYTES)}</p>`, viewport: 'mobile' }]]]));
	const path = table.served[0]!.path;
	assert.ok(table.files.some((f) => f.source.includes(`<link rel="preload" href="${path}" as="fetch" crossorigin="anonymous" fetchpriority="low" media="${PHONE}" /><template data-mm-layer-src="${path}" data-mm-layer-keys="p:1" data-mm-viewport="mobile">`)));
});

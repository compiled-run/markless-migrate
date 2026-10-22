import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const LINKS = 16;

// Every page shares a header with many links and a settings button that opens a dialog; the main content holds a table.
function page(path: string, settings: boolean): string {
	const links = Array.from({ length: LINKS }, (_, i) => `<a href="/docs/${i + 1}">Doc ${i + 1}</a>`).join(' ');
	const open = settings ? ` onclick="document.getElementById('settings').showModal()"` : '';
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop ${path}</title></head><body>
<header><nav aria-label="Docs">${links}</nav><button type="button"${open}>Settings</button></header>
<dialog id="settings" aria-label="Settings"><label><input type="checkbox"> Dark mode</label><button type="button" onclick="this.closest('dialog').close()">Close</button></dialog>
<main><h1>Page ${path}</h1><table><thead><tr><th><button type="button" onclick="document.getElementById('order').textContent = 'sorted by name'">Sort by name</button></th></tr></thead><tbody><tr><td id="order">unsorted</td></tr></tbody></table></main>
</body></html>`;
}

function serve(settings: boolean, only?: string): Promise<Server> {
	const server = createServer((req, res) => {
		if (req.url === '/favicon.ico' || (only && req.url !== only)) {
			res.writeHead(404).end();
			return;
		}
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(new URL(req.url ?? '/', 'http://x').pathname, settings));
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
let browser: Browser;
let old: Server;
let same: Server;
let dropped: Server;
let homeOnly: Server;
before(async () => {
	browser = await chromium.launch();
	[old, same, dropped, homeOnly] = await Promise.all([serve(true), serve(true), serve(false), serve(true, '/')]);
});
after(async () => {
	await browser?.close();
	for (const s of [old, same, dropped, homeOnly]) s?.close();
});

const desktop = [VIEWPORTS[0]!];

test('journeys start with the main content, so a cap that the header alone would fill still reaches the table', async () => {
	const { journeys, elements, skipped } = await explore(browser, defaultEnv(origin(old)), '/', desktop[0]!, { maxJourneys: 8 });
	assert.equal(journeys[0]!.name, 'click button "Sort by name"');
	assert.equal(journeys.length, 8);
	assert.ok(elements.some((e) => e.element === `${LINKS - 2} more links in nav to other pages` && e.by?.startsWith('alike')), 'plain links are sampled: two followed, the rest compared by address');
	assert.deepEqual(elements.filter((e) => !e.by), [], 'every element is used once before any keyboard path');
	assert.ok(skipped > 0);
});

test('without a cap every control is exercised, including the ones the settings dialog reveals', async () => {
	const { elements } = await explore(browser, defaultEnv(origin(old)), '/', desktop[0]!);
	assert.deepEqual(elements.filter((e) => !e.by), []);
	const revealed = elements.filter((e) => e.element.includes('(after click button "Settings")')).map((e) => e.element);
	assert.deepEqual(revealed.sort(), ['button "Close" (after click button "Settings")', 'checkbox "Dark mode" (after click button "Settings")']);
	assert.ok(elements.find((e) => e.element === 'button "Settings"')!.layout);
});

test('a time budget that runs out lists what it did not reach instead of dropping it', async () => {
	const { elements } = await explore(browser, defaultEnv(origin(old)), '/', desktop[0]!, { budgetMs: 1 });
	assert.ok(elements.length > 3);
	assert.ok(elements.every((e) => e.by?.startsWith('its address') || e.by?.startsWith('alike') || /out of the journey budget \(0 s\)/.test(e.reason ?? '')), JSON.stringify(elements.slice(0, 3)));
});

test('a new app that drops the header settings dialog is red on the first route checked, and on every route sharing the header', async () => {
	const one = await runCheck({ oldOrigin: origin(old), newOrigin: origin(dropped), routes: ['/a'], viewports: desktop, browser });
	const [a] = one.routes;
	assert.equal(a!.ok, false);
	assert.ok(a!.failures.some((f) => f.dimension === 'behaviour' && f.check === 'click button "Settings"'), a!.failures.map((f) => f.check).join('\n'));
	const two = await runCheck({ oldOrigin: origin(old), newOrigin: origin(dropped), routes: ['/', '/a'], viewports: desktop, browser });
	const [home, other] = two.routes;
	assert.ok(home!.failures.some((f) => f.check === 'click button "Settings"'));
	assert.ok(!other!.journeys!.some((j) => j.name === 'click button "Settings"'), 'the shared control is explored once');
	assert.equal(other!.ok, false);
	assert.ok(other!.failures.some((f) => f.check === 'click button "Settings", in the layout shared with /'), other!.failures.map((f) => f.check).join('\n'));
	assert.equal(other!.coverage!.exercised, other!.coverage!.total);
});

test('an identical new app is green only when every interactive element was exercised', async () => {
	const capped = await runCheck({ oldOrigin: origin(old), newOrigin: origin(same), routes: ['/'], viewports: desktop, browser, journeys: { maxJourneys: 3 } });
	const [r] = capped.routes;
	assert.equal(r!.ok, false);
	assert.deepEqual([...new Set(r!.failures.map((f) => f.check.split(':')[0]))], ['not exercised']);
	assert.ok(r!.failures.every((f) => f.dimension === 'behaviour'));
	const full = await runCheck({ oldOrigin: origin(old), newOrigin: origin(same), routes: ['/'], viewports: desktop, browser });
	assert.deepEqual(full.routes[0]!.failures.map((f) => `${f.dimension}: ${f.check}: ${f.actual}`), []);
	assert.equal(full.routes[0]!.coverage!.exercised, full.routes[0]!.coverage!.total);
});

test('a route sharing a layout with a route that was not compared is red for the shared controls, and the report lists every element', async () => {
	const { shareLayout } = await import('../src/check/run.ts');
	const { renderHtml } = await import('../src/check/html.ts');
	const { DIMENSIONS } = await import('../src/check/types.ts');
	const zero = { downloaded: 0, source: 0, executed: 0 };
	const base = { ok: true, dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, 'pass'])) as never, failures: [], weight: { old: zero, new: zero }, visualDiffs: [], shots: [] };
	const shared = { element: 'button "Settings"', signature: 'header|button|Settings|0', layout: true, shared: '/' };
	const mine = { element: 'button "Sort by name"', signature: 'page|button|Sort by name|0', layout: false, by: 'click button "Sort by name"' };
	const [, other] = shareLayout([{ ...base, route: '/', ok: false }, { ...base, route: '/a', coverage: { total: 2, exercised: 1, elements: [mine, shared], skipped: 0 } }]);
	assert.equal(other!.ok, false);
	assert.deepEqual(other!.failures.map((f) => [f.check, f.actual]), [['not exercised: button "Settings", shared with /', '/ was not compared, so its shared controls were not exercised']]);
	const html = renderHtml({ version: 1, old: 'o', new: 'n', startedAt: 'x', ok: false, routes: [other!] });
	assert.match(html, /Interactive elements exercised: 1 of 2, <strong>1 not exercised<\/strong>/);
	assert.match(html, /class="differs"><strong>button &#34;Settings&#34;<\/strong> not exercised: \/ was not compared/);
});

test('a route the old app serves and the new one answers 404 for is not ported', async () => {
	const report = await runCheck({ oldOrigin: origin(old), newOrigin: origin(homeOnly), routes: ['/a'], viewports: desktop, browser, journeys: { maxJourneys: 1 } });
	assert.equal(report.routes[0]!.notPorted, true);
	assert.equal(report.routes[0]!.ok, false);
});

test('a shared control is exercised on a route with room for it, not on the first route when that one is full of its own controls', async () => {
	const busy = (path: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${path}</title></head><body>
<header><button type="button" onclick="this.textContent = 'Opened'">Menu</button></header>
<main><h1>${path}</h1>${path === '/' ? Array.from({ length: 45 }, (_, i) => `<button type="button" onclick="this.textContent = 'done ${i}'">Task ${i}</button>`).join('') : ''}</main></body></html>`;
	const server = createServer((req, res) => res.writeHead(req.url === '/favicon.ico' ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' }).end(busy(new URL(req.url ?? '/', 'http://x').pathname)));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	try {
		const at = origin(server);
		const report = await runCheck({ oldOrigin: at, newOrigin: at, routes: ['/', '/a'], viewports: desktop, browser });
		const [home, other] = report.routes;
		assert.ok(other!.journeys!.some((j) => j.name === 'click button "Menu"'), 'the route with room uses the shared control');
		assert.ok(!home!.journeys!.some((j) => j.name === 'click button "Menu"'));
		assert.ok(home!.coverage!.elements.some((e) => e.element === 'button "Menu"' && e.shared === '/a'));
	} finally {
		server.close();
	}
});

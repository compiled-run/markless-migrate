import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { RecordedJourney } from '../src/check/journeys.ts';
import { journeyPrefixes, prefixFor } from '../src/check/probes-compare.ts';
import { runCheck } from '../src/check/run.ts';

// A tool behind a first-visit dialog, as ui.shadcn.com's /create: it shows once a browser (localStorage), "Get Started" dismisses it, and the header's Menu
// opens a menu. A fresh page shows the dialog over everything, so a probe of Menu must take the step a visitor takes first.
const page = `<!doctype html><html lang="en"><head><title>Create</title><style>[role=menu]{position:fixed;top:40px;left:20px;background:#fff;border:1px solid}</style></head><body><div id="app"><header><button id="m" aria-haspopup="menu" aria-expanded="false">Menu</button><div role="menu" id="l" hidden><div role="menuitem" tabindex="-1">Presets</div></div></header><main><h1>Create</h1></main></div><div role="dialog" aria-modal="true" aria-label="Welcome" id="hello" hidden><p>Build your own</p><button id="go">Get Started</button></div><script>
const app = document.getElementById('app'), hello = document.getElementById('hello'), m = document.getElementById('m'), l = document.getElementById('l');
if (!localStorage.getItem('seen')) { hello.hidden = false; app.setAttribute('aria-hidden', 'true'); localStorage.setItem('seen', '1'); }
document.getElementById('go').onclick = () => { localStorage.setItem('seen', '1'); hello.hidden = true; app.removeAttribute('aria-hidden'); };
const close = () => { l.hidden = true; m.setAttribute('aria-expanded', 'false'); m.focus(); };
m.onclick = () => { if (!l.hidden) return close(); l.hidden = false; m.setAttribute('aria-expanded', 'true'); l.firstElementChild.focus(); };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !l.hidden) close(); });
addEventListener('pointerdown', (e) => { if (!l.hidden && !l.contains(e.target) && e.target !== m) close(); });
l.firstElementChild.onclick = close;
</script></body></html>`;

let server: Server;
let origin: string;
before(async () => {
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page));
	origin = await new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
});
after(() => {
	server.closeAllConnections();
	server.close();
});

test('a control a fresh page hides behind a first-visit dialog is probed after the step the journeys took to reach it', async () => {
	const report = await runCheck({ oldOrigin: origin, newOrigin: origin, routes: ['/'], probes: {} });
	const route = report.routes[0]!;
	assert.deepEqual(route.failures.filter((f) => /probe/.test(f.check)).map((f) => `${f.check}: ${f.actual}`), []);
	assert.ok(!JSON.stringify(route).includes('not found again on the old page'), 'the Menu probe found its control');
});

test('prefixes come from the journeys that used a control and, for one tracked but not used, from the journey to what revealed it', () => {
	const start = { action: 'click' as const, target: { role: 'button', name: 'Get Started', nth: 0 } };
	const journey = (steps: RecordedJourney['steps']): RecordedJourney => ({ name: '', steps, expected: [] });
	const journeys = [journey([start]), journey([start, { action: 'click', target: { role: 'button', name: 'Search documentation...', nth: 0 } }]), journey([{ action: 'click', target: { role: 'button', name: 'Theme', nth: 0 } }])];
	const prefixes = new Map(journeyPrefixes(journeys, [{ signature: 'page|button|Get Started|0 > link|127k|0' }, { signature: 'header|button|Theme|0' }]));
	assert.deepEqual([...prefixes.keys()], ['button|Searchdocumentation...|0', 'link|127k|0']);
	assert.deepEqual(prefixFor(prefixes, { role: 'link', name: '127k', nth: 0 }), [start]);
	assert.deepEqual(prefixFor(prefixes, { role: 'button', name: 'Search documentation... Search...', nth: 0 }), [start], 'a name with a key hint read into it is the same control');
	assert.equal(prefixFor(prefixes, { role: 'button', name: 'Theme', nth: 0 }), undefined, 'a control a journey used at load needs no prefix');
});

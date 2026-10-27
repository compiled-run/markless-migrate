import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureQwikFloating } from '../src/convert/qwik-floating.ts';

// Floating panels as Qwik UI places them once its code runs: a select's listbox 8 px under its trigger, left aligned; a
// popover 4 px above its trigger's end; a tooltip 6 px to its trigger's right, centred. The gap and the side are in no
// markup (Qwik UI's gutter and floating props), so convert reads them off the page.
const PAGE = `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<div style="position:absolute;left:100px;top:100px"><button id="a-trigger" aria-haspopup="listbox" aria-controls="a-panel" style="width:120px;height:30px">Pick</button>
<div id="a-panel" popover="manual" data-floating="absolute" role="listbox" hidden style="margin:0;padding:0;border:0;width:200px;height:90px">items</div></div>
<div style="position:absolute;left:500px;top:400px"><button id="b-trigger" popovertarget="b-panel" style="width:100px;height:30px">Info</button>
<div id="b-panel" popover="auto" data-floating="absolute" hidden style="margin:0;padding:0;border:0;width:60px;height:40px">tip</div></div>
<div style="position:absolute;left:100px;top:600px"><div id="c"><button aria-describedby="c" data-state="closed" style="width:80px;height:30px">Hover</button></div>
<div id="c-panel" role="tooltip" popover="manual" data-floating="absolute" hidden style="margin:0;padding:0;border:0;width:50px;height:20px">t</div></div>
<script>
const place = (panel, x, y) => { panel.hidden = false; panel.style.position = 'absolute'; panel.style.left = x + 'px'; panel.style.top = y + 'px'; };
const rect = (id) => document.getElementById(id).getBoundingClientRect();
document.getElementById('a-trigger').addEventListener('click', () => { const p = document.getElementById('a-panel'); p.showPopover(); setTimeout(() => { const r = rect('a-trigger'); place(p, r.left, r.bottom + 8); }, 80); });
document.getElementById('b-panel').addEventListener('toggle', (e) => { if (e.newState !== 'open') return; const p = e.target; const r = rect('b-trigger'); place(p, r.right - 60, r.top - 4 - 40); });
document.querySelector('[aria-describedby="c"]').addEventListener('mouseover', () => { const p = document.getElementById('c-panel'); p.showPopover(); const r = rect('c').width ? document.querySelector('[aria-describedby="c"]').getBoundingClientRect() : null; place(p, r.right + 6, r.top + (r.height - 20) / 2); });
</script></body></html>`;

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE) : res.writeHead(404).end()));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser?.close();
	server?.close();
});

test("each Qwik UI floating panel's side and gap are read off the old page, by opening it as a visitor would", async () => {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const { panels } = await captureQwikFloating(browser, origin, '/', await mkdtemp(join(tmpdir(), 'qwik-floating-')));
	const byId = Object.fromEntries(panels.map((p) => [p.id, { placement: p.placement, gutter: p.gutter }]));
	assert.deepEqual(byId, {
		'a-panel': { placement: 'bottom-start', gutter: 8 },
		'b-panel': { placement: 'top-end', gutter: 4 },
		'c-panel': { placement: 'right', gutter: 6 },
	});
});

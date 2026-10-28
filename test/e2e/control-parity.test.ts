import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, webkit, type Browser } from 'playwright';
import { defaultEnv } from '../../src/check/browser.ts';
import { checkControlParity, type ControlParityOptions } from '../../src/check/control-parity.ts';
import { VIEWPORTS, type Failure } from '../../src/check/types.ts';

const page = (body: string, script = '', style = '') => `<!doctype html><html lang="en"><head><title>Parity</title><style>body { margin: 0; font: 16px/1.5 sans-serif } header { height: 60px; display: flex; gap: 8px; align-items: center; padding: 0 16px } main { padding: 16px } [role=menu] { position: absolute; background: white; border: 1px solid #888; padding: 4px; width: 160px } [role=menu][hidden] { display: none } ${style}</style></head><body><header><a href="/elsewhere">Home</a><a href="/other">Docs</a></header><main><h1>Parity</h1>${body}</main><script>${script}</script></body></html>`;

// A menu button: a click (or the keys the script adds) opens a menu `gap` px under it; Escape closes it.
const menuBody = `<div id="box"><button id="trigger" aria-haspopup="menu" aria-expanded="false">Options</button></div><div role="menu" id="menu" hidden><div role="menuitem" tabindex="-1">Copy</div><div role="menuitem" tabindex="-1">Paste</div></div>`;
const menuScript = (gap = 'innerWidth >= 1400 ? 4 : 4', keys = '', extra = '') => `
const t = document.getElementById('trigger'), m = document.getElementById('menu');
const show = (open) => { m.hidden = !open; t.setAttribute('aria-expanded', String(open)); if (open) { const r = t.getBoundingClientRect(); m.style.left = r.left + scrollX + 'px'; m.style.top = r.bottom + scrollY + (${gap}) + 'px'; m.querySelector('[role=menuitem]').focus(); } else t.focus(); };
t.addEventListener('click', () => show(m.hidden));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) show(false); ${extra} });
t.addEventListener('keydown', (e) => { ${keys} });`;

const CASES: Record<string, { old: string; new: string }> = {
	same: { old: page(`${menuBody}<input aria-label="Name">`, menuScript()), new: page(`${menuBody}<input aria-label="Name">`, menuScript()) },
	covered: { old: page(menuBody, menuScript()), new: page(`${menuBody}<div style="position: absolute; left: 0; top: 0; width: 100vw; height: 60px; z-index: 5"></div><div id="cover" style="position: absolute; z-index: 5"></div>`, `${menuScript()} const r = t.getBoundingClientRect(), c = document.getElementById('cover'); Object.assign(c.style, { left: r.left + r.width * 0.6 + 'px', top: r.top + scrollY + 'px', width: r.width * 0.4 + 'px', height: r.height + 'px' });`) },
	wider: { old: page(menuBody, menuScript()), new: page(menuBody, menuScript(), '#trigger { padding: 1px 12px }') },
	nudged: { old: page(menuBody, menuScript()), new: page(menuBody, menuScript(), '#trigger { padding-left: 7px; padding-right: 7px }') },
	taller: { old: page(menuBody, menuScript()), new: page(menuBody, menuScript(), '#box { padding-bottom: 12px }') },
	narrow: { old: page(`${menuBody}<button>Share</button>`, menuScript()), new: page(`${menuBody}<button>Share</button>`, menuScript(), '@media (min-width: 1400px) { main > button { display: none } }') },
	lower: { old: page(menuBody, menuScript()), new: page(menuBody, menuScript('innerWidth >= 1400 ? 16 : 4')) },
	keys: { old: page(menuBody, menuScript(undefined, `if (e.key === 'ArrowDown') { e.preventDefault(); show(true); }`)), new: page(menuBody, menuScript()) },
	throws: { old: page(menuBody, menuScript()), new: page(menuBody, menuScript(undefined, '', `if (e.key === 'Escape') throw new Error('closing failed');`)) },
	date: {
		old: page(`<input aria-label="Date" placeholder="June 01, 2025">`, `const i = document.querySelector('input'); const fix = () => { const d = new Date(i.value); i.setAttribute('aria-invalid', String(isNaN(d))); if (!isNaN(d)) i.value = d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }); }; i.addEventListener('blur', fix); i.addEventListener('keydown', (e) => e.key === 'Enter' && fix());`),
		new: page(`<input aria-label="Date" placeholder="June 01, 2025">`, `const i = document.querySelector('input'); const fix = () => { const d = new Date(i.value); if (!isNaN(d)) { d.setDate(1); i.value = d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }); } }; i.addEventListener('blur', fix); i.addEventListener('keydown', (e) => e.key === 'Enter' && fix());`),
	},
	fades: {
		old: page(menuBody, menuScript(), '[role=menu] { transition: opacity 400ms linear, display 400ms allow-discrete; opacity: 1 } @starting-style { [role=menu] { opacity: 0 } }'),
		new: page(menuBody, menuScript()),
	},
	shifted: { old: page(`<div style="height: 100px"></div><button>Alpha</button><br><button>Beta</button><br><button>Gamma</button>`), new: page(`<div style="height: 124px"></div><button>Alpha</button><br><button>Beta</button><br><button>Gamma</button>`) },
	sticky: {
		old: page(`<div style="height: 1600px"></div><button id="far">Far</button><div style="height: 1600px"></div>`, `addEventListener('scroll', () => document.querySelector('header').dataset.scrolled = String(scrollY > 40));`),
		new: page(`<div style="height: 1600px"></div><button id="far">Far</button><div style="height: 1600px"></div>`),
	},
	filters: {
		old: page(`<input aria-label="Filter"><div role="listbox" aria-label="Fruit" id="list"><div role="option">Apple</div><div role="option">Banana</div></div>`, `const list = document.getElementById('list'); const all = [...list.children]; document.querySelector('input').addEventListener('input', (e) => list.replaceChildren(...all.filter((o) => o.textContent.toLowerCase().includes(e.target.value.toLowerCase()))));`),
		new: page(`<input aria-label="Filter"><div role="listbox" aria-label="Fruit" id="list"><div role="option">Apple</div><div role="option">Banana</div></div>`, `document.querySelector('input').addEventListener('input', (e) => { for (const o of document.querySelectorAll('[role=option]')) o.hidden = !o.textContent.toLowerCase().includes(e.target.value.toLowerCase()); });`),
	},
	copies: {
		old: page(`<pre>one</pre><button>Copy</button><pre style="height: 300px">extra</pre><button>Copy</button><pre>two</pre><button>Copy</button><pre>three</pre><button>Copy</button>`),
		new: page(`<pre>one</pre><button>Copy</button><pre style="height: 300px">extra</pre><pre>two</pre><button>Copy</button><pre>three</pre><button>Copy</button>`),
	},
	scroller: { old: '', new: '' },
	stars: { old: page(`${menuBody}<button>Star 127k</button>`, menuScript()), new: page(`${menuBody}<button>Star 126k</button>`, menuScript()) },
	noisy: { old: '', new: page(`${menuBody}<button id="n">Count</button>`, menuScript()) },
};
// Each load of the original draws the counter at another width (the page's randomness is frozen, so the server varies it).
let loads = 0;
// A sidebar its own script scrolls to another place on each load, as the docs sidebar centred while the page streams.
const sidebar = (top: number) => page(`<aside aria-label="Docs" id="side" style="position: fixed; left: 0; top: 60px; width: 200px; height: 300px; overflow: auto">${Array.from({ length: 40 }, (_, i) => `<a href="/doc-${i}" style="display: block; height: 30px">Doc ${i}</a>`).join('')}</aside><button style="margin-left: 240px">Main</button>`, `document.getElementById('side').scrollTop = ${top};`);
const noisyOld = () => page(`${menuBody}<button id="n" style="padding: 1px ${(loads++ % 2) * 10 + 2}px">Count</button>`, menuScript());

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		const [, side, name] = new URL(req.url ?? '/', 'http://x').pathname.split('/');
		const shape = CASES[name ?? ''];
		const html = name === 'scroller' ? sidebar(side === 'old' ? (loads++ % 2) * 200 + 150 : 0) : shape && (side === 'old' ? (name === 'noisy' ? noisyOld() : shape.old) : side === 'new' ? shape.new : undefined);
		return html ? res.writeHead(200, { 'content-type': 'text/html' }).end(html) : res.writeHead(404).end('<!doctype html><title>404</title>');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser?.close();
	server?.close();
});

const FAST: ControlParityOptions = { widths: [1280, 1440], anchorWidths: [1280, 1440], settleMs: 250, maxUses: 3, maxKeys: 3, maxInputs: 0 };

// Old and new are served under one origin, each side a path of its own: the route is rewritten per side.
async function check(name: string, options: ControlParityOptions = FAST): Promise<readonly Failure[]> {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const out = await checkControlParity(browser, { old: defaultEnv(`${origin}/old/`), new: defaultEnv(`${origin}/new/`) }, name, VIEWPORTS[0]!, options);
	return out.failures;
}
const checks = (failures: readonly Failure[]) => failures.map((f) => `${f.check} @${f.viewport ?? ''}: ${f.expected} | ${f.actual}`);

test('a port alike in every control: nothing is red', async () => {
	assert.deepEqual(checks(await check('same', { ...FAST, maxInputs: 3 })), []);
});

test('a layer laid over the header and a control: the click lands elsewhere, at the control and over the region', async () => {
	const found = checks(await check('covered'));
	assert.ok(found.some((f) => f.startsWith('hit target over a control') && f.includes('button "Options"')), found.join('\n'));
	assert.ok(found.some((f) => f.startsWith('hit target over a region') && f.includes('banner')), found.join('\n'));
});

test('a control a few pixels wider is red as its box; one a pixel off is not', async () => {
	const wider = checks(await check('wider'));
	assert.ok(wider.some((f) => f.startsWith('control box') && f.includes('button "Options"')), wider.join('\n'));
	assert.deepEqual(checks(await check('nudged')).filter((f) => f.startsWith('control box')), []);
});

test('a container taller on the port is red as its container box', async () => {
	const found = checks(await check('taller'));
	assert.ok(found.some((f) => f.startsWith('container box') && f.includes('its parent')), found.join('\n'));
});

test('a control the port hides at 1440 px only: missing at that width', async () => {
	const found = checks(await check('narrow'));
	assert.ok(found.some((f) => f.startsWith('controls at each width @1440') && f.includes('button "Share"')), found.join('\n'));
	assert.ok(!found.some((f) => f.startsWith('controls at each width @1280')), found.join('\n'));
});

test('a pop-up 12 px lower at 1440 px only: its place is red at 1440, not at 1280', async () => {
	const found = checks(await check('lower'));
	assert.ok(found.some((f) => f.startsWith('pop-up place (Chromium) @1440') && f.includes('16 px down')), found.join('\n'));
	assert.ok(!found.some((f) => f.includes('@1280') && f.startsWith('pop-up place')), found.join('\n'));
});

test('the same pop-up in WebKit: its place is compared there too, at both widths', async () => {
	const engine = await webkit.launch();
	try {
		const found = checks(await check('lower', { ...FAST, maxKeys: 0, webkit: engine }));
		assert.ok(found.some((f) => f.startsWith('pop-up place (WebKit) @1440') && f.includes('16 px down')), found.join('\n'));
		assert.ok(!found.some((f) => f.startsWith('pop-up place (WebKit) @1280')), found.join('\n'));
	} finally {
		await engine.close();
	}
});

test('ArrowDown opens the menu on the original only: the keyboard is red, naming the key and what differs', async () => {
	const found = checks(await check('keys', { ...FAST, maxKeys: 8 }));
	assert.ok(found.some((f) => f.startsWith('keyboard: pop-up') && f.includes('ArrowDown') && f.includes('a menu is open')), found.join('\n'));
});

test('the port throws after Escape: the error is red', async () => {
	const found = checks(await check('throws', { ...FAST, maxKeys: 8 }));
	assert.ok(found.some((f) => f.startsWith('errors after a key') && f.includes('closing failed')), found.join('\n'));
});

test('a date typed into a field that the port turns into the first of the month: its value and validity are red', async () => {
	const found = checks(await check('date', { ...FAST, maxInputs: 9 }));
	assert.ok(found.some((f) => f.startsWith('field input: value') && f.includes('"May 28, 2025" typed') && f.includes('May 28, 2025"') && f.includes('May 01, 2025')), found.join('\n'));
	assert.ok(found.some((f) => f.startsWith('field input: validity') && f.includes('"abc"')), found.join('\n'));
});

test('a menu that fades in on the original and shows at once on the port: its first frame and its opening are red', async () => {
	const found = checks(await check('fades', { ...FAST, film: true, maxKeys: 0 }));
	assert.ok(found.some((f) => f.startsWith('pop-up first frame')), found.join('\n'));
	assert.ok(found.some((f) => f.startsWith('pop-up opening, frame by frame')), found.join('\n'));
});

test('a control whose size changes from load to load on the original is not compared', async () => {
	assert.deepEqual(checks(await check('noisy')).filter((f) => f.includes('"Count')), []);
});

test('a live count in a control\'s name (stars) that moved between the two deploys: the same control, nothing red', async () => {
	assert.deepEqual(checks(await check('stars', { ...FAST, maxUses: 0, maxKeys: 0 })), []);
});

test('a block 24 px taller above three controls: one box finding where the shift starts, not one per control after it', async () => {
	const found = checks(await check('shifted', { ...FAST, maxUses: 0, maxKeys: 0 })).filter((f) => f.startsWith('control box'));
	for (const width of ['1280', '1440']) assert.ok(found.filter((f) => f.includes(`@${width}`)).length <= 1, found.join('\n'));
});

test('a header the original restyles on scroll: bringing a control into view is no change of the control\'s', async () => {
	assert.deepEqual(checks(await check('sticky', { ...FAST, maxUses: 3, maxKeys: 6 })), []);
});

test('a list filtered in the page by removing rows on one side and hiding them on the other: the same answer', async () => {
	assert.deepEqual(checks(await check('filters', { ...FAST, maxUses: 2, maxKeys: 0, maxInputs: 3 })).filter((f) => f.startsWith('field input')), []);
});

test('one of many namesake buttons missing on the port: one finding, not one for every namesake after it', async () => {
	const found = checks(await check('copies', { ...FAST, widths: [1280], maxUses: 0, maxKeys: 0 }));
	assert.equal(found.filter((f) => f.startsWith('controls at each width')).length, 1, found.join('\n'));
	assert.ok(found.filter((f) => f.startsWith('control box') || f.startsWith('container box')).length <= 1, found.join('\n'));
});

test('a sidebar its script scrolls to a different place on each load: its links are compared from the top, so nothing is red', async () => {
	assert.deepEqual(checks(await check('scroller', { ...FAST, widths: [1280], maxUses: 0, maxKeys: 0 })), []);
});

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import fc from 'fast-check';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { checkProbes } from '../src/check/probes.ts';
import { dateStrings, modelOf, modelSteps, seedOf } from '../src/check/role-models.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// Each page is a miniature of a defect the owner found by hand in a port, written once correctly (`old`) and once with the defect (`bad`).

// A dropdown menu with a submenu, as the APG menu pattern has it; `deaf` opens the submenu only by the pointer, never by ArrowRight.
const submenu = (deaf: boolean) => `<button id="t" aria-haspopup="menu" aria-expanded="false">Edit</button>
<div id="m" role="menu" hidden><div role="menuitem" tabindex="-1">Copy</div><div role="menuitem" tabindex="-1" id="s" aria-haspopup="menu" aria-expanded="false">Share</div><div role="menuitem" tabindex="-1">Delete</div></div>
<div id="sm" role="menu" hidden><div role="menuitem" tabindex="-1">Email</div><div role="menuitem" tabindex="-1">Link</div></div>
<script>
const items = (menu) => [...menu.children];
const openSub = (focus) => { sm.hidden = false; s.setAttribute('aria-expanded', 'true'); if (focus) sm.firstElementChild.focus(); };
const closeSub = () => { sm.hidden = true; s.setAttribute('aria-expanded', 'false'); };
const close = () => { closeSub(); m.hidden = true; t.setAttribute('aria-expanded', 'false'); t.focus(); };
t.onclick = () => { if (!m.hidden) return close(); m.hidden = false; t.setAttribute('aria-expanded', 'true'); m.firstElementChild.focus(); };
s.addEventListener('pointerenter', () => openSub(false));
for (const menu of [m, sm]) menu.addEventListener('keydown', (e) => {
	const list = items(menu); const i = list.indexOf(document.activeElement);
	const go = (n) => { e.preventDefault(); list[(n + list.length) % list.length].focus(); };
	if (e.key === 'ArrowDown') go(i + 1); else if (e.key === 'ArrowUp') go(i - 1); else if (e.key === 'Home') go(0); else if (e.key === 'End') go(list.length - 1);
	else if (e.key === 'ArrowRight' && document.activeElement === s && ${deaf ? 'false' : 'true'}) { e.preventDefault(); openSub(true); }
	else if (e.key === 'ArrowLeft' && menu === sm) { e.preventDefault(); closeSub(); s.focus(); }
	else if (e.key === 'Escape') { e.preventDefault(); close(); }
	else if (e.key.length === 1) { const n = list.findIndex((x) => x.textContent.toLowerCase().startsWith(e.key.toLowerCase())); if (n >= 0) go(n); }
});
addEventListener('click', (e) => { if (!m.hidden && !m.contains(e.target) && !sm.contains(e.target) && e.target !== t) close(); });
</script>`;

// A month grid with a roving focused day: arrows move by a day or a week, PageUp/PageDown by a month, Shift+PageUp/PageDown by a
// year, Home/End to the week's ends. `shifty` is Base UI's port defect: Shift+ArrowLeft jumps a month and leaves no day focused.
// `stuck` is the Radix date picker's: in the popover no key moves the focused day.
const calendarScript = (shifty: boolean, stuck: boolean) => `
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
let day = new Date(2025, 4, 14);
const draw = (grid, caption, keepFocus) => {
	caption.textContent = MONTHS[day.getMonth()] + ' ' + day.getFullYear();
	grid.textContent = '';
	const first = new Date(day.getFullYear(), day.getMonth(), 1);
	const count = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
	let row;
	for (let i = 0; i < first.getDay() + count; i++) {
		if (i % 7 === 0) { row = document.createElement('div'); row.setAttribute('role', 'row'); grid.append(row); }
		const cell = document.createElement('div'); cell.setAttribute('role', 'gridcell'); row.append(cell);
		const d = i - first.getDay() + 1;
		if (d < 1) continue;
		const b = document.createElement('button'); b.textContent = String(d); b.tabIndex = d === day.getDate() ? 0 : -1;
		b.setAttribute('aria-label', MONTHS[day.getMonth()] + ' ' + d + ', ' + day.getFullYear());
		b.onclick = () => { day = new Date(day.getFullYear(), day.getMonth(), d); draw(grid, caption, true); };
		cell.append(b);
	}
	if (keepFocus) grid.querySelector('button[tabindex="0"]')?.focus();
};
const keys = (grid, caption) => grid.addEventListener('keydown', (e) => {
	${stuck ? 'return;' : ''}
	const y = day.getFullYear(), mo = day.getMonth(), d = day.getDate();
	const clamp = (yy, mm) => new Date(yy, mm, Math.min(d, new Date(yy, mm + 1, 0).getDate()));
	let next;
	if (e.key === 'ArrowLeft' && e.shiftKey && ${shifty ? 'true' : 'false'}) { e.preventDefault(); day = clamp(y, mo - 1); draw(grid, caption, false); return; }
	if (e.key === 'ArrowLeft') next = new Date(y, mo, d - 1);
	else if (e.key === 'ArrowRight') next = new Date(y, mo, d + 1);
	else if (e.key === 'ArrowUp') next = new Date(y, mo, d - 7);
	else if (e.key === 'ArrowDown') next = new Date(y, mo, d + 7);
	else if (e.key === 'PageUp') next = e.shiftKey ? clamp(y - 1, mo) : clamp(y, mo - 1);
	else if (e.key === 'PageDown') next = e.shiftKey ? clamp(y + 1, mo) : clamp(y, mo + 1);
	else if (e.key === 'Home') next = new Date(y, mo, d - day.getDay());
	else if (e.key === 'End') next = new Date(y, mo, d + 6 - day.getDay());
	if (!next) return;
	e.preventDefault(); day = next; draw(grid, caption, true);
});`;
const calendar = (shifty: boolean) => `<section><h2 id="cap"></h2><div role="grid" id="g" aria-labelledby="cap"></div></section><script>${calendarScript(shifty, false)} draw(g, cap, false); keys(g, cap);</script>`;
const datePicker = (stuck: boolean) => `<button id="p" aria-haspopup="dialog" aria-expanded="false">Pick a date</button><div id="pop" role="dialog" aria-label="Choose a date" hidden><h2 id="cap"></h2><div role="grid" id="g" aria-labelledby="cap"></div></div>
<script>${calendarScript(false, stuck)}
const shut = () => { pop.hidden = true; p.setAttribute('aria-expanded', 'false'); p.focus(); };
p.onclick = () => { if (!pop.hidden) return shut(); pop.hidden = false; p.setAttribute('aria-expanded', 'true'); draw(g, cap, true); };
keys(g, cap);
pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== p) { pop.hidden = true; p.setAttribute('aria-expanded', 'false'); } });
</script>`;

// A date field that reads what is typed when it loses focus or on Enter and writes it back as "May 28, 2025"; `monthly` is the
// port's parser that kept the month and year only, so May 28 became May 1.
const dateField = (monthly: boolean) => `<label for="d">Due date</label><input id="d" placeholder="June 01, 2025"><p id="out">No date</p>
<script>
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const commit = () => {
	const t = Date.parse(d.value);
	if (Number.isNaN(t)) { out.textContent = 'No date'; return; }
	const at = new Date(t);
	const shown = ${monthly ? 'new Date(at.getFullYear(), at.getMonth(), 1)' : 'at'};
	d.value = MONTHS[shown.getMonth()] + ' ' + String(shown.getDate()).padStart(2, '0') + ', ' + shown.getFullYear();
	out.textContent = 'Due ' + d.value;
};
d.addEventListener('blur', commit);
d.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
</script>`;

// A data table's multi-select filter: each click on an option toggles it and the list stays open, as Base UI's does; Escape and a
// click outside close it. `clingy` is the port's: once anything is chosen, a click outside leaves it open.
const multiselect = (clingy: boolean) => `<button id="f" aria-haspopup="listbox" aria-expanded="false">Status</button><div id="lb" role="listbox" aria-multiselectable="true" hidden><div role="option" tabindex="-1" aria-selected="false">Todo</div><div role="option" tabindex="-1" aria-selected="false">In progress</div><div role="option" tabindex="-1" aria-selected="false">Done</div></div>
<script>
const opts = [...lb.children];
const close = (back) => { lb.hidden = true; f.setAttribute('aria-expanded', 'false'); if (back) f.focus(); };
f.onclick = () => { if (!lb.hidden) return close(true); lb.hidden = false; f.setAttribute('aria-expanded', 'true'); opts[0].focus(); };
for (const o of opts) o.onclick = () => { o.setAttribute('aria-selected', String(o.getAttribute('aria-selected') !== 'true')); o.focus(); };
lb.addEventListener('keydown', (e) => {
	const i = opts.indexOf(document.activeElement);
	if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(i + 1, opts.length - 1)].focus(); }
	else if (e.key === 'ArrowUp') { e.preventDefault(); opts[Math.max(i - 1, 0)].focus(); }
	else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); opts[i]?.click(); }
	else if (e.key === 'Escape') close(true);
});
addEventListener('click', (e) => { if (lb.hidden || lb.contains(e.target) || e.target === f) return; ${clingy ? "if (opts.some((o) => o.getAttribute('aria-selected') === 'true')) return;" : ''} close(false); });
</script>`;

// A file tree whose folders open on a click or ArrowRight and close on ArrowLeft; `shallow` is the port's: a folder inside a folder
// does not open.
const fileTree = (shallow: boolean) => `<ul role="tree" id="tr" aria-label="Files">
<li role="treeitem" aria-expanded="false" tabindex="0" data-level="1"><span>app</span><ul role="group" hidden>
	<li role="treeitem" tabindex="-1" data-level="2"><span>layout.tsx</span></li>
	<li role="treeitem" aria-expanded="false" tabindex="-1" data-level="2"><span>components</span><ul role="group" hidden>
		<li role="treeitem" tabindex="-1" data-level="3"><span>button.tsx</span></li>
	</ul></li>
</ul></li>
<li role="treeitem" tabindex="-1" data-level="1"><span>package.json</span></li>
</ul>
<script>
const visible = () => [...tr.querySelectorAll('[role=treeitem]')].filter((i) => !i.parentElement.closest('[hidden]'));
const toggle = (item, open) => {
	if (!item.hasAttribute('aria-expanded') || (${shallow ? 'true' : 'false'} && item.dataset.level !== '1')) return;
	const to = open ?? item.getAttribute('aria-expanded') !== 'true';
	item.setAttribute('aria-expanded', String(to)); item.querySelector(':scope > ul').hidden = !to;
};
const focus = (item) => { for (const i of tr.querySelectorAll('[role=treeitem]')) i.tabIndex = i === item ? 0 : -1; item.focus(); };
tr.addEventListener('click', (e) => { const item = e.target.closest('[role=treeitem]'); if (!item) return; e.stopPropagation(); toggle(item); focus(item); });
tr.addEventListener('keydown', (e) => {
	const list = visible(); const item = document.activeElement; const i = list.indexOf(item); if (i < 0) return;
	if (e.key === 'ArrowDown' && list[i + 1]) { e.preventDefault(); focus(list[i + 1]); }
	else if (e.key === 'ArrowUp' && list[i - 1]) { e.preventDefault(); focus(list[i - 1]); }
	else if (e.key === 'Home') { e.preventDefault(); focus(list[0]); }
	else if (e.key === 'End') { e.preventDefault(); focus(list.at(-1)); }
	else if (e.key === 'ArrowRight') { e.preventDefault(); if (item.getAttribute('aria-expanded') === 'false') toggle(item, true); else if (item.getAttribute('aria-expanded') === 'true' && list[i + 1]) focus(list[i + 1]); }
	else if (e.key === 'ArrowLeft') { e.preventDefault(); if (item.getAttribute('aria-expanded') === 'true') toggle(item, false); else { const up = item.parentElement.closest('[role=treeitem]'); if (up) focus(up); } }
	else if (e.key === 'Enter') { e.preventDefault(); toggle(item); }
});
</script>`;

// A modal dialog that keeps Tab inside and gives focus back to its trigger; `leaky` lets Shift+Tab leave it.
const modal = (leaky: boolean) => `<button>Before</button><button id="o" aria-haspopup="dialog" aria-expanded="false">Settings</button><div id="d" role="dialog" aria-modal="true" aria-label="Settings" hidden><input aria-label="Name"><button id="x">Close</button></div><button>After</button>
<script>
const close = () => { d.hidden = true; o.setAttribute('aria-expanded', 'false'); o.focus(); };
o.onclick = () => { d.hidden = false; o.setAttribute('aria-expanded', 'true'); d.querySelector('input').focus(); };
x.onclick = close;
d.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') return close();
	if (e.key !== 'Tab') return;
	const stops = [...d.querySelectorAll('input, button')];
	const i = stops.indexOf(document.activeElement);
	if (e.shiftKey && ${leaky ? 'false' : 'true'} && i === 0) { e.preventDefault(); stops.at(-1).focus(); }
	else if (!e.shiftKey && i === stops.length - 1) { e.preventDefault(); stops[0].focus(); }
});
</script>`;

// Tabs that follow focus with the arrows; `stiff` moves with ArrowRight only.
const tabs = (stiff: boolean) => `<div role="tablist" id="tl" aria-label="Views"><button role="tab" aria-selected="true" tabindex="0">Preview</button><button role="tab" aria-selected="false" tabindex="-1">Code</button><button role="tab" aria-selected="false" tabindex="-1">Notes</button></div><div role="tabpanel" id="pn">Preview</div>
<script>
const all = [...tl.children];
const pick = (t) => { for (const x of all) { x.setAttribute('aria-selected', String(x === t)); x.tabIndex = x === t ? 0 : -1; } t.focus(); pn.textContent = t.textContent; };
for (const t of all) t.onclick = () => pick(t);
tl.addEventListener('keydown', (e) => {
	const i = all.indexOf(document.activeElement);
	const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' && ${stiff ? 'false' : 'true'} ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : null;
	if (to === null) return;
	e.preventDefault(); pick(all[(to + all.length) % all.length]);
});
</script>`;

const PAIRS: Record<string, { old: string; bad: string; control: RegExp; model: string }> = {
	submenu: { old: submenu(false), bad: submenu(true), control: /button "Edit"/, model: 'menu' },
	'calendar shift': { old: calendar(false), bad: calendar(true), control: /grid/, model: 'grid' },
	'date picker': { old: datePicker(false), bad: datePicker(true), control: /button "Pick a date"/, model: 'popover' },
	'date field': { old: dateField(false), bad: dateField(true), control: /textbox "Due date"/, model: 'text' },
	multiselect: { old: multiselect(false), bad: multiselect(true), control: /button "Status"/, model: 'listbox' },
	'file tree': { old: fileTree(false), bad: fileTree(true), control: /tree "Files"/, model: 'tree' },
	modal: { old: modal(false), bad: modal(true), control: /button "Settings"/, model: 'popover' },
	tabs: { old: tabs(false), bad: tabs(true), control: /tablist "Views"/, model: 'tabs' },
};

function serve(pages: Record<string, string>): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const page = pages[new URL(req.url ?? '/', 'http://x').pathname];
		if (page === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="en"><title>Models</title><main><h1>Models</h1>${page}</main></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

const path = (name: string) => `/${name.replace(/ /g, '-')}`;

describe('role-model probes', () => {
	let browser: Browser;
	let old: string;
	let bad: string;
	const servers: Server[] = [];
	before(async () => {
		browser = await chromium.launch();
		const a = await serve(Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [path(k), v.old])));
		const b = await serve(Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [path(k), v.bad])));
		servers.push(a.server, b.server);
		old = a.origin;
		bad = b.origin;
	});
	after(async () => {
		await browser?.close();
		for (const s of servers) s.close();
	});

	for (const [name, pair] of Object.entries(PAIRS)) {
		test(`the ${pair.model} model catches the ${name} defect with a seed and the shortest steps, and is green on the same page`, { timeout: 300_000 }, async () => {
			const route = path(name);
			const [result, same] = await Promise.all([checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(bad) }, route, VIEWPORTS[0]!), checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(old) }, route, VIEWPORTS[0]!)]);
			const found = result.failures.filter((f) => f.check.startsWith(`role model probe of `) && pair.control.test(f.check));
			assert.ok(found.length, `${name}: ${JSON.stringify(result.failures, null, 1)}`);
			const f = found[0]!;
			assert.match(f.check, new RegExp(`: the ${pair.model} model, seed -?\\d+, shrunk to \\d+ steps? `));
			assert.match(f.expected, /^old, after /);
			assert.match(f.hint, /MARKLESS_MIGRATE_MODEL_SEED=-?\d+/);
			assert.deepEqual(same.failures, [], `${name} on the same page: ${JSON.stringify(same.failures, null, 1)}`);
			assert.ok(same.controls.some((c) => c.cls === 'role model' && c.state === 'probed'), JSON.stringify(same.controls));
		});
	}

	test('the same route is driven through the same steps every run', { timeout: 300_000 }, async () => {
		const sides = { old: defaultEnv(old), new: defaultEnv(bad) };
		const runs = [await checkProbes(browser, sides, path('submenu'), VIEWPORTS[0]!), await checkProbes(browser, sides, path('submenu'), VIEWPORTS[0]!)];
		const model = (r: (typeof runs)[number]) => r.failures.filter((f) => f.check.startsWith('role model probe')).map((f) => [f.check, f.expected, f.actual]);
		assert.ok(model(runs[0]!).length);
		assert.deepEqual(model(runs[1]!), model(runs[0]!));
	});
});

test('each role gets the model of its APG keyboard pattern', () => {
	const c = (role: string, popup?: string) => ({ role, name: 'x', nth: 0, kind: '', classes: [], region: 'main', ...(popup ? { popup } : {}) });
	assert.equal(modelOf(c('button', 'menu')), 'menu');
	assert.equal(modelOf(c('button', 'true')), 'menu');
	assert.equal(modelOf(c('button', 'listbox')), 'listbox');
	assert.equal(modelOf(c('combobox')), 'listbox');
	assert.equal(modelOf(c('button', 'dialog')), 'popover');
	assert.equal(modelOf({ ...c('area'), classes: ['context menu'] }), 'context menu');
	assert.equal(modelOf(c('menubar')), 'menubar');
	assert.equal(modelOf(c('grid')), 'grid');
	assert.equal(modelOf(c('tree')), 'tree');
	assert.equal(modelOf(c('tablist')), 'tabs');
	assert.equal(modelOf(c('toolbar')), 'toolbar');
	assert.equal(modelOf(c('radiogroup')), 'toolbar');
	assert.equal(modelOf(c('textbox')), 'text');
	assert.equal(modelOf(c('searchbox')), 'text');
	assert.equal(modelOf(c('link')), undefined);
});

test('the menu model reaches a submenu and back, the grid model every APG calendar key, and text fields get dates in many formats', () => {
	const keys = (model: Parameters<typeof modelSteps>[0]) => new Set(fc.sample(modelSteps(model), { numRuns: 2_000, seed: 7 }).flatMap((op) => (op.op === 'key' ? [op.key] : [])));
	for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft', 'Escape']) assert.ok(keys('menu').has(k), `menu: ${k}`);
	for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Shift+PageUp', 'Shift+PageDown', 'Home', 'End', 'Shift+ArrowLeft', 'Shift+ArrowRight']) assert.ok(keys('grid').has(k), `grid: ${k}`);
	for (const k of ['Tab', 'Shift+Tab', 'Escape']) assert.ok(keys('popover').has(k), `popover: ${k}`);
	const dates = fc.sample(dateStrings, { numRuns: 500, seed: 3 });
	assert.ok(dates.some((d) => /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(d)), 'a "May 28, 2025" form');
	assert.ok(dates.some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), 'an ISO form');
	assert.ok(dates.some((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d)), 'a slashed form');
	assert.ok(dates.includes('May 28, 2025'));
	assert.ok(dates.some((d) => /Feb(ruary)? 30/.test(d)), 'a day that does not exist');
});

test('the seed is a fixed function of the route, the control and the model', () => {
	assert.equal(seedOf('/a', 'button|Edit|0', 'menu'), seedOf('/a', 'button|Edit|0', 'menu'));
	assert.notEqual(seedOf('/a', 'button|Edit|0', 'menu'), seedOf('/b', 'button|Edit|0', 'menu'));
	assert.ok(Number.isInteger(seedOf('/a', 'x', 'menu')) && Math.abs(seedOf('/a', 'x', 'menu')) < 2 ** 31);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { attr, body, find, parseDocument, walk, type Element } from '../src/convert/dom.ts';
import { TablePlan, templateOf, type CapturedTable, type TableSnapshot } from '../src/convert/tanstack-table.ts';
import { emitChildren, emitElement } from '../src/convert/tsrx.ts';

// A table region as the old page showed it in each recorded state, built from one description so the states differ only
// where the table's state reaches.
interface Shape {
	readonly rows: readonly { readonly id: string; readonly sel: boolean }[];
	readonly page: 'none' | 'some' | 'all';
	readonly count: string;
	readonly canNext: boolean;
	readonly hidden?: boolean;
}

function radixRegion(s: Shape): string {
	const box = (on: 'none' | 'some' | 'all' | boolean) => {
		const state = on === true || on === 'all' ? 'checked' : on === 'some' ? 'indeterminate' : 'unchecked';
		const checked = state === 'checked' ? 'true' : state === 'indeterminate' ? 'mixed' : 'false';
		return `<button type="button" role="checkbox" aria-checked="${checked}" data-state="${state}" data-slot="checkbox">${state === 'unchecked' ? '' : `<span data-slot="checkbox-indicator" data-state="${state}"><svg class="check"></svg></span>`}</button>`;
	};
	const names: Record<string, string> = { a: 'alpha', b: 'beta', c: 'gamma' };
	const rows = s.rows.length
		? s.rows.map((r) => `<tr data-slot="table-row" data-state="${r.sel ? 'selected' : 'false'}"><td>${box(r.sel)}</td>${s.hidden ? '' : `<td><div class="lowercase">${names[r.id]}</div></td>`}<td><button id="menu-${r.id}" aria-haspopup="menu">Open</button></td></tr>`).join('')
		: '<tr><td colspan="3" class="h-24">No results.</td></tr>';
	return `<div class="w-full"><input placeholder="Filter names..." value=""><table><thead><tr><th>${box(s.page)}</th>${s.hidden ? '' : '<th><button data-slot="button">Name</button></th>'}<th></th></tr></thead><tbody>${rows}</tbody></table><div class="count">${s.count}</div><button data-slot="button"${s.canNext ? '' : ' disabled=""'}>Next</button></div>`;
}

const q = (s: Shape, filtered: number, selected: number) => ({ filteredSelected: s.rows.filter((r) => r.sel).length, selected, filtered, rows: 3, pageRows: s.rows.length, pageNumber: 1, pageCount: s.canNext ? 2 : 1, pageIndex: 0, canPrev: false, canNext: s.canNext, pageSel: s.page, allSel: selected === 3 ? 'all' : selected ? 'some' : 'none' });

function capture(region: (s: Shape) => string): CapturedTable {
	const ids = ['a', 'b', 'c'];
	const all = (sel: (id: string) => boolean) => ids.map((id) => ({ id, sel: sel(id) }));
	const snap = (name: string, s: Shape, filtered: number, selected: number, columns: Record<string, boolean> = {}): TableSnapshot => ({ name, q: q(s, filtered, selected), columns: Object.fromEntries(['select', 'name', 'actions'].map((c) => [c, { sorted: '', visible: columns[c] ?? true }])), rows: s.rows, html: region(s) });
	const initial: Shape = { rows: all(() => false), page: 'none', count: '0 of 3 row(s) selected.', canNext: false };
	return {
		sig: 'table||',
		nth: 0,
		region: { sig: 'div||', nth: 0 },
		data: ids.map((id) => ({ name: id })),
		rowIds: ids,
		columns: [
			{ id: 'select', accessor: false, def: { enableSorting: false, enableHiding: false } },
			{ id: 'name', accessor: true, def: {} },
			{ id: 'actions', accessor: false, def: { enableHiding: false } },
		],
		features: ['columnFilteringFeature', 'columnVisibilityFeature', 'rowSelectionFeature', 'rowPaginationFeature'],
		rowModels: ['filteredRowModel', 'paginatedRowModel'],
		sortFns: [],
		filterFns: ['includesString'],
		options: {},
		state: { rowSelection: {}, columnFilters: [], columnVisibility: {}, pagination: { pageIndex: 0, pageSize: 10 } },
		controls: [
			{ sig: 'input', nth: 0, kind: 'filter', column: 'name' },
			{ sig: 'all', nth: 0, kind: 'select', next: { none: 'pageOn', some: 'pageOn', all: 'pageOff' } },
			...ids.map((id, i) => ({ sig: 'row', nth: i, kind: 'row' as const, row: id })),
			{ sig: 'next', nth: 0, kind: 'page', delta: 1 },
			{ sig: 'item|name', nth: 0, kind: 'visibility', column: 'name', menu: { sig: 'columns', nth: 0 } },
		],
		snapshots: [
			snap('initial', initial, 3, 0),
			snap('row', { ...initial, rows: all((id) => id === 'a'), page: 'some', count: '1 of 3 row(s) selected.' }, 3, 1),
			snap('all', { ...initial, rows: all(() => true), page: 'all', count: '3 of 3 row(s) selected.' }, 3, 3),
			snap('filtered', { ...initial, rows: [{ id: 'b', sel: false }], count: '0 of 1 row(s) selected.' }, 1, 1),
			snap('empty', { ...initial, rows: [], count: '0 of 0 row(s) selected.' }, 0, 0),
			snap('page:first', { ...initial, rows: all(() => false).slice(0, 1), canNext: true }, 3, 0),
			snap('hidden', { ...initial, hidden: true }, 3, 0, { name: false }),
		],
	};
}

function convert(region: (s: Shape) => string) {
	const table = capture(region);
	const doc = parseDocument(`<body>${table.snapshots[0]!.html}</body>`);
	const root = body(doc);
	const els = [...walk(root)];
	const boxes = els.filter((el) => attr(el, 'role') === 'checkbox');
	const located: Record<string, Element | undefined> = {
		'div||': els.find((el) => el.tagName === 'div'),
		'table||': els.find((el) => el.tagName === 'table'),
		input: els.find((el) => el.tagName === 'input'),
		all: boxes[0],
		next: els.find((el) => el.tagName === 'button' && attr(el, 'data-slot') === 'button' && el.childNodes.some((n) => 'value' in n && n.value === 'Next')),
	};
	const plan = new TablePlan();
	plan.expect('/t', [table]);
	const placed = plan.add('/t', (sig, nth) => (sig === 'row' ? boxes[nth + 1] : located[sig]));
	plan.emitHtml = (html) => emitChildren(parseFragment(html) as unknown as Element);
	const bind = (el: Element) => plan.bind(el);
	plan.emitter = (el, declarations) => emitElement(el, { declarations, bind });
	const declarations: string[] = [];
	return { plan, placed, out: emitElement(root, { declarations, bind }), declarations };
}

test('a TanStack table renders its rows from one template in a keyed @for over the view, with the empty state the old page showed', () => {
	const { placed, out, plan } = convert(radixRegion);
	assert.equal(placed, 1, plan.notes.join('\n'));
	assert.match(out, /<tbody>@for \(const row of tt0v\.rows; key row\.id\) \{ <tr data-slot="table-row" data-state=\{row\.sel \? "selected" : "false"\}>/);
	assert.match(out, /\} @empty \{ <tr><td colspan="3" class="h-24">No results\.<\/td><\/tr> \}<\/tbody>/);
	// Each row's own text and the id of its menu trigger are the row's values.
	assert.match(out, /<div class="lowercase">\{row\.c0\}<\/div>/);
	assert.match(out, /<button id=\{row\.c1\} aria-haspopup="menu">Open<\/button>/);
	assert.match(plan.specsModule()!, /export const ttc_[0-9a-f]{10}: Readonly<Record<string, readonly string\[\]>> = \{"a":\["alpha","menu-a"\],"b":\["beta","menu-b"\],"c":\["gamma","menu-c"\]\};/);
});

test('a row checkbox and the select-all box show what the old page showed for each selection, and call the table on use', () => {
	const { out } = convert(radixRegion);
	assert.match(out, /aria-checked=\{row\.sel \? "true" : "false"\}/);
	assert.match(out, /onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, tt0\.s, \{ k: "row", r: row\.id \}\); \}\}/);
	assert.match(out, /onKeyDown=\{\(event\) => \{ if \(event\.key === 'Enter'\) event\.preventDefault\(\); \}\}/, "Enter does not toggle Radix's checkbox");
	// In a keyed row the indicator is hidden while unchecked: a row holding a branch could not be built when it comes back.
	assert.match(out, /aria-checked=\{row\.sel \? "true" : "false"\} data-state=\{row\.sel \? "checked" : "unchecked"\}/);
	assert.match(out, /<span data-slot="checkbox-indicator" data-state="checked" hidden=\{!row\.sel\}><svg class="check"><\/svg><\/span><\/button>/);
	assert.doesNotMatch(out.slice(out.indexOf('@for')), /@if/, 'nothing in a row is a branch');
	assert.match(out, /aria-checked=\{tt0v\.q\.pageSel === "none" \? "false" : tt0v\.q\.pageSel === "some" \? "mixed" : "true"\}/);
	assert.match(out, /@if \(tt0v\.q\.pageSel === "some"\) \{ <><span data-slot="checkbox-indicator" data-state="indeterminate">/);
	assert.match(out, /tt0\.s = ttAct\(tts_[0-9a-f]{10}, tt0\.s, \{ k: "select", next: \{"none":"pageOn","some":"pageOn","all":"pageOff"\} \}\)/);
});

test('a hideable column takes its header out and hides its cells; the count and the page buttons read the view; the filter sets the column filter', () => {
	const { out, plan, declarations } = convert(radixRegion);
	assert.match(out, /@if \(tt0v\.c\["name"\]\.v\) \{ <th><button data-slot="button">Name<\/button><\/th> \}/, 'a hidden column takes its header out, as the old page did');
	assert.match(out, /<td hidden=\{!tt0v\.c\["name"\]\.v\}><div class="lowercase">/);
	// Text updates where it reads a name: each count is a computed() of its own.
	assert.match(out, /<div class="count">\{tt0t0\}\{" of "\}\{tt0t1\}\{" row\(s\) selected\."\}<\/div>/);
	assert.ok(declarations.includes('const tt0t0 = computed(() => tt0v.q.filteredSelected);') && declarations.includes('const tt0t1 = computed(() => tt0v.q.filtered);'), declarations.join('\n'));
	assert.match(out, /<button data-slot="button" disabled=\{tt0v\.q\.canNext \? false : true\} onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, tt0\.s, \{ k: "page", d: 1 \}\); \}\}>Next<\/button>/);
	assert.match(out, /<input placeholder="Filter names\.\.\." value="" onInput=\{\(event\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, tt0\.s, \{ k: "filter", c: "name", v: \(event\.target as HTMLInputElement\)\.value \}\); \}\} \/>/);
	assert.match(plan.sharedModule('../../lib/parts')!, /export const ttShared0 = shared\(\(\) => \{\n\tconst table = state<\{ s: TableState \}>\(\{ s: \{"rowSelection":\{\},"columnFilters":\[\],"columnVisibility":\{\},"pagination":\{"pageIndex":0,"pageSize":10\}\} \}\);/);
	assert.match(plan.specsModule()!, /import \{ columnFilteringFeature, columnVisibilityFeature, createFilteredRowModel, createPaginatedRowModel, filterFn_includesString, rowPaginationFeature, rowSelectionFeature \} from '@tanstack\/table-core';/);
	assert.match(plan.specsModule()!, /features: \{ columnFilteringFeature, columnVisibilityFeature, rowSelectionFeature, rowPaginationFeature, filteredRowModel: createFilteredRowModel\(\), paginatedRowModel: createPaginatedRowModel\(\), filterFns: \{ includesString: filterFn_includesString \} \}/);
});

// The same table drawn another way (Base UI's span checkbox with its hidden input, other classes, text and order): the
// plan reads only how the markup followed the table, never names or places.
function baseRegion(s: Shape): string {
	const box = (on: 'none' | 'some' | 'all' | boolean) => {
		const checked = on === true || on === 'all';
		const mixed = on === 'some';
		return `<span role="checkbox" tabindex="0" aria-checked="${mixed ? 'mixed' : String(checked)}"${checked ? ' data-checked=""' : mixed ? ' data-indeterminate=""' : ' data-unchecked=""'}>${checked || mixed ? `<span class="tick">${mixed ? '-' : 'v'}</span>` : ''}</span><input type="checkbox" aria-hidden="true" tabindex="-1"${checked ? ' checked=""' : ''}>`;
	};
	const rows = s.rows.length ? s.rows.map((r) => `<tr class="r"${r.sel ? ' data-selected="true"' : ''}>${s.hidden ? '' : `<td><b>${r.id.toUpperCase()}</b></td>`}<td>${box(r.sel)}</td></tr>`).join('') : '<tr><td colspan="2">Nothing here</td></tr>';
	return `<section><table><thead><tr>${s.hidden ? '' : '<th>Name</th>'}<th>${box(s.page)}</th></tr></thead><tbody>${rows}</tbody></table><p><span>${s.count.replace(/(\d+) of (\d+) row\(s\) selected\./, 'Picked $1 / $2')}</span></p><input placeholder="Search"></section>`;
}

test('an alternate-shaped table binds the same quantities: a span checkbox with its hidden input, another count, columns in another order', () => {
	const table = capture(baseRegion);
	const columns = [table.columns[1]!, table.columns[0]!, table.columns[2]!];
	const shaped: CapturedTable = { ...table, region: { sig: 'section||', nth: 0 }, columns: columns.filter((c) => c.id !== 'actions'), controls: table.controls.filter((c) => c.kind !== 'page'), snapshots: table.snapshots.map((s) => ({ ...s, columns: { name: s.columns.name!, select: s.columns.select! } })) };
	const doc = parseDocument(`<body>${shaped.snapshots[0]!.html}</body>`);
	const root = body(doc);
	const els = [...walk(root)];
	const boxes = els.filter((el) => attr(el, 'role') === 'checkbox');
	const plan = new TablePlan();
	plan.expect('/u', [shaped]);
	const placed = plan.add('/u', (sig, nth) => (sig === 'row' ? boxes[nth + 1] : sig === 'all' ? boxes[0] : sig === 'input' ? find(root, (el) => el.tagName === 'input' && attr(el, 'placeholder') === 'Search') : sig === 'table||' ? find(root, (el) => el.tagName === 'table') : find(root, (el) => el.tagName === 'section')));
	assert.equal(placed, 1, plan.notes.join('\n'));
	plan.emitHtml = (html) => emitChildren(parseFragment(html) as unknown as Element);
	const bind = (el: Element) => plan.bind(el);
	plan.emitter = (el, declarations) => emitElement(el, { declarations, bind });
	const out = emitElement(root, { bind });
	assert.match(out, /@for \(const row of tt0v\.rows; key row\.id\) \{ <tr class="r" data-selected=\{row\.sel \? "true" : undefined\}><td hidden=\{!tt0v\.c\["name"\]\.v\}><b>\{row\.c0\}<\/b><\/td>/);
	assert.match(out, /<input type="checkbox" aria-hidden="true" tabindex="-1" checked=\{row\.sel \? true : false\} onClick=\{\(\) => \{ tt0\.s = ttAct\([^)]*\{ k: "row", r: row\.id \}\); \}\} onFocus=\{\(event\) => focusControl\(event\)\} \/>/);
	assert.match(out, /onKeyUp=\{\(event\) => \{ if \(event\.key === ' '\) \{ tt0\.s = ttAct/, "Space toggles Base UI's checkbox as it comes up");
	assert.match(out, /<span>\{"Picked "\}\{tt0t0\}\{" \/ "\}\{tt0t1\}<\/span>/);
	assert.match(out, /@empty \{ <tr><td colspan="2">Nothing here<\/td><\/tr> \}/);
	assert.ok(plan.focusesControls);
});

test('rows that differ in anything but values are no template', () => {
	assert.deepEqual(templateOf(['<td a="1">x</td>', '<td a="2">y</td>']), { markup: '<td a={\u00000\u0000}>{\u00001\u0000}</td>', values: [['1', 'x'], ['2', 'y']] });
	assert.equal(typeof templateOf(['<td onClick={() => go(1)}>x</td>', '<td onClick={() => go(2)}>x</td>']), 'string');
	assert.equal(typeof templateOf(['<td>x</td>', '<td><b>x</b></td>']), 'string');
});

test("the menu of a table's columns binds each item's check to its column and toggles it, on the state its page shares", () => {
	const table = capture(radixRegion);
	const item = (on: boolean) => `<div role="menu"><div role="menuitemcheckbox" aria-checked="${on}" data-state="${on ? 'checked' : 'unchecked'}"><span data-slot="indicator">${on ? '<span data-state="checked"><svg class="check"></svg></span>' : ''}</span>name</div></div>`;
	const withMenus: CapturedTable = { ...table, snapshots: table.snapshots.map((s) => (s.name === 'initial' || s.name === 'hidden' ? { ...s, menus: { 'columns#0': item(s.name === 'initial') } } : s)) };
	const plan = new TablePlan();
	plan.expect('/t', [withMenus]);
	plan.emitHtml = (html) => emitChildren(parseFragment(html) as unknown as Element);
	const kept = [body(parseDocument(`<body>${item(true)}</body>`)).childNodes[0] as Element];
	assert.equal(plan.layer('/other', { sig: 'columns', nth: 0 }, kept), undefined, "another page's menu with the same trigger is not this table's");
	const layer = plan.layer('/t', { sig: 'columns', nth: 0 }, kept)!;
	assert.deepEqual(layer.declare, ['const tt0 = ttShared0();', 'const tt0v = computed(() => ttView(' + /tts_[0-9a-f]{10}/.exec(plan.specsModule()!)![0] + ', tt0.s));']);
	const out = emitElement(kept[0]!, { bind: layer.bind });
	assert.match(out, /<div role="menuitemcheckbox" aria-checked=\{tt0v\.c\["name"\]\.v \? "true" : "false"\} data-state=\{tt0v\.c\["name"\]\.v \? "checked" : "unchecked"\} onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, tt0\.s, \{ k: "vis", c: "name" \}\); \}\}><span data-slot="indicator">@if \(tt0v\.c\["name"\]\.v\) \{ <><span data-state="checked"><svg class="check"><\/svg><\/span><\/> \}<\/span>name<\/div>/);
});

test('a row pressed anywhere (React Aria) holding a label around its checkbox counts only the input click the label forwards', () => {
	const region = (s: Shape) => radixRegion(s).replace(/<button type="button" role="checkbox"([^>]*)>(.*?)<\/button>/g, (_, attrs: string, inner: string) => `<label data-slot="checkbox"${attrs.replace(/ role="checkbox"/, '')}><input type="checkbox">${inner}</label>`);
	const table = capture(region);
	const shaped: CapturedTable = { ...table, controls: table.controls.map((c) => (c.kind === 'row' ? { ...c, sig: 'tr' } : c)) };
	const root = body(parseDocument(`<body>${shaped.snapshots[0]!.html}</body>`));
	const els = [...walk(root)];
	const rows = els.filter((el) => el.tagName === 'tr' && attr(el, 'data-slot') === 'table-row' && el.parentNode && (el.parentNode as Element).tagName === 'tbody');
	const plan = new TablePlan();
	plan.expect('/r', [shaped]);
	assert.equal(plan.add('/r', (sig, nth) => (sig === 'tr' ? rows[nth] : sig === 'div||' ? els.find((el) => el.tagName === 'div') : sig === 'table||' ? els.find((el) => el.tagName === 'table') : undefined)), 1, plan.notes.join('\n'));
	plan.emitHtml = (html) => emitChildren(parseFragment(html) as unknown as Element);
	const bind = (el: Element) => plan.bind(el);
	plan.emitter = (el, declarations) => emitElement(el, { declarations, bind });
	const out = emitElement(root, { bind });
	assert.match(out, /<tr data-slot="table-row" data-state=\{row\.sel \? "selected" : "false"\} onClick=\{\(event\) => \{ const at = event\.target as Element; if \(at\.closest\('label'\) && at\.tagName !== 'INPUT'\) return; tt0\.s = ttAct\([^)]*\{ k: "row", r: row\.id \}\); \}\}>/);
});

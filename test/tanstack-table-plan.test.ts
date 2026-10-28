import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { attr, body, find, parseDocument, walk, type Element } from '../src/convert/dom.ts';
import { ownFunction, recordPageSize, TablePlan, templateOf, type CapturedTable, type TableSnapshot } from '../src/convert/tanstack-table.ts';
import { emitChildren, emitElement, mergeBindings, type Binding } from '../src/convert/tsrx.ts';

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
	const names: Record<string, string> = { a: 'alpha', b: 'beta', c: 'gamma', d: 'delta' };
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

function convert(region: (s: Shape) => string, page: (html: string) => string = (html) => html, edit: (t: CapturedTable) => CapturedTable = (t) => t, other: (el: Element) => Binding | undefined = () => undefined) {
	const table = edit(capture(region));
	const doc = parseDocument(`<body>${page(table.snapshots[0]!.html)}</body>`);
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
	const bind = (el: Element) => mergeBindings(plan.bind(el), other(el));
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

// ttAct keeps the state it is handed in its table instance, so the page hands it a copy and assigns the result back.
test('every control hands ttAct a copy of the table state and assigns the state it returns', () => {
	for (const region of [radixRegion]) {
		const { out } = convert(region);
		const calls = out.match(/ttAct\([^;]*;/g) ?? [];
		assert.ok(calls.length > 0);
		for (const call of calls) assert.match(call, /^ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt\d+\.s\), /);
		assert.equal((out.match(/\btt\d+\.s = ttAct\(/g) ?? []).length, calls.length);
	}
});

test('a row checkbox and the select-all box show what the old page showed for each selection, and call the table on use', () => {
	const { out } = convert(radixRegion);
	assert.match(out, /aria-checked=\{row\.sel \? "true" : "false"\}/);
	assert.match(out, /onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "row", r: row\.id \}\); \}\}/);
	assert.match(out, /onKeyDown=\{\(event\) => \{ if \(event\.key === 'Enter'\) event\.preventDefault\(\); \}\}/, "Enter does not toggle Radix's checkbox");
	// In a keyed row the indicator is hidden while unchecked: a row holding a branch could not be built when it comes back.
	assert.match(out, /aria-checked=\{row\.sel \? "true" : "false"\} data-state=\{row\.sel \? "checked" : "unchecked"\}/);
	assert.match(out, /<span data-slot="checkbox-indicator" data-state="checked" hidden=\{!row\.sel\}><svg class="check"><\/svg><\/span><\/button>/);
	assert.doesNotMatch(out.slice(out.indexOf('@for')), /@if/, 'nothing in a row is a branch');
	assert.match(out, /aria-checked=\{tt0v\.q\.pageSel === "none" \? "false" : tt0v\.q\.pageSel === "some" \? "mixed" : "true"\}/);
	assert.match(out, /@if \(tt0v\.q\.pageSel === "some"\) \{ <><span data-slot="checkbox-indicator" data-state="indeterminate">/);
	assert.match(out, /tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "select", next: \{"none":"pageOn","some":"pageOn","all":"pageOff"\} \}\)/);
});

test('a hideable column takes its header out and hides its cells; the count and the page buttons read the view; the filter sets the column filter', () => {
	const { out, plan, declarations } = convert(radixRegion);
	assert.match(out, /@if \(tt0v\.c\["name"\]\.v\) \{ <th><button data-slot="button">Name<\/button><\/th> \}/, 'a hidden column takes its header out, as the old page did');
	assert.match(out, /<td hidden=\{!tt0v\.c\["name"\]\.v\}><div class="lowercase">/);
	// Text updates where it reads a name: each count is a computed() of its own.
	assert.match(out, /<div class="count">\{tt0t0\}\{" of "\}\{tt0t1\}\{" row\(s\) selected\."\}<\/div>/);
	assert.ok(declarations.includes('const tt0t0 = computed(() => tt0v.q.filteredSelected);') && declarations.includes('const tt0t1 = computed(() => tt0v.q.filtered);'), declarations.join('\n'));
	assert.match(out, /<button data-slot="button" disabled=\{tt0v\.q\.canNext \? false : true\} onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "page", d: 1 \}\); \}\}>Next<\/button>/);
	assert.match(out, /<input placeholder="Filter names\.\.\." value=\{tt0v\.c\["name"\]\.f\} onInput=\{\(event\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "filter", c: "name", v: \(event\.target as HTMLInputElement\)\.value \}\); \}\} \/>/);
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
	assert.match(out, /<input type="checkbox" aria-hidden="true" tabindex="-1" checked=\{row\.sel \? true : false\} onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "row", r: row\.id \}\); \}\} onFocus=\{\(event\) => focusControl\(event\)\} \/>/);
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
	assert.match(out, /<div role="menuitemcheckbox" aria-checked=\{tt0v\.c\["name"\]\.v \? "true" : "false"\} data-state=\{tt0v\.c\["name"\]\.v \? "checked" : "unchecked"\} onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "vis", c: "name" \}\); \}\}><span data-slot="indicator">@if \(tt0v\.c\["name"\]\.v\) \{ <><span data-state="checked"><svg class="check"><\/svg><\/span><\/> \}<\/span>name<\/div>/);
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
	assert.match(out, /<tr data-slot="table-row" data-state=\{row\.sel \? "selected" : "false"\} onClick=\{\(event\) => \{ const at = event\.target as Element; if \(at\.closest\('label'\) && at\.tagName !== 'INPUT'\) return; tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "row", r: row\.id \}\); \}\}>/);
});

test('a table whose rows are no one template renders as the old page showed it, every part of it, and compiles', async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	// One row carries an attribute the others lack: the rows differ in more than values.
	const { plan, out, declarations } = convert((s) => radixRegion(s).replace('<tr data-slot="table-row" data-state="false"><td><button type="button" role="checkbox" aria-checked="false" data-state="unchecked" data-slot="checkbox"></button></td><td><div class="lowercase">beta', '<tr data-slot="table-row" data-state="false" data-odd=""><td><button type="button" role="checkbox" aria-checked="false" data-state="unchecked" data-slot="checkbox"></button></td><td><div class="lowercase">beta'));
	assert.match(plan.notes.join('\n'), /its rows are not one template/);
	assert.doesNotMatch(out, /\brow\.|tt0/, 'nothing in the table reads a row or the table state');
	assert.deepEqual(declarations, []);
	assert.match(out, /<tbody><tr data-slot="table-row" data-state="false">/);
	const source = `export default function Page() @{\n\t${out}\n}\n`;
	const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), []);
});

test('rows holding differently shaped content are one template, an arm per shape on the row\'s own key, and compile', async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	// Beta draws its name inside a <b> (dashboard-01's status icon, one per status).
	const { plan, placed, out, declarations } = convert((s) => radixRegion(s).replace('<div class="lowercase">beta</div>', '<div class="lowercase"><b>beta</b></div>'));
	assert.equal(placed, 1, plan.notes.join('\n'));
	assert.doesNotMatch(plan.notes.join('\n'), /not one template/);
	const arms = /<div class="lowercase">@if \(row\.c(\d+) === "0"\) \{ <>\{row\.c(\d+)\}<\/> \}@if \(row\.c\1 === "1"\) \{ <><b>beta<\/b><\/> \}<\/div>/.exec(out);
	assert.ok(arms, out);
	const values = (plan as unknown as { placed: { values: Record<string, string[]> }[] }).placed[0]!.values;
	assert.deepEqual(['a', 'b', 'c'].map((id) => values[id]![Number(arms[1])]), ['0', '1', '0'], 'alpha and gamma hold text, beta a <b>');
	assert.deepEqual(['a', 'c'].map((id) => values[id]![Number(arms[2])]), ['alpha', 'gamma'], 'each row fills its own arm');
	const source = `import { computed } from '@markless/core';\nimport { ttView, ttAct } from './tt.ts';\nimport { tts_x, ttc_x } from './specs.ts';\nimport { ttShared0 } from './shared.ts';\nexport default function Page() @{\n\t${declarations.join('\n\t')}\n\t${out}\n}\n`;
	const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), []);
});

test('a row only the every-row state shows has its own values, read on a page row of its shape', () => {
	// Delta is on no page the old page loaded: the every-row state shows it, its name inside a <b> as beta's.
	const region = (s: Shape) => radixRegion(s).replace('<div class="lowercase">beta</div>', '<div class="lowercase"><b>beta</b></div>').replace('<div class="lowercase">delta</div>', '<div class="lowercase"><b>delta</b></div>');
	const all: Shape = { rows: ['a', 'b', 'c', 'd'].map((id) => ({ id, sel: false })), page: 'none', count: '0 of 4 row(s) selected.', canNext: false };
	const { plan, placed } = convert(region, undefined, (t) => ({ ...t, rowIds: [...t.rowIds, 'd'], data: [...t.data, { name: 'd' }], snapshots: [...t.snapshots, { ...t.snapshots[0]!, name: 'rows:all', html: region(all), rows: all.rows.map((r) => ({ id: r.id, sel: false })) }] }));
	assert.equal(placed, 1, plan.notes.join('\n'));
	const values = (plan as unknown as { placed: { values: Record<string, string[]> }[] }).placed[0]!.values;
	assert.deepEqual(values.d, values.b!.map((v) => (v === 'beta' ? 'delta' : v === 'menu-b' ? 'menu-d' : v)), JSON.stringify(values));
});

test('a control each row keeps its own state for (a reviewer select) keeps it by row id, and compiles', async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	// The page's select plan gives every select a state() of its own, as it does a select outside a table.
	const region = (s: Shape) => radixRegion(s).replace(/<div class="lowercase">(\w+)<\/div>/g, (_, n: string) => `<div class="lowercase"><span data-slot="select-value">${n === 'beta' ? 'Assign' : n}</span></div>`);
	const names = new Map<Element, string>();
	const other = (el: Element): Binding | undefined => {
		if (attr(el, 'data-slot') !== 'select-value') return undefined;
		const name = names.get(el) ?? names.set(el, `sel${names.size}`).get(el)!;
		const text = (el.childNodes[0] as unknown as { value: string }).value;
		return { declare: [`let ${name} = state(${JSON.stringify(text)});`], extra: [`onMmchoose={(event) => (${name} = (event as CustomEvent<string>).detail)}`], children: `{${name}}` };
	};
	const { plan, placed, out, declarations } = convert(region, undefined, undefined, other);
	assert.equal(placed, 1, plan.notes.join('\n'));
	const m = /<span data-slot="select-value" onMmchoose=\{\(event\) => \(tt0\.s = ttAct\(tts_\w+, structuredClone\(tt0\.s\), \{ k: "cell", r: row\.id, c: (\d+), v: \(event as CustomEvent<string>\)\.detail \}\)\)\}>\{row\.c(\d+)\}<\/span>/.exec(out);
	assert.ok(m && m[1] === m[2], out);
	const values = (plan as unknown as { placed: { values: Record<string, string[]> }[] }).placed[0]!.values;
	assert.deepEqual(['a', 'b', 'c'].map((id) => values[id]![Number(m[1])]), ['alpha', 'Assign', 'gamma'], 'each row starts with what its own select showed');
	assert.ok(!declarations.some((d) => /\bsel\d/.test(d)), 'no row keeps a state of its own');
	const source = `import { computed, state } from '@markless/core';\nimport { ttView, ttAct } from './tt.ts';\nimport { tts_x, ttc_x } from './specs.ts';\nimport { ttShared0 } from './shared.ts';\nexport default function Page() @{\n\t${declarations.join('\n\t')}\n\t${out}\n}\n`;
	const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), []);
});

test('a web font that only some rows draw waits on the table body, so the rows stay one template', () => {
	// The capture marks the blocks a late font draws: here only beta's name (an Arabic status in the RTL data table).
	const { placed, out, plan } = convert(radixRegion, (html) => html.replace('<div class="lowercase">beta</div>', '<div class="lowercase" data-mm-late-font="">beta</div>'));
	assert.equal(placed, 1, plan.notes.join('\n'));
	assert.deepEqual(plan.notes, []);
	assert.match(out, /<tbody data-mm-late-font="">@for \(const row of tt0v\.rows; key row\.id\) \{ /);
	assert.match(out, /<div class="lowercase">\{row\.c0\}<\/div>/);
});

test('pages are recorded at the page size the table loaded with when its rows fill three of them, so a page-size select shows its value', () => {
	assert.equal(recordPageSize(68, 10), 10);
	assert.equal(recordPageSize(100, 10), 10);
	// Too few rows for a first, a middle and a last page at the table's own size: a third of the rows.
	assert.equal(recordPageSize(5, 10), 1);
	assert.equal(recordPageSize(25, 10), 8);
	assert.equal(recordPageSize(30, 10), 10);
	assert.equal(recordPageSize(9, undefined), 3);
});

test('a column\'s own filter or sort function is the old page\'s code when it reads only its arguments and the language\'s globals', () => {
	assert.deepEqual(ownFunction('(row, id, value) => value.includes(row.getValue(id))'), { code: '(row, id, value) => value.includes(row.getValue(id))' });
	assert.deepEqual(ownFunction('(e,t,r)=>r.includes(e.getValue(t))'), { code: '(e,t,r)=>r.includes(e.getValue(t))' });
	assert.ok('code' in ownFunction('function(e, t, r) { const v = e.getValue(t); return Array.isArray(r) ? r.includes(v) : String(v) === r; }'));
	// A method's own source (filterFn(row, id, value) { ... }) is a function expression once named as one.
	assert.deepEqual(ownFunction('filterFn(row, id, value) { return value.includes(row.getValue(id)); }'), { code: 'function filterFn(row, id, value) { return value.includes(row.getValue(id)); }' });
	assert.match((ownFunction('(row, id, value) => labels.some((l) => l.value === row.getValue(id))') as { why: string }).why, /reads labels/);
});

test('a column the old page gave its own filter function runs that code in the port; one reading the old app\'s values leaves the table unported', () => {
	const withFn = (source: string) => (t: CapturedTable): CapturedTable => ({ ...t, columns: t.columns.map((c) => (c.id === 'name' ? { ...c, def: { ...c.def, filterFn: { $fn: source } } } : c)) });
	const own = convert(radixRegion, undefined, withFn('(e,t,r)=>r.includes(e.getValue(t))'));
	assert.equal(own.placed, 1, own.plan.notes.join('\n'));
	assert.match(own.plan.specsModule()!, /"filterFn":\(e,t,r\)=>r\.includes\(e\.getValue\(t\)\)/);
	const foreign = convert(radixRegion, undefined, withFn('(e,t,r)=>labels.includes(e.getValue(t))'));
	assert.equal(foreign.placed, 0);
	assert.match(foreign.plan.notes.join('\n'), /column "name"'s filterFn reads labels/);
});

test("a column header's menu items sort its column one way whatever its direction was, on the state its page shares", () => {
	const table = capture(radixRegion);
	const menu = `<div role="menu"><div role="menuitem">Asc</div><div role="menuitem">Desc</div></div>`;
	const header = { sig: 'button|button|Name', nth: 0 };
	const sorted: CapturedTable = {
		...table,
		controls: [...table.controls, { sig: 'item|Asc', nth: 0, kind: 'sort', column: 'name', next: { '': 'asc', asc: 'asc', desc: 'asc' }, menu: header }, { sig: 'item|Desc', nth: 1, kind: 'sort', column: 'name', next: { '': 'desc', asc: 'desc', desc: 'desc' }, menu: header }],
	};
	const plan = new TablePlan();
	plan.expect('/t', [sorted]);
	plan.emitHtml = (html) => emitChildren(parseFragment(html) as unknown as Element);
	const kept = [body(parseDocument(`<body>${menu}</body>`)).childNodes[0] as Element];
	const layer = plan.layer('/t', header, kept)!;
	const out = emitElement(kept[0]!, { bind: layer.bind });
	assert.match(out, /<div role="menuitem" onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "sort", c: "name", next: \{"":"asc","asc":"asc","desc":"asc"\} \}\); \}\}>Asc<\/div><div role="menuitem" onClick=\{[^}]*next: \{"":"desc","asc":"desc","desc":"desc"\} \}\); \}\}>Desc<\/div>/);
});

test("a toolbar's Reset, shown only while a column is filtered, is an arm in its place that clears every filter; the other children keep their own bindings", () => {
	const withReset = (t: CapturedTable): CapturedTable => ({
		...t,
		controls: [...t.controls, { sig: 'button|button|Reset', nth: 0, kind: 'clear' }],
		snapshots: t.snapshots.map((s) => {
			const filtering = s.name === 'filtered' || s.name === 'empty';
			return { ...s, q: { ...s.q, filtering }, html: filtering ? s.html.replace('<table>', '<button data-slot="button">Reset</button><table>') : s.html };
		}),
	});
	const { out, plan } = convert(radixRegion, undefined, withReset);
	assert.doesNotMatch(plan.notes.join('\n'), /follows no quantity/, plan.notes.join('\n'));
	assert.match(out, /value=\{tt0v\.c\["name"\]\.f\}[^]*?\/>@if \(tt0v\.q\.filtering\) \{ <><button data-slot="button" onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "clear" \}\); \}\}>Reset<\/button><\/> \}<table>/);
});

test('a page-size select sets the page size from the choice its select part reports, by the text the choice shows', () => {
	const region = (s: Shape) => radixRegion(s).replace('<div class="count">', '<div class="size"><button type="button" role="combobox" data-slot="select-trigger">10</button></div><div class="count">');
	const withSize = (t: CapturedTable): CapturedTable => ({ ...t, controls: [...t.controls, { sig: 'select', nth: 0, kind: 'pageSize', sizes: { '10': 10, '20': 20 } }] });
	const doc = (html: string) => html;
	const table = withSize(capture(region));
	const root = body(parseDocument(`<body>${doc(table.snapshots[0]!.html)}</body>`));
	const els = [...walk(root)];
	const located: Record<string, Element | undefined> = { 'div||': els.find((el) => el.tagName === 'div'), 'table||': els.find((el) => el.tagName === 'table'), select: els.find((el) => attr(el, 'role') === 'combobox') };
	const plan = new TablePlan();
	plan.expect('/t', [table]);
	assert.equal(plan.add('/t', (sig) => located[sig]), 1, plan.notes.join('\n'));
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	assert.match(out, /<div class="size" onMmchoose=\{\(event\) => \{ const n = \(\{"10":10,"20":20\} as Record<string, number>\)\[\(event as CustomEvent<string>\)\.detail\]; if \(n !== undefined\) \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "pageSize", n \}\); \} \}\}><button type="button" role="combobox"/);
});

test("a faceted filter: its trigger shows the chosen values' labels or their count, and its popover's options toggle and check them, with Clear filters once one is chosen", () => {
	const values = ['alpha', 'beta', 'gamma'];
	const labels: Record<string, string> = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma' };
	const badges = (chosen: readonly string[]) => (chosen.length ? `<div data-slot="separator"></div><span data-slot="badge">${chosen.length}</span><div class="list">${chosen.length > 2 ? `<span data-slot="badge">${chosen.length} selected</span>` : chosen.map((v) => `<span data-slot="badge">${labels[v]}</span>`).join('')}</div>` : '');
	const trigger = (chosen: readonly string[]) => `<button type="button" aria-haspopup="dialog" data-slot="popover-trigger">Name${badges(chosen)}</button>`;
	const popover = (chosen: readonly string[]) => `<div role="dialog" data-slot="popover-content"><div cmdk-root=""><div cmdk-list=""><div cmdk-group="">${values.map((v) => `<div cmdk-item="" role="option"><div class="${chosen.includes(v) ? 'box on' : 'box off'}"></div><span>${labels[v]}</span><span class="count">1</span></div>`).join('')}</div>${chosen.length ? '<div cmdk-separator=""></div><div cmdk-group=""><div cmdk-item="" role="option">Clear filters</div></div>' : ''}</div></div></div>`;
	const key = 'trig#0';
	const facets = { alpha: 1, beta: 1, gamma: 1 };
	const withFacets = (t: CapturedTable): CapturedTable => {
		const states: [string, string[]][] = [...values.map((v, k) => [`facet:${key}:${k}`, [v]] as [string, string[]]), [`facet:${key}:two`, values.slice(0, 2)], [`facet:${key}:three`, values.slice(0, 3)]];
		const initial = t.snapshots.find((s) => s.name === 'initial')!;
		return {
			...t,
			controls: [...t.controls, ...values.map((v, k) => ({ sig: `option|${labels[v]}1`, nth: k, kind: 'facet' as const, column: 'name', value: v, menu: { sig: 'trig', nth: 0 } })), { sig: 'option|Clear filters', nth: 3, kind: 'facetClear', column: 'name', menu: { sig: 'trig', nth: 0 } }],
			snapshots: [
				...t.snapshots.map((s) => ({ ...s, columns: { ...s.columns, name: { ...s.columns.name!, facets } }, html: s.html.replace('<table>', `${trigger([])}<table>`), ...(s.name === 'initial' ? { menus: { [key]: popover([]) } } : {}) })),
				...states.map(([name, chosen]) => ({ ...initial, name, columns: { ...initial.columns, name: { ...initial.columns.name!, chosen, facets } }, html: initial.html.replace('<table>', `${trigger(chosen)}<table>`), menus: { [key]: popover(chosen) } })),
			],
		};
	};
	const table = withFacets(capture(radixRegion));
	const root = body(parseDocument(`<body>${table.snapshots[0]!.html}</body>`));
	const els = [...walk(root)];
	const located: Record<string, Element | undefined> = { 'div||': els.find((el) => el.tagName === 'div'), 'table||': els.find((el) => el.tagName === 'table'), trig: els.find((el) => attr(el, 'aria-haspopup') === 'dialog') };
	const plan = new TablePlan();
	plan.expect('/t', [table]);
	plan.emitHtml = (html) => emitChildren(parseFragment(html) as unknown as Element);
	assert.equal(plan.add('/t', (sig) => located[sig]), 1, plan.notes.join('\n'));
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	assert.match(out, /<button type="button" aria-haspopup="dialog" data-slot="popover-trigger">Name<div data-slot="separator" hidden=\{tt0v\.c\["name"\]\.fs\.length === 0\}><\/div><span data-slot="badge" hidden=\{tt0v\.c\["name"\]\.fs\.length === 0\}>\{tt0v\.c\["name"\]\.fs\.length\}<\/span>/);
	assert.match(out, /@for \(const l of tt0v\.c\["name"\]\.fs\.map\(\(x\) => \(\{"alpha":"Alpha","beta":"Beta","gamma":"Gamma"\} as Record<string, string>\)\[String\(x\)\] \?\? ""\); key l\) \{ <span data-slot="badge" hidden=\{tt0v\.c\["name"\]\.fs\.length > 2\}>\{l\}<\/span> \}/);
	assert.doesNotMatch(plan.notes.join('\n'), /faceted filter/);
	const kept = [body(parseDocument(`<body>${popover([])}</body>`)).childNodes[0] as Element];
	const layer = plan.layer('/t', { sig: 'trig', nth: 0 }, kept)!;
	const pop = emitElement(kept[0]!, { bind: layer.bind });
	assert.match(pop, /<div cmdk-item="" role="option" onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "facet", c: "name", v: "beta" \}\); \}\}><div class=\{tt0v\.c\["name"\]\.fs\.includes\("beta"\) \? "box on" : "box off"\}><\/div><span>Beta<\/span><span class="count">\{tt0v\.c\["name"\]\.u\["beta"\] \?\? 0\}<\/span><\/div>/);
	assert.match(pop, /@if \(tt0v\.c\["name"\]\.fs\.length > 0\) \{ <><div cmdk-separator=""><\/div>\n?<div cmdk-group=""><div cmdk-item="" role="option" onClick=\{\(\) => \{ tt0\.s = ttAct\(tts_[0-9a-f]{10}, structuredClone\(tt0\.s\), \{ k: "facetClear", c: "name" \}\); \}\}>Clear filters<\/div><\/div><\/> \}<\/div>/);
});

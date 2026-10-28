import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { parseFragment } from 'parse5';
import { parseSync } from 'oxc-parser';
import { patternNames, walk as walkJs, type N } from '../source/js.ts';
import { attr, childrenOf, elementChildren, inner as innerOf, isElement, isText, outer, removeAttr, setAttr, textContent, walk, type Element as Tree } from './dom.ts';
import { LATE_FONT } from '../../parts/late-fonts.ts';
import { emitChildren, lit, mergeBindings, type Binding } from './tsrx.ts';
import { chosenTemplate } from './chosen-template.ts';

// What a page's TanStack Table (v9, @tanstack/react-table's useTable) was given and how it showed each state, read from
// the old page's React tree and by using the table there. The port runs @tanstack/table-core on that data over Markless
// state (parts/tanstack-table.ts); the markup each state showed decides what the state binds (TablePlan).

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A control of the table, by its signature and occurrence on the page as loaded, and what using it did to the table's state. */
export interface TableControl {
	readonly sig: string;
	readonly nth: number;
	/**
	 * `sort`: sets the column's sorting from its current direction (`next`, keyed by '', 'asc' or 'desc'); `filter`: an
	 * input whose value is the column's filter; `row`: toggles a row's selection; `select`: selects or clears the page's
	 * rows or every row, from whether none, some or all of the page's are (`next`, keyed by 'none', 'some' or 'all');
	 * `visibility`: toggles the column's visibility (a menu item, `menu` naming its trigger); `clear`: clears every column's
	 * filter (a toolbar's Reset, shown only while one is filtered); `facet`: an option of a faceted filter's popover that
	 * toggles `value` in its column's filter list, `facetClear` the popover's Clear filters; `pageSize`: a select whose
	 * options set the page size (`sizes`); `page`: moves `delta` pages,
	 * or goes `to` an end.
	 */
	readonly kind: 'sort' | 'filter' | 'row' | 'select' | 'visibility' | 'page' | 'clear' | 'facet' | 'facetClear' | 'pageSize';
	/** A page-size select's sizes, by the text its trigger shows once each is chosen. */
	readonly sizes?: Readonly<Record<string, number>>;
	/** A faceted filter option's value, which it toggles in its column's filter list. */
	readonly value?: Json;
	readonly column?: string;
	readonly row?: string;
	readonly next?: Readonly<Record<string, string>>;
	readonly delta?: number;
	/** `page`: goes to the first or the last page, from any page. */
	readonly to?: 'first' | 'last';
	readonly menu?: { readonly sig: string; readonly nth: number };
}

/** The table and its region in one state: every quantity a binding may follow, and the region's markup. */
export interface TableSnapshot {
	readonly name: string;
	readonly q: Readonly<Record<string, string | number | boolean>>;
	readonly columns: Readonly<Record<string, { readonly sorted: string; readonly visible: boolean; readonly chosen?: readonly Json[]; readonly facets?: Readonly<Record<string, number>> }>>;
	/** The page's rows in order, with whether each is selected. */
	readonly rows: readonly { readonly id: string; readonly sel: boolean }[];
	/** The region's markup (the component's root element), attributes sorted and transient ones left out. */
	readonly html: string;
	/** Each visibility menu's content as it opened in this state, by its trigger's `sig#nth`. */
	readonly menus?: Readonly<Record<string, string>>;
}

export interface CapturedTable {
	readonly sig: string;
	readonly nth: number;
	/** The root element of the component that called useTable. */
	readonly region: { readonly sig: string; readonly nth: number };
	/** Each row's value per accessor column, as row.getValue gave it, and the row's id. */
	readonly data: readonly Readonly<Record<string, Json>>[];
	readonly rowIds: readonly string[];
	readonly columns: readonly { readonly id: string; readonly accessor: boolean; readonly def: Readonly<Record<string, Json>> }[];
	/** The registered features, row models and function registries, by the name table-core exports them under. */
	readonly features: readonly string[];
	readonly rowModels: readonly string[];
	readonly sortFns: readonly string[];
	readonly filterFns: readonly string[];
	readonly options: Readonly<Record<string, Json>>;
	readonly state: Readonly<Record<string, Json>>;
	readonly controls: readonly TableControl[];
	readonly snapshots: readonly TableSnapshot[];
}

export interface TableCapture {
	readonly route: string;
	readonly tables: readonly CapturedTable[];
	readonly skipped: readonly string[];
}

const VERSION = 'tables-17';
const fileFor = (dir: string, route: string) => join(dir, `${createHash('sha256').update(`${VERSION}|${route}`).digest('hex').slice(0, 16)}.json`);

/** Whether a settled page may hold a TanStack table: one with a table element. */
const ALL_ROWS = 'rows:all';

export const mayHoldTable = (html: string): boolean => /<table[\s>]/.test(html);

// --- In the page -----------------------------------------------------------------------------------------------------

interface Found {
	readonly sig: string;
	readonly nth: number;
	readonly region?: { readonly sig: string; readonly nth: number };
	readonly why?: string;
	readonly spec?: Omit<CapturedTable, 'sig' | 'nth' | 'region' | 'controls' | 'snapshots'>;
}

/** Finds every table element a TanStack v9 table instance renders, and reads what the instance was given. */
function findTables(): Found[] {
	type Fiber = { return?: Fiber; child?: Fiber; sibling?: Fiber; memoizedState?: unknown; stateNode?: unknown };
	type Tbl = Record<string, any>;
	const w = window as unknown as { __mmTT: { table: Tbl; root: Element; el: Element; initial: Record<string, unknown> }[] };
	w.__mmTT = [];
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const order = new Map<Element, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	const isTable = (x: unknown): x is Tbl => Boolean(x) && typeof x === 'object' && typeof (x as Tbl).getRowModel === 'function' && typeof (x as Tbl)._rowModelFns === 'object' && typeof (x as Tbl).baseAtoms === 'object';
	const fiberOf = (el: Element) => {
		const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
		return key ? ((el as unknown as Record<string, Fiber>)[key] as Fiber) : undefined;
	};
	const json = (v: unknown, depth = 0): unknown => {
		if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
		if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
		if (depth > 6) return undefined;
		if (Array.isArray(v)) {
			const out = v.map((x) => json(x, depth + 1));
			return out.some((x) => x === undefined) ? undefined : out;
		}
		if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
			const out: Record<string, unknown> = {};
			for (const [k, x] of Object.entries(v as object)) {
				const j = json(x, depth + 1);
				if (j === undefined) return undefined;
				out[k] = j;
			}
			return out;
		}
		return undefined;
	};
	const out: Found[] = [];
	for (const el of document.querySelectorAll('table')) {
		if (el.closest('template')) continue;
		let table: Tbl | undefined;
		let owner: Fiber | undefined;
		for (let f = fiberOf(el); f && !table; f = f.return) {
			for (let h = f.memoizedState as { memoizedState?: unknown; next?: unknown } | undefined, i = 0; h && typeof h === 'object' && 'next' in h && i < 200; h = h.next as typeof h, i++) {
				const v = h.memoizedState as { current?: unknown } | unknown[] | undefined;
				const candidates = [v, (v as { current?: unknown } | undefined)?.current, Array.isArray(v) ? v[0] : undefined];
				table = candidates.find(isTable);
				if (table) break;
			}
			if (table) owner = f;
		}
		const base = { sig: sigOf(el), nth: order.get(el) ?? 0 };
		if (!table || !owner) continue;
		const roots: Element[] = [];
		const visit = (f: Fiber) => {
			for (let c = f.child; c; c = c.sibling) {
				if (c.stateNode instanceof Element) roots.push(c.stateNode);
				else visit(c);
			}
		};
		visit(owner);
		if (roots.length !== 1) {
			out.push({ ...base, why: `the component renders ${roots.length} root elements` });
			continue;
		}
		const root = roots[0]!;
		const region = { sig: sigOf(root), nth: order.get(root) ?? 0 };
		const t = table;
		const features = t.options.features as Record<string, unknown>;
		const leaf = (t.getAllLeafColumns() as Tbl[]);
		if (leaf.length !== (t.getAllFlatColumns() as Tbl[]).length) {
			out.push({ ...base, region, why: 'grouped columns' });
			continue;
		}
		const rows = (t.getCoreRowModel().rows as Tbl[]);
		if (rows.some((r) => (r.subRows as unknown[] | undefined)?.length)) {
			out.push({ ...base, region, why: 'rows with sub-rows' });
			continue;
		}
		const columns: { id: string; accessor: boolean; def: Record<string, unknown> }[] = [];
		let why: string | undefined;
		for (const c of leaf) {
			const def: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(c.columnDef as object)) {
				if (['header', 'cell', 'footer', 'meta', 'accessorFn', 'accessorKey', 'columns', 'id', 'aggregatedCell'].includes(k)) continue;
				// A column's own filter or sort function is kept as its source: the plan runs it when it reads only its arguments.
				if (typeof v === 'function' && (k === 'filterFn' || k === 'sortingFn')) {
					def[k] = { $fn: String(v) };
					continue;
				}
				if (typeof v === 'function') {
					why = `column "${c.id}" has a ${k} function`;
					break;
				}
				const j = json(v);
				if (j !== undefined) def[k] = j;
			}
			if (why) break;
			columns.push({ id: c.id as string, accessor: typeof c.accessorFn === 'function', def });
		}
		if (why) {
			out.push({ ...base, region, why });
			continue;
		}
		const data: Record<string, unknown>[] = [];
		for (const r of rows) {
			const values: Record<string, unknown> = {};
			for (const c of columns) {
				if (!c.accessor) continue;
				const j = json(r.getValue(c.id));
				if (j === undefined && r.getValue(c.id) !== undefined) why = `row "${r.id}" has a value of column "${c.id}" that is not data`;
				if (j !== undefined) values[c.id] = j;
			}
			data.push(values);
		}
		if (why) {
			out.push({ ...base, region, why });
			continue;
		}
		const options: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(t.options as object)) {
			if (['features', 'data', 'columns', 'state', 'initialState', 'atoms', 'debugAll', 'debugTable', 'debugColumns', 'debugRows', 'debugHeaders', 'debugCells'].includes(k) || /^on[A-Z].*Change$/.test(k)) continue;
			if (typeof v === 'function') {
				if (k === 'getRowId' || k === 'getSubRows') continue;
				why = `the table's ${k} is a function`;
				break;
			}
			const j = json(v);
			if (j !== undefined) options[k] = j;
		}
		if (why) {
			out.push({ ...base, region, why });
			continue;
		}
		const fns = t._rowModelFns as { sortFns?: object; filterFns?: object };
		const state = json(t.store.state) as Record<string, unknown> | undefined;
		if (!state) {
			out.push({ ...base, region, why: 'its state is not data' });
			continue;
		}
		w.__mmTT.push({ table: t, root, el, initial: state });
		out.push({
			...base,
			region,
			spec: {
				data: data as never,
				rowIds: rows.map((r) => r.id as string),
				columns: columns as never,
				features: Object.keys(features).filter((k) => k.endsWith('Feature') && !k.startsWith('core')),
				rowModels: Object.keys(features).filter((k) => k.endsWith('RowModel') || k.startsWith('faceted')),
				sortFns: Object.keys(fns.sortFns ?? {}),
				filterFns: Object.keys(fns.filterFns ?? {}),
				options: options as never,
				state: state as never,
			},
		});
	}
	return out;
}

/** The table's quantities a binding may follow, its columns' and its page rows'. */
function readTable(i: number): Pick<TableSnapshot, 'q' | 'columns' | 'rows'> {
	type Tbl = Record<string, any>;
	const t = (window as unknown as { __mmTT: { table: Tbl }[] }).__mmTT[i]!.table;
	const r = <T>(f: () => T, or: T): T => {
		try {
			return f();
		} catch {
			return or;
		}
	};
	const s = t.store.state as { pagination?: { pageIndex: number; pageSize: number } };
	const page = r(() => t.getIsAllPageRowsSelected() as boolean, false) ? 'all' : r(() => t.getIsSomePageRowsSelected() as boolean, false) ? 'some' : 'none';
	const all = r(() => t.getIsAllRowsSelected() as boolean, false) ? 'all' : r(() => t.getIsSomeRowsSelected() as boolean, false) ? 'some' : 'none';
	const q = {
		filteredSelected: r(() => t.getFilteredSelectedRowModel().rows.length as number, 0),
		selected: r(() => t.getSelectedRowModel().rows.length as number, 0),
		filtered: r(() => t.getFilteredRowModel().rows.length as number, 0),
		rows: t.getCoreRowModel().rows.length as number,
		pageRows: t.getRowModel().rows.length as number,
		pageNumber: (s.pagination?.pageIndex ?? 0) + 1,
		pageCount: r(() => t.getPageCount() as number, 1),
		pageIndex: s.pagination?.pageIndex ?? 0,
		canPrev: r(() => t.getCanPreviousPage() as boolean, false),
		filtering: ((t.store.state as { columnFilters?: unknown[] }).columnFilters ?? []).length > 0,
		canNext: r(() => t.getCanNextPage() as boolean, false),
		pageSel: page,
		allSel: all,
	};
	const columns: Record<string, { sorted: string; visible: boolean; chosen?: Json[]; facets?: Record<string, number> }> = {};
	for (const c of t.getAllLeafColumns() as Tbl[]) {
		const filter = r(() => c.getFilterValue() as unknown, undefined);
		const facets = r(() => (typeof c.getFacetedUniqueValues === 'function' ? Object.fromEntries(c.getFacetedUniqueValues() as Map<string, number>) : undefined), undefined);
		columns[c.id as string] = { sorted: r(() => (c.getIsSorted() as string | false) || '', ''), visible: r(() => c.getIsVisible() as boolean, true), ...(Array.isArray(filter) ? { chosen: JSON.parse(JSON.stringify(filter)) } : {}), ...(facets ? { facets } : {}) };
	}
	return { q, columns, rows: (t.getRowModel().rows as Tbl[]).map((row) => ({ id: row.id as string, sel: r(() => row.getIsSelected() as boolean, false) })) };
}

/** Sets the table's state through its own setters (the old page's handlers then render it), `initial` for what it loaded with. */
function setTable([i, state]: readonly [number, Record<string, unknown> | 'initial']): void {
	type Tbl = Record<string, any>;
	const entry = (window as unknown as { __mmTT: { table: Tbl; initial: Record<string, unknown> }[] }).__mmTT[i]!;
	const next = state === 'initial' ? entry.initial : { ...entry.initial, ...state };
	for (const [key, value] of Object.entries(next)) {
		const set = entry.table[`set${key[0]!.toUpperCase()}${key.slice(1)}`];
		if (typeof set === 'function' && JSON.stringify(entry.table.store.state[key]) !== JSON.stringify(value)) set(value);
	}
}

const stateOf = (page: Page, i: number) => page.evaluate((i) => JSON.parse(JSON.stringify((window as unknown as { __mmTT: { table: { store: { state: unknown } } }[] }).__mmTT[i]!.table.store.state)) as Record<string, Json>, i);

/** The region's markup, canonical: attributes in name order, styles as the CSSOM writes them, focus and hover states left out. */
function regionMarkup(i: number): string {
	const root = (window as unknown as { __mmTT: { root: Element }[] }).__mmTT[i]!.root;
	return canonOf(root);
	function canonOf(el: Element): string {
		const transient = /^data-(hovered|pressed|focused|focus-visible|focus-visible-within|focus-within|highlighted)$/;
		const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const value = (n: Element, a: Attr) => (a.name === 'style' && n instanceof HTMLElement ? n.style.cssText : a.value);
		const canon = (n: Node): string => {
			if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
			if (!(n instanceof Element)) return '';
			const tag = n.tagName.toLowerCase();
			const attrs = [...n.attributes].filter((a) => !transient.test(a.name)).map((a) => [a.name, value(n, a)] as [string, string]);
			// A checkable input's checked state is its property, which React writes without the attribute.
			if (n instanceof HTMLInputElement && /^(checkbox|radio)$/.test(n.type)) {
				const at = attrs.findIndex(([name]) => name === 'checked');
				if (at >= 0) attrs.splice(at, 1);
				if (n.checked) attrs.push(['checked', '']);
			}
			const list = attrs.sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, v]) => ` ${name}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
			return /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
		};
		return canon(el);
	}
}

/** The controls in the region a visitor uses, by signature at load: text inputs, buttons, checkboxes and sortable headers. */
function controlsOf(i: number): { sig: string; nth: number; text: boolean; disabled: boolean; menu: boolean; pop: boolean; listbox: boolean }[] {
	const w = window as unknown as { __mmTT: { root: Element }[]; __mmControls: Element[] };
	const root = w.__mmTT[i]!.root;
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const order = new Map<Element, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	const found = [...root.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, button, [role="checkbox"], [role="button"], [role="columnheader"], label[data-rac]:has(input[type="checkbox"]), tbody > tr[role="row"]')].filter((el) => !el.matches('[role="checkbox"] *, [role="button"] *, button *, label[data-rac] input'));
	w.__mmControls = found;
	return found.map((el) => ({ sig: sigOf(el), nth: order.get(el) ?? 0, text: el.matches('input, textarea'), disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled'), menu: el.getAttribute('aria-haspopup') === 'menu' || el.getAttribute('aria-haspopup') === 'true', pop: el.getAttribute('aria-haspopup') === 'dialog', listbox: el.tagName === 'BUTTON' && el.getAttribute('role') === 'combobox' }));
}

/** The menu a trigger opened (its aria-controls, else the menu shown last), with its items' texts. */
function openedMenu(): { html: string; items: string[] } | undefined {
	const menus = [...document.querySelectorAll('[role="menu"]')].filter((m) => (m as HTMLElement).offsetParent !== null || getComputedStyle(m).position === 'fixed');
	const menu = menus.at(-1);
	if (!menu) return undefined;
	const w = window as unknown as { __mmMenu?: Element };
	w.__mmMenu = menu;
	const items = [...menu.querySelectorAll('[role^="menuitem"]')].map((x) => (x.textContent ?? '').trim());
	const transient = /^data-(hovered|pressed|focused|focus-visible|focus-visible-within|focus-within|highlighted)$|^(tabindex|style)$/;
	const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const canon = (n: Node): string => {
		if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
		if (!(n instanceof Element)) return '';
		const tag = n.tagName.toLowerCase();
		const list = [...n.attributes].filter((a) => !transient.test(a.name)).sort((a, b) => (a.name < b.name ? -1 : 1)).map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
		return /^(img|input|br|hr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
	};
	return { html: canon(menu), items };
}

// --- Driving the old page --------------------------------------------------------------------------------------------

const settle = async (page: Page) => {
	await page.waitForTimeout(120);
	await finishAnimations(page).catch(() => {});
};

async function set(page: Page, i: number, state: Record<string, unknown> | 'initial'): Promise<void> {
	await page.evaluate(setTable, [i, state] as const);
	await settle(page);
}

async function closeMenus(page: Page): Promise<void> {
	for (let k = 0; k < 3 && (await page.evaluate(() => Boolean(document.querySelector('[role="menu"], [role="dialog"][data-state="open"]')))); k++) {
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	}
}

const control = (page: Page, k: number) => page.evaluateHandle((k) => (window as unknown as { __mmControls: Element[] }).__mmControls[k]!, k);

/** Where a control is pressed: its middle, or for one holding other controls (a row around its checkbox) a point of its own. */
function ownPoint(k: number): { x: number; y: number } | null | undefined {
	const all = (window as unknown as { __mmControls: Element[] }).__mmControls;
	const el = all[k]!;
	const inner = all.filter((o) => o !== el && el.contains(o)).map((o) => o.getBoundingClientRect());
	if (!inner.length) return undefined;
	const r = el.getBoundingClientRect();
	const inside = (x: number, y: number) => inner.some((b) => x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2);
	for (const fx of [0.5, 0.75, 0.9, 0.25, 0.1])
		for (const fy of [0.5, 0.25, 0.75]) {
			const x = r.left + r.width * fx;
			const y = r.top + r.height * fy;
			const hit = document.elementFromPoint(x, y);
			if (!inside(x, y) && hit && el.contains(hit) && !all.some((o) => o !== el && el.contains(o) && o.contains(hit))) return { x: x - r.left, y: y - r.top };
		}
	return null;
}

async function click(page: Page, k: number): Promise<boolean> {
	const el = (await control(page, k)).asElement();
	if (!el) return false;
	// A point is found on screen only: a table further down the page is scrolled to first.
	await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
	const point = await page.evaluate(ownPoint, k);
	if (point === null) return false;
	return el.click({ timeout: 2000, ...(point ? { position: point } : {}) }).then(() => true, () => false);
}

function changed(before: Record<string, Json>, after: Record<string, Json>): string[] {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

const dirOf = (sorting: Json | undefined, column: string): string => {
	const entry = Array.isArray(sorting) ? (sorting as { id: string; desc: boolean }[]).find((s) => s.id === column) : undefined;
	return entry ? (entry.desc ? 'desc' : 'asc') : '';
};

const selectionOf = (state: Record<string, Json>) => Object.entries((state.rowSelection ?? {}) as Record<string, boolean>).filter(([, on]) => on).map(([id]) => id).sort();

// What a column's own function may read besides its arguments: the language's globals, never the old app's.
const GLOBALS = new Set(['Array', 'Boolean', 'Date', 'Infinity', 'JSON', 'Math', 'NaN', 'Number', 'Object', 'RegExp', 'String', 'isNaN', 'isFinite', 'parseFloat', 'parseInt', 'undefined']);

/** A column's own function (a filterFn) as code the port runs, when it reads nothing of the old page's: else why not. */
export function ownFunction(source: string): { readonly code: string } | { readonly why: string } {
	for (const code of [source, `function ${source}`]) {
		const parsed = parseSync('fn.js', `(${code})`, { sourceType: 'module', preserveParens: false });
		const expr = (parsed.program.body[0] as unknown as { expression?: N } | undefined)?.expression;
		if (parsed.errors.length || !expr || !/^(ArrowFunctionExpression|FunctionExpression)$/.test(expr.type)) continue;
		const declared = new Set<string>();
		walkJs(expr, (n) => {
			if (n.type === 'VariableDeclarator' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration') {
				for (const p of [n.id, ...(n.params ?? [])]) for (const name of patternNames(p)) declared.add(name);
			}
		});
		const free = new Set<string>();
		walkJs(expr, (n, ancestors) => {
			if (n.type !== 'Identifier') return;
			const parent = ancestors.at(-1);
			if (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
			if (parent?.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) return;
			if (!declared.has(n.name) && !GLOBALS.has(n.name)) free.add(n.name);
		});
		return free.size ? { why: `reads ${[...free].join(', ')}` } : { code };
	}
	return { why: 'is not a function expression' };
}

/** The columns as code: a column's own function is written as its source, every other value as JSON. */
function columnsCode(columns: CapturedTable['columns']): string {
	const code: string[] = [];
	const text = JSON.stringify(columns, (_, v: unknown) => {
		const source = v && typeof v === 'object' && !Array.isArray(v) ? (v as { $fn?: unknown }).$fn : undefined;
		if (typeof source !== 'string') return v;
		const own = ownFunction(source);
		code.push('code' in own ? own.code : 'undefined');
		return `\u0000fn${code.length - 1}\u0000`;
	});
	return text.replace(/"\\u0000fn(\d+)\\u0000"/g, (_, i: string) => code[Number(i)]!);
}

/** A table's faceted filters: each popover trigger, by `sig#nth`, with the column its options filter and its options in order. */
function facetsOf(table: CapturedTable): Map<string, { trigger: { sig: string; nth: number }; column: string; options: TableControl[] }> {
	const out = new Map<string, { trigger: { sig: string; nth: number }; column: string; options: TableControl[] }>();
	for (const c of table.controls.filter((x) => x.kind === 'facet' && x.menu)) {
		const key = `${c.menu!.sig}#${c.menu!.nth}`;
		(out.get(key) ?? out.set(key, { trigger: c.menu!, column: c.column!, options: [] }).get(key)!).options.push(c);
	}
	return out;
}

const meaningfulKids = (el: Tree): Tree[] => childrenOf(el).filter((n) => isElement(n) || (isText(n) && n.value.trim() !== '')) as Tree[];
// Alike whatever order their attributes were written in: a recorded state's markup has them sorted.
const sameNode = (a: Tree, b: Tree): boolean => {
	if (isText(a as never) || isText(b as never)) return isText(a as never) && isText(b as never) && (a as unknown as { value: string }).value === (b as unknown as { value: string }).value;
	if (!isElement(a) || !isElement(b) || a.tagName !== b.tagName) return false;
	const attrs = (x: Tree) => JSON.stringify(x.attrs.map((t) => [t.name, t.value]).sort());
	const ak = meaningfulKids(a);
	const bk = meaningfulKids(b);
	return attrs(a) === attrs(b) && ak.length === bk.length && ak.every((x, i) => sameNode(x, bk[i]!));
};

/**
 * Each value's label from what a control showed with each value chosen alone: the one text that differs between them.
 * Undefined unless every value was recorded alone and one text tells them apart.
 */
function chosenLabels(variants: readonly { values: readonly Json[]; extras: readonly Tree[] | undefined }[]): Record<string, string> | undefined {
	const singles = variants.filter((x) => x.values.length === 1 && x.extras);
	const textsOf = (nodes: readonly Tree[]) => {
		const out: string[] = [];
		const visit = (n: Tree) => (isText(n as never) ? out.push((n as unknown as { value: string }).value.trim()) : isElement(n) ? childrenOf(n).forEach((c) => visit(c as Tree)) : undefined);
		nodes.forEach(visit);
		return out;
	};
	const texts = singles.map((x) => textsOf(x.extras!));
	if (texts.length < 2 || texts.some((t) => t.length !== texts[0]!.length)) return undefined;
	const differ = texts[0]!.map((_, i) => i).filter((i) => new Set(texts.map((t) => t[i])).size > 1);
	if (differ.length !== 1) return undefined;
	return Object.fromEntries(singles.map((x, k) => [String(x.values[0]), texts[k]![differ[0]!]!]));
}

/** The page size pages are recorded at: the table's own when its rows fill a first, a middle and a last page of it, else a third of the rows. */
export const recordPageSize = (rows: number, pageSize: number | undefined): number => (pageSize && rows >= 3 * pageSize ? pageSize : Math.max(1, Math.floor(rows / 3)));
const pageSizeOf = (state: Readonly<Record<string, Json>>): number | undefined => ((state.pagination as { pageSize?: number } | undefined)?.pageSize);

/** Uses each control of the table once (a sorting control from every direction) and records what it did. */
/** The page as loaded again, its tables found again in the same order. */
async function reload(page: Page): Promise<void> {
	await page.reload({ waitUntil: 'load' }).catch(() => {});
	await page.waitForTimeout(300);
	await page.evaluate(findTables);
}

async function probe(page: Page, i: number, spec: NonNullable<Found['spec']>, log: (line: string) => void): Promise<TableControl[]> {
	const out: TableControl[] = [];
	const initial = spec.state as Record<string, Json>;
	// Every page button is usable on a second page, and a page of two rows can have some of its rows selected.
	const size = Math.max(2, recordPageSize(spec.rowIds.length, pageSizeOf(spec.state)));
	const middle = spec.features.includes('rowPaginationFeature') && spec.rowIds.length > size ? { pagination: { pageIndex: 1, pageSize: size } } : undefined;
	const controls = await page.evaluate(controlsOf, i);
	// Select-all is used once the rows' own controls are known: a widget keeping its own selection is put in each state by them.
	const selects: { sig: string; nth: number }[] = [];
	// A widget keeping its own selection keeps it across the table's resets: each control is used from a fresh load.
	const owned = await ownsSelection(page, i, spec);
	for (let k = 0; k < controls.length; k++) {
		const c = controls[k]!;
		if (owned) await reload(page);
		await set(page, i, 'initial');
		await page.evaluate(controlsOf, i);
		if (c.text) {
			const el = (await control(page, k)).asElement();
			if (!el) continue;
			await el.fill('zq').catch(() => {});
			await settle(page);
			const after = await stateOf(page, i);
			const filters = (after.columnFilters ?? []) as { id: string; value: Json }[];
			const own = filters.find((f) => f.value === 'zq');
			if (own) out.push({ sig: c.sig, nth: c.nth, kind: 'filter', column: own.id });
			else if (changed(initial, after).length) log(`  table control ${c.sig}#${c.nth}: typing changed ${changed(initial, after).join(', ')}, which is not ported`);
			await el.fill('').catch(() => {});
			continue;
		}
		if (c.disabled && !middle) continue;
		// The second page shows other rows, whose controls come before this one: it is found again there.
		const found = async () => (c.disabled ? (await set(page, i, middle!), (await page.evaluate(controlsOf, i)).findIndex((x) => x.sig === c.sig && x.nth === c.nth)) : k);
		let at = await found();
		let before = await stateOf(page, i);
		if (at < 0 || !(await click(page, at))) {
			// What a use before left over the page (a menu's underlay that outlived Escape) goes with a fresh load.
			await reload(page);
			await page.evaluate(controlsOf, i);
			at = await found();
			before = await stateOf(page, i);
			if (at < 0 || !(await click(page, at))) {
				log(`  table control ${c.sig}#${c.nth}: could not be pressed`);
				continue;
			}
		}
		await settle(page);
		let after = await stateOf(page, i);
		if (c.menu) {
			await probeMenu(page, i, c, initial, out, log);
			continue;
		}
		if (c.pop) {
			await closeMenus(page);
			await probeFacets(page, i, c, initial, out, log);
			continue;
		}
		if (c.listbox) {
			await page.keyboard.press('Escape');
			await settle(page);
			await probeSizes(page, i, c, out);
			continue;
		}
		const keys = changed(before, after);
		if (keys.length === 1 && keys[0] === 'sorting') {
			const sorted = (after.sorting as { id: string }[]).map((s) => s.id);
			if (sorted.length !== 1) continue;
			const column = sorted[0]!;
			const next: Record<string, string> = { [dirOf(before.sorting, column)]: dirOf(after.sorting, column) };
			// The next direction from each direction it reaches, until one repeats.
			for (let n = 0; n < 3; n++) {
				const from = dirOf(after.sorting, column);
				if (from in next) break;
				await click(page, at);
				await settle(page);
				after = await stateOf(page, i);
				next[from] = dirOf(after.sorting, column);
			}
			out.push({ sig: c.sig, nth: c.nth, kind: 'sort', column, next });
		} else if (keys.length === 1 && keys[0] === 'rowSelection') {
			const was = selectionOf(before);
			const now = selectionOf(after);
			const toggled = [...now.filter((id) => !was.includes(id)), ...was.filter((id) => !now.includes(id))];
			const pageIds = (await page.evaluate(readTable, i)).rows.map((r) => r.id);
			if (toggled.length === 1 && pageIds.length > 1) out.push({ sig: c.sig, nth: c.nth, kind: 'row', row: toggled[0]! });
			else if (now.length === pageIds.length || now.length === spec.rowIds.length) selects.push(c);
		} else if (keys.length === 1 && keys[0] === 'pagination') {
			const index = (s: Record<string, Json>) => (s.pagination as { pageIndex: number }).pageIndex;
			const delta = index(after) - index(before);
			const count = Number((await page.evaluate(readTable, i)).q.pageCount);
			// Used again from another page: a control that goes to the first or last page goes there from anywhere.
			const third = middle && Math.ceil(spec.rowIds.length / middle.pagination.pageSize) > 2 ? { pagination: { pageIndex: 2, pageSize: middle.pagination.pageSize } } : undefined;
			const again = middle && index(before) !== middle.pagination.pageIndex ? middle : third;
			let to: 'first' | 'last' | undefined;
			if (delta && again) {
				await set(page, i, again);
				// Another page shows other rows, whose controls come before this one.
				const there = (await page.evaluate(controlsOf, i)).findIndex((x) => x.sig === c.sig && x.nth === c.nth);
				const from = await stateOf(page, i);
				const counted = Number((await page.evaluate(readTable, i)).q.pageCount);
				if (there >= 0 && (await click(page, there))) {
					await settle(page);
					const moved = index(await stateOf(page, i));
					if (moved - index(from) !== delta) to = index(after) === count - 1 && moved === counted - 1 ? 'last' : index(after) === 0 && moved === 0 ? 'first' : undefined;
					if (moved - index(from) !== delta && !to) {
						log(`  table control ${c.sig}#${c.nth}: moves the page by neither a step nor to an end, which is not ported`);
						continue;
					}
				}
			}
			if (to) out.push({ sig: c.sig, nth: c.nth, kind: 'page', to });
			else if (delta) out.push({ sig: c.sig, nth: c.nth, kind: 'page', delta });
		} else if (keys.length) log(`  table control ${c.sig}#${c.nth}: changed ${keys.join(', ')}, which is not ported`);
		await closeMenus(page);
	}
	// A control shown only while a column is filtered (a toolbar's Reset): used from a filtered table.
	const filter = out.find((c) => c.kind === 'filter');
	if (filter) {
		const filtered = { columnFilters: [{ id: filter.column!, value: String(spec.data.map((d) => d[filter.column!]).find((v) => typeof v === 'string' && v) ?? 'a').slice(0, 2) }] };
		await set(page, i, filtered);
		const shown = await page.evaluate(controlsOf, i);
		for (const [k, c] of shown.entries()) {
			if (controls.some((x) => x.sig === c.sig) || c.text) continue;
			await set(page, i, filtered);
			await page.evaluate(controlsOf, i);
			if (!(await click(page, k))) continue;
			await settle(page);
			if (((await stateOf(page, i)).columnFilters as unknown[] | undefined)?.length === 0) out.push({ sig: c.sig, nth: c.nth, kind: 'clear' });
			await closeMenus(page);
		}
		await set(page, i, 'initial');
	}
	for (const c of selects) out.push({ sig: c.sig, nth: c.nth, kind: 'select', next: owned ? await selectAllByUse(page, i, c, spec, out) : await selectAll(page, i, (await page.evaluate(controlsOf, i)).findIndex((x) => x.sig === c.sig && x.nth === c.nth), spec, middle) });
	await set(page, i, 'initial');
	return out;
}

/**
 * Whether the table's rows show a selection of their own rather than the table's (React Aria's Table given no
 * selectedKeys keeps its own and tells the table on change): the rows do not change when the table's selection does.
 */
async function ownsSelection(page: Page, i: number, spec: NonNullable<Found['spec']>): Promise<boolean> {
	if (!spec.features.includes('rowSelectionFeature')) return false;
	const body = () => page.evaluate((i) => (window as unknown as { __mmTT: { el: Element }[] }).__mmTT[i]!.el.querySelector('tbody')?.outerHTML ?? '', i);
	await set(page, i, 'initial');
	const before = await body();
	await set(page, i, { rowSelection: { [spec.rowIds[0]!]: true } });
	const after = await body();
	await set(page, i, 'initial');
	return before === after;
}

/** Uses controls by signature, in order, on the page as it is. */
async function useAll(page: Page, i: number, uses: readonly { sig: string; nth: number }[]): Promise<boolean> {
	for (const u of uses) {
		const k = (await page.evaluate(controlsOf, i)).findIndex((x) => x.sig === u.sig && x.nth === u.nth);
		if (k < 0 || !(await click(page, k))) return false;
		await settle(page);
	}
	return true;
}

/** The row controls that select `ids`, in order. */
const rowUses = (controls: readonly TableControl[], ids: readonly string[]) => ids.map((id) => controls.find((c) => c.kind === 'row' && c.row === id)).filter((c): c is TableControl => c !== undefined);

/** Select-all of a widget keeping its own selection: each starting selection reached by using the rows, from a fresh load. */
async function selectAllByUse(page: Page, i: number, control: { sig: string; nth: number }, spec: NonNullable<Found['spec']>, controls: readonly TableControl[]): Promise<Record<string, string>> {
	const next: Record<string, string> = {};
	const ids = spec.rowIds;
	for (const [from, rows] of [['none', []], ['some', ids.slice(0, 1)], ['all', ids]] as const) {
		await reload(page);
		const uses = rowUses(controls, rows);
		if (uses.length !== rows.length || !(await useAll(page, i, [...uses, control]))) continue;
		const left = new Set(selectionOf(await stateOf(page, i)));
		next[from] = ids.every((id) => left.has(id)) ? 'pageOn' : left.size === 0 ? 'pageOff' : 'some';
	}
	await reload(page);
	return next;
}

/**
 * What a select-all control does from none, some and all of the page's rows selected, on a page showing only some rows
 * (a middle page) with a row off the page selected too: selects the page's rows or every row (`pageOn`, `allOn`), or
 * clears the page's rows or every row (`pageOff`, `allOff`). Radix's demo selects the page; React Aria's Table clears
 * every row, as its onSelectionChange gets an empty set.
 */
async function selectAll(page: Page, i: number, k: number, spec: NonNullable<Found['spec']>, middle: Record<string, unknown> | undefined): Promise<Record<string, string>> {
	const next: Record<string, string> = {};
	await set(page, i, middle ?? 'initial');
	const shown = (await page.evaluate(readTable, i)).rows.map((r) => r.id);
	const off = spec.rowIds.filter((id) => !shown.includes(id));
	for (const [from, rows] of [['none', []], ['some', [shown[0]!]], ['all', [...shown, ...off.slice(0, 1)]]] as const) {
		await set(page, i, { ...middle, rowSelection: Object.fromEntries(rows.map((id) => [id, true])) });
		if (!(await click(page, k))) continue;
		await settle(page);
		const left = new Set(selectionOf(await stateOf(page, i)));
		const outside = rows.filter((id) => !shown.includes(id));
		if (spec.rowIds.every((id) => left.has(id))) next[from] = off.length ? 'allOn' : 'pageOn';
		else if (shown.every((id) => left.has(id))) next[from] = 'pageOn';
		else if (left.size === 0) next[from] = outside.length ? 'allOff' : 'pageOff';
		else if (shown.every((id) => !left.has(id)) && outside.every((id) => left.has(id))) next[from] = 'pageOff';
	}
	await set(page, i, 'initial');
	return next;
}

/** The options of the popover a trigger opened (its aria-controls): their texts, and the popover's markup. */
function openedOptions(trigger: number): { html: string; items: string[] } | undefined {
	const w = window as unknown as { __mmControls: Element[]; __mmOptions?: Element[] };
	const id = w.__mmControls[trigger]?.getAttribute('aria-controls');
	const popover = id ? document.getElementById(id) : null;
	if (!popover) return undefined;
	w.__mmOptions = [...popover.querySelectorAll('[cmdk-item], [role="option"]')];
	const transient = /^data-(hovered|pressed|focused|focus-visible|focus-visible-within|focus-within|highlighted|selected)$|^(tabindex|style|aria-selected|id|aria-labelledby|aria-controls|aria-activedescendant)$/;
	const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const canon = (n: Node): string => {
		if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
		if (!(n instanceof Element)) return '';
		const tag = n.tagName.toLowerCase();
		const list = [...n.attributes].filter((a) => !transient.test(a.name)).sort((a, b) => (a.name < b.name ? -1 : 1)).map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
		return /^(img|input|br|hr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
	};
	return { html: canon(popover), items: w.__mmOptions.map((x) => (x.textContent ?? '').trim()) };
}

/** A select of the table (Rows per page): each option chosen in turn; one setting the page size makes it a page-size control. */
async function probeSizes(page: Page, i: number, trigger: { sig: string; nth: number }, out: TableControl[]): Promise<void> {
	const open = async () => {
		const k = triggerIndex(await page.evaluate(controlsOf, i), trigger);
		if (k < 0 || !(await click(page, k))) return 0;
		await settle(page);
		return page.locator('[role="listbox"] [role="option"]').filter({ visible: true }).count();
	};
	await set(page, i, 'initial');
	const count = await open();
	await page.keyboard.press('Escape');
	await settle(page);
	const sizes: Record<string, number> = {};
	for (let n = 0; n < count; n++) {
		await set(page, i, 'initial');
		if (!(await open())) break;
		const option = page.locator('[role="listbox"] [role="option"]').filter({ visible: true }).nth(n);
		const text = ((await option.textContent().catch(() => '')) ?? '').trim();
		if (!(await option.click({ timeout: 2000 }).then(() => true, () => false))) continue;
		await settle(page);
		const size = ((await stateOf(page, i)).pagination as { pageSize?: number } | undefined)?.pageSize;
		if (typeof size === 'number') sizes[text] = size;
	}
	await set(page, i, 'initial');
	const initial = (await stateOf(page, i)).pagination as { pageSize?: number } | undefined;
	if (Object.values(sizes).some((n) => n !== initial?.pageSize)) out.push({ sig: trigger.sig, nth: trigger.nth, kind: 'pageSize', sizes });
}

/**
 * A popover trigger among the controls in some state: its text then may hold what is chosen after its own (a faceted
 * filter's badges), so it is the one of its tag and slot whose text starts with its own, by its place among those.
 */
function triggerIndex(controls: readonly { sig: string }[], trigger: { sig: string; nth: number }): number {
	const [tag, slot, text] = trigger.sig.split('|') as [string, string, string];
	const alike = controls.map((c, k) => ({ c, k })).filter(({ c }) => {
		const [t, s, x] = c.sig.split('|') as [string, string, string];
		return t === tag && s === slot && x.startsWith(text);
	});
	const exact = alike.filter(({ c }) => c.sig === trigger.sig);
	return (exact.length > trigger.nth ? exact[trigger.nth] : alike[trigger.nth])?.k ?? -1;
}

/**
 * Opens a popover trigger of the table (a faceted filter) and uses each option from the table as loaded: an option that
 * puts one value in a column's filter list toggles it; one shown once a value is chosen that empties the list clears it.
 */
async function probeFacets(page: Page, i: number, trigger: { sig: string; nth: number }, initial: Record<string, Json>, out: TableControl[], log: (line: string) => void): Promise<void> {
	const open = async (): Promise<{ items: string[] } | undefined> => {
		const k = triggerIndex(await page.evaluate(controlsOf, i), trigger);
		if (k < 0 || !(await click(page, k))) return undefined;
		await settle(page);
		return page.evaluate(openedOptions, k);
	};
	const pick = (n: number) => page.evaluateHandle((n) => (window as unknown as { __mmOptions: Element[] }).__mmOptions[n]!, n).then((h) => h.asElement());
	await set(page, i, 'initial');
	const first = await open();
	await closeMenus(page);
	if (!first) return;
	let column: string | undefined;
	let chosen: Json | undefined;
	for (const [n, text] of first.items.entries()) {
		await set(page, i, 'initial');
		if (!(await open())) continue;
		const el = await pick(n);
		if (!el || !(await el.click({ timeout: 2000 }).then(() => true, () => false))) continue;
		await settle(page);
		const after = await stateOf(page, i);
		await closeMenus(page);
		const filters = (after.columnFilters ?? []) as { id: string; value: Json }[];
		const keys = changed(initial, after);
		if (keys.length === 1 && keys[0] === 'columnFilters' && filters.length === 1 && Array.isArray(filters[0]!.value) && filters[0]!.value.length === 1) {
			column = filters[0]!.id;
			chosen ??= filters[0]!.value[0]!;
			out.push({ sig: `option|${text}`, nth: n, kind: 'facet', column, value: filters[0]!.value[0]!, menu: { sig: trigger.sig, nth: trigger.nth } });
		} else if (keys.length) log(`  table popover option "${text}": changed ${keys.join(', ')}, which is not ported`);
	}
	if (column === undefined) return;
	// What a chosen value shows besides the options (Clear filters) is used with one value chosen.
	const one = { columnFilters: [{ id: column, value: [chosen!] }] };
	await set(page, i, one);
	const opened = await open();
	await closeMenus(page);
	for (const [n, text] of (opened?.items ?? []).entries()) {
		if (n < first.items.length) continue;
		await set(page, i, one);
		if (!(await open())) continue;
		const el = await pick(n);
		if (!el || !(await el.click({ timeout: 2000 }).then(() => true, () => false))) continue;
		await settle(page);
		const after = await stateOf(page, i);
		await closeMenus(page);
		if (!((after.columnFilters ?? []) as unknown[]).length) out.push({ sig: `option|${text}`, nth: n, kind: 'facetClear', column, menu: { sig: trigger.sig, nth: trigger.nth } });
	}
	await set(page, i, 'initial');
}

/** Opens a menu trigger of the table and uses each item: an item that toggles a column's visibility is a control. */
async function probeMenu(page: Page, i: number, trigger: { sig: string; nth: number }, initial: Record<string, Json>, out: TableControl[], log: (line: string) => void): Promise<void> {
	const opened = await page.evaluate(openedMenu);
	await closeMenus(page);
	if (!opened) return;
	const k = (await page.evaluate(controlsOf, i)).findIndex((c) => c.sig === trigger.sig && c.nth === trigger.nth);
	for (const [index, text] of opened.items.entries()) {
		// Each item from a fresh load: a menu closed by Escape can leave its underlay over the page for a while.
		await reload(page);
		await page.evaluate(controlsOf, i);
		if (!(await click(page, k))) {
			log(`  table menu ${trigger.sig}#${trigger.nth}: could not be opened`);
			return;
		}
		await settle(page);
		const item = page.locator('[role="menu"]').last().locator('[role^="menuitem"]').nth(index);
		if (!(await item.click({ timeout: 2000 }).then(() => true, () => false))) {
			log(`  table menu item "${text}": could not be pressed`);
			continue;
		}
		await settle(page);
		const after = await stateOf(page, i);
		await closeMenus(page);
		const keys = changed(initial, after);
		if (keys.length === 1 && keys[0] === 'columnVisibility') {
			const hidden = Object.entries(after.columnVisibility as Record<string, boolean>).filter(([id, on]) => on === false && (initial.columnVisibility as Record<string, boolean> | undefined)?.[id] !== false).map(([id]) => id);
			if (hidden.length === 1) out.push({ sig: `item|${text}`, nth: index, kind: 'visibility', column: hidden[0]!, menu: { sig: trigger.sig, nth: trigger.nth } });
		} else if (keys.length === 1 && keys[0] === 'sorting' && (after.sorting as { id: string }[]).length === 1) {
			// A column header's menu item sorts one way whatever the direction was (DataTableColumnHeader's Asc and Desc).
			const column = (after.sorting as { id: string }[])[0]!.id;
			const dir = dirOf(after.sorting, column);
			out.push({ sig: `item|${text}`, nth: index, kind: 'sort', column, next: { '': dir, asc: dir, desc: dir }, menu: { sig: trigger.sig, nth: trigger.nth } });
		} else if (keys.length) log(`  table menu item "${text}": changed ${keys.join(', ')}, which is not ported`);
	}
	await set(page, i, 'initial');
}

/** The states a binding is learned from, each set on the old page and recorded with the table's quantities. */
async function record(page: Page, i: number, spec: NonNullable<Found['spec']>, controls: readonly TableControl[]): Promise<TableSnapshot[]> {
	const states: [string, Record<string, unknown> | 'initial'][] = [['initial', 'initial']];
	const ids = spec.rowIds;
	// A widget keeping its own selection is selected by using its rows (on a fresh load), the rest of a state set after.
	const owned = await ownsSelection(page, i, spec);
	const selected = new Map<string, readonly string[]>();
	if (spec.features.includes('rowSelectionFeature')) {
		states.push(['row', { rowSelection: { [ids[0]!]: true } }], ['all', { rowSelection: Object.fromEntries(ids.map((id) => [id, true])) }]);
		selected.set('row', ids.slice(0, 1)).set('all', ids);
	}
	const filter = controls.find((c) => c.kind === 'filter');
	if (filter) {
		// A filter that leaves out the first row (selected) but keeps another, and one that leaves none.
		const values = spec.data.map((d) => String(d[filter.column!] ?? ''));
		const keep = values.findIndex((v, k) => k > 0 && v && !values[0]!.toLowerCase().includes(v.toLowerCase()));
		if (keep > 0) {
			states.push(['filtered', { rowSelection: { [ids[0]!]: true }, columnFilters: [{ id: filter.column!, value: values[keep]! }] }]);
			selected.set('filtered', ids.slice(0, 1));
		}
		states.push(['empty', { columnFilters: [{ id: filter.column!, value: '⁣mm-no-match' }] }]);
	}
	for (const column of new Set(controls.filter((x) => x.kind === 'sort').map((x) => x.column!))) for (const dir of ['asc', 'desc']) states.push([`sort:${column}:${dir}`, { sorting: [{ id: column, desc: dir === 'desc' }] }]);
	if (spec.features.includes('rowPaginationFeature') && ids.length > 2) {
		const size = recordPageSize(ids.length, pageSizeOf(spec.state));
		const count = Math.ceil(ids.length / size);
		states.push(['page:first', { pagination: { pageIndex: 0, pageSize: size } }], ['page:last', { pagination: { pageIndex: count - 1, pageSize: size }, rowSelection: { [ids[0]!]: true } }]);
		// A page with pages both before and after it: what follows only one way (a last-page button) is told apart there.
		if (count > 2) states.push(['page:middle', { pagination: { pageIndex: 1, pageSize: size } }]);
		selected.set('page:last', ids.slice(0, 1));
	}
	// Every row on one page: the markup of the rows no other state shows, each read as its own values.
	if (spec.features.includes('rowPaginationFeature')) states.push([ALL_ROWS, { pagination: { pageIndex: 0, pageSize: ids.length } }]);
	const hideable = spec.columns.filter((c) => c.def.enableHiding !== false).map((c) => c.id);
	if (spec.features.includes('columnVisibilityFeature') && hideable.length) states.push(['hidden', { columnVisibility: Object.fromEntries(hideable.map((id) => [id, false])) }]);
	const facet = (c: TableControl) => c.kind === 'facet' || c.kind === 'facetClear';
	const menus = [...new Map(controls.filter((c) => c.menu && !facet(c)).map((c) => [`${c.menu!.sig}#${c.menu!.nth}`, c.menu!])).entries()];
	// A faceted filter in each of its states: no value chosen, each value alone, two values and three (its trigger shows a
	// count beyond two), each with its popover as it then opened.
	const popovers = [...new Map(controls.filter((c) => c.kind === 'facet').map((c) => [`${c.menu!.sig}#${c.menu!.nth}`, { trigger: c.menu!, column: c.column! }])).entries()];
	const facetStates = new Set<string>(['initial']);
	for (const [key, { column }] of popovers) {
		const values = controls.filter((c) => c.kind === 'facet' && `${c.menu!.sig}#${c.menu!.nth}` === key).map((c) => c.value!);
		const add = (name: string, chosen: Json[]) => {
			states.push([name, { columnFilters: [{ id: column, value: chosen }] }]);
			facetStates.add(name);
		};
		values.forEach((value, k) => add(`facet:${key}:${k}`, [value]));
		if (values.length > 1) add(`facet:${key}:two`, values.slice(0, 2));
		if (values.length > 2) add(`facet:${key}:three`, values.slice(0, 3));
	}
	const out: TableSnapshot[] = [];
	for (const [name, state] of states) {
		const rows = selected.get(name);
		if (owned && rows && state !== 'initial') {
			await reload(page);
			const { rowSelection: _, ...rest } = state;
			if (!(await useAll(page, i, rowUses(controls, rows)))) continue;
			await set(page, i, { ...rest, rowSelection: (await stateOf(page, i)).rowSelection });
		} else {
			if (owned) await reload(page);
			await set(page, i, state);
		}
		const read = await page.evaluate(readTable, i);
		const html = await page.evaluate(regionMarkup, i);
		const shown: Record<string, string> = {};
		if (facetStates.has(name))
			for (const [key, { trigger }] of popovers) {
				const k = triggerIndex(await page.evaluate(controlsOf, i), trigger);
				if (k < 0 || !(await click(page, k))) continue;
				await settle(page);
				const opened = await page.evaluate(openedOptions, k);
				if (opened) shown[key] = opened.html;
				await closeMenus(page);
			}
		if (name === 'initial' || name === 'hidden')
			for (const [key, trigger] of menus) {
				const k = (await page.evaluate(controlsOf, i)).findIndex((c) => c.sig === trigger.sig && c.nth === trigger.nth);
				if (k < 0 || !(await click(page, k))) continue;
				await settle(page);
				const opened = await page.evaluate(openedMenu);
				if (opened) shown[key] = opened.html;
				await closeMenus(page);
			}
		out.push({ name, ...read, html, ...(Object.keys(shown).length ? { menus: shown } : {}) });
	}
	await set(page, i, 'initial');
	return out;
}

/** Reads every TanStack table of a route on the old page, uses its controls and records its states. Cached by route. */
export async function captureTables(browser: Browser, origin: string, route: string, dir: string, log: (line: string) => void = () => {}): Promise<TableCapture> {
	const file = fileFor(dir, route);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as TableCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const tables: CapturedTable[] = [];
	const skipped: string[] = [];
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForTimeout(300);
		const found = await page.evaluate(findTables);
		let index = 0;
		for (const f of found) {
			if (!f.spec || !f.region) {
				skipped.push(`${f.sig}#${f.nth}: ${f.why}`);
				continue;
			}
			const i = index++;
			const controls = await probe(page, i, f.spec, log);
			const snapshots = await record(page, i, f.spec, controls);
			tables.push({ sig: f.sig, nth: f.nth, region: f.region, ...f.spec, controls, snapshots });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: TableCapture = { route, tables, skipped };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

// --- The plan --------------------------------------------------------------------------------------------------------

/** Where the tables' specs are written, under the app's lib/parts/, and the names they are exported by. */
export const SPECS_MODULE = 'tanstack-tables.ts';
export const SPEC_PREFIX = 'tts_';
export const CELLS_PREFIX = 'ttc_';
export const SHARED_MODULE = 'tanstack-tables.tsrx';

// table-core 9's exports for what a table registers: a feature under its own name, a row model under create<Name>, a
// sort or filter function under sortFn_<name> or filterFn_<name>.
const FEATURES = new Set(['cellSelectionFeature', 'cellSpanningFeature', 'columnFacetingFeature', 'rowAggregationFeature', 'columnFilteringFeature', 'columnGroupingFeature', 'columnOrderingFeature', 'columnPinningFeature', 'columnResizingFeature', 'columnSizingFeature', 'columnVisibilityFeature', 'globalFilteringFeature', 'rowExpandingFeature', 'rowPaginationFeature', 'rowPinningFeature', 'rowSelectionFeature', 'rowSortingFeature']);
const ROW_MODELS: Readonly<Record<string, string>> = { filteredRowModel: 'createFilteredRowModel', sortedRowModel: 'createSortedRowModel', paginatedRowModel: 'createPaginatedRowModel', groupedRowModel: 'createGroupedRowModel', expandedRowModel: 'createExpandedRowModel', facetedRowModel: 'createFacetedRowModel', facetedMinMaxValues: 'createFacetedMinMaxValues', facetedUniqueValues: 'createFacetedUniqueValues' };
const SORT_FNS = new Set(['alphanumeric', 'alphanumericCaseSensitive', 'text', 'textCaseSensitive', 'datetime', 'basic']);
const FILTER_FNS = new Set(['arrHas', 'arrIncludes', 'arrIncludesAll', 'arrIncludesSome', 'between', 'betweenInclusive', 'empty', 'endsWith', 'equals', 'equalsString', 'equalsStringSensitive', 'greaterThan', 'greaterThanOrEqualTo', 'inDateRange', 'inNumberRange', 'includesString', 'includesStringSensitive', 'lessThan', 'lessThanOrEqualTo', 'notEmpty', 'startsWith', 'weakEquals']);
const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'selected', 'open', 'inert', 'readonly', 'required', 'multiple']);
// The quantities an attribute or what an element holds may follow, in the order they are tried, and the counts a text may
// show (a count is never a key: a lookup from it would guess at the counts no state showed).
const STATES = ['canPrev', 'canNext', 'pageSel', 'allSel', 'empty', 'filtering'];
const COUNTS = ['filteredSelected', 'selected', 'filtered', 'rows', 'pageRows', 'pageNumber', 'pageCount', 'pageIndex'];

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10);

type Key = string | number | boolean;
interface Candidate {
	readonly expr: string;
	readonly keys: readonly Key[];
}
type Lookup = readonly (readonly [Key, string | undefined])[];

/** The first candidate a property's values are a function of over the states it was read in, as a lookup; 'static' when they never change. */
export function learn(values: readonly (string | undefined)[], candidates: readonly Candidate[]): { readonly expr: string; readonly table: Lookup } | 'static' | undefined {
	if (new Set(values).size <= 1) return 'static';
	for (const c of candidates) {
		const map = new Map<Key, string | undefined>();
		if (c.keys.every((k, s) => (map.has(k) ? map.get(k) === values[s] : (map.set(k, values[s]), true)))) return { expr: c.expr, table: [...map] };
	}
	return undefined;
}

/** A lookup as an expression of its quantity. */
export function choose(expr: string, table: Lookup, value: (v: string | undefined) => string): string {
	if (table.length === 2 && table.every(([k]) => typeof k === 'boolean')) return `${expr} ? ${value(table.find(([k]) => k === true)![1])} : ${value(table.find(([k]) => k === false)![1])}`;
	return table.reduceRight<string>((rest, [k, v], i) => (i === table.length - 1 ? value(v) : `${expr} === ${JSON.stringify(k)} ? ${value(v)} : ${rest}`), '');
}

/** The children a lookup's values show, an arm per value side by side (a branch cannot hold another). */
function arms(expr: string, table: Lookup, emit: (html: string) => string): string {
	return table.map(([key, html]) => (html ? `@if (${typeof key === 'boolean' ? `${key ? '' : '!'}${expr}` : `${expr} === ${JSON.stringify(key)}`}) { <>${emit(html)}</> }` : '')).join('');
}

/**
 * The children a lookup's values show, inside a keyed row: every value's elements rendered, each hidden but in its own
 * state. Undefined when a value shows text, which only a branch could take out.
 */
function hiddenArms(expr: string, table: Lookup): string | undefined {
	let out = '';
	for (const [key, html] of table) {
		if (!html) continue;
		const fragment = parseFragment(html) as unknown as Tree;
		const top = childrenOf(fragment);
		if (top.some((n) => isText(n) && n.value.trim())) return undefined;
		const when = typeof key === 'boolean' ? `${key ? '!' : ''}${expr}` : `${expr} !== ${JSON.stringify(key)}`;
		out += emitChildren(fragment, { bind: (el) => (top.includes(el) ? { omit: ['hidden'], extra: [`hidden={${when}}`] } : undefined) }).replace(/\n/g, '');
	}
	return out;
}

// The ids a library generates per mount (React's useId, a collection's counter) change whenever a row mounts again: they
// name the element, not the table's state, and keep the page's own.
const ID_REFERENCES = new Set(['id', 'for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage']);
const GENERATED = /(?:^|[-_\s])(?:react-aria|radix|base-ui)\b|_[rR]_|«r|:r[0-9a-z]+:/;
const mountIdentity = (name: string, values: readonly (string | undefined)[]) => ID_REFERENCES.has(name) || values.every((v) => v === undefined || GENERATED.test(v));

const attributeValue = (name: string) => (v: string | undefined) => (BOOLEAN.has(name) ? String(v !== undefined) : v === undefined ? 'undefined' : lit(v));

interface Props {
	readonly attrs: Readonly<Record<string, string>>;
	readonly text: string;
	readonly shape: string;
	readonly inner: string;
}

function propsOf(el: Tree): Props {
	const kids = childrenOf(el);
	return {
		attrs: Object.fromEntries(el.attrs.map((a) => [a.name, a.value])),
		text: kids.filter(isText).map((t) => t.value).join(''),
		shape: kids.map((n) => (isElement(n) ? n.tagName : isText(n) && n.value.trim() ? '#t' : '')).filter(Boolean).join(','),
		inner: innerOf(el),
	};
}

// What opening a layer puts beside its trigger is rendered hidden there by the converter: no element of the table's.
const kids = (el: Tree): Tree[] => elementChildren(el).filter((e) => attr(e, 'data-mm-shown-with') === undefined);

const at = (root: Tree | undefined, path: readonly number[]): Tree | undefined => {
	let el = root;
	for (const i of path) el = el ? kids(el)[i] : undefined;
	return el;
};

/** Where `el` is under `root`, by element child indexes. */
function pathIn(root: Tree, el: Tree): number[] | undefined {
	const path: number[] = [];
	for (let x = el; x !== root; ) {
		const parent = x.parentNode as Tree | null;
		if (!parent || !isElement(parent)) return undefined;
		path.unshift(kids(parent).indexOf(x));
		x = parent;
	}
	return path;
}

/** Where the converted region's tree of elements differs from the recorded one, if anywhere. */
function mismatch(page: Tree, rec: Tree, path: string): string | undefined {
	if (page.tagName !== rec.tagName) return `${path}: <${page.tagName}> where the old page had <${rec.tagName}>`;
	const a = kids(page);
	const b = kids(rec);
	if (a.length !== b.length) return `${path}: ${a.length} children where the old page had ${b.length}`;
	for (let i = 0; i < a.length; i++) {
		const m = mismatch(a[i]!, b[i]!, `${path}/${a[i]!.tagName}[${i}]`);
		if (m) return m;
	}
	return undefined;
}

interface Read {
	readonly el: Tree;
	/** The candidates' keys in the state it was read in. */
	readonly keys: readonly Key[];
}

/** A table captured on the old page, as the plan places it. */
interface Placed {
	readonly name: string;
	readonly spec: string;
	readonly cells: string;
	readonly shared: string;
	readonly table: CapturedTable;
	/** Each row's values the row template reads, by row id. */
	readonly values: Record<string, string[]>;
}

/**
 * TanStack tables on Markless state (parts/tanstack-table.ts runs table-core over it): one state() per table, shared by
 * its page and its menus, holds the table's state, and a computed() view derives what the page shows. Every element whose
 * markup followed the table on the old page binds the quantity it followed, learned from the states captureTables
 * recorded: the body renders the page's rows in a keyed @for from one row template, a hidden column's cells leave, the
 * select-all box shows none, some or all, a count reads the view. Each control calls ttAct as its use did on the old page.
 */
export class TablePlan {
	private readonly bindings = new Map<Tree, Binding>();
	private readonly lazy = new Map<Tree, () => Binding | undefined>();
	private readonly owner = new Map<Tree, string>();
	private readonly emitting = new Set<Tree>();
	/** Each placed table's rows binding, made once; a table whose rows are no template renders as the old page showed it. */
	private readonly rows = new Map<string, () => Binding | undefined>();
	private readonly bound = new Map<string, boolean>();
	private readonly placed: Placed[] = [];
	/** Every table captured, placed or not: a menu of one is bound before its page is (layers are emitted first). */
	private readonly expected = new Map<string, Placed[]>();
	private readonly menus = new Map<string, { placed: Placed; controls: TableControl[] }>();
	readonly notes: string[] = [];
	private n = 0;
	/** Emits one element of a page with every plan's bindings; set before the pages are emitted. */
	emitter: (el: Tree, declarations: string[]) => string = () => '';
	/** Emits recorded markup (an arm's content). */
	emitHtml: (html: string) => string = (html) => html;

	get count(): number {
		return this.placed.length;
	}

	/** Whether any table was captured: its modules are written for its menus even when its page could not be bound. */
	get used(): boolean {
		return [...this.expected.values()].some((list) => list.length > 0);
	}

	/** Whether a placed table uses Base UI's checkbox (its hidden input hands focus on through toggle.ts). */
	get focusesControls(): boolean {
		return [...this.bindings.values()].some((b) => b.extra?.some((x) => x.includes('focusControl(')));
	}

	bind(el: Tree): Binding | undefined {
		const name = this.owner.get(el);
		if (name !== undefined && !this.bound.has(name)) {
			// The rows are emitted before any of the table is: every binding in it reads the state the rows declare.
			this.bound.set(name, true);
			this.bound.set(name, this.rows.get(name)?.() !== undefined);
		}
		if (name !== undefined && !this.bound.get(name)) return undefined;
		const lazy = this.lazy.get(el);
		return lazy ? mergeBindings(this.bindings.get(el), lazy()) : this.bindings.get(el);
	}

	/** The elements of a placed table's region, which the other plans leave alone. */
	claims(el: Tree): boolean {
		return this.owner.has(el);
	}

	/** The table an element's region is, its identity among alike regions of other pages. */
	nameOf(el: Tree): string | undefined {
		return this.owner.get(el);
	}

	/** Names a route's captured tables and their menus, before any page or layer is emitted. */
	expect(route: string, tables: readonly CapturedTable[]): void {
		const list = tables.map((table) => {
			const k = this.n++;
			const spec = `${SPEC_PREFIX}${hash([table.data, table.columns, table.features, table.rowModels, table.sortFns, table.filterFns, table.options, table.rowIds])}`;
			const placed: Placed = { name: `tt${k}`, spec, cells: `${CELLS_PREFIX}${hash([route, table.sig, table.nth])}`, shared: `ttShared${k}`, table, values: {} };
			for (const c of table.controls.filter((x) => (x.kind === 'visibility' || x.kind === 'sort' || x.kind === 'facet' || x.kind === 'facetClear') && x.menu)) {
				const key = `${route}|${c.menu!.sig}#${c.menu!.nth}`;
				(this.menus.get(key) ?? this.menus.set(key, { placed, controls: [] }).get(key)!).controls.push(c);
			}
			return placed;
		});
		this.expected.set(route, list);
	}

	add(route: string, locate: (sig: string, nth: number) => Tree | undefined): number {
		let count = 0;
		for (const placed of this.expected.get(route) ?? []) {
			const why = this.place(route, placed, locate);
			if (why) this.notes.push(`${route} table ${placed.table.sig.slice(0, 40)}#${placed.table.nth}: not ported, ${why}`);
			else count++;
		}
		return count;
	}

	private place(route: string, placed: Placed, locate: (sig: string, nth: number) => Tree | undefined): string | undefined {
		const { table, name, spec } = placed;
		const unknown = [...table.features.filter((f) => !FEATURES.has(f)), ...table.rowModels.filter((m) => !ROW_MODELS[m]), ...table.sortFns.filter((f) => !SORT_FNS.has(f)).map((f) => `sortFn ${f}`), ...table.filterFns.filter((f) => !FILTER_FNS.has(f)).map((f) => `filterFn ${f}`)];
		if (unknown.length) return `it registers ${unknown.join(', ')}, which table-core does not export`;
		for (const c of table.columns)
			for (const [key, value] of Object.entries(c.def)) {
				const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as { $fn?: Json }).$fn : undefined;
				const own = typeof source === 'string' ? ownFunction(source) : undefined;
				if (own && 'why' in own) return `column "${c.id}"'s ${key} ${own.why}`;
			}
		const region = locate(table.region.sig, table.region.nth);
		const tableEl = locate(table.sig, table.nth);
		if (!region || !tableEl || !pathIn(region, tableEl)) return 'its region is not on the converted page';
		const snaps = table.snapshots.map((s) => ({ ...s, root: kids(parseFragment(s.html) as unknown as Tree)[0] }));
		const initial = snaps.find((s) => s.name === 'initial');
		if (!initial?.root) return 'no initial state was recorded';
		const differs = mismatch(region, initial.root, region.tagName);
		if (differs) return `its markup differs from the old page's (${differs})`;
		const tablePath = pathIn(region, tableEl)!;
		// A state's table is found by its place among the region's tables: what a state adds around it (a toolbar's Reset) moves its path.
		const tableIndex = [...walk(region)].filter((e) => e.tagName === 'table').indexOf(tableEl);
		const inTable = (root: Tree | undefined, path: readonly number[]) => at(root ? [...walk(root)].filter((e) => e.tagName === 'table')[tableIndex] : undefined, path);
		const section = (root: Tree | undefined, tag: string) => (at(root, tablePath) ? kids(at(root, tablePath)!).find((k) => k.tagName === tag) : undefined);
		const thead = section(region, 'thead');
		const tbody = section(region, 'tbody');
		if (!thead || !tbody) return 'its table has no head or body';
		const headRows = kids(thead);
		if (headRows.length !== 1) return `its head has ${headRows.length} rows`;
		const heads = kids(headRows[0]!);
		const visible = table.columns.filter((c) => initial.columns[c.id]?.visible !== false).map((c) => c.id);
		if (heads.length !== visible.length) return `its head shows ${heads.length} cells for ${visible.length} columns`;
		const bodyRows = kids(tbody);
		if (bodyRows.length !== initial.rows.length || bodyRows.some((tr) => tr.tagName !== 'tr' || kids(tr).length !== visible.length)) return 'its body rows are not one cell per column';
		// Any row may show any record once the table sorts, filters or pages, so a late font one row draws waits on the body.
		const late = bodyRows.flatMap((tr) => [...walk(tr)]).filter((el) => attr(el, LATE_FONT) !== undefined);
		for (const el of late) removeAttr(el, LATE_FONT);
		if (late.length) setAttr(tbody, LATE_FONT, '');

		const v = `${name}v`;
		const declare = [`const ${name} = ${placed.shared}();`, `const ${v} = computed(() => ttView(${spec}, ${name}.s, ${placed.cells}));`];
		const bindings = new Map<Tree, Binding>();
		const add = (el: Tree, b: Binding) => bindings.set(el, mergeBindings(bindings.get(el), { declare, ...b })!);
		// ttAct keeps the state it is handed in its table instance: Markless refuses a live state object there, so it gets a copy.
		const act = (action: string) => `${name}.s = ttAct(${spec}, structuredClone(${name}.s), ${action})`;
		const notes: string[] = [];

		// Cells move in the hidden state; every other state shows every column.
		const shown = snaps.filter((s) => s.name !== 'hidden' && s.name !== ALL_ROWS && s.root);
		const facetTriggers = new Set<Tree>();
		const tableExprs = [...STATES, ...COUNTS].map((key) => `${v}.q.${key}`);
		// Text updates only where it reads a name: each quantity a text shows is a computed() of its own.
		const texts = new Map<string, string>();
		const textOf = (expr: string): string => {
			let own = texts.get(expr);
			if (!own) {
				own = `${name}t${texts.size}`;
				texts.set(expr, own);
				declare.push(`const ${own} = computed(() => ${expr});`);
			}
			return own;
		};
		const tableKeys = (s: (typeof snaps)[number]): Key[] => [...STATES, ...COUNTS].map((key) => (key === 'empty' ? s.q.pageRows === 0 : s.q[key]!));

		/**
		 * Where states differ only by elements some of them add among an element's children (a toolbar's Reset while a column
		 * is filtered): each added element as an arm at its place, shown by the quantity its presence follows, and each child
		 * the states share read in its own place. A table control among what an arm shows does what it did.
		 */
		const insertedArms = (el: Tree, reads: readonly Read[], candidates: readonly Candidate[]): { inserts: { before: Tree | null; markup: string }[]; reads: Read[][] } | undefined => {
			const base = kids(el);
			const shared: Read[][] = base.map(() => []);
			const extras = new Map<number, (string | undefined)[]>();
			for (const [n, r] of reads.entries()) {
				const own = kids(r.el);
				let j = 0;
				for (const child of own) {
					if (j < base.length && child.tagName === base[j]!.tagName && attr(child, 'data-slot') === attr(base[j]!, 'data-slot')) {
						shared[j]!.push({ el: child, keys: r.keys });
						j++;
					} else (extras.get(j) ?? extras.set(j, reads.map(() => undefined)).get(j)!)[n] = outer(child);
				}
				if (j < base.length) return undefined;
			}
			if (!extras.size) return undefined;
			const inserts: { before: Tree | null; markup: string }[] = [];
			for (const [j, values] of extras) {
				const learned = learn(values, candidates);
				if (!learned || learned === 'static') return undefined;
				inserts.push({ before: base[j] ?? null, markup: arms(learned.expr, learned.table, (html) => this.emitHtml(withClear(html)).replaceAll(`${CLEAR}=""`, `onClick={() => { ${act('{ k: "clear" }')}; }}`)) });
			}
			return { inserts, reads: shared };
		};
		const clears = table.controls.filter((c) => c.kind === 'clear');
		const CLEAR = 'data-mm-tt-clear';
		// A Reset an arm shows clears every filter: marked in its markup, then bound once the arm is emitted.
		const withClear = (html: string): string => {
			if (!clears.length) return html;
			const fragment = parseFragment(html) as unknown as Tree;
			for (const x of walk(fragment)) if (clears.some((c) => c.sig === `${x.tagName}|${attr(x, 'data-slot') ?? ''}|${textContent(x).trim().replace(/\s+/g, ' ').slice(0, 60)}`)) setAttr(x, CLEAR, '');
			return innerOf(fragment);
		};

		/**
		 * Binds what an element's markup followed over the states it was read in: an attribute, its text (each number in it
		 * read from the view) or, where its children change shape, an arm per value; then its children, unless `shallow`.
		 */
		const learnElement = (el: Tree, reads: readonly Read[], exprs: readonly string[], label: string, shallow = false, inRow = false): Read[][] | undefined => {
			if (!reads.length || facetTriggers.has(el)) return undefined;
			const props = reads.map((r) => propsOf(r.el));
			const all = exprs.map((expr, c) => ({ expr, keys: reads.map((r) => r.keys[c]!) }));
			const candidates = all.filter((c) => c.keys.every((k) => typeof k !== 'number'));
			const omit: string[] = [];
			const extra: string[] = [];
			for (const a of [...new Set(props.flatMap((p) => Object.keys(p.attrs)))]) {
				// A text field's value is what the visitor typed; the tab stop follows focus.
				if (!/^[A-Za-z_][\w.-]*$/.test(a) || a === 'tabindex' || (a === 'value' && /^(input|textarea)$/.test(el.tagName))) continue;
				const values = props.map((p) => p.attrs[a]);
				if (mountIdentity(a, values)) continue;
				const learned = learn(values, candidates);
				if (!learned) notes.push(`${label}: its ${a} follows no quantity of the table`);
				else if (learned !== 'static') {
					omit.push(a);
					extra.push(`${a}={${choose(learned.expr, learned.table, attributeValue(a))}}`);
				}
			}
			if (omit.length) add(el, { omit, extra });
			if (new Set(props.map((p) => p.shape)).size > 1 && !inRow) {
				const inserted = insertedArms(el, reads, candidates);
				if (inserted) {
					add(el, { inserts: inserted.inserts });
					if (!shallow) kids(el).forEach((child, i) => learnElement(child, inserted.reads[i]!, exprs, `${label}/${child.tagName}[${i}]`));
					return inserted.reads;
				}
			}
			if (new Set(props.map((p) => p.shape)).size > 1) {
				const learned = shallow ? undefined : learn(props.map((p) => p.inner), candidates);
				if (!learned) notes.push(`${label}: what it holds follows no quantity of the table`);
				else if (learned !== 'static' && !inRow) add(el, { children: arms(learned.expr, learned.table, this.emitHtml) });
				else if (learned !== 'static') {
					const shown = hiddenArms(learned.expr, learned.table);
					if (shown === undefined) notes.push(`${label}: what it holds in some state is text, which a row cannot hide`);
					else add(el, { children: shown });
				}
				return;
			}
			const texts = props.map((p) => p.text);
			if (new Set(texts).size > 1) {
				const split = texts.map((t) => t.split(/(\d+)/));
				const counts = all.filter((c) => c.keys.every((x) => typeof x === 'number'));
				let out = '';
				let ok = kids(el).length === 0 && split.every((s) => s.length === split[0]!.length);
				for (let i = 0; ok && i < split[0]!.length; i++) {
					const parts = split.map((s) => s[i]!);
					if (new Set(parts).size === 1) out += parts[0] ? `{${lit(parts[0])}}` : '';
					else {
						const c = i % 2 === 1 ? counts.find((x) => x.keys.every((n, s) => n === Number(parts[s]))) : undefined;
						if (c) out += `{${textOf(c.expr)}}`;
						else ok = false;
					}
				}
				if (ok) add(el, { children: out });
				else notes.push(`${label}: its text follows no quantity of the table`);
			}
			if (!shallow) kids(el).forEach((child, i) => learnElement(child, reads.flatMap((r) => (kids(r.el)[i] ? [{ el: kids(r.el)[i]!, keys: r.keys }] : [])), exprs, `${label}/${child.tagName}[${i}]`, false, inRow));
		};

		// Outside the head and body: each element by its place, in every state that shows every column.
		const outside = (el: Tree, reads: readonly Read[], label: string): void => {
			if (el === thead || el === tbody) return;
			if (![...walk(el)].includes(thead)) {
				learnElement(el, reads, tableExprs, label);
				return;
			}
			const aligned = learnElement(el, reads, tableExprs, label, true);
			kids(el).forEach((child, i) => outside(child, aligned ? aligned[i]! : reads.flatMap((r) => (kids(r.el)[i]?.tagName === child.tagName ? [{ el: kids(r.el)[i]!, keys: r.keys }] : [])), `${label}/${child.tagName}[${i}]`));
		};
		// A faceted filter's trigger shows what its column's filter list holds: one template over the chosen values' labels.
		for (const [key, { trigger, column }] of facetsOf(table)) {
			const el = locate(trigger.sig, trigger.nth);
			const path = el ? pathIn(region, el) : undefined;
			const base = el ? meaningfulKids(el) : [];
			const variants: { labels: string[]; values: readonly Json[]; extras: Tree[] | undefined }[] = [];
			for (const snap of snaps.filter((x) => x.name.startsWith(`facet:${key}:`))) {
				const own = path && snap.root ? at(snap.root, path) : undefined;
				const nodes = own ? meaningfulKids(own) : [];
				const prefix = nodes.length > base.length && base.every((b, i) => sameNode(b, nodes[i]!));
				variants.push({ labels: [], values: snap.columns[column]?.chosen ?? [], extras: prefix ? nodes.slice(base.length) : undefined });
			}
			const labels = chosenLabels(variants);
			const template = el && labels && variants.every((x) => x.extras) ? chosenTemplate(variants.map((x) => ({ labels: x.values.map((value) => labels[String(value)]!), html: x.extras!.map(outer).join('') })), `${v}.c[${lit(column)}].fs.length`, `${v}.c[${lit(column)}].fs.map((x) => (${JSON.stringify(labels)} as Record<string, string>)[String(x)] ?? "")`, `${v}.c[${lit(column)}].fs.length === 0`) : undefined;
			if (!el || !template) {
				notes.push(`faceted filter ${trigger.sig}#${trigger.nth}: what it shows of its chosen values follows no template`);
				continue;
			}
			// Rendered always and hidden while nothing is chosen: the table's state is another module's, which no arm is rebuilt from.
			add(el, { inserts: [{ before: null, markup: template }] });
			facetTriggers.add(el);
		}
		outside(region, shown.flatMap((s) => (s.root ? [{ el: s.root, keys: tableKeys(s) }] : [])), region.tagName);

		// A hidden column's header leaves as on the old page; its cells are hidden, not taken out: a keyed row holding a
		// branch could not be built for a row that comes back (a filter cleared), so nothing in a row is a branch.
		const hideable = (id: string) => table.features.includes('columnVisibilityFeature') && table.columns.find((c) => c.id === id)!.def.enableHiding !== false;
		// The head: each column's cell, read with the column's direction first.
		const headPath = pathIn(tableEl, headRows[0]!)!;
		heads.forEach((th, i) => {
			const id = visible[i]!;
			const reads = shown.flatMap((s) => (inTable(s.root, [...headPath, i]) ? [{ el: inTable(s.root, [...headPath, i])!, keys: [s.columns[id]?.sorted ?? '', ...tableKeys(s)] }] : []));
			learnElement(th, reads, [`${v}.c[${lit(id)}].s`, ...tableExprs], `head ${id}`);
			if (hideable(id)) this.removable(th, `${v}.c[${lit(id)}].v`);
		});

		// The body: each row read in every state that shows it, with whether it is selected first.
		const bodyPath = pathIn(tableEl, tbody)!;
		bodyRows.forEach((tr, index) => {
			const id = table.rowIds[index]!;
			const reads = shown.flatMap((s) => {
				const place = s.rows.findIndex((r) => r.id === id);
				const row = place >= 0 ? kids(inTable(s.root, bodyPath) ?? tr)[place] : undefined;
				return row ? [{ el: row, keys: [s.rows[place]!.sel, ...tableKeys(s)] }] : [];
			});
			learnElement(tr, reads, ['row.sel', ...tableExprs], `row ${id}`, false, true);
			kids(tr).forEach((td, i) => {
				if (hideable(visible[i]!)) add(td, { extra: [`hidden={!${v}.c[${lit(visible[i]!)}].v}`] });
			});
		});

		// The controls: each calls ttAct as its use did on the old page.
		const inRegion = new Set(walk(region));
		const located = table.controls.filter((c) => !c.menu && c.kind !== 'clear').map((c) => ({ c, el: locate(c.sig, c.nth) }));
		for (const { c, el } of located) {
			if (!el || !inRegion.has(el)) {
				notes.push(`control ${c.sig}#${c.nth}: not in the converted region`);
				continue;
			}
			// A control inside another that does the same (a checkbox in a row a press anywhere on selects) is the outer's:
			// its clicks reach the outer one.
			const same = (o: (typeof located)[number]) => o.c.kind === c.kind && o.c.row === c.row && o.c.column === c.column;
			if (located.some((o) => o.el && o.el !== el && same(o) && [...walk(o.el)].includes(el))) continue;
			// A label inside it forwards its click to its input: the control sees both, whether or not the label was a control.
			const holdsLabel = [...walk(el)].some((x) => x !== el && x.tagName === 'label' && [...walk(x)].some((y) => y.tagName === 'input'));
			const rowIndex = bodyRows.findIndex((tr) => [...walk(tr)].includes(el));
			if (c.kind === 'row' && table.rowIds[rowIndex] !== c.row) {
				notes.push(`control ${c.sig}#${c.nth}: toggles row ${c.row} from row ${table.rowIds[rowIndex]}`);
				continue;
			}
			const action =
				c.kind === 'sort' ? `{ k: "sort", c: ${lit(c.column!)}, next: ${JSON.stringify(c.next)} }`
				: c.kind === 'filter' ? `{ k: "filter", c: ${lit(c.column!)}, v: (event.target as HTMLInputElement).value }`
				: c.kind === 'row' ? '{ k: "row", r: row.id }'
				: c.kind === 'page' ? (c.to ? `{ k: "page", to: ${lit(c.to)} }` : `{ k: "page", d: ${c.delta} }`)
				: `{ k: ${lit(c.kind)}, next: ${JSON.stringify(c.next)} }`;
			// A page-size select's choice (the select part's mmchoose, bubbling from its trigger) sets the page size.
			if (c.kind === 'pageSize') {
				const parent = el.parentNode as Tree | null;
				if (parent && isElement(parent)) add(parent, { extra: [`onMmchoose={(event) => { const n = (${JSON.stringify(c.sizes)} as Record<string, number>)[(event as CustomEvent<string>).detail]; if (n !== undefined) { ${act('{ k: "pageSize", n }')}; } }}`] });
				continue;
			}
			// A filter field shows its column's filter (a Reset clears it), as the old page's controlled input does.
			add(el, c.kind === 'filter' ? { omit: ['value'], extra: [`value={${v}.c[${lit(c.column!)}].f}`, `onInput={(event) => { ${act(action)}; }}`] } : { extra: [clickOf(el, holdsLabel, act(action)), ...checkboxKeys(el, act(action)), ...pressKeys(el, act(action))] });
			// Base UI's checkbox: the hidden input beside it (its label's target) uses it too and hands focus to it.
			const parent = el.parentNode as Tree | null;
			const siblings = parent && isElement(parent) ? kids(parent) : [];
			const input = siblings[siblings.indexOf(el) + 1];
			if (input?.tagName === 'input' && attr(input, 'aria-hidden') === 'true' && attr(input, 'type') === 'checkbox') add(input, { extra: [`onClick={() => { ${act(action)}; }}`, 'onFocus={(event) => focusControl(event)}'] });
		}

		// The rows: one template from the rows as emitted; what differs between them is each row's own value.
		const empty = snaps.find((s) => s.name === 'empty');
		const emptyBody = empty ? inTable(empty.root, bodyPath) : undefined;
		let rows: { binding: Binding | undefined } | undefined;
		const rowsBinding = () => (rows ??= { binding: emitRows() }).binding;
		this.rows.set(name, rowsBinding);
		this.lazy.set(tbody, rowsBinding);
		// Every row the table has: the page's own, then those only the every-row state showed.
		const every = snaps.find((s) => s.name === ALL_ROWS);
		const pageIds = table.rowIds.slice(0, bodyRows.length);
		const extra = every?.root && inTable(every.root, bodyPath) ? kids(inTable(every.root, bodyPath)!).flatMap((tr, k) => (every.rows[k] && !pageIds.includes(every.rows[k]!.id) ? [{ id: every.rows[k]!.id, tr }] : [])) : [];
		const emitRows = (): Binding | undefined => {
			const local: string[] = [];
			const all = [...bodyRows, ...extra.map((x) => x.tr)];
			const ids = [...pageIds, ...extra.map((x) => x.id)];
			const emitted = rowMarkups(all, bodyRows.length, this.bindings, (el) => this.emitter(el, local), this.emitHtml);
			const own = typeof emitted === 'string' ? emitted : rowStates(emitted, local);
			const template = typeof own === 'string' ? own : templateOf(own.rows);
			if (typeof template === 'string' || typeof own === 'string') {
				this.notes.push(`${route} table ${table.sig.slice(0, 40)}: its rows are not one template, ${template}`);
				return undefined;
			}
			// What a row's own control keeps is a value of the row after the template's, set through the table's state.
			const kept = template.values[0]!.length;
			ids.forEach((id, i) => (placed.values[id] = [...template.values[i]!, ...own.inits[i]!]));
			// A row's values are fields of its row in the view: a plain read of the row updates, a composite one would not.
			const slots = template.markup.replace(/\u0000(\d+)\u0000/g, (_, slot: string) => `row.c${slot}`);
			const markup = rowStateCode(slots, (k, value) => act(`{ k: "cell", r: row.id, c: ${kept + Number(k)}, v: ${value} }`), (k) => `row.c${kept + Number(k)}`);
			return { declare: [...declare, ...own.declare], children: `@for (const row of ${v}.rows; key row.id) { ${markup} }${emptyBody ? ` @empty { ${this.emitHtml(innerOf(emptyBody))} }` : ''}` };
		};

		for (const note of notes) this.notes.push(`${route} table ${table.sig.slice(0, 40)}: ${note}`);
		for (const [el, b] of bindings) this.bindings.set(el, mergeBindings(this.bindings.get(el), b)!);
		for (const el of inRegion) this.owner.set(el, name);
		this.placed.push(placed);
		return undefined;
	}

	/** A header cell of a hideable column: rendered only while its column is shown. */
	private removable(el: Tree, shownExpr: string): void {
		this.lazy.set(el, () => {
			if (this.emitting.has(el)) return undefined;
			this.emitting.add(el);
			const local: string[] = [];
			try {
				return { declare: local, replace: `@if (${shownExpr}) { ${this.emitter(el, local)} }` };
			} finally {
				this.emitting.delete(el);
			}
		});
	}

	/**
	 * The menu a table's visibility controls are in (a layer their trigger opens): each item binds what it showed with its
	 * column shown and hidden, and toggles its column. Undefined when the layer is no table's.
	 */
	layer(route: string, reveal: { readonly sig?: string; readonly nth?: number }, kept: readonly Tree[]): { readonly bind: (el: Tree) => Binding | undefined; readonly declare: readonly string[] } | undefined {
		const key = `${reveal.sig}#${reveal.nth ?? 0}`;
		const entry = this.menus.get(`${route}|${key}`);
		if (!entry) return undefined;
		const { placed, controls } = entry;
		const { name, spec } = placed;
		const v = `${name}v`;
		const declare = [`const ${name} = ${placed.shared}();`, `const ${v} = computed(() => ttView(${spec}, ${name}.s));`];
		if (controls.some((c) => c.kind === 'facet')) return this.facetLayer(placed, key, controls, kept, declare);
		const recorded = placed.table.snapshots.filter((s) => s.menus?.[key]).map((s) => ({ s, items: [...walk(kids(parseFragment(s.menus![key]!) as unknown as Tree)[0]!)].filter((el) => /^menuitem/.test(attr(el, 'role') ?? '')) }));
		const items = kept.flatMap((top) => [...walk(top)]).filter((el) => /^menuitem/.test(attr(el, 'role') ?? ''));
		// A layer's other nodes (focus guards beside the menu) are layers of their own.
		if (!items.length) return undefined;
		const bindings = new Map<Tree, Binding>();
		const add = (el: Tree, b: Binding) => bindings.set(el, mergeBindings(bindings.get(el), { declare, ...b })!);
		for (const c of controls) {
			const el = items[c.nth];
			if (!el || textContent(el).trim() !== c.sig.slice('item|'.length)) {
				this.notes.push(`${route} table menu item ${c.sig}: not in its layer`);
				continue;
			}
			if (c.kind === 'sort') {
				add(el, { extra: [`onClick={() => { ${name}.s = ttAct(${spec}, structuredClone(${name}.s), { k: "sort", c: ${lit(c.column!)}, next: ${JSON.stringify(c.next)} }); }}`] });
				continue;
			}
			const shownExpr = `${v}.c[${lit(c.column!)}].v`;
			const visit = (page: Tree, reads: readonly { el: Tree; shown: boolean }[]): void => {
				const props = reads.map((r) => propsOf(r.el));
				const candidates = [{ expr: shownExpr, keys: reads.map((r) => r.shown) }];
				const omit: string[] = [];
				const extra: string[] = [];
				for (const a of [...new Set(props.flatMap((p) => Object.keys(p.attrs)))]) {
					if (!/^[A-Za-z_][\w.-]*$/.test(a)) continue;
					const learned = learn(props.map((p) => p.attrs[a]), candidates);
					if (learned && learned !== 'static') {
						omit.push(a);
						extra.push(`${a}={${choose(learned.expr, learned.table, attributeValue(a))}}`);
					}
				}
				if (omit.length) add(page, { omit, extra });
				if (new Set(props.map((p) => p.shape)).size > 1) {
					const learned = learn(props.map((p) => p.inner), candidates);
					if (learned && learned !== 'static') add(page, { children: arms(learned.expr, learned.table, this.emitHtml) });
					return;
				}
				const own = kids(page);
				if (reads.every((r) => kids(r.el).length === own.length)) own.forEach((child, i) => visit(child, reads.map((r) => ({ el: kids(r.el)[i]!, shown: r.shown }))));
			};
			visit(el, recorded.flatMap(({ s, items: own }) => (own[c.nth] ? [{ el: own[c.nth]!, shown: s.columns[c.column!]?.visible !== false }] : [])));
			add(el, { extra: [`onClick={() => { ${name}.s = ttAct(${spec}, structuredClone(${name}.s), { k: "vis", c: ${lit(c.column!)} }); }}`] });
		}
		return bindings.size ? { bind: (el) => bindings.get(el), declare } : undefined;
	}

	/**
	 * A faceted filter's popover: each option toggles its value in its column's filter list and binds what it showed with
	 * the value chosen and not (its check) and its count; what the popover adds once a value is chosen (Clear filters) is
	 * an arm whose option clears the list.
	 */
	private facetLayer(placed: Placed, key: string, controls: readonly TableControl[], kept: readonly Tree[], declare: readonly string[]): { readonly bind: (el: Tree) => Binding | undefined; readonly declare: readonly string[] } | undefined {
		const { name, spec } = placed;
		const v = `${name}v`;
		const column = controls.find((c) => c.kind === 'facet')!.column!;
		const fs = `${v}.c[${lit(column)}].fs`;
		const act = (action: string) => `${name}.s = ttAct(${spec}, structuredClone(${name}.s), ${action})`;
		const bindings = new Map<Tree, Binding>();
		const add = (el: Tree, b: Binding) => bindings.set(el, mergeBindings(bindings.get(el), { declare, ...b })!);
		const isItem = (el: Tree) => attr(el, 'cmdk-item') !== undefined || attr(el, 'role') === 'option';
		const roots = kept.filter((x) => isElement(x));
		const items = roots.flatMap((top) => [...walk(top)]).filter(isItem);
		// A layer's other nodes (focus guards beside the popover) are layers of their own.
		if (!items.length) return undefined;
		const recorded = placed.table.snapshots.filter((s) => s.menus?.[key]).map((s) => {
			const root = kids(parseFragment(s.menus![key]!) as unknown as Tree)[0]!;
			return { s, root, items: [...walk(root)].filter(isItem), chosen: s.columns[column]?.chosen ?? [], facets: s.columns[column]?.facets ?? {} };
		});
		const unchosen = recorded.filter((r) => !r.chosen.length);
		for (const c of controls.filter((x) => x.kind === 'facet')) {
			const el = items[c.nth];
			if (!el || `option|${textContent(el).trim()}` !== c.sig) {
				this.notes.push(`table popover option ${c.sig}: not in its layer`);
				continue;
			}
			const value = JSON.stringify(c.value);
			const on = `${fs}.includes(${value})`;
			const reads = recorded.flatMap((r) => (r.items[c.nth] ? [{ el: r.items[c.nth]!, on: r.chosen.some((x) => JSON.stringify(x) === value), count: r.facets[String(c.value)] }] : []));
			const visit = (page: Tree, at: readonly { el: Tree; on: boolean; count: number | undefined }[]): void => {
				const props = at.map((r) => propsOf(r.el));
				const omit: string[] = [];
				const extra: string[] = [];
				for (const a of [...new Set(props.flatMap((p) => Object.keys(p.attrs)))]) {
					if (!/^[A-Za-z_][\w.-]*$/.test(a) || /^(id|aria-selected|data-selected)$/.test(a)) continue;
					const learned = learn(props.map((p) => p.attrs[a]), [{ expr: on, keys: at.map((r) => r.on) }]);
					if (learned && learned !== 'static') {
						omit.push(a);
						extra.push(`${a}={${choose(learned.expr, learned.table, attributeValue(a))}}`);
					}
				}
				if (omit.length) add(page, { omit, extra });
				// A count of the rows holding the value, among those the other columns' filters keep.
				if (!kids(page).length && props.every((p, k) => p.text.trim() !== '' && p.text.trim() === String(at[k]!.count))) {
					add(page, { children: `{${v}.c[${lit(column)}].u[${lit(String(c.value))}] ?? 0}` });
					return;
				}
				const own = kids(page);
				if (at.every((r) => kids(r.el).length === own.length)) own.forEach((child, i) => visit(child, at.map((r) => ({ ...r, el: kids(r.el)[i]! }))));
			};
			visit(el, reads);
			add(el, { extra: [`onClick={() => { ${act(`{ k: "facet", c: ${lit(column)}, v: ${value} }`)}; }}`] });
		}
		// What the popover adds once a value is chosen, in the place it adds it.
		const clears = controls.filter((c) => c.kind === 'facetClear');
		const chosenOnes = recorded.filter((r) => r.chosen.length);
		// Aligned child by child (tag and slot); what the converter renders hidden that the old page left out (cmdk's empty
		// state) is skipped, and what the state has beyond the layer is added before the next child it does have.
		const added = (page: Tree, rec: Tree): { parent: Tree; before: Tree | null; html: string }[] | undefined => {
			const a = kids(page);
			const b = kids(rec);
			const alike = (x: Tree, y: Tree) => x.tagName === y.tagName && attr(x, 'data-slot') === attr(y, 'data-slot');
			const out: { parent: Tree; before: Tree | null; html: string }[] = [];
			let i = 0;
			for (const child of b) {
				while (i < a.length && !alike(a[i]!, child) && attr(a[i]!, 'hidden') !== undefined) i++;
				if (i < a.length && alike(a[i]!, child)) {
					const inner = added(a[i]!, child);
					if (!inner) return undefined;
					out.push(...inner);
					i++;
				} else {
					const last = out.at(-1);
					if (last && last.parent === page && last.before === (a[i] ?? null)) out[out.length - 1] = { ...last, html: last.html + outer(child) };
					else out.push({ parent: page, before: a[i] ?? null, html: outer(child) });
				}
			}
			return a.slice(i).every((x) => attr(x, 'hidden') !== undefined) ? out : undefined;
		};
		// The popover's content, which is what was recorded: the layer may wrap it (a popper's positioning wrapper).
		const recRoot = chosenOnes[0]?.root ?? recorded[0]?.root;
		const base = recRoot ? roots.flatMap((top) => [...walk(top)]).find((el) => el.tagName === recRoot.tagName && attr(el, 'data-slot') === attr(recRoot, 'data-slot') && attr(el, 'role') === attr(recRoot, 'role')) : undefined;
		const extras = base && chosenOnes.length ? added(base, chosenOnes[0]!.root) : undefined;
		if (extras?.length && unchosen.every((r) => !added(base!, r.root)?.length) && chosenOnes.every((r) => JSON.stringify(added(base!, r.root)?.map((x) => x.html)) === JSON.stringify(extras.map((x) => x.html)))) {
			const MARK = 'data-mm-tt-facet-clear';
			for (const x of extras) {
				const fragment = parseFragment(x.html) as unknown as Tree;
				for (const el of walk(fragment)) if (isItem(el) && clears.some((c) => c.sig === `option|${textContent(el).trim()}`)) setAttr(el, MARK, '');
				const markup = this.emitHtml(innerOf(fragment)).replaceAll(`${MARK}=""`, `onClick={() => { ${act(`{ k: "facetClear", c: ${lit(column)} }`)}; }}`);
				add(x.parent, { inserts: [{ before: x.before, markup: `@if (${fs}.length > 0) { <>${markup}</> }` }] });
			}
		} else if (clears.length) this.notes.push(`table popover ${key}: what it adds once a value is chosen is not one arm`);
		return bindings.size ? { bind: (el) => bindings.get(el), declare } : undefined;
	}

	/** The module of every placed table's spec and row values, importing the table-core exports each registers. */
	specsModule(): string | undefined {
		const all = [...this.expected.values()].flat();
		if (!all.length) return undefined;
		const imports = new Set<string>();
		const specs = new Map<string, string>();
		const cells: string[] = [];
		for (const p of all) {
			cells.push(`export const ${p.cells}: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(p.values)};`);
			if (specs.has(p.spec)) continue;
			const t = p.table;
			const features = [...t.features.map((f) => (imports.add(f), f)), ...t.rowModels.map((m) => (imports.add(ROW_MODELS[m]!), `${m}: ${ROW_MODELS[m]}()`))];
			if (t.sortFns.length) features.push(`sortFns: { ${t.sortFns.map((f) => (imports.add(`sortFn_${f}`), `${f}: sortFn_${f}`)).join(', ')} }`);
			if (t.filterFns.length) features.push(`filterFns: { ${t.filterFns.map((f) => (imports.add(`filterFn_${f}`), `${f}: filterFn_${f}`)).join(', ')} }`);
			specs.set(p.spec, `export const ${p.spec}: TableSpec = { features: { ${features.join(', ')} }, data: ${JSON.stringify(t.data)}, rowIds: ${JSON.stringify(t.rowIds)}, columns: ${columnsCode(t.columns)}, options: ${JSON.stringify(t.options)} };`);
		}
		return `// Generated by markless-migrate convert: each TanStack table's data, columns and features as the old page gave them; change the converter, not this file.\nimport { ${[...imports].sort().join(', ')} } from '@tanstack/table-core';\nimport type { TableSpec } from './tanstack-table.ts';\n\n${[...specs.values()].join('\n')}\n${cells.join('\n')}\n`;
	}

	/** The module of each table's state, shared by its page and the menus its controls are in. */
	sharedModule(partsPath: string): string | undefined {
		if (!this.expected.size) return undefined;
		const lines = [...this.expected.values()].flat().map((p) => `export const ${p.shared} = shared(() => {\n\tconst table = state<{ s: TableState }>({ s: ${JSON.stringify(p.table.state)} });\n\treturn table;\n});`);
		return `// Generated by markless-migrate convert: each TanStack table's state, shared by its page and its menus; change the converter, not this file.\nimport { shared, state } from '@markless/core';\nimport type { TableState } from '${partsPath}/tanstack-table.ts';\n\n${lines.join('\n')}\n`;
	}
}

// An element's own shape (its tag and attribute names), and what it holds by shape: its children's own shapes and texts.
const ownShape = (el: Tree) => `${el.tagName}[${el.attrs.map((a) => a.name).sort().join(',')}]`;
const holds = (el: Tree) => childrenOf(el).map((n) => (isElement(n) ? ownShape(n) : isText(n) && n.value.trim() ? '#t' : '')).filter(Boolean).join('|');

/** Where rows hold differently shaped content (a status icon per status), and which rows hold each shape. */
function variantsOf(rows: readonly Tree[]): { readonly path: number[]; readonly groups: number[][] }[] {
	const out: { path: number[]; groups: number[][] }[] = [];
	const visit = (nodes: readonly Tree[], path: number[]): void => {
		const shapes = nodes.map(holds);
		if (shapes.some((h) => h !== shapes[0])) {
			const groups = new Map<string, number[]>();
			shapes.forEach((h, r) => (groups.get(h) ?? groups.set(h, []).get(h)!).push(r));
			out.push({ path, groups: [...groups.values()] });
			return;
		}
		kids(nodes[0]!).forEach((_, i) => visit(nodes.map((n) => kids(n)[i]!), [...path, i]));
	};
	visit(rows, []);
	return out;
}

/** Writes `from`'s attribute values and texts on `to`, alike in shape, except inside `skip`; the undo, or undefined when they differ. */
function transplant(to: Tree, from: Tree, skip: ReadonlySet<Tree> = new Set()): (() => void) | undefined {
	const writes: [target: { value: string }, value: string][] = [];
	const visit = (a: Tree, b: Tree): boolean => {
		if (ownShape(a) !== ownShape(b)) return false;
		for (const x of a.attrs) {
			const value = attr(b, x.name)!;
			if (value !== x.value) writes.push([x, value]);
		}
		if (skip.has(a)) return true;
		const ak = childrenOf(a);
		const bk = childrenOf(b);
		if (ak.length !== bk.length) return false;
		return ak.every((n, i) => {
			const m = bk[i]!;
			if (isText(n) && isText(m)) {
				if (n.value !== m.value) writes.push([n, m.value]);
				return true;
			}
			return isElement(n) && isElement(m) ? visit(n, m) : n.nodeName === m.nodeName;
		});
	};
	if (!visit(to, from)) return undefined;
	const old = writes.map(([t]) => t.value);
	for (const [t, v] of writes) t.value = v;
	return () => writes.forEach(([t], i) => (t.value = old[i]!));
}

/**
 * The state each row's own controls keep (a select's shown value, a state() per row on the page) as values of their
 * rows, which the table's state can change: in each row's markup, the k-th such state it reads is `\u0005k\u0005`, and
 * `inits[row][k]` its first value. A string when a row's states differ from another's in kind.
 */
function rowStates(rows: readonly string[], declared: readonly string[]): { readonly rows: string[]; readonly inits: string[][]; readonly declare: string[] } | string {
	const states = new Map<string, string>();
	for (const line of declared) {
		const m = /^let (\w+) = state\((".*")\);$/.exec(line);
		if (m) states.set(m[1]!, JSON.parse(m[2]!) as string);
	}
	if (!states.size) return { rows: [...rows], inits: rows.map(() => []), declare: [...declared] };
	const name = new RegExp(`\\b(${[...states.keys()].join('|')})\\b`, 'g');
	const inits: string[][] = [];
	const out = rows.map((markup, r) => {
		const order: string[] = [];
		const named = markup.replace(name, (n) => {
			if (!order.includes(n)) order.push(n);
			return `\u0005${order.indexOf(n)}\u0005`;
		});
		inits[r] = order.map((n) => states.get(n)!);
		return named;
	});
	if (inits.some((i) => i.length !== inits[0]!.length)) return 'their rows keep different states';
	return { rows: out, inits, declare: declared.filter((line) => !states.has(/^let (\w+) = state\(/.exec(line)?.[1] ?? '')) };
}

/** A row's kept state in a template: each assignment to it a call that writes it (`write`), each other mention a read. */
function rowStateCode(markup: string, write: (k: string, value: string) => string, read: (k: string) => string): string {
	let out = '';
	let from = 0;
	const re = /\u0005(\d+)\u0005/g;
	for (let m = re.exec(markup); m; m = re.exec(markup)) {
		out += markup.slice(from, m.index);
		const end = m.index + m[0].length;
		const assign = /^\s*=(?!=)\s*/.exec(markup.slice(end));
		if (!assign) {
			out += read(m[1]!);
			from = end;
			continue;
		}
		const start = end + assign[0].length;
		let depth = 0;
		let j = start;
		for (; j < markup.length; j++) {
			const c = markup[j]!;
			if ('([{'.includes(c)) depth++;
			else if (')]}'.includes(c)) {
				if (depth === 0) break;
				depth--;
			} else if ((c === ',' || c === ';') && depth === 0) break;
		}
		out += write(m[1]!, markup.slice(start, j));
		from = j;
		re.lastIndex = j;
	}
	return out + markup.slice(from);
}

/**
 * Each row's markup with every shape its places hold across the rows as an arm on the row's own key, so every row is the
 * same template: a page row as it is emitted, a row only another state showed written on the page's first row.
 */
function rowMarkups(rows: readonly Tree[], pageCount: number, bindings: Map<Tree, Binding>, emit: (el: Tree) => string, emitHtml: (html: string) => string): string[] | string {
	const variants = variantsOf(rows);
	const childrenMarkup = (el: Tree) => childrenOf(el).map((n) => (isElement(n) ? emit(n) : isText(n) ? emitHtml(n.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : '')).join('');
	const out: string[] = [];
	for (let r = 0; r < rows.length; r++) {
		const host = r < pageCount ? rows[r]! : rows[0]!;
		const undo: (() => void)[] = [];
		try {
			const places = variants.map((v) => at(host, v.path)!);
			if (r >= pageCount) {
				const done = transplant(host, rows[r]!, new Set(places));
				if (!done) return `row ${r} has a shape no page row has`;
				undo.push(done);
			}
			for (const [k, v] of variants.entries()) {
				const mine = v.groups.findIndex((g) => g.includes(r));
				const arms = v.groups.map((g, gi) => {
					const page = g.find((x) => x < pageCount);
					let content: string;
					if (page === undefined) content = emitHtml(innerOf(at(rows[gi === mine ? r : g[0]!]!, v.path)!));
					else {
						const el = at(rows[gi === mine && r < pageCount ? r : page]!, v.path)!;
						if (gi === mine && r >= pageCount) {
							const done = transplant(el, at(rows[r]!, v.path)!);
							if (!done) return undefined;
							undo.push(done);
						}
						content = childrenMarkup(el);
					}
					return `@if (\u0003${mine}\u0003 === ${JSON.stringify(String(gi))}) { <>${content}</> }`;
				});
				if (arms.some((a) => a === undefined)) return `row ${r} holds a shape no page row holds alike`;
				const place = places[k]!;
				const own = bindings.get(place);
				if (own?.children !== undefined || own?.replace !== undefined) return 'a place whose shape differs between rows already changes with the table';
				bindings.set(place, mergeBindings(own, { children: arms.join('') })!);
				undo.push(() => (own ? bindings.set(place, own) : bindings.delete(place)));
			}
			out.push(emit(host));
		} finally {
			undo.reverse().forEach((u) => u());
		}
	}
	return out;
}

/**
 * A control's click. A label around its input is clicked twice per use (its own click, then the one it forwards to the
 * input): only the input's counts, in the label and in a control holding it.
 */
function clickOf(el: Tree, holdsLabel: boolean, use: string): string {
	if (el.tagName === 'label' && [...walk(el)].some((x) => x.tagName === 'input')) return `onClick={(event) => { if ((event.target as Element).tagName !== 'INPUT') return; ${use}; }}`;
	if (holdsLabel) return `onClick={(event) => { const at = event.target as Element; if (at.closest('label') && at.tagName !== 'INPUT') return; ${use}; }}`;
	return `onClick={() => { ${use}; }}`;
}

/**
 * React Aria's rows and sortable column headers are pressed from the keyboard too (usePress): a row on Space, as
 * RacTablePlan's rows are, a header on Enter or Space as the key comes up. What a key cancels is decided before the
 * handler loads, from the key alone.
 */
function pressKeys(el: Tree, use: string): string[] {
	if (attr(el, 'data-rac') === undefined && attr(el, 'data-react-aria-pressable') === undefined) return [];
	const role = attr(el, 'role');
	if (role === 'row') return [`onKeyDown={(event) => { if (event.key === ' ') { event.preventDefault(); ${use}; } }}`];
	if (role === 'columnheader') return [`onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.preventDefault(); }}`, `onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') { ${use}; } }}`];
	return [];
}

// Radix's Checkbox is a button Enter does not toggle; Base UI's is a span Space toggles as it comes up, Enter submitting its form.
function checkboxKeys(el: Tree, use: string): string[] {
	if (attr(el, 'role') !== 'checkbox') return [];
	if (el.tagName === 'button') return [`onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}`];
	return [`onKeyDown={(event) => { if (event.key === ' ') event.preventDefault(); else if (event.key === 'Enter') { event.preventDefault(); submitForm(event); } }}`, `onKeyUp={(event) => { if (event.key === ' ') { ${use}; } }}`];
}

interface Token {
	readonly kind: 'code' | 'attr' | 'expr' | 'text' | 'key';
	readonly text: string;
	readonly value: string;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (t: string) => t.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m)));

/** tsrx markup as tokens: `="value"` attributes, whole `{"value"}` expressions, text between tags, and the code between them. */
function tokenize(markup: string): Token[] {
	const out: Token[] = [];
	const re = /="((?:[^"\\]|\\.)*)"|\{("(?:[^"\\]|\\.)*")\}|>([^<>{}@]+)(?=<)|\u0003([^\u0003]*)\u0003/g;
	let last = 0;
	const code = (to: number) => {
		if (to > last) out.push({ kind: 'code', text: markup.slice(last, to), value: '' });
	};
	for (let m = re.exec(markup); m; m = re.exec(markup)) {
		if (m[4] !== undefined) {
			code(m.index);
			out.push({ kind: 'key', text: m[0], value: m[4] });
		} else if (m[3] !== undefined) {
			code(m.index + 1);
			out.push({ kind: 'text', text: m[3], value: decode(m[3]) });
		} else {
			code(m.index);
			out.push(m[1] !== undefined ? { kind: 'attr', text: m[0], value: decode(m[1]) } : { kind: 'expr', text: m[0], value: JSON.parse(m[2]!) as string });
		}
		last = m.index + m[0].length;
	}
	code(markup.length);
	return out;
}

/**
 * The rows as one template: their markup token by token, a slot (`\0n\0`) where a quoted value, a literal expression or a
 * text differs between rows, each row filling it with its own. Why not, when the rows differ in anything else.
 */
export function templateOf(rows: readonly string[]): { readonly markup: string; readonly values: string[][] } | string {
	const tokens = rows.map(tokenize);
	if (tokens.some((t) => t.length !== tokens[0]!.length)) return 'their markup has different shapes';
	const values: string[][] = rows.map(() => []);
	// A row's key is read by every arm it decides: one slot each.
	const keys = new Map<string, number>();
	let markup = '';
	for (let i = 0; i < tokens[0]!.length; i++) {
		const all = tokens.map((t) => t[i]!);
		const first = all[0]!;
		if (all.every((t) => t.text === first.text)) {
			markup += first.kind === 'key' ? JSON.stringify(first.value) : first.text;
			continue;
		}
		if (all.some((t) => t.kind !== first.kind || t.kind === 'code')) return `they differ in ${JSON.stringify(first.text.slice(0, 80))}`;
		const seen = first.kind === 'key' ? keys.get(JSON.stringify(all.map((t) => t.value))) : undefined;
		if (seen !== undefined) {
			markup += `\u0000${seen}\u0000`;
			continue;
		}
		const slot = values[0]!.length;
		if (first.kind === 'key') keys.set(JSON.stringify(all.map((t) => t.value)), slot);
		all.forEach((t, r) => values[r]!.push(t.value));
		markup += first.kind === 'attr' ? `={\u0000${slot}\u0000}` : first.kind === 'key' ? `\u0000${slot}\u0000` : `{\u0000${slot}\u0000}`;
	}
	return { markup, values };
}

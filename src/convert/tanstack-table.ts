import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { parseFragment } from 'parse5';
import { attr, childrenOf, elementChildren, inner as innerOf, isElement, isText, removeAttr, setAttr, textContent, walk, type Element as Tree } from './dom.ts';
import { LATE_FONT } from '../../parts/late-fonts.ts';
import { emitChildren, lit, mergeBindings, type Binding } from './tsrx.ts';

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
	 * `visibility`: toggles the column's visibility (a menu item, `menu` naming its trigger); `page`: moves `delta` pages.
	 */
	readonly kind: 'sort' | 'filter' | 'row' | 'select' | 'visibility' | 'page';
	readonly column?: string;
	readonly row?: string;
	readonly next?: Readonly<Record<string, string>>;
	readonly delta?: number;
	readonly menu?: { readonly sig: string; readonly nth: number };
}

/** The table and its region in one state: every quantity a binding may follow, and the region's markup. */
export interface TableSnapshot {
	readonly name: string;
	readonly q: Readonly<Record<string, string | number | boolean>>;
	readonly columns: Readonly<Record<string, { readonly sorted: string; readonly visible: boolean }>>;
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

const VERSION = 'tables-5';
const fileFor = (dir: string, route: string) => join(dir, `${createHash('sha256').update(`${VERSION}|${route}`).digest('hex').slice(0, 16)}.json`);

/** Whether a settled page may hold a TanStack table: one with a table element. */
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
		canNext: r(() => t.getCanNextPage() as boolean, false),
		pageSel: page,
		allSel: all,
	};
	const columns: Record<string, { sorted: string; visible: boolean }> = {};
	for (const c of t.getAllLeafColumns() as Tbl[]) columns[c.id as string] = { sorted: r(() => (c.getIsSorted() as string | false) || '', ''), visible: r(() => c.getIsVisible() as boolean, true) };
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
function controlsOf(i: number): { sig: string; nth: number; text: boolean; disabled: boolean; menu: boolean }[] {
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
	return found.map((el) => ({ sig: sigOf(el), nth: order.get(el) ?? 0, text: el.matches('input, textarea'), disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled'), menu: el.getAttribute('aria-haspopup') === 'menu' || el.getAttribute('aria-haspopup') === 'true' }));
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
	for (let k = 0; k < 3 && (await page.evaluate(() => Boolean(document.querySelector('[role="menu"]')))); k++) {
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
	const size = Math.max(2, Math.floor(spec.rowIds.length / 3));
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
		if (c.disabled && middle) await set(page, i, middle);
		else if (c.disabled) continue;
		let before = await stateOf(page, i);
		if (!(await click(page, k))) {
			// What a use before left over the page (a menu's underlay that outlived Escape) goes with a fresh load.
			await reload(page);
			if (c.disabled && middle) await set(page, i, middle);
			await page.evaluate(controlsOf, i);
			before = await stateOf(page, i);
			if (!(await click(page, k))) {
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
				await click(page, k);
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
			const delta = ((after.pagination as { pageIndex: number }).pageIndex) - ((before.pagination as { pageIndex: number }).pageIndex);
			if (delta) out.push({ sig: c.sig, nth: c.nth, kind: 'page', delta });
		} else if (keys.length) log(`  table control ${c.sig}#${c.nth}: changed ${keys.join(', ')}, which is not ported`);
		await closeMenus(page);
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
	for (const c of controls.filter((x) => x.kind === 'sort')) for (const dir of ['asc', 'desc']) states.push([`sort:${c.column}:${dir}`, { sorting: [{ id: c.column!, desc: dir === 'desc' }] }]);
	if (spec.features.includes('rowPaginationFeature') && ids.length > 2) {
		const size = Math.max(1, Math.floor(ids.length / 3));
		const count = Math.ceil(ids.length / size);
		states.push(['page:first', { pagination: { pageIndex: 0, pageSize: size } }], ['page:last', { pagination: { pageIndex: count - 1, pageSize: size }, rowSelection: { [ids[0]!]: true } }]);
		selected.set('page:last', ids.slice(0, 1));
	}
	const hideable = spec.columns.filter((c) => c.def.enableHiding !== false).map((c) => c.id);
	if (spec.features.includes('columnVisibilityFeature') && hideable.length) states.push(['hidden', { columnVisibility: Object.fromEntries(hideable.map((id) => [id, false])) }]);
	const menus = [...new Map(controls.filter((c) => c.menu).map((c) => [`${c.menu!.sig}#${c.menu!.nth}`, c.menu!])).entries()];
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
const STATES = ['canPrev', 'canNext', 'pageSel', 'allSel', 'empty'];
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
			for (const c of table.controls.filter((x) => x.kind === 'visibility' && x.menu)) {
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
		const region = locate(table.region.sig, table.region.nth);
		const tableEl = locate(table.sig, table.nth);
		if (!region || !tableEl || !pathIn(region, tableEl)) return 'its region is not on the converted page';
		const snaps = table.snapshots.map((s) => ({ ...s, root: kids(parseFragment(s.html) as unknown as Tree)[0] }));
		const initial = snaps.find((s) => s.name === 'initial');
		if (!initial?.root) return 'no initial state was recorded';
		const differs = mismatch(region, initial.root, region.tagName);
		if (differs) return `its markup differs from the old page's (${differs})`;
		const tablePath = pathIn(region, tableEl)!;
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
		const shown = snaps.filter((s) => s.name !== 'hidden' && s.root);
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
		 * Binds what an element's markup followed over the states it was read in: an attribute, its text (each number in it
		 * read from the view) or, where its children change shape, an arm per value; then its children, unless `shallow`.
		 */
		const learnElement = (el: Tree, reads: readonly Read[], exprs: readonly string[], label: string, shallow = false, inRow = false): void => {
			if (!reads.length) return;
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
		const outside = (el: Tree, path: number[]): void => {
			if (el === thead || el === tbody) return;
			const reads = shown.flatMap((s) => {
				const r = at(s.root, path);
				return r && r.tagName === el.tagName ? [{ el: r, keys: tableKeys(s) }] : [];
			});
			if (![...walk(el)].includes(thead)) return learnElement(el, reads, tableExprs, `${el.tagName} ${path.join('/')}`);
			learnElement(el, reads, tableExprs, `${el.tagName} ${path.join('/')}`, true);
			kids(el).forEach((child, i) => outside(child, [...path, i]));
		};
		outside(region, []);

		// A hidden column's header leaves as on the old page; its cells are hidden, not taken out: a keyed row holding a
		// branch could not be built for a row that comes back (a filter cleared), so nothing in a row is a branch.
		const hideable = (id: string) => table.features.includes('columnVisibilityFeature') && table.columns.find((c) => c.id === id)!.def.enableHiding !== false;
		// The head: each column's cell, read with the column's direction first.
		const headPath = pathIn(region, headRows[0]!)!;
		heads.forEach((th, i) => {
			const id = visible[i]!;
			const reads = shown.flatMap((s) => (at(s.root, [...headPath, i]) ? [{ el: at(s.root, [...headPath, i])!, keys: [s.columns[id]?.sorted ?? '', ...tableKeys(s)] }] : []));
			learnElement(th, reads, [`${v}.c[${lit(id)}].s`, ...tableExprs], `head ${id}`);
			if (hideable(id)) this.removable(th, `${v}.c[${lit(id)}].v`);
		});

		// The body: each row read in every state that shows it, with whether it is selected first.
		const bodyPath = pathIn(region, tbody)!;
		bodyRows.forEach((tr, index) => {
			const id = table.rowIds[index]!;
			const reads = shown.flatMap((s) => {
				const place = s.rows.findIndex((r) => r.id === id);
				const row = place >= 0 ? kids(at(s.root, bodyPath) ?? tr)[place] : undefined;
				return row ? [{ el: row, keys: [s.rows[place]!.sel, ...tableKeys(s)] }] : [];
			});
			learnElement(tr, reads, ['row.sel', ...tableExprs], `row ${id}`, false, true);
			kids(tr).forEach((td, i) => {
				if (hideable(visible[i]!)) add(td, { extra: [`hidden={!${v}.c[${lit(visible[i]!)}].v}`] });
			});
		});

		// The controls: each calls ttAct as its use did on the old page.
		const inRegion = new Set(walk(region));
		const located = table.controls.filter((c) => c.kind !== 'visibility').map((c) => ({ c, el: locate(c.sig, c.nth) }));
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
				: c.kind === 'page' ? `{ k: "page", d: ${c.delta} }`
				: `{ k: ${lit(c.kind)}, next: ${JSON.stringify(c.next)} }`;
			add(el, { extra: c.kind === 'filter' ? [`onInput={(event) => { ${act(action)}; }}`] : [clickOf(el, holdsLabel, act(action)), ...checkboxKeys(el, act(action)), ...pressKeys(el, act(action))] });
			// Base UI's checkbox: the hidden input beside it (its label's target) uses it too and hands focus to it.
			const parent = el.parentNode as Tree | null;
			const siblings = parent && isElement(parent) ? kids(parent) : [];
			const input = siblings[siblings.indexOf(el) + 1];
			if (input?.tagName === 'input' && attr(input, 'aria-hidden') === 'true' && attr(input, 'type') === 'checkbox') add(input, { extra: [`onClick={() => { ${act(action)}; }}`, 'onFocus={(event) => focusControl(event)}'] });
		}

		// The rows: one template from the rows as emitted; what differs between them is each row's own value.
		const empty = snaps.find((s) => s.name === 'empty');
		const emptyBody = empty ? at(empty.root, bodyPath) : undefined;
		let rows: { binding: Binding | undefined } | undefined;
		const rowsBinding = () => (rows ??= { binding: emitRows() }).binding;
		this.rows.set(name, rowsBinding);
		this.lazy.set(tbody, rowsBinding);
		const emitRows = (): Binding | undefined => {
			const local: string[] = [];
			const template = templateOf(bodyRows.map((tr) => this.emitter(tr, local)));
			if (typeof template === 'string') {
				this.notes.push(`${route} table ${table.sig.slice(0, 40)}: its rows are not one template, ${template}`);
				return undefined;
			}
			table.rowIds.forEach((id, i) => (placed.values[id] = template.values[i]!));
			// A row's values are fields of its row in the view: a plain read of the row updates, a composite one would not.
			const markup = template.markup.replace(/\u0000(\d+)\u0000/g, (_, slot: string) => `row.c${slot}`);
			return { declare: [...declare, ...local], children: `@for (const row of ${v}.rows; key row.id) { ${markup} }${emptyBody ? ` @empty { ${this.emitHtml(innerOf(emptyBody))} }` : ''}` };
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
			specs.set(p.spec, `export const ${p.spec}: TableSpec = { features: { ${features.join(', ')} }, data: ${JSON.stringify(t.data)}, rowIds: ${JSON.stringify(t.rowIds)}, columns: ${JSON.stringify(t.columns)}, options: ${JSON.stringify(t.options)} };`);
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
	readonly kind: 'code' | 'attr' | 'expr' | 'text';
	readonly text: string;
	readonly value: string;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (t: string) => t.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m)));

/** tsrx markup as tokens: `="value"` attributes, whole `{"value"}` expressions, text between tags, and the code between them. */
function tokenize(markup: string): Token[] {
	const out: Token[] = [];
	const re = /="((?:[^"\\]|\\.)*)"|\{("(?:[^"\\]|\\.)*")\}|>([^<>{}@]+)(?=<)/g;
	let last = 0;
	const code = (to: number) => {
		if (to > last) out.push({ kind: 'code', text: markup.slice(last, to), value: '' });
	};
	for (let m = re.exec(markup); m; m = re.exec(markup)) {
		if (m[3] !== undefined) {
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
	let markup = '';
	for (let i = 0; i < tokens[0]!.length; i++) {
		const all = tokens.map((t) => t[i]!);
		const first = all[0]!;
		if (all.every((t) => t.text === first.text)) {
			markup += first.text;
			continue;
		}
		if (all.some((t) => t.kind !== first.kind || t.kind === 'code')) return `they differ in ${JSON.stringify(first.text.slice(0, 80))}`;
		const slot = values[0]!.length;
		all.forEach((t, r) => values[r]!.push(t.value));
		markup += first.kind === 'attr' ? `={\u0000${slot}\u0000}` : `{\u0000${slot}\u0000}`;
	}
	return { markup, values };
}

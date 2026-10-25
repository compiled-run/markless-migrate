import { constructTable, functionalUpdate } from '@tanstack/table-core';

// TanStack Table's own engine (@tanstack/table-core) over Markless state: the table state lives in a state() the
// converter's TablePlan declares, ttView derives what the page shows from it, and ttAct applies a control's use as the
// old page's handler called the table's API. One table instance per table, kept like useTable keeps its own, so the row
// models' memos and their resets (a sort or filter going back to the first page) run as they did on the old page.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type TableState = Readonly<Record<string, Json>>;

/** A table as the converter read it from the old page: its data, columns, registered features and options. */
export interface TableSpec {
	readonly features: Readonly<Record<string, unknown>>;
	readonly data: readonly Readonly<Record<string, Json>>[];
	readonly rowIds: readonly string[];
	readonly columns: readonly { readonly id: string; readonly accessor: boolean; readonly def: Readonly<Record<string, Json>> }[];
	readonly options: Readonly<Record<string, Json>>;
}

export type Selection = 'none' | 'some' | 'all';

export interface TableView {
	/** The page's rows, in order, each with the values its row shows (`c0`, `c1`...). */
	readonly rows: readonly ({ readonly id: string; readonly sel: boolean } & Readonly<Record<`c${number}`, string>>)[];
	readonly q: {
		readonly filteredSelected: number;
		readonly selected: number;
		readonly filtered: number;
		readonly rows: number;
		readonly pageRows: number;
		readonly pageNumber: number;
		readonly pageCount: number;
		readonly pageIndex: number;
		readonly canPrev: boolean;
		readonly canNext: boolean;
		readonly pageSel: Selection;
		readonly allSel: Selection;
		/** Whether the page shows no row. */
		readonly empty: boolean;
	};
	/** Each column's sort direction ('' when unsorted) and whether it is shown. */
	readonly c: Readonly<Record<string, { readonly s: string; readonly v: boolean }>>;
}

export type TableAction =
	| { readonly k: 'sort'; readonly c: string; readonly next: Readonly<Record<string, string>> }
	| { readonly k: 'filter'; readonly c: string; readonly v: string }
	| { readonly k: 'row'; readonly r: string }
	/** Selects or clears the page's rows or every row (`pageOn`, `allOn`, `pageOff`, `allOff`), by how many of the page's are. */
	| { readonly k: 'select'; readonly next: Readonly<Record<string, string>> }
	| { readonly k: 'vis'; readonly c: string }
	| { readonly k: 'page'; readonly d: number };

// No subscriptions: Markless re-derives the view when the state changes, so atoms only hold values.
const REACTIVITY = {
	createOptionsStore: false,
	wrapExternalAtoms: false,
	batch: (fn: () => void) => fn(),
	schedule: (fn: () => void) => fn(),
	untrack: <T>(fn: () => T) => fn(),
	addSubscription: () => {},
	unmount: () => {},
	createReadonlyAtom: <T>(fn: () => T) => ({ get: fn, subscribe: () => ({ unsubscribe() {} }) }),
	createWritableAtom: <T>(value: T) => {
		let current = value;
		return {
			get: () => current,
			set: (next: T | ((old: T) => T)) => {
				current = typeof next === 'function' ? (next as (old: T) => T)(current) : next;
			},
			subscribe: () => ({ unsubscribe() {} }),
		};
	},
};

type Table = Record<string, any>;
interface Instance {
	readonly table: Table;
	/** What the table's change handlers were last given, state key by state key. */
	pending: Record<string, Json>;
	state: TableState;
}
const instances = new WeakMap<TableSpec, Instance>();

const CHANGES = ['sorting', 'columnFilters', 'columnVisibility', 'rowSelection', 'pagination', 'globalFilter', 'columnOrder', 'columnPinning', 'rowPinning', 'expanded', 'grouping', 'columnSizing'];

function instanceOf(spec: TableSpec, state: TableState): Instance {
	let own = instances.get(spec);
	if (!own) {
		const columns = spec.columns.map((c) => ({ ...c.def, id: c.id, ...(c.accessor ? { accessorFn: (row: Readonly<Record<string, Json>>) => row[c.id] } : {}) }));
		const handlers: Record<string, (updater: unknown) => void> = {};
		const box: Instance = { table: undefined as unknown as Table, pending: {}, state };
		for (const key of CHANGES)
			handlers[`on${key[0]!.toUpperCase()}${key.slice(1)}Change`] = (updater) => {
				box.pending[key] = functionalUpdate(updater as never, (box.pending[key] ?? box.state[key]) as never) as Json;
			};
		const table = constructTable({
			...spec.options,
			features: { ...spec.features, coreReactivityFeature: REACTIVITY },
			data: spec.data as never,
			columns: columns as never,
			getRowId: (_row: unknown, index: number) => spec.rowIds[index] ?? String(index),
			state: state as never,
			...handlers,
		} as never) as Table;
		(box as { table: Table }).table = table;
		own = box;
		instances.set(spec, own);
	}
	if (own.state !== state) {
		own.state = state;
		own.table.setOptions((old: Record<string, unknown>) => ({ ...old, state }));
	}
	return own;
}

const selection = (all: boolean, some: boolean): Selection => (all ? 'all' : some ? 'some' : 'none');

const views = new WeakMap<TableSpec, { state: TableState; cells?: Cells; view: TableView }>();
type Cells = Readonly<Record<string, readonly string[]>>;

/** What the page shows of the table in `state`; `cells`, each row's values by its id, go on its rows. */
export function ttView(spec: TableSpec, state: TableState, cells?: Cells): TableView {
	const last = views.get(spec);
	if (last?.state === state && last.cells === cells) return last.view;
	const own = instanceOf(spec, state);
	const t = own.table;
	const rows = t.getRowModel().rows as Table[];
	// What reading the row models asked to change (a page reset) is ttAct's to apply, not the view's.
	own.pending = {};
	const pagination = state.pagination as { pageIndex?: number } | undefined;
	const has = (name: string) => typeof t[name] === 'function';
	const view: TableView = {
		rows: rows.map((r) => ({ ...Object.fromEntries((cells?.[r.id as string] ?? []).map((value, i) => [`c${i}`, value])), id: r.id as string, sel: has('getSelectedRowModel') ? (r.getIsSelected() as boolean) : false })),
		q: {
			filteredSelected: has('getFilteredSelectedRowModel') ? t.getFilteredSelectedRowModel().rows.length : 0,
			selected: has('getSelectedRowModel') ? t.getSelectedRowModel().rows.length : 0,
			filtered: has('getFilteredRowModel') ? t.getFilteredRowModel().rows.length : rows.length,
			rows: t.getCoreRowModel().rows.length,
			pageRows: rows.length,
			pageNumber: (pagination?.pageIndex ?? 0) + 1,
			pageCount: has('getPageCount') ? t.getPageCount() : 1,
			pageIndex: pagination?.pageIndex ?? 0,
			canPrev: has('getCanPreviousPage') ? t.getCanPreviousPage() : false,
			canNext: has('getCanNextPage') ? t.getCanNextPage() : false,
			pageSel: has('getIsAllPageRowsSelected') ? selection(t.getIsAllPageRowsSelected(), t.getIsSomePageRowsSelected()) : 'none',
			allSel: has('getIsAllRowsSelected') ? selection(t.getIsAllRowsSelected(), t.getIsSomeRowsSelected()) : 'none',
			empty: rows.length === 0,
		},
		c: Object.fromEntries((t.getAllLeafColumns() as Table[]).map((c) => [c.id as string, { s: (typeof c.getIsSorted === 'function' && (c.getIsSorted() as string | false)) || '', v: typeof c.getIsVisible === 'function' ? (c.getIsVisible() as boolean) : true }])),
	};
	views.set(spec, { state, ...(cells ? { cells } : {}), view });
	return view;
}

/** The state after a control's use, as the old page's handler changed it through the table's API. */
export function ttAct(spec: TableSpec, state: TableState, action: TableAction): TableState {
	const own = instanceOf(spec, state);
	const t = own.table;
	t.getRowModel();
	own.pending = {};
	switch (action.k) {
		case 'sort': {
			const column = t.getColumn(action.c);
			const to = action.next[(column.getIsSorted() as string | false) || ''] ?? '';
			if (to) column.toggleSorting(to === 'desc');
			else column.clearSorting();
			break;
		}
		case 'filter':
			t.getColumn(action.c).setFilterValue(action.v);
			break;
		case 'row':
			t.getRow(action.r).toggleSelected();
			break;
		case 'select': {
			const to = action.next[selection(t.getIsAllPageRowsSelected(), t.getIsSomePageRowsSelected())];
			if (to === 'pageOn' || to === 'pageOff') t.toggleAllPageRowsSelected(to === 'pageOn');
			else if (to === 'allOn') t.toggleAllRowsSelected(true);
			else if (to === 'allOff') t.setRowSelection({});
			break;
		}
		case 'vis':
			t.getColumn(action.c).toggleVisibility();
			break;
		case 'page':
			if (action.d === -1) t.previousPage();
			else if (action.d === 1) t.nextPage();
			else t.setPageIndex((old: number) => old + action.d);
			break;
	}
	let next: TableState = { ...state, ...own.pending };
	// The render after the change: the row models' resets (back to the first page) are part of the same use.
	instanceOf(spec, next);
	own.pending = {};
	t.getRowModel();
	if (Object.keys(own.pending).length) next = { ...next, ...own.pending };
	own.pending = {};
	return next;
}

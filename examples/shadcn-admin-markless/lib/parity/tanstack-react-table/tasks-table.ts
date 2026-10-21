// The tasks table's model, as features/tasks/components/tasks-table.tsx asks TanStack Table for it: the same columns,
// global filter, faceted column filters, sorting, pagination and row selection, computed by @tanstack/table-core
// (used as-is) from plain values the page keeps in state, and the URL state use-table-url-state writes.
import {
	type ColumnDef,
	type ColumnFiltersState,
	createTable,
	getCoreRowModel,
	getFacetedRowModel,
	getFacetedUniqueValues,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type TableOptionsResolved,
	type VisibilityState,
} from '@tanstack/table-core';
import TASKS from '../../tasks.json' with { type: 'json' };

export type Task = (typeof TASKS)[number];
export const SLOTS = 50;

export const STATUSES = [
	{ label: 'Backlog', value: 'backlog' },
	{ label: 'Todo', value: 'todo' },
	{ label: 'In Progress', value: 'in progress' },
	{ label: 'Done', value: 'done' },
	{ label: 'Canceled', value: 'canceled' },
] as const;

export const PRIORITIES = [
	{ label: 'Low', value: 'low' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'High', value: 'high' },
	{ label: 'Critical', value: 'critical' },
] as const;

export const LABELS = [
	{ label: 'Bug', value: 'bug' },
	{ label: 'Feature', value: 'feature' },
	{ label: 'Documentation', value: 'documentation' },
] as const;

const includes = (row: { getValue: (id: string) => unknown }, id: string, value: unknown) => (value as string[]).includes(row.getValue(id) as string);

const columns: ColumnDef<Task>[] = [
	{ id: 'select', enableSorting: false, enableHiding: false },
	{ accessorKey: 'id', enableSorting: false, enableHiding: false },
	{ accessorKey: 'title' },
	{ accessorKey: 'status', filterFn: includes },
	{ accessorKey: 'priority', filterFn: includes },
	{ id: 'actions' },
];

/** What the page keeps, as plain strings and numbers; lists travel comma-joined. */
export interface TableInput {
	readonly sorting: string;
	readonly filter: string;
	readonly status: string;
	readonly priority: string;
	readonly page: number;
	readonly pageSize: number;
	readonly selected: string;
	readonly hidden: string;
}

export interface RowView {
	readonly slot: string;
	readonly shown: boolean;
	readonly key: string;
	readonly id: string;
	readonly title: string;
	readonly label: string;
	readonly labelName: string;
	readonly status: string;
	readonly statusName: string;
	readonly priority: string;
	readonly priorityName: string;
	readonly selected: boolean;
}

export interface PageButton {
	readonly key: string;
	readonly shown: boolean;
	readonly ellipsis: boolean;
	readonly page: number;
	readonly current: boolean;
	readonly label: string;
}

export interface FacetOption {
	readonly value: string;
	readonly label: string;
	readonly selected: boolean;
	readonly count: string;
}

export interface TableModel {
	readonly rows: readonly RowView[];
	readonly empty: boolean;
	readonly pageCount: number;
	readonly pageLabel: string;
	readonly canPrevious: boolean;
	readonly canNext: boolean;
	readonly pages: readonly PageButton[];
	readonly headerChecked: string;
	readonly selectedCount: number;
	readonly filtered: boolean;
	readonly statusOptions: readonly FacetOption[];
	readonly priorityOptions: readonly FacetOption[];
}

export const list = (csv: string): string[] => csv.split(',').filter(Boolean);

const nameOf = (options: readonly { label: string; value: string }[], value: string) => options.find((o) => o.value === value)?.label ?? '';

function table(input: TableInput) {
	const columnFilters: ColumnFiltersState = [];
	if (input.status) columnFilters.push({ id: 'status', value: list(input.status) });
	if (input.priority) columnFilters.push({ id: 'priority', value: list(input.priority) });
	const rowSelection: RowSelectionState = Object.fromEntries(list(input.selected).map((id) => [id, true]));
	const columnVisibility: VisibilityState = Object.fromEntries(list(input.hidden).map((id) => [id, false]));
	const [sortId, dir] = input.sorting.split(':');
	const state = { sorting: sortId ? [{ id: sortId, desc: dir === 'desc' }] : [], columnFilters, globalFilter: input.filter, pagination: { pageIndex: Math.max(0, input.page - 1), pageSize: input.pageSize }, rowSelection, columnVisibility, columnPinning: { left: [], right: [] }, columnOrder: [], columnSizing: {}, columnSizingInfo: { startOffset: null, startSize: null, deltaOffset: null, deltaPercentage: null, isResizingColumn: false, columnSizingStart: [] }, expanded: {}, grouping: [], rowPinning: { top: [], bottom: [] } };
	const options: TableOptionsResolved<Task> = {
		data: TASKS as Task[],
		columns,
		state,
		enableRowSelection: true,
		onStateChange: () => {},
		renderFallbackValue: null,
		globalFilterFn: (row, _columnId, filterValue) => {
			const id = String(row.getValue('id')).toLowerCase();
			const title = String(row.getValue('title')).toLowerCase();
			const searchValue = String(filterValue).toLowerCase();
			return id.includes(searchValue) || title.includes(searchValue);
		},
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
	};
	return createTable(options);
}

// lib/utils.ts getPageNumbers in the old app.
export function pageNumbers(current: number, total: number): (number | '...')[] {
	if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
	if (current <= 3) return [1, 2, 3, 4, '...', total];
	if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
	return [1, '...', current - 1, current, current + 1, '...', total];
}

export function tableModel(input: TableInput): TableModel {
	const t = table(input);
	const page = t.getRowModel().rows;
	// Fixed slots keyed by position: an @for whose keys change as the list changes stops updating the page.
	const rows: RowView[] = Array.from({ length: SLOTS }, (_, i) => {
		const row = page[i];
		if (!row) return { slot: `r${i}`, shown: false, key: '', id: '', title: '', label: '', labelName: '', status: '', statusName: '', priority: '', priorityName: '', selected: false };
		const task = row.original;
		return {
			slot: `r${i}`,
			shown: true,
			key: row.id,
			id: task.id,
			title: task.title,
			label: task.label,
			labelName: nameOf(LABELS, task.label),
			status: task.status,
			statusName: nameOf(STATUSES, task.status),
			priority: task.priority,
			priorityName: nameOf(PRIORITIES, task.priority),
			selected: row.getIsSelected(),
		};
	});
	const pageCount = t.getPageCount();
	const current = t.getState().pagination.pageIndex + 1;
	const numbers = pageNumbers(current, pageCount);
	const pages: PageButton[] = Array.from({ length: 7 }, (_, i) => {
		const n = numbers[i];
		if (n === undefined) return { key: `p${i}`, shown: false, ellipsis: false, page: 0, current: false, label: '' };
		return n === '...' ? { key: `p${i}`, shown: true, ellipsis: true, page: 0, current: false, label: '' } : { key: `p${i}`, shown: true, ellipsis: false, page: n, current: n === current, label: String(n) };
	});
	const facetOptions = (id: string, options: readonly { label: string; value: string }[], chosen: string): FacetOption[] => {
		const facets = t.getColumn(id)?.getFacetedUniqueValues() ?? new Map();
		return options.map((o) => ({ value: o.value, label: o.label, selected: list(chosen).includes(o.value), count: facets.get(o.value) ? String(facets.get(o.value)) : '' }));
	};
	const all = t.getIsAllPageRowsSelected();
	const some = t.getIsSomePageRowsSelected();
	return {
		rows,
		empty: page.length === 0,
		pageCount,
		pageLabel: `Page ${current} of ${pageCount}`,
		canPrevious: t.getCanPreviousPage(),
		canNext: t.getCanNextPage(),
		pages,
		headerChecked: all ? 'true' : some ? 'mixed' : 'false',
		selectedCount: t.getFilteredSelectedRowModel().rows.length,
		filtered: t.getState().columnFilters.length > 0 || !!t.getState().globalFilter,
		statusOptions: facetOptions('status', STATUSES, input.status),
		priorityOptions: facetOptions('priority', PRIORITIES, input.priority),
	};
}

/** One field of a fixed slot in a list the page renders slot by slot (rows, page buttons, facet options). */
export function slotField<T, K extends keyof T>(items: readonly T[], slot: number, key: K): T[K] {
	return items[slot]?.[key] as T[K];
}

export function toggleValue(csv: string, value: string): string {
	const values = list(csv);
	return (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]).join(',');
}

export function hasValue(csv: string, value: string): boolean {
	return list(csv).includes(value);
}

export function countOf(csv: string): number {
	return list(csv).length;
}

/** table.toggleAllPageRowsSelected(!all): the header checkbox. */
export function toggleAllOnPage(input: TableInput): string {
	const ids = table(input).getRowModel().rows.map((r) => r.id);
	const selected = list(input.selected);
	const all = ids.length > 0 && ids.every((id) => selected.includes(id));
	return (all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]).join(',');
}

export function selectedCount(input: TableInput): number {
	return table(input).getFilteredSelectedRowModel().rows.length;
}

export function pageCountFor(input: TableInput): number {
	return table(input).getPageCount();
}

/** taskSchema.parse(row.original): the row as the old dialogs see it. */
export function taskAt(key: string): Task | undefined {
	return (TASKS as Task[])[Number(key)];
}

/** showSubmittedData's description: the value as indented JSON. */
export function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

/** DataTableBulkActions' live announcement. */
export function announcementFor(count: number): string {
	return count > 0 ? `${count} task${count > 1 ? 's' : ''} selected. Bulk actions toolbar is available.` : '';
}

// The route's validateSearch (zod), in its key order: what TanStack Router hands navigate as `prev`.
type Search = Record<string, unknown>;
const KEYS = ['page', 'pageSize', 'status', 'priority', 'filter'] as const;
const STATUS_VALUES: readonly string[] = STATUSES.map((s) => s.value);
const PRIORITY_VALUES: readonly string[] = PRIORITIES.map((p) => p.value);

const parseValue = (raw: string): unknown => {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
};

export function validateSearch(search: string): Search {
	const params = new URLSearchParams(search);
	const out: Search = {};
	for (const [key, raw] of params) {
		if (!(KEYS as readonly string[]).includes(key) || key in out) continue;
		const v = parseValue(raw);
		if (key === 'page') out.page = typeof v === 'number' ? v : 1;
		else if (key === 'pageSize') out.pageSize = typeof v === 'number' ? v : 10;
		else if (key === 'filter') out.filter = typeof v === 'string' ? v : '';
		else {
			const allowed = key === 'status' ? STATUS_VALUES : PRIORITY_VALUES;
			out[key] = Array.isArray(v) && v.every((x) => allowed.includes(x)) ? v : [];
		}
	}
	return out;
}

/** The table state the route's search holds. */
export function fromSearch(search: string): Pick<TableInput, 'filter' | 'status' | 'priority' | 'page' | 'pageSize'> {
	const s = validateSearch(search);
	return {
		filter: typeof s.filter === 'string' ? s.filter : '',
		status: Array.isArray(s.status) ? s.status.join(',') : '',
		priority: Array.isArray(s.priority) ? s.priority.join(',') : '',
		page: typeof s.page === 'number' ? s.page : 1,
		pageSize: typeof s.pageSize === 'number' ? s.pageSize : 10,
	};
}

// TanStack Router's default stringifySearch: objects and JSON-looking strings as JSON, encoded as URLSearchParams does.
function stringify(search: Search): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined) continue;
		let text: string;
		if (typeof value === 'string') {
			let looksJson = true;
			try {
				JSON.parse(value);
			} catch {
				looksJson = false;
			}
			text = looksJson ? JSON.stringify(value) : value;
		} else text = JSON.stringify(value);
		params.append(key, text);
	}
	const text = params.toString();
	return text ? `?${text}` : '';
}

/** navigate({ search: (prev) => ({ ...prev, ...patch }) }): a new history entry, the patch's keys after the ones the URL already has. */
export function navigateSearch(patch: readonly (readonly [string, unknown])[], replace = false): void {
	const next: Search = { ...validateSearch(location.search) };
	for (const [key, value] of patch) next[key] = value;
	const url = `${location.pathname}${stringify(next)}`;
	// navigate() to the URL already shown commits no history entry; the router loads the match again (the loading bar runs).
	if (url === `${location.pathname}${location.search}`) {
		document.dispatchEvent(new Event('searchreload'));
		return;
	}
	if (replace) history.replaceState(history.state, '', url);
	else history.pushState(history.state, '', url);
}

/** onPaginationChange: page and pageSize, defaults left out. */
export function pushPagination(page: number, pageSize: number): void {
	navigateSearch([['page', page <= 1 ? undefined : page], ['pageSize', pageSize === 10 ? undefined : pageSize]]);
}

/** onColumnFiltersChange: back to the first page, the faceted filters as arrays. */
export function pushFilters(status: string, priority: string): void {
	navigateSearch([['page', undefined], ['status', status ? list(status) : undefined], ['priority', priority ? list(priority) : undefined]]);
}

/** onGlobalFilterChange: back to the first page, the trimmed text. */
export function pushGlobalFilter(value: string): void {
	navigateSearch([['page', undefined], ['filter', value ? value : undefined]]);
}

/** setPageSize as table-core does it: the first row shown stays on the page. */
export function pageAfterResize(page: number, pageSize: number, next: number): number {
	return Math.floor(((page - 1) * pageSize) / next) + 1;
}

/** One field of the task a row key names, '' when there is none. */
export function taskField(key: string, field: 'id' | 'title' | 'status' | 'label' | 'priority'): string {
	const task = taskAt(key);
	return task ? task[field] : '';
}

export function statusText(value: string): string {
	const names: Record<string, string> = { 'in progress': 'In Progress', backlog: 'Backlog', todo: 'Todo', canceled: 'Canceled', done: 'Done' };
	return names[value] ?? 'Select dropdown';
}

export interface SelectionView {
	readonly headerChecked: string;
	readonly selectedCount: number;
}

/** What depends on the row selection, apart from the rows: kept out of the rows' list so a row's own checkbox writes only bindings. */
export function selectionView(input: TableInput): SelectionView {
	const t = table(input);
	const all = t.getIsAllPageRowsSelected();
	const some = t.getIsSomePageRowsSelected();
	return { headerChecked: all ? 'true' : some ? 'mixed' : 'false', selectedCount: t.getFilteredSelectedRowModel().rows.length };
}

// Each list the page loops over comes from its own call: an @for over a computed that only reads another computed's field re-creates its rows instead of keeping the server-rendered ones.
export const tableRows = (input: TableInput): readonly RowView[] => tableModel(input).rows;
export const tablePages = (input: TableInput): readonly PageButton[] => tableModel(input).pages;
export const statusFacets = (input: TableInput): readonly FacetOption[] => tableModel(input).statusOptions;
export const priorityFacets = (input: TableInput): readonly FacetOption[] => tableModel(input).priorityOptions;

// The users table's model, as features/users/components/users-table.tsx asks TanStack Table for it: the same
// columns, filters, sorting, pagination, faceting and row selection, computed by @tanstack/table-core (the
// framework-agnostic engine, used as-is) from plain values the page keeps in state. What it returns is plain
// data for the page's fixed row slots.
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
	type SortingState,
	type TableOptionsResolved,
	type VisibilityState,
} from '@tanstack/table-core';
import { badgeVariants } from '../../../components/ui/variants.ts';
import { cn } from '../../utils.ts';
import USERS from '../../users.json' with { type: 'json' };

export type User = (typeof USERS)[number];
export const SLOTS = 50;

const STATUS_CLASS: Record<string, string> = {
	active: 'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200',
	inactive: 'bg-neutral-300/40 border-neutral-300',
	invited: 'bg-sky-200/40 text-sky-900 dark:text-sky-100 border-sky-300',
	suspended: 'bg-destructive/10 dark:bg-destructive/50 text-destructive dark:text-primary border-destructive/10',
};

const includes = (row: { getValue: (id: string) => unknown }, id: string, value: unknown) => (value as string[]).includes(row.getValue(id) as string);

const columns: ColumnDef<User>[] = [
	{ id: 'select', enableSorting: false, enableHiding: false },
	{ accessorKey: 'username', enableHiding: false },
	{ id: 'fullName' },
	{ accessorKey: 'email' },
	{ accessorKey: 'phoneNumber', enableSorting: false },
	{ accessorKey: 'status', filterFn: includes, enableHiding: false, enableSorting: false },
	{ accessorKey: 'role', filterFn: includes, enableSorting: false, enableHiding: false },
	{ id: 'actions' },
];

/** What the page keeps, as strings: Markless 0.4.0 hands handlers an array state as null, so lists travel comma-joined. */
export interface TableInput {
	readonly sorting: string;
	readonly username: string;
	readonly status: string;
	readonly role: string;
	readonly page: number;
	readonly pageSize: number;
	readonly selected: string;
	readonly hidden: string;
}

export interface RowView {
	readonly shown: boolean;
	readonly id: string;
	readonly username: string;
	readonly fullName: string;
	readonly email: string;
	readonly phone: string;
	readonly status: string;
	readonly statusClass: string;
	readonly role: string;
	readonly selected: boolean;
	readonly rowState: string;
	readonly checkState: string;
	readonly ariaChecked: string;
}

export interface PageButton {
	readonly shown: boolean;
	readonly ellipsis: boolean;
	readonly page: number;
	readonly current: boolean;
	readonly label: string;
	readonly className: string;
}

export interface TableModel {
	readonly rows: readonly RowView[];
	readonly pageCount: number;
	readonly pageLabel: string;
	readonly canPrevious: boolean;
	readonly canNext: boolean;
	readonly pages: readonly PageButton[];
	readonly headerChecked: string;
	readonly headerState: string;
	readonly selectedCount: number;
	readonly filtered: boolean;
	readonly statusFacets: Readonly<Record<string, number>>;
	readonly roleFacets: Readonly<Record<string, number>>;
}

const list = (csv: string) => csv.split(',').filter(Boolean);

export function parseSorting(sorting: string): SortingState {
	const [id, dir] = sorting.split(':');
	return id ? [{ id, desc: dir === 'desc' }] : [];
}

function table(input: TableInput) {
	const columnFilters: ColumnFiltersState = [];
	if (input.username) columnFilters.push({ id: 'username', value: input.username });
	if (input.status) columnFilters.push({ id: 'status', value: list(input.status) });
	if (input.role) columnFilters.push({ id: 'role', value: list(input.role) });
	const rowSelection: RowSelectionState = Object.fromEntries(list(input.selected).map((id) => [id, true]));
	const columnVisibility: VisibilityState = Object.fromEntries(list(input.hidden).map((id) => [id, false]));
	const state = { sorting: parseSorting(input.sorting), columnFilters, pagination: { pageIndex: Math.max(0, input.page - 1), pageSize: input.pageSize }, rowSelection, columnVisibility, columnPinning: { left: [], right: [] }, columnOrder: [], columnSizing: {}, columnSizingInfo: { startOffset: null, startSize: null, deltaOffset: null, deltaPercentage: null, isResizingColumn: false, columnSizingStart: [] }, expanded: {}, grouping: [], globalFilter: undefined, rowPinning: { top: [], bottom: [] } };
	const options: TableOptionsResolved<User> = {
		data: USERS as User[],
		columns,
		state,
		getRowId: (row) => row.id,
		enableRowSelection: true,
		onStateChange: () => {},
		renderFallbackValue: null,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
	};
	return createTable(options);
}

// lib/utils.ts getPageNumbers in the old app: at most five numbers, with ellipses.
export function pageNumbers(current: number, total: number): (number | '...')[] {
	if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
	if (current <= 3) return [1, 2, 3, 4, '...', total];
	if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
	return [1, '...', current - 1, current, current + 1, '...', total];
}

const PAGE_BUTTON = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";

export function tableModel(input: TableInput): TableModel {
	const t = table(input);
	const page = t.getRowModel().rows;
	const rows: RowView[] = Array.from({ length: SLOTS }, (_, i) => {
		const row = page[i];
		if (!row) return { shown: false, id: '', username: '', fullName: '', email: '', phone: '', status: '', statusClass: '', role: '', selected: false, rowState: 'false', checkState: 'unchecked', ariaChecked: 'false' };
		const u = row.original;
		const selected = row.getIsSelected();
		return {
			shown: true,
			id: u.id,
			username: u.username,
			fullName: `${u.firstName} ${u.lastName}`,
			email: u.email,
			phone: u.phoneNumber,
			status: u.status,
			statusClass: cn(badgeVariants({ variant: 'outline' }), cn('capitalize', STATUS_CLASS[u.status])),
			role: u.role,
			selected,
			rowState: selected ? 'selected' : 'false',
			checkState: selected ? 'checked' : 'unchecked',
			ariaChecked: selected ? 'true' : 'false',
		};
	});
	const pageCount = t.getPageCount();
	const current = t.getState().pagination.pageIndex + 1;
	const numbers = pageNumbers(current, pageCount);
	const pages: PageButton[] = Array.from({ length: 7 }, (_, i) => {
		const n = numbers[i];
		if (n === undefined) return { shown: false, ellipsis: false, page: 0, current: false, label: '', className: '' };
		if (n === '...') return { shown: true, ellipsis: true, page: 0, current: false, label: '', className: '' };
		return { shown: true, ellipsis: false, page: n, current: n === current, label: String(n), className: cn(PAGE_BUTTON, n === current ? 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90' : 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50', 'h-9 px-4 py-2 has-[>svg]:px-3', 'h-8 min-w-8 px-2') };
	});
	const facets = (id: string) => Object.fromEntries(t.getColumn(id)?.getFacetedUniqueValues() ?? new Map()) as Record<string, number>;
	const all = t.getIsAllPageRowsSelected();
	const some = t.getIsSomePageRowsSelected();
	return {
		rows,
		pageCount,
		pageLabel: `Page ${current} of ${pageCount}`,
		canPrevious: t.getCanPreviousPage(),
		canNext: t.getCanNextPage(),
		pages,
		headerChecked: all ? 'true' : some ? 'mixed' : 'false',
		headerState: all ? 'checked' : some ? 'indeterminate' : 'unchecked',
		selectedCount: t.getFilteredSelectedRowModel().rows.length,
		filtered: t.getState().columnFilters.length > 0,
		statusFacets: facets('status'),
		roleFacets: facets('role'),
	};
}

/** The ids on the shown page, for the header checkbox. */
export function pageIds(input: TableInput): string[] {
	return table(input).getRowModel().rows.map((r) => r.id);
}

/** The search string the old app keeps in the URL (useTableUrlState): defaults left out. */
export function searchFor(input: Pick<TableInput, 'username' | 'status' | 'role' | 'page' | 'pageSize'>): string {
	const params = new URLSearchParams();
	if (input.username.trim()) params.set('username', input.username);
	for (const key of ['status', 'role'] as const) if (input[key]) params.set(key, JSON.stringify(list(input[key])));
	if (input.page > 1) params.set('page', String(input.page));
	if (input.pageSize !== 10) params.set('pageSize', String(input.pageSize));
	const text = params.toString();
	return text ? `?${text}` : '';
}

/** One field of one row slot, for the slot's bindings (a cell or a prop cannot index a list in a recipe). */
export function field<K extends keyof RowView>(rows: readonly RowView[], slot: number, key: K): RowView[K] | '' | false {
	const row = rows[slot];
	if (row) return row[key];
	return key === 'shown' || key === 'selected' ? false : '';
}

export function pageField<K extends keyof PageButton>(pages: readonly PageButton[], slot: number, key: K): PageButton[K] | '' | false {
	const page = pages[slot];
	if (page) return page[key];
	return key === 'shown' || key === 'ellipsis' || key === 'current' ? false : '';
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

/** row.toggleSelected for the row in a slot of the shown page. */
export function toggleRow(input: TableInput, slot: number): string {
	const id = pageIds(input)[slot];
	return id ? toggleValue(input.selected, id) : input.selected;
}

/** table.toggleAllPageRowsSelected(!all): the header checkbox. */
export function toggleAllOnPage(input: TableInput): string {
	const ids = pageIds(input);
	const selected = list(input.selected);
	const all = ids.length > 0 && ids.every((id) => selected.includes(id));
	return (all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]).join(',');
}

export function userAt(input: TableInput, slot: number): User | undefined {
	return table(input).getRowModel().rows[slot]?.original;
}

/** setFilterValue resets to the first page, as useTableUrlState does when a filter changes. */
export function pageCountFor(input: TableInput): number {
	return table(input).getPageCount();
}

export function facet(model: TableModel, column: 'status' | 'role', value: string): string {
	const n = (column === 'status' ? model.statusFacets : model.roleFacets)[value];
	return n ? String(n) : '';
}

/** The table's class: a hidden column's cells are not drawn (the old table leaves them out). */
export function hiddenColumns(hidden: string): string {
	return list(hidden).map((id) => `hide-${id}`).join(' ');
}

/** The page a numbered pagination slot goes to. */
export function pageAtSlot(input: TableInput, slot: number): number {
	const n = pageNumbers(input.page, pageCountFor(input))[slot];
	return typeof n === 'number' ? n : input.page;
}

export function lastPage(input: TableInput): number {
	return Math.max(1, pageCountFor(input));
}

/** DataTableBulkActions' live announcement. */
export function announcementFor(count: number): string {
	return count > 0 ? `${count} user${count > 1 ? 's' : ''} selected. Bulk actions toolbar is available.` : '';
}

const parse = (raw: string | null): unknown => {
	if (raw === null) return undefined;
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
};

/** The table state the old route's search schema accepts, read from a URL's search. */
export function fromSearch(search: string): Pick<TableInput, 'username' | 'status' | 'role' | 'page' | 'pageSize'> {
	const params = new URLSearchParams(search);
	const arr = (key: string, allowed: readonly string[]) => {
		const v = parse(params.get(key));
		return Array.isArray(v) && v.every((x) => allowed.includes(x)) ? v.join(',') : '';
	};
	const num = (key: string, fallback: number) => {
		const v = parse(params.get(key));
		return typeof v === 'number' ? v : fallback;
	};
	const username = parse(params.get('username'));
	return {
		username: typeof username === 'string' ? username : '',
		status: arr('status', ['active', 'inactive', 'invited', 'suspended']),
		role: arr('role', ['superadmin', 'admin', 'manager', 'cashier']),
		page: num('page', 1),
		pageSize: num('pageSize', 10),
	};
}

/** navigate({ search }) as useTableUrlState calls it: a new history entry for the table's URL state. */
export function pushSearch(input: Pick<TableInput, 'username' | 'status' | 'role' | 'page' | 'pageSize'>): void {
	history.pushState(history.state, '', `${location.pathname}${searchFor(input)}`);
}

export function deleteSummary(user: User | undefined): string {
	return user ? JSON.stringify(user, null, 2) : '';
}

/** The row slot whose actions menu was opened last (the menu cell names it `-<slot>`). */
export function rowSlot(at: string): number {
	return Number(at.slice(1)) || 0;
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { columnFilteringFeature, columnVisibilityFeature, createFilteredRowModel, createPaginatedRowModel, createSortedRowModel, filterFn_includesString, rowPaginationFeature, rowSelectionFeature, rowSortingFeature, sortFn_alphanumeric, sortFn_text } from '@tanstack/table-core';
import { ttAct, ttView, type TableSpec, type TableState } from '../parts/tanstack-table.ts';

// shadcn's data-table demo as its page registered it, with the values each row showed; the orders and counts below are
// what the old page's table showed after the same uses (read there through its useTable instance).
const features = { columnFilteringFeature, columnVisibilityFeature, rowPaginationFeature, rowSelectionFeature, rowSortingFeature, filteredRowModel: createFilteredRowModel(), paginatedRowModel: createPaginatedRowModel(), sortedRowModel: createSortedRowModel(), filterFns: { includesString: filterFn_includesString }, sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text } };
const auto = { filterFn: 'auto', sortFn: 'auto', sortUndefined: 1 };
const spec = (): TableSpec => ({
	features,
	data: [
		{ status: 'success', email: 'ken99@example.com', amount: 316 },
		{ status: 'success', email: 'Abe45@example.com', amount: 242 },
		{ status: 'processing', email: 'Monserrat44@example.com', amount: 837 },
		{ status: 'success', email: 'Silas22@example.com', amount: 874 },
		{ status: 'failed', email: 'carmella@example.com', amount: 721 },
	],
	rowIds: ['0', '1', '2', '3', '4'],
	columns: [
		{ id: 'select', accessor: false, def: { ...auto, enableSorting: false, enableHiding: false } },
		{ id: 'status', accessor: true, def: auto },
		{ id: 'email', accessor: true, def: auto },
		{ id: 'amount', accessor: true, def: auto },
		{ id: 'actions', accessor: false, def: { ...auto, enableHiding: false } },
	],
	options: {},
});
const INITIAL: TableState = { sorting: [], rowSelection: {}, columnVisibility: {}, columnFilters: [], pagination: { pageIndex: 0, pageSize: 10 } };
const order = (s: TableSpec, state: TableState) => ttView(s, state).rows.map((r) => r.id).join(',');
const EMAIL = { k: 'sort', c: 'email', next: { '': 'asc', asc: 'desc', desc: 'asc' } } as const;

test('sorting a column runs table-core: Email ascending, then descending, then ascending again', () => {
	const s = spec();
	assert.equal(order(s, INITIAL), '0,1,2,3,4');
	const asc = ttAct(s, INITIAL, EMAIL);
	assert.deepEqual(asc.sorting, [{ id: 'email', desc: false }]);
	assert.equal(order(s, asc), '1,4,0,2,3');
	assert.equal(ttView(s, asc).c.email!.s, 'asc');
	const desc = ttAct(s, asc, EMAIL);
	assert.equal(order(s, desc), '3,2,0,4,1');
	assert.equal(order(s, ttAct(s, desc, EMAIL)), '1,4,0,2,3');
	// A number column's first direction is descending (table-core's auto sort direction).
	const amount = ttAct(s, INITIAL, { k: 'sort', c: 'amount', next: { '': 'desc', desc: 'asc', asc: 'desc' } });
	assert.equal(order(s, amount), '3,2,4,0,1');
});

test('a filter keeps the rows whose value includes it, case-insensitively, and an empty one is removed', () => {
	const s = spec();
	const typed = ttAct(s, INITIAL, { k: 'filter', c: 'email', v: 'abe' });
	assert.equal(order(s, typed), '1');
	assert.equal(ttView(s, typed).q.filtered, 1);
	assert.equal(order(s, ttAct(s, INITIAL, { k: 'filter', c: 'email', v: 'abc1' })), '');
	const cleared = ttAct(s, typed, { k: 'filter', c: 'email', v: '' });
	assert.deepEqual(cleared.columnFilters, []);
	assert.equal(order(s, cleared), '0,1,2,3,4');
});

test('selecting rows: a row toggles, select-all chooses every row from none or some and clears from all, and the counts follow', () => {
	const s = spec();
	const SELECT_ALL = { k: 'select', next: { none: 'pageOn', some: 'pageOn', all: 'pageOff' } } as const;
	const one = ttAct(s, INITIAL, { k: 'row', r: '2' });
	assert.deepEqual(ttView(s, one).rows.filter((r) => r.sel).map((r) => r.id), ['2']);
	assert.equal(ttView(s, one).q.pageSel, 'some');
	const all = ttAct(s, one, SELECT_ALL);
	assert.equal(ttView(s, all).q.pageSel, 'all');
	assert.equal(ttView(s, all).q.filteredSelected, 5);
	const none = ttAct(s, all, SELECT_ALL);
	assert.equal(ttView(s, none).q.selected, 0);
	// "n of m row(s) selected" counts the selected rows the filter keeps.
	const hidden = ttAct(s, one, { k: 'filter', c: 'email', v: 'ken' });
	assert.equal(ttView(s, hidden).q.filteredSelected, 0);
	assert.equal(ttView(s, hidden).q.selected, 1);
});

test('a column toggles its visibility, and pages move within bounds', () => {
	const s = spec();
	const hidden = ttAct(s, INITIAL, { k: 'vis', c: 'amount' });
	assert.equal(ttView(s, hidden).c.amount!.v, false);
	assert.equal(ttView(s, ttAct(s, hidden, { k: 'vis', c: 'amount' })).c.amount!.v, true);
	const paged: TableState = { ...INITIAL, pagination: { pageIndex: 0, pageSize: 2 } };
	assert.equal(ttView(s, paged).q.canPrev, false);
	const second = ttAct(s, paged, { k: 'page', d: 1 });
	assert.equal(order(s, second), '2,3');
	assert.equal(ttView(s, second).q.canPrev, true);
	// Sorting goes back to the first page, as the sorted row model resets the page index on the old page.
	assert.deepEqual(ttAct(s, second, EMAIL).pagination, { pageIndex: 0, pageSize: 2 });
});

test("each row of the view carries the values its row shows, as fields a row's markup reads plainly", () => {
	const s = spec();
	const cells = { '0': ['success', '$316.00'], '1': ['success', '$242.00'], '2': ['processing', '$837.00'], '3': ['success', '$874.00'], '4': ['failed', '$721.00'] };
	const rows = ttView(s, ttAct(s, INITIAL, EMAIL), cells).rows;
	assert.deepEqual(rows[0], { c0: 'success', c1: '$242.00', id: '1', sel: false });
	assert.equal(ttView(s, INITIAL).rows[0]!.c0, undefined, 'a view without values (a menu reading only its columns) has none');
});

test("select-all does what the old page's control did: React Aria's clears every row, the Radix demo's only the page's", () => {
	const s = spec();
	const filtered = ttAct(s, ttAct(s, INITIAL, { k: 'select', next: { none: 'allOn' } }), { k: 'filter', c: 'email', v: 'ken' });
	assert.equal(ttView(s, filtered).q.selected, 5);
	assert.equal(ttView(s, ttAct(s, filtered, { k: 'select', next: { all: 'allOff' } })).q.selected, 0);
	assert.equal(ttView(s, ttAct(s, filtered, { k: 'select', next: { all: 'pageOff' } })).q.selected, 4);
});

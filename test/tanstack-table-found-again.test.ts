// The table recorder reloads the old page between uses and reaches each table by its place in what it finds there; on a
// busy machine a table can mount later than the fixed wait after load, and reading it then failed the whole capture.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { findAgain } from '../src/convert/tanstack-table.ts';

/** A page whose tables mount one more on each look, up to `tables`; how often it was looked at. */
const mountingLate = (tables: number) => {
	let looks = 0;
	const page = {
		evaluate: async () => Array.from({ length: Math.min(tables, looks++) }, () => ({ spec: {} })),
		waitForTimeout: async () => {},
	} as unknown as Pick<Page, 'evaluate' | 'waitForTimeout'>;
	return { page, looks: () => looks };
};

test('the tables a page mounts late after a reload are waited for until there are as many as its first load had', async () => {
	const late = mountingLate(2);
	await findAgain(late.page, 2);
	assert.equal(late.looks(), 3, 'found again on the third look, when the second table had mounted');
});

test('a table that never comes back fails with how many were found, not a TypeError on the table that is missing', async () => {
	const short = mountingLate(1);
	await assert.rejects(findAgain(short.page, 2), /1 of the page's 2 TanStack tables found again/);
});

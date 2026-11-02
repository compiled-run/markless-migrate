// The table recorder reloads the old page between uses and reaches each table by its place in what it finds there; on a
// busy machine a table can mount later than a fixed wait after load, and reading it then failed the whole capture.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAgain } from '../src/convert/tanstack-table.ts';

/** A page that shows `specs` TanStack tables once React has taken over its tables, or never when `takenOver` is false. */
const reloaded = (specs: number, takenOver = true) => {
	const waited: unknown[] = [];
	const page = {
		evaluate: async () => Array.from({ length: specs }, () => ({ spec: {} })),
		waitForFunction: async (_: unknown, want: unknown) => {
			waited.push(want);
			if (!takenOver) throw new Error('Timeout');
		},
	} as unknown as Parameters<typeof findAgain>[0];
	return { page, waited };
};

test('a reload waits until React has taken over as many tables as the first load showed, then finds them', async () => {
	const page = reloaded(2);
	await findAgain(page.page, { tables: 3, specs: 2 });
	assert.deepEqual(page.waited, [3]);
});

test('a table that never comes back fails with how many were found, not a TypeError on the table that is missing', async () => {
	await assert.rejects(findAgain(reloaded(1).page, { tables: 2, specs: 2 }), /^Error: 1 of the page's 2 TanStack tables found again after it loaded again$/);
	await assert.rejects(findAgain(reloaded(1, false).page, { tables: 2, specs: 2 }), /1 of the page's 2 TanStack tables found again after it loaded again; React had not taken over its 2 tables within 10 s/);
});

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

// Parts that keep the view or table state they are handed (their own latest-view store, the table instance). Markless
// refuses a handler that hands them a live state object, so converted code hands each a copy and assigns the result back.
const KEEPS_ITS_STATE: Readonly<Record<string, number>> = { ttAct: 1, racCalendarEvent: 1, dayPickerSet: 1 };

test('every call the converter writes to a part that keeps its state hands it a copy of the state', async () => {
	const dir = join(import.meta.dirname, '../src/convert');
	const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.ts'));
	const calls: string[] = [];
	for (const file of files) {
		const source = await readFile(join(dir, file), 'utf8');
		for (const [name, index] of Object.entries(KEEPS_ITS_STATE)) {
			for (const match of source.matchAll(new RegExp(`\\b${name}\\((.*?)\\)[;}\`]`, 'g'))) {
				const args = match[1]!.split(/,\s*(?![^(]*\))/);
				calls.push(`${file}: ${match[0]}`);
				assert.match(args[index] ?? '', /^structuredClone\(/, `${file}: ${match[0]}`);
			}
		}
	}
	assert.ok(calls.length >= 4, calls.join('\n'));
});

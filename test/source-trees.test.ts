import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { descendants, parseTree } from '../src/source/trees.ts';

test('walks left early and collected do not corrupt the parser: the next parse still works', async () => {
	setFlagsFromString('--expose-gc');
	const gc = runInNewContext('gc') as () => void;
	const php = `<?php\n${Array.from({ length: 200 }, (_, i) => `Route::get('/p${i}', function () { return view('x${i}', ['a' => [1, 2, [3, [4]]]]); });`).join('\n')}`;
	for (let round = 0; round < 30; round++) {
		const root = await parseTree('php', php);
		let seen = 0;
		for (const _ of descendants(root)) if (++seen > 50) break;
		assert.equal([...descendants(root, 'string')].length, 600);
		gc();
		await new Promise((done) => setTimeout(done, 5));
	}
});

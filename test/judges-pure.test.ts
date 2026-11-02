// A judge decides from recorded observations alone: no module it loads may drive a browser, so re-judging needs none.
import assert from 'node:assert/strict';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { moduleEdges, ROOT } from '../src/code-closure.ts';

/** The modules that judge: each is loaded by `check judge`, which runs with no browser. */
export const JUDGES = ['src/check/journeys-compare.ts', 'src/check/compare.ts', 'src/check/timing-verdicts.ts', 'src/check/stats.ts'];

/** Packages that drive or measure a browser. */
const BROWSER = new Set(['playwright', 'playwright-core', 'lighthouse']);

/** The first import chain from `entry` to a browser package, type-only imports and files read beside a module aside. */
async function browserChain(entry: string): Promise<string[] | undefined> {
	const from = new Map<string, string | null>([[entry, null]]);
	const queue = [entry];
	while (queue.length) {
		const file = queue.shift()!;
		for (const edge of (await moduleEdges(file)).edges) {
			if (edge.typeOnly || edge.read) continue;
			if (edge.target.kind === 'package' && BROWSER.has(edge.target.name)) {
				const chain = [edge.target.name];
				for (let at: string | null | undefined = file; at; at = from.get(at)) chain.unshift(relative(ROOT, at));
				return chain;
			}
			if (edge.target.kind === 'file' && !from.has(edge.target.path)) {
				from.set(edge.target.path, file);
				queue.push(edge.target.path);
			}
		}
	}
	return undefined;
}

for (const judge of JUDGES) {
	test(`${judge} loads nothing that drives a browser`, async () => {
		const chain = await browserChain(join(ROOT, judge));
		assert.equal(chain, undefined, `${judge} reaches a browser package: ${chain?.join(' -> ')}`);
	});
}

test('the import walk finds a browser package behind a chain of modules', async () => {
	const chain = await browserChain(join(ROOT, 'src/check/journeys.ts'));
	assert.ok(chain?.at(-1) === 'playwright', `journeys.ts explores in a browser: ${chain?.join(' -> ')}`);
});

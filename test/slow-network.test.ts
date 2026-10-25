import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executedBytes, median, networkTables, shortNames, summarizeCell, type NetworkRun, type SideNetwork } from '../src/check/slow-network.ts';

test('executed bytes count the innermost range: a function that never ran inside a script that did is left out', () => {
	const source = 'a'.repeat(100);
	const entries = [{ source, functions: [{ ranges: [{ startOffset: 0, endOffset: 100, count: 1 }] }, { ranges: [{ startOffset: 20, endOffset: 60, count: 0 }] }, { ranges: [{ startOffset: 30, endOffset: 40, count: 2 }] }] }];
	assert.equal(executedBytes(entries), 100 - 40 + 10);
	assert.equal(executedBytes([{ source: 'abc', functions: [{ ranges: [{ startOffset: 0, endOffset: 3, count: 0 }] }] }]), 0);
});

test("a cell's medians leave out failed runs, and painted-to-answered is each run's own answer less its paint", () => {
	const run = (fcp: number, answered: number): NetworkRun => ({ fcp, answered, clicks: 3, bytes: 1000, jsDownloaded: 500, requests: [] });
	const cell = summarizeCell('regular-2g', 'firefox', [run(1000, 5000), run(2000, 4000), run(1500, 9000), { clicks: 0, bytes: 0, jsDownloaded: 0, requests: [], error: 'timed out' }]);
	assert.equal(cell.median.answered, 5000);
	assert.equal(cell.median.visibleToAnswer, 4000);
	assert.equal(cell.median.fcp, 1500);
	assert.equal(cell.medianRun?.answered, 5000);
	assert.equal(median([]), undefined);
	assert.equal(median([1, 2, 3, 10]), 2.5);
});

test('the tables put a column per page and a row per metric with a value, and name failed runs', () => {
	const run = (answered: number): NetworkRun => ({ ttfb: 300, fcp: 900, answered, clicks: 2, bytes: 250_000, jsDownloaded: 40_000, requests: [] });
	const sides: SideNetwork[] = [
		{ url: 'https://old.example/tabs', cells: [summarizeCell('regular-2g', 'chromium', [run(4000), run(5000), { clicks: 0, bytes: 0, jsDownloaded: 0, requests: [], error: 'timed out' }]), { profile: 'regular-2g', browser: 'webkit', runs: [], median: {}, unavailable: 'webkit is not installed' }] },
		{ url: 'https://new.example/tabs', cells: [summarizeCell('regular-2g', 'chromium', [run(9000)]), { profile: 'regular-2g', browser: 'webkit', runs: [], median: {}, unavailable: 'webkit is not installed' }] },
	];
	const text = networkTables(sides, shortNames(sides.map((s) => s.url)));
	assert.match(text, /^chromium, Regular 2G \(256 kbit\/s, 300 ms RTT\): median of 2 cold loads$/m);
	assert.match(text, /^ +old\.example +new\.example$/m);
	assert.match(text, /^  First click answered +4\.50 s +9\.00 s$/m);
	assert.match(text, /^  Painted to first click answered +3\.60 s +8\.10 s$/m);
	assert.match(text, /^  Downloaded in all +250 kB +250 kB$/m);
	assert.doesNotMatch(text, /Largest paint/, 'a metric no browser reported is left out');
	assert.match(text, /old\.example: 1 of 3 runs failed \(timed out\)/);
	assert.match(text, /webkit, .*\n  webkit is not installed/);
	assert.deepEqual(shortNames(['https://a.example/x', 'https://a.example/y', 'https://b.example/']), ['a.example/x', 'a.example/y', 'b.example']);
});

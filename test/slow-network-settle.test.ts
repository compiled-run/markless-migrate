// A slow-network cell stops taking runs once the runs it has left could no longer make the new page slower there: a cell
// whose old page answers in minutes and the new one in seconds is settled after three runs a side, not five.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureSlowNetwork, type NetworkRun } from '../src/check/slow-network.ts';
import { networkVerdicts, settledNotSlower } from '../src/check/slow-network-verdicts.ts';

const run = (t: number): NetworkRun => ({ firstFrame: t / 2, lcp: t / 2, answered: t, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });

test('a cell is settled only when no remaining runs, however late on the new page and early on the old, could make the new median later', () => {
	assert.equal(settledNotSlower([100_000, 110_000, 120_000].map(run), [10_000, 12_000, 11_000].map(run), 5), true);
	assert.equal(settledNotSlower([100_000, 110_000, 120_000].map(run), [10_000, 12_000, 130_000].map(run), 5), false, 'a new run already later than the old ones');
	assert.equal(settledNotSlower([100_000, 110_000].map(run), [10_000, 12_000].map(run), 5), false, 'three late new runs could still come');
	assert.equal(settledNotSlower([100_000, 110_000, 120_000].map(run), [10_000, { ...run(11_000), error: 'never answered' }, 12_000].map((r) => (typeof r === 'number' ? run(r) : r)), 5), false, 'a failed run');
	assert.equal(settledNotSlower([run(100_000), run(110_000), run(120_000)], [run(10_000), { ...run(11_000), lcp: undefined }, run(12_000)], 5), false, 'a time one run lacks');
});

test('a cell whose old page is far slower stops after three runs a side, and its verdict is the one five would give', async () => {
	const taken: string[] = [];
	const fake = async (url: string): Promise<NetworkRun> => {
		taken.push(url);
		const n = taken.filter((u) => u === url).length;
		return run(url.includes('old') ? 110_000 + 1000 * n : 18_000 + 100 * n);
	};
	const urls = ['https://old.example/', 'https://new.example/'];
	const [old, next] = await measureSlowNetwork(urls, { profiles: ['regular-2g'], browsers: ['chromium'], runs: 5, runner: fake, settle: { old: urls[0]!, new: urls[1]! } });
	assert.equal(taken.filter((u) => u.includes('old')).length, 3);
	assert.equal(taken.filter((u) => u.includes('new')).length, 3);
	assert.equal(old!.cells[0]!.settled, true);
	const verdicts = networkVerdicts(old!.cells[0]!, next!.cells[0]!);
	assert.deepEqual(verdicts.map((v) => [v.metric, v.ok]), [['firstFrame', true], ['lcp', true], ['answered', true]]);
});

test('a cell where the two pages are close takes every run', async () => {
	const taken: string[] = [];
	const fake = async (url: string): Promise<NetworkRun> => (taken.push(url), run(url.includes('old') ? 20_000 + (taken.length % 3) * 500 : 20_200 + (taken.length % 2) * 500));
	const urls = ['https://old.example/', 'https://new.example/'];
	await measureSlowNetwork(urls, { profiles: ['regular-3g'], browsers: ['chromium'], runs: 5, runner: fake, settle: { old: urls[0]!, new: urls[1]! } });
	assert.equal(taken.length, 10);
});

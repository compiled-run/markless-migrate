// The old page's slow-network runs stop once nothing they have yet to show could come before the new page's latest, the two
// sides still taken in turn; a verdict those stopped times could have decided differently takes the runs again in full.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureSlowNetwork, type NetworkRun, type NetworkRunOptions } from '../src/check/slow-network.ts';
import { networkVerdicts, retakeStopped, stopBounds } from '../src/check/slow-network-verdicts.ts';
import { summarizeCell } from '../src/check/slow-network.ts';

const run = (answered: number, paint = 5_000): NetworkRun => ({ firstFrame: paint, lcp: paint, answered, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });

test('the bounds are the new page’s latest time so far and two instrument steps; nothing is known before a new run, and a time no new run showed needs no wait', () => {
	assert.equal(stopBounds([]), undefined);
	assert.deepEqual(stopBounds([run(10_000), run(12_000)]), { firstFrame: 5_200, lcp: 5_034, answered: 12_500 });
	assert.deepEqual(stopBounds([{ ...run(10_000), lcp: undefined }]), { firstFrame: 5_200, lcp: null, answered: 10_500 });
	assert.equal(stopBounds([run(10_000), { ...run(1), error: 'stalled' }]), undefined);
});

// A runner that stops an old run the way the browser loop does: once the run's answer is past the bound it was given.
function fakeRunner(answers: { old: number[]; new: number[] }, calls: { url: string; stopped: boolean }[]) {
	const taken = { old: 0, new: 0 };
	return async (url: string, _p: unknown, _b: unknown, options: NetworkRunOptions = {}): Promise<NetworkRun> => {
		const side = url.includes('old') ? 'old' : 'new';
		const answered = answers[side][taken[side]++ % answers[side].length]!;
		const bounds = options.stopBy?.();
		const stop = bounds && bounds.answered !== null && answered > bounds.answered ? bounds.answered + 1 : undefined;
		calls.push({ url, stopped: stop !== undefined });
		return stop !== undefined ? { firstFrame: 5_000, lcp: 5_000, answeredAfter: stop, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] } : run(answered);
	};
}

const urls = ['https://old.example/', 'https://new.example/'];

test('an old page far slower than the new one has its runs stopped at the new page’s latest answer, and the verdicts are those of whole runs', async () => {
	const answers = { old: [110_000, 112_000, 111_000, 113_000, 114_000], new: [18_000, 18_200, 18_100, 18_300, 18_050] };
	const calls: { url: string; stopped: boolean }[] = [];
	const [old, next] = await measureSlowNetwork(urls, { profiles: ['regular-2g'], browsers: ['chromium'], runs: 5, runner: fakeRunner(answers, calls) as never, settle: { old: urls[0]!, new: urls[1]! } });
	const oldCalls = calls.filter((c) => c.url.includes('old'));
	assert.equal(oldCalls[0]!.stopped, false, 'the first old run has no new run to stop by');
	assert.ok(oldCalls.slice(1).every((c) => c.stopped));
	const whole = summarizeCell('regular-2g', 'chromium', answers.old.slice(0, old!.cells[0]!.runs.length).map((a) => run(a)));
	assert.deepEqual(networkVerdicts(old!.cells[0]!, next!.cells[0]!).map((v) => [v.metric, v.ok]), networkVerdicts({ ...whole, ...(old!.cells[0]!.settled ? { settled: true } : {}) }, next!.cells[0]!).map((v) => [v.metric, v.ok]));
});

test('a new page that turns out slower than an early bound takes the stopped old runs again in full before the cell is judged', async () => {
	const answers = { old: [30_000], new: [10_000, 10_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000] };
	const calls: { url: string; stopped: boolean }[] = [];
	const [old, next] = await measureSlowNetwork(urls, { profiles: ['regular-3g'], browsers: ['chromium'], runs: 9, runner: fakeRunner(answers, calls) as never, settle: { old: urls[0]!, new: urls[1]! } });
	const stopped = calls.filter((c) => c.url.includes('old') && c.stopped).length;
	assert.ok(stopped > 0, 'some old runs were stopped at the early bound');
	assert.equal(calls.filter((c) => c.url.includes('old')).length, 9 + stopped);
	assert.ok(old!.cells[0]!.runs.every((r) => r.answered === 30_000 && r.answeredAfter === undefined));
	const whole = summarizeCell('regular-3g', 'chromium', Array.from({ length: 9 }, () => run(30_000)));
	assert.deepEqual(networkVerdicts(old!.cells[0]!, next!.cells[0]!), networkVerdicts(whole, next!.cells[0]!));
});

test('stopped old times stand when the verdict is green by its p alone, or when every one is later than every new time and the new median is within the fixed bands', () => {
	const cell = (runs: NetworkRun[]) => summarizeCell('regular-2g', 'chromium', runs);
	const stoppedRun = (at: number): NetworkRun => ({ firstFrame: 5_000, lcp: 5_000, answeredAfter: at, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });
	assert.equal(retakeStopped(cell([run(110_000), stoppedRun(18_500), stoppedRun(18_500), stoppedRun(18_500), stoppedRun(18_500)]), cell([18_000, 18_100, 18_200, 18_000, 18_100].map((a) => run(a)))), false);
	assert.equal(retakeStopped(cell([run(30_000), stoppedRun(10_500), stoppedRun(10_500), run(30_000), run(30_000)]), cell([10_000, 10_000, 40_000, 40_000, 40_000].map((a) => run(a)))), false, 'green by p: later old times only raise it');
	assert.equal(retakeStopped(cell([run(30_000), stoppedRun(10_500), stoppedRun(10_500), ...Array.from({ length: 6 }, () => run(30_000))]), cell([10_000, 10_000, ...Array.from({ length: 7 }, () => 60_000)].map((a) => run(a)))), true, 'red, with stopped times under new ones');
	assert.equal(retakeStopped(cell([30_000, 30_000, 30_000, 30_000, 30_000].map((a) => run(a))), cell([40_000, 40_000, 40_000, 40_000, 40_000].map((a) => run(a)))), false, 'no stopped run, nothing to take again');
});

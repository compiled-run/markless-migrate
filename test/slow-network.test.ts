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

test('a frame is blank while every pixel is the one colour, and painted once anything differs from it', async () => {
	const { PNG } = await import('pngjs');
	const { blankFrame } = await import('../src/check/slow-network.ts');
	const frame = (paint?: [number, number]) => {
		const png = new PNG({ width: 20, height: 10 });
		png.data.fill(255);
		if (paint) {
			const at = (paint[1] * 20 + paint[0]) * 4;
			png.data[at] = png.data[at + 1] = png.data[at + 2] = 40;
		}
		return PNG.sync.write(png);
	};
	assert.equal(blankFrame(frame()), true);
	assert.equal(blankFrame(frame([13, 7])), false);
});

test('painted-to-answered counts from the first painted frame, the browser\'s FCP only where no frame was read', () => {
	const cell = summarizeCell('regular-3g', 'webkit', [{ firstFrame: 900, fcp: 3300, answered: 4000, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] }]);
	assert.equal(cell.median.visibleToAnswer, 3100);
	assert.equal(cell.median.firstFrame, 900);
	assert.equal(summarizeCell('regular-3g', 'webkit', [{ fcp: 1000, answered: 4000, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] }]).median.visibleToAnswer, 3000);
	assert.match(networkTables([{ url: 'https://a.example/', cells: [cell] }]), /First painted frame +0\.90 s\n +FCP \(as the browser reports it\) +3\.30 s/);
});

test('check measures every page on Regular 3G, Regular 2G and slow 4G in all three browsers unless told otherwise', async () => {
	const { slowNetworkFlags, DEFAULT_CHECK_PROFILES } = await import('../src/check/slow-network.ts');
	assert.deepEqual(DEFAULT_CHECK_PROFILES, ['regular-3g', 'regular-2g', 'slow-4g']);
	assert.deepEqual(slowNetworkFlags({}), { options: { profiles: ['regular-3g', 'regular-2g', 'slow-4g'], browsers: ['chromium', 'firefox', 'webkit'], runs: 5, concurrency: 2 } });
	assert.deepEqual(slowNetworkFlags({ 'no-slow-network': true }), { options: undefined });
	assert.deepEqual(slowNetworkFlags({ 'slow-network': ['regular-2g'], 'slow-network-browser': ['firefox'], 'slow-network-runs': '7', 'slow-network-control': '#tab' }), { options: { profiles: ['regular-2g'], browsers: ['firefox'], runs: 7, concurrency: 2, control: '#tab' } });
	assert.match(String(slowNetworkFlags({ 'slow-network-runs': '3' }).error), /at least 4: the old page's own runs are split in two to tell noise/);
	assert.match(String(slowNetworkFlags({ 'slow-network': ['edge'] }).error), /unknown --slow-network edge/);
	assert.match(String(slowNetworkFlags({ 'no-slow-network': true, 'slow-network': ['regular-2g'] }).error), /--no-slow-network and --slow-network/);
});

test('on CI a browser the slow network is measured in but that is not installed is an error naming it; elsewhere its cells are skipped', async () => {
	const { missingBrowsersError } = await import('../src/check/slow-network.ts');
	const only = (present: string) => (name: string) => name === present;
	const error = missingBrowsersError(['chromium', 'firefox', 'webkit'], { CI: 'true' }, only('chromium'));
	assert.match(String(error), /firefox and webkit are not installed on this CI machine \(pnpm exec playwright install --with-deps firefox webkit\)/);
	assert.equal(missingBrowsersError(['chromium', 'firefox', 'webkit'], {}, only('chromium')), undefined);
	assert.equal(missingBrowsersError(['chromium', 'firefox'], { CI: 'false' }, only('chromium')), undefined);
	assert.equal(missingBrowsersError(['chromium'], { CI: 'true' }, only('chromium')), undefined);
});

test('a run during which this machine stalled the measuring process is retaken, and named when it stalls every time', async () => {
	const { stallWatch, measureSlowNetwork } = await import('../src/check/slow-network.ts');
	const watch = stallWatch(50);
	const until = Date.now() + 400;
	while (Date.now() < until);
	await new Promise((r) => setTimeout(r, 80));
	assert.ok(watch.stop() >= 300, 'a blocked process is seen as a stall');
	const calm = stallWatch(50);
	await new Promise((r) => setTimeout(r, 200));
	assert.ok(calm.stop() < 150);
	let calls = 0;
	const flaky = async (): Promise<NetworkRun> => (++calls === 1 ? { clicks: 0, bytes: 0, jsDownloaded: 0, requests: [], stalledMs: 4000, error: 'stalled' } : { answered: 1000, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });
	const [side] = await measureSlowNetwork(['https://a.example/'], { profiles: ['regular-3g'], browsers: ['chromium'], runs: 1, runner: flaky });
	assert.equal(calls, 2);
	assert.equal(side!.cells[0]!.median.answered, 1000);
	const stuck = async (): Promise<NetworkRun> => ({ clicks: 0, bytes: 0, jsDownloaded: 0, requests: [], stalledMs: 4000, error: 'this machine stalled the measurement for 4.0 s' });
	const [again] = await measureSlowNetwork(['https://a.example/'], { profiles: ['regular-3g'], browsers: ['chromium'], runs: 1, runner: stuck });
	assert.match(again!.cells[0]!.runs[0]!.error ?? '', /stalled the measurement/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { networkFailures, noiseBand, networkVerdicts } from '../src/check/slow-network-verdicts.ts';
import { summarizeCell, type NetworkRun, type RouteNetwork } from '../src/check/slow-network.ts';

const run = (answered: number, firstFrame = 1000, requests: NetworkRun['requests'] = []): NetworkRun => ({ firstFrame, answered, clicks: 2, bytes: 1, jsDownloaded: 1, requests });

test("the noise band is how far apart the medians of two halves of the old page's own runs fall", () => {
	assert.equal(noiseBand([1000, 1000, 1000, 1000, 1000]), 0);
	// Splits of [1000, 1010, 1020, 1030, 1400] into two and three: the widest gaps come with the outlier in the smaller half.
	const band = noiseBand([1000, 1010, 1020, 1030, 1400])!;
	assert.ok(band > 0 && band < 400, String(band));
	assert.equal(noiseBand([1000, 1010, 1020]), undefined, 'too few runs to split');
});

test('a cell is red only when new is slower beyond the band from old against old and the runs differ (Mann-Whitney)', () => {
	const old = summarizeCell('regular-2g', 'firefox', [run(5000), run(5050), run(5100), run(4950), run(5020)]);
	const slower = summarizeCell('regular-2g', 'firefox', [run(9000), run(9100), run(8900), run(9050), run(8950)]);
	const alike = summarizeCell('regular-2g', 'firefox', [run(5010), run(5060), run(5090), run(4980), run(5030)]);
	const red = networkVerdicts(old, slower).find((v) => v.metric === 'answered')!;
	assert.equal(red.ok, false);
	assert.ok(red.worse > red.band, JSON.stringify(red));
	assert.ok(red.p < 0.05);
	assert.ok(networkVerdicts(old, alike).every((v) => v.ok));
	assert.ok(networkVerdicts(old, slower).find((v) => v.metric === 'firstFrame')!.ok, 'same paint');
});

test('a new page that never answers the click the old one answered is red; neither answering is no verdict', () => {
	const old = summarizeCell('regular-3g', 'webkit', [run(3000), run(3010), run(3020), run(3030), run(3040)]);
	const never: NetworkRun = { firstFrame: 1000, clicks: 40, bytes: 1, jsDownloaded: 1, requests: [], error: 'the control never answered a click within 180 s' };
	const next = summarizeCell('regular-3g', 'webkit', [never, never, never, never, never]);
	const v = networkVerdicts(old, next).find((x) => x.metric === 'answered')!;
	assert.equal(v.ok, false);
	assert.match(v.reason ?? '', /never answered/);
	const none = (): NetworkRun => ({ firstFrame: 1000, clicks: 0, bytes: 1, jsDownloaded: 1, requests: [], noControl: true });
	const both = networkVerdicts(summarizeCell('regular-3g', 'webkit', [none(), none(), none(), none()]), summarizeCell('regular-3g', 'webkit', [none(), none(), none(), none()]));
	assert.equal(both.find((x) => x.metric === 'answered'), undefined);
});

test('the failure names the browser and network, and the largest requests the new page finished before its answer', () => {
	const reqs = [
		{ url: 'https://new.example/', type: 'document', start: 0, end: 2000, bytes: 56_000 },
		{ url: 'https://new.example/app.css', type: 'stylesheet', start: 2100, end: 9000, bytes: 94_000 },
		{ url: 'https://new.example/late.js', type: 'script', start: 9100, end: 12_000, bytes: 70_000 },
		{ url: 'https://new.example/after.js', type: 'script', start: 12_500, end: 14_000, bytes: 99_000 },
	];
	const old = summarizeCell('regular-2g', 'firefox', [run(5000), run(5050), run(5100), run(4950), run(5020)]);
	const next = summarizeCell('regular-2g', 'firefox', [run(12_100, 9100, reqs), run(12_200, 9100, reqs), run(12_000, 9100, reqs), run(12_300, 9100, reqs), run(12_150, 9100, reqs)]);
	const network: RouteNetwork = { old: { url: 'https://old.example/', cells: [old] }, new: { url: 'https://new.example/', cells: [next] } };
	const failures = networkFailures('/', network);
	const f = failures.find((x) => /First click answered/.test(x.check))!;
	assert.equal(f.dimension, 'load');
	assert.equal(f.check, 'page load: slow network, firefox Regular 2G (256 kbit/s, 300 ms RTT): First click answered');
	assert.match(f.actual, /^12\.15 s, the median of 5 \(runs [^)]+\): 7\.13 s worse, beyond the [\d.]+ s the old page's own runs differ by or the measurement can tell apart \(p = 0\.00\d\)/);
	assert.match(f.actual, /before the answer the new page finished 220 kB \(6\.9 s of the link\): stylesheet \/app\.css 94\.0 kB \(2\.9 s\), script \/late\.js 70\.0 kB \(2\.2 s\), document \/ 56\.0 kB \(1\.8 s\)/);
	assert.doesNotMatch(f.actual, /after\.js/);
	assert.ok(failures.some((x) => /First painted frame/.test(x.check)));
});

test('a difference finer than the instrument can see is no verdict: a frame read every 100 ms, a click answered at most every 250 ms', () => {
	const tight = (base: number, ms: number[]) => ms.map((d) => run(base + d * 10, 430 + d));
	const old = summarizeCell('regular-3g', 'chromium', tight(2000, [1, 1, 0, -1]));
	const next = summarizeCell('regular-3g', 'chromium', tight(2000, [41, 41, 14, 51]));
	const verdicts = networkVerdicts(old, next);
	const frame = verdicts.find((v) => v.metric === 'firstFrame')!;
	assert.ok(frame.worse > 30 && frame.worse < 100, String(frame.worse));
	assert.equal(frame.band, 100, "the screenshots' interval, wider than the old page's own spread");
	assert.equal(frame.ok, true);
	assert.equal(verdicts.find((v) => v.metric === 'answered')!.band >= 250, true);
});

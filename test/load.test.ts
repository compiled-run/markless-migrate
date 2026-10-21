import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { blockedPatterns, judgeLoad, loadFailures, loadLine, mannWhitneyGreater, measureLoad, readRun, routeLoad, unmeasured, type LoadRun, type Metrics } from '../src/check/load.ts';

const runs = (lcps: readonly number[], over: Partial<Metrics> = {}): Metrics[] => lcps.map((lcp) => ({ score: 80, fcp: 1800, lcp, si: 1900, tbt: 50, cls: 0.001, ...over }));
const verdict = (old: Metrics[], next: Metrics[], metric: keyof Metrics) => judgeLoad(old, next).find((v) => v.metric === metric)!;

test('the exact one-sided Mann-Whitney p of two runs that never overlap is one split in all of them', () => {
	assert.equal(mannWhitneyGreater([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]), 1 / 252);
	assert.equal(mannWhitneyGreater([1, 2, 3, 4], [5, 6, 7, 8]), 1 / 70);
	assert.equal(mannWhitneyGreater([1, 2, 3], [4, 5, 6]), 1 / 20);
	assert.ok(mannWhitneyGreater([5, 5, 5, 5, 5], [5, 5, 5, 5, 5]) > 0.5);
	assert.equal(mannWhitneyGreater([6, 7, 8, 9, 10], [1, 2, 3, 4, 5]), 1);
	assert.equal(mannWhitneyGreater([1, 3], [2, 4]), 2 / 6);
	assert.equal(mannWhitneyGreater([1, 2, 2], [2, 3]), 3 / 10);
	const ten = Array.from({ length: 10 }, (_, i) => i);
	assert.equal(mannWhitneyGreater(ten, ten.map((v) => v + 10)), 1 / 184756);
});

test('a new LCP slower in every run is red; the same page measured twice is not', () => {
	const old = runs([5060, 5061, 4909, 5059, 5059]);
	const slow = verdict(old, runs([7976, 7834, 6986, 7400, 7700]), 'lcp');
	assert.equal(slow.ok, false);
	assert.ok(slow.worse > 2000);
	assert.ok(slow.p < 0.01);
	assert.equal(verdict(old, runs([5058, 5066, 4910, 5062, 5059]), 'lcp').ok, true);
});

test('two runs of five that stall do not make a page red when its other three match the old page', () => {
	const old = runs([5059, 5825, 5052, 4813, 5058]);
	assert.equal(verdict(old, runs([5050, 10090, 5040, 9800, 5060]), 'lcp').ok, true);
});

test('a difference smaller than the floor is not red, however consistent', () => {
	const old = runs([5000, 5001, 5002, 5003, 5004]);
	const v = verdict(old, runs([5200, 5201, 5202, 5203, 5204]), 'lcp');
	assert.ok(v.p < 0.01);
	assert.ok(Math.abs(v.floor - 250) < 1);
	assert.equal(v.ok, true);
	assert.equal(verdict(old, runs([5300, 5301, 5302, 5303, 5304]), 'lcp').ok, false);
});

test('a lower score is worse; a higher one is not', () => {
	const old = runs([5000, 5000, 5000, 5000, 5000], { score: 80 });
	assert.equal(verdict(old, runs([5000, 5000, 5000, 5000, 5000], { score: 70 }), 'score').ok, false);
	assert.equal(verdict(old, runs([5000, 5000, 5000, 5000, 5000], { score: 90 }), 'score').ok, true);
});

const lhr = JSON.parse(readFileSync(join(import.meta.dirname, 'load-fixtures', 'vite-dev-port.lhr.json'), 'utf8'));

test('a Lighthouse report gives the metrics, the LCP element, its breakdown and what began before it', () => {
	const run = readRun(lhr, 'https://vite-dev-markless.vercel.app');
	assert.deepEqual(run.metrics, { score: 66, fcp: lhr.audits['first-contentful-paint'].numericValue, lcp: lhr.audits['largest-contentful-paint'].numericValue, si: lhr.audits['speed-index'].numericValue, tbt: lhr.audits['total-blocking-time'].numericValue, cls: lhr.audits['cumulative-layout-shift'].numericValue });
	const d = run.detail!;
	assert.match(d.lcpElement ?? '', /h1\.text-white "The Build Tool for the Web"/);
	assert.deepEqual(Object.keys(d.lcpPhases ?? {}), ['TTFB', 'Load Delay', 'Load Time', 'Render Delay']);
	assert.equal(Math.round(d.observed.lcp!), 785);
	assert.ok(d.htmlBytes! > 20_000);
	assert.ok(d.beforeLcp.largest.some((r) => r.url === '/assets/641_x_629_vite_masthead.CJXD3cz6.riv' && r.priority === 'High'), JSON.stringify(d.beforeLcp.largest));
	assert.ok(!d.beforeLcp.largest.some((r) => r.url.includes('footer-background')), 'a low-priority image does not count toward the LCP');
	assert.ok(d.beforeLcp.largest.every((r) => !r.url.startsWith('https://vite-dev-markless.vercel.app')), 'the app origin is left out of its own URLs');
	assert.equal(d.filmstrip?.length, 3);
	assert.ok(d.beforeFcp!.largest.every((r) => r.priority === 'VeryHigh' || (r.priority === 'High' && r.type === 'Script')), JSON.stringify(d.beforeFcp));
	assert.ok(d.beforeFcp!.largest.some((r) => r.url === '/page-scripts/home.js'), 'a High-priority modulepreload that finished before the first paint holds it back');
	assert.deepEqual(readRun({ ...lhr, runtimeError: { code: 'NO_FCP', message: 'The page did not paint any content.' } }, 'x'), { error: 'NO_FCP: The page did not paint any content.' });
});

test("a red metric's failure names both sides' LCP element and the requests before it; a green route keeps no filmstrip", () => {
	const typical = readRun(lhr, 'https://vite-dev-markless.vercel.app');
	const at = (lcp: number): LoadRun => ({ metrics: { ...typical.metrics!, lcp }, detail: { ...typical.detail!, filmstrip: typical.detail!.filmstrip } });
	const load = routeLoad(5, [5060, 5061, 4909, 5059, 5059].map(at), [7976, 7834, 6986, 7400, 7700].map(at));
	assert.equal(load.ok, false);
	const [failure, ...rest] = loadFailures('/', load);
	assert.equal(rest.length, 0);
	assert.equal(failure!.dimension, 'load');
	assert.equal(failure!.check, 'page load: Largest Contentful Paint (Lighthouse, mobile)');
	assert.match(failure!.expected, /^5\.06 s or better, the old page's median of 5 \(runs 5\.06 s, 5\.06 s, 4\.91 s, 5\.06 s, 5\.06 s\); old: LCP element /);
	assert.match(failure!.actual, /^7\.70 s, the median of 5 .*2\.64 s worse, beyond the 253 ms allowed/);
	assert.match(failure!.actual, /requests \(\d+\.\d kB\) began before it and count toward it, largest: \/assets\/641_x_629_vite_masthead\.CJXD3cz6\.riv 85\.4 kB High Other/);
	assert.ok(load.new.detail?.filmstrip?.length);
	assert.match(loadLine(load), /LCP 5\.06 s -> 7\.70 s \(worse\)/);
	const fcp = loadFailures('/', routeLoad(5, [1500, 1500, 1501, 1499, 1500].map((v) => ({ ...at(5000), metrics: { ...typical.metrics!, fcp: v } })), [1700, 1700, 1701, 1699, 1700].map((v) => ({ ...at(5000), metrics: { ...typical.metrics!, fcp: v } }))))[0]!;
	assert.equal(fcp.check, 'page load: First Contentful Paint (Lighthouse, mobile)');
	assert.match(fcp.actual, /requests at a render-blocking priority \(VeryHigh, or a High-priority script\) finished before it and hold it back \(\d+\.\d kB\): .*\/page-scripts\/home\.js \d+\.\d kB High Script/);
	const same = routeLoad(5, [5060, 5061, 4909, 5059, 5059].map(at), [5060, 5061, 4909, 5059, 5059].map(at));
	assert.equal(same.ok, true);
	assert.equal(same.new.detail?.filmstrip, undefined);
	assert.deepEqual(loadFailures('/', same), []);
});

test('a new page Lighthouse never finishes is red; an old one it never finishes leaves the route without a verdict', () => {
	const typical = readRun(lhr, 'x');
	const failed: LoadRun = { error: 'NO_FCP: The page did not paint any content.' };
	const broken = routeLoad(4, [typical, typical, typical, typical], [failed, failed, failed, failed]);
	assert.equal(broken.ok, false);
	assert.match(loadFailures('/', broken)[0]!.actual, /no Lighthouse run of the new page finished \(NO_FCP/);
	const noOld = routeLoad(4, [failed, failed, failed, failed], [typical, typical, typical, typical]);
	assert.equal(noOld.ok, true);
	assert.deepEqual(loadFailures('/', noOld), []);
	const skipped = unmeasured('not measured: --header and --cookie are for the apps alone');
	assert.deepEqual(loadFailures('/', skipped), []);
	assert.match(loadLine(skipped), /^page load \(Lighthouse, mobile\): not compared, not measured: --header/);
});

test('runs alternate which side goes first, so a machine that slows down part way falls on both', async () => {
	const order: string[] = [];
	await measureLoad({ old: 'http://old.test', new: 'http://new.test' }, ['/a'], { runs: 4 }, async (url) => {
		order.push(new URL(url).host.split('.')[0]!);
		return lhr;
	});
	assert.deepEqual(order, ['old', 'new', 'new', 'old', 'old', 'new', 'new', 'old']);
});

test('a run that errors is taken again, so a paint the machine skipped does not leave a side a run short', async () => {
	let calls = 0;
	const loads = await measureLoad({ old: 'http://old.test', new: 'http://new.test' }, ['/'], { runs: 4 }, async () => (++calls === 1 ? { ...lhr, runtimeError: { code: 'NO_FCP', message: 'The page did not paint any content.' } } : lhr));
	assert.equal(calls, 9);
	assert.ok(loads.get('/')!.old.runs.every((r) => !('error' in r)));
});

test('a metric worse than its floor but within noise after the first runs gets as many runs again, and is judged on all of them', async () => {
	let calls = 0;
	const at = (lcp: number) => ({ ...lhr, audits: { ...lhr.audits, 'largest-contentful-paint': { numericValue: lcp } } });
	// Old stalls twice in its first five runs; new is 600 ms slower than old's typical run every time.
	const old = [2988, 802, 2745, 796, 799, 801, 805, 798, 803, 800];
	const loads = await measureLoad({ old: 'http://old.test', new: 'http://new.test' }, ['/'], { runs: 5 }, async (url) => {
		calls++;
		return url.startsWith('http://old.test') ? at(old.shift()!) : at(1400);
	});
	const load = loads.get('/')!;
	assert.equal(calls, 20);
	assert.equal(load.runs, 10);
	assert.equal(load.verdicts.find((v) => v.metric === 'lcp')!.ok, false);
	let steady = 0;
	await measureLoad({ old: 'http://old.test', new: 'http://new.test' }, ['/'], { runs: 4 }, async () => (steady++, lhr));
	assert.equal(steady, 8, 'a route already decided takes no more runs');
});

test('tracker hosts are blocked in Lighthouse as in the rest of the check, and an allowed one is not', () => {
	const patterns = blockedPatterns({ add: ['ads.example.com'], allow: ['www.google-analytics.com'] });
	assert.ok(patterns.includes('*://ads.example.com/*'));
	assert.ok(!patterns.some((p) => p.includes('google-analytics.com')), 'an allowed host under a blocked domain loads');
	assert.ok(blockedPatterns().includes('*.google-analytics.com/*'));
});

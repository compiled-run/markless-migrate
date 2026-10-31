import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { blockedPatterns, clusters, judgeLoad, loadFailures, loadLine, mannWhitneyGreater, measureLoad, readRun, routeLoad, unmeasured, type LoadRun, type Metrics } from '../src/check/load.ts';

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
	assert.match(loadLine(skipped), /^page load, PageSpeed-equivalent \(lab\): not compared, not measured: --header/);
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

// Runs of vite.dev in check.yml run 41181882418 (Lighthouse mobile FCP, ms).
const VITE_HOME_OLD = [1868, 1969, 3020, 2415, 2416, 3017, 3017, 2565, 1860, 3013];
const VITE_HOME_NEW = [1730, 2718, 2718, 2716, 2415, 2717, 2715, 2716, 1719, 2712];
const VITE_BLOG_OLD = [3670, 3653, 3614, 3619, 3616];
const VITE_BLOG_NEW = [3684, 3660, 3662, 3662, 3769];
const paints = (fcp: number): Metrics => ({ score: 90, fcp, lcp: fcp + 400, si: fcp, tbt: 0, cls: 0 });

test("a paint time whose runs fall in separate clusters is red as inconclusive, naming them, never a pass", () => {
	assert.deepEqual(clusters(VITE_HOME_OLD), [[1860, 1868, 1969], [2415, 2416], [2565], [3013, 3017, 3017, 3020]]);
	assert.equal(clusters(VITE_BLOG_OLD), undefined);
	assert.equal(clusters(VITE_BLOG_NEW), undefined, 'one late run is an outlier, not a second cluster');
	const v = verdict(VITE_HOME_OLD.map(paints), VITE_HOME_NEW.map(paints), 'fcp');
	assert.equal(v.ok, false);
	assert.equal(v.bimodal?.side, 'old');
	const load = routeLoad(10, VITE_HOME_OLD.map((fcp) => ({ metrics: paints(fcp) })), VITE_HOME_NEW.map((fcp) => ({ metrics: paints(fcp) })));
	assert.match(loadFailures('/', load).find((f) => /First Contentful Paint/.test(f.check))!.actual, /^inconclusive: bimodal, the old page's 10 runs fall in 4 clusters: 1\.86 s-1\.97 s \(3 runs\), 2\.42 s \(2 runs\), 2\.56 s \(1 run\), 3\.01 s-3\.02 s \(4 runs\)$/);
});

test("a paint time is red for any slowdown beyond the old page's own noise and a frame, not only beyond 5% of it", () => {
	// 60 ms later on every run: under the old 5% allowance (181 ms) this passed.
	const v = verdict(VITE_BLOG_OLD.map(paints), VITE_BLOG_OLD.map((x) => paints(x + 60)), 'fcp');
	assert.equal(v.ok, false, JSON.stringify(v));
	// The /blog runs themselves: 43 ms later, within the 45.5 ms its old runs differ from each other by, so not told from noise.
	const blog = verdict(VITE_BLOG_OLD.map(paints), VITE_BLOG_NEW.map(paints), 'fcp');
	assert.equal(blog.worse, 43);
	assert.equal(blog.floor, 45.5);
	assert.equal(blog.ok, true);
});

test("on identical pages a route's lab metrics are red at most 5% of the time, and a first paint 5% later is red at least 99% of the time (seeded, so exact)", () => {
	let seed = 41181882;
	const uniform = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const gauss = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
	// Noise as the /blog runs show it: about 25 ms on a 3.6 s first paint, the paint times of a run moving together.
	const runs = (late: number) => Array.from({ length: 5 }, (): Metrics => {
		const shared = gauss();
		const fcp = Math.round(3630 + 25 * shared + late);
		return { score: Math.round(90 + 1.5 * gauss()), fcp, si: fcp + Math.round(10 * gauss()), lcp: fcp + 400 + Math.round(30 * gauss()), tbt: Math.max(0, Math.round(40 + 15 * gauss())), cls: 0 };
	});
	const red = (late: number, routes: number) => {
		let n = 0;
		for (let i = 0; i < routes; i++) if (judgeLoad(runs(0), runs(late)).some((v) => !v.ok)) n++;
		return n / routes;
	};
	const identical = red(0, 2000);
	assert.ok(identical <= 0.05, `identical pages red on ${identical * 100}% of routes`);
	const later = red(181, 2000);
	assert.ok(later >= 0.99, `a first paint 181 ms later red on ${later * 100}% of routes`);
});

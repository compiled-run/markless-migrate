import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cpuMultiplier, loadLine, psiFailures, psiLines, routeLoad, type LoadRun } from '../src/check/load.ts';
import { fieldData, measurePsi, psiRun, type Fetcher } from '../src/check/psi.ts';

const response = JSON.parse(readFileSync(join(import.meta.dirname, 'load-fixtures', 'psi-port.json'), 'utf8'));
const withLcp = (lcp: number, score = 0.69) => ({ ...response, lighthouseResult: { ...response.lighthouseResult, categories: { performance: { score } }, audits: { ...response.lighthouseResult.audits, 'largest-contentful-paint': { numericValue: lcp } } } });
const reply = (status: number, body: unknown) => ({ status, json: async () => body });

test("the CPU slowdown that makes this machine stand for PageSpeed's reference device follows Lighthouse's calculator", () => {
	assert.equal(cpuMultiplier(1300), 3);
	assert.ok(Math.abs(cpuMultiplier(1533) - 4) < 0.01);
	assert.ok(Math.abs(cpuMultiplier(4400) - 16.3) < 0.1, 'a fast laptop needs about 16x, not 4x');
	assert.equal(cpuMultiplier(800), 2);
	assert.equal(cpuMultiplier(150), 1);
	assert.equal(cpuMultiplier(100), 1);
});

test('a PageSpeed Insights response gives the lab metrics, the LCP element from Lighthouse 13, and the field data', async () => {
	const urls: string[] = [];
	const got = await psiRun('https://new.example/', 'mobile', { key: 'K' }, async (url) => (urls.push(url), reply(200, response)));
	assert.match(urls[0]!, /^https:\/\/www\.googleapis\.com\/pagespeedonline\/v5\/runPagespeed\?url=https%3A%2F%2Fnew\.example%2F&strategy=mobile&category=performance&key=K$/);
	assert.equal(got.run.metrics?.score, 69);
	assert.match(got.run.detail?.lcpElement ?? '', /h1\.text-white "The Build Tool for the Web"/);
	assert.ok(Object.keys(got.run.detail?.lcpPhases ?? {}).includes('Time to first byte'));
	assert.equal(got.lighthouse, '13.5.0');
	assert.equal(got.field?.scope, 'url');
	assert.equal(got.field?.p75.lcp, 1958);
	assert.equal(got.field?.p75.cls, 0);
	assert.equal(fieldData({ loadingExperience: { origin_fallback: true, metrics: {} }, originLoadingExperience: { overall_category: 'AVERAGE', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100 } } } })?.scope, 'origin');
});

test('a 429 is retried with backoff, and a quota that stays exhausted falls back to the calibrated lab, saying so', async () => {
	let calls = 0;
	const flaky: Fetcher = async () => (++calls < 3 ? reply(429, { error: { message: 'Quota exceeded for quota metric. More' } }) : reply(200, response));
	const ok = await psiRun('https://new.example/', 'mobile', { backoffMs: [1, 1, 1] }, flaky);
	assert.equal(calls, 3);
	assert.equal(ok.run.metrics?.score, 69);
	const exhausted = await measurePsi({ old: 'https://old.example', new: 'https://new.example' }, '/', { runs: 5, backoffMs: [1, 1] }, async () => reply(429, { error: { message: 'Quota exceeded for quota metric. More' } }));
	assert.deepEqual(exhausted, { unavailable: 'PSI unavailable (quota: Quota exceeded for quota metric), using PageSpeed-equivalent (lab, calibrated)' });
	assert.deepEqual(psiLines(exhausted), ['PageSpeed Insights: PSI unavailable (quota: Quota exceeded for quota metric), using PageSpeed-equivalent (lab, calibrated)']);
	assert.equal(psiFailures('/', exhausted), undefined, 'the lab gates the route instead');
	const local = await measurePsi({ old: 'http://127.0.0.1:3000', new: 'https://new.example' }, '/', {}, async () => assert.fail('never called'));
	assert.match('unavailable' in local ? local.unavailable : '', /cannot reach http:\/\/127\.0\.0\.1:3000: it measures deployed URLs only/);
});

test('runs alternate old and new, and a new page slower in every PageSpeed run is red on PageSpeed', async () => {
	const order: string[] = [];
	const psi = await measurePsi({ old: 'https://old.example', new: 'https://new.example' }, '/', { key: 'K', runs: 5, strategies: ['mobile'] }, async (url) => {
		const old = url.includes('old.example');
		order.push(old ? 'old' : 'new');
		return reply(200, old ? withLcp(5050, 0.79) : withLcp(8030, 0.69));
	});
	assert.deepEqual(order, ['old', 'new', 'new', 'old', 'old', 'new', 'new', 'old', 'old', 'new']);
	const failures = psiFailures('/', psi)!;
	assert.deepEqual(failures.map((f) => f.check).sort(), ['page load: Largest Contentful Paint (PageSpeed Insights, mobile)', 'page load: Performance score (PageSpeed Insights, mobile)']);
	assert.match(failures.find((f) => /Largest/.test(f.check))!.actual, /^8\.03 s, the median of 5 .*2\.98 s worse/);
	const lines = psiLines(psi);
	assert.match(lines[0]!, /^PageSpeed Insights mobile, median of 5, Lighthouse 13\.5\.0: score 79 -> 69 \(worse\), .*LCP 5\.05 s -> 8\.03 s \(worse\)/);
	assert.match(lines[1]!, /field data \(Chrome UX Report, p75\): old this URL FAST: FCP 1375 ms, LCP 1958 ms/);
});

test('a report PageSpeed Insights repeats from its cache is asked for again, so every run counted is a new one', async () => {
	let calls = 0;
	const stamps = ['t1', 't1', 't2', 't3', 't3', 't3', 't4'];
	const psi = await measurePsi({ old: 'https://old.example', new: 'https://new.example' }, '/', { runs: 2, strategies: ['mobile'], repeatWaitMs: 1 }, async () => reply(200, { ...response, analysisUTCTimestamp: stamps[calls++] }));
	assert.equal(calls, 7);
	assert.ok('strategies' in psi && psi.strategies[0]!.old.runs.length === 2 && psi.strategies[0]!.new.runs.length === 2);
});

test('the lab line says it is the PageSpeed-equivalent, calibrated, with the slowdown it used', () => {
	const run: LoadRun = { metrics: { score: 80, fcp: 1500, lcp: 3000, si: 2000, tbt: 100, cls: 0 }, benchmarkIndex: 4400, cpuMultiplier: 16.3 };
	assert.match(loadLine(routeLoad(4, [run, run, run, run], [run, run, run, run])), /^page load, PageSpeed-equivalent \(lab, calibrated; Lighthouse mobile, median of 4, 16\.3x CPU for benchmarkIndex 4400\)/);
});

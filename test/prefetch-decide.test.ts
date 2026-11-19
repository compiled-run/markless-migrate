import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routerOptions, routerPrefetchSupport } from '../src/convert/prefetch-config.ts';
import { prefetchRecorder } from '../src/prefetch/convert.ts';
import { decidePrefetch, declaredTriggers, MAX_CONCURRENCY } from '../src/prefetch/decide.ts';
import type { ConditionResult, PrefetchFacts, Trigger, TriggerEvidence } from '../src/prefetch/facts.ts';

const e = (tested: number, fired: number): TriggerEvidence => ({ tested, fired, targets: Array.from({ length: fired }, (_, i) => `/p${i}`), bytes: fired * 1000, cancelled: 0 });
const page = (route: string, triggers: Partial<Record<Trigger, TriggerEvidence>>, more: Partial<PrefetchFacts> = {}): PrefetchFacts => ({ route, browser: 'chromium', shapes: ['{path}.data'], fullLoads: false, links: 30, triggers, concurrency: 2, bytesBeforeClick: 0, hints: { links: [], speculationRules: [] }, requests: [], ...more });
const everywhere = (r: ConditionResult) => ({ 'no-info': r, '4g': r, '3g': r, '2g': r, 'slow-2g': r, 'save-data': r, 'slow-link': r });

test('an original that fetches links as they come into view on every network: the port does the same, idle adds nothing, intent stays on', () => {
	const facts = [page('/a', { load: e(100, 4), visible: e(20, 20), viewport: e(4, 60) }, { concurrency: 5, conditions: everywhere({ load: true, visible: true, viewport: true, hover: false }), revisit: { target: '/b', by: 'link', refetched: false, fromCache: false, afterMs: 2600 } }), page('/b', { load: e(100, 6), viewport: e(2, 20) })];
	const d = decidePrefetch(facts);
	assert.deepEqual(d.setting, { intent: 'all', viewport: 'all', idle: 'none', concurrency: 5 });
	assert.ok(d.reasons.some((r) => /when the link comes into view, on every network we tried/.test(r.says)), JSON.stringify(d.reasons));
	assert.ok(d.reasons.some((r) => /under Save-Data/.test(r.says)), 'the router never prefetches under Save-Data: said, not hidden');
	assert.deepEqual(d.loadLinks, ['/p0', '/p1', '/p2', '/p3', '/p4', '/p5'], 'a few links fetched at load are per-link facts, not an app-wide trigger');
	assert.equal(d.revisitFromMemory, true);
});

test('an original that fetches nothing ahead: intent alone', () => {
	const d = decidePrefetch([page('/a', { load: e(10, 0), viewport: e(4, 0), hover: e(2, 0), focus: e(2, 0), pointerdown: e(2, 0) })]);
	assert.deepEqual(d.setting, { intent: 'all', viewport: 'none', idle: 'none', concurrency: 2 });
	assert.ok(d.reasons.some((r) => /fetches nothing before a click/.test(r.says)));
});

test('an original that fetches on hover only on fast connections: intent on fast connections, nothing more eager', () => {
	const d = decidePrefetch([page('/a', { viewport: e(4, 0), hover: e(2, 2) }, { conditions: { '4g': { hover: true }, 'no-info': { hover: true }, '3g': { hover: false }, 'slow-link': { hover: false } } })]);
	assert.deepEqual(d.setting, { intent: 'fast', viewport: 'none', idle: 'none', concurrency: 2 });
});

test('an original that fetches in view only on fast connections: viewport on fast connections', () => {
	const d = decidePrefetch([page('/a', { viewport: e(4, 8) }, { conditions: { '4g': { viewport: true }, '3g': { viewport: false }, 'save-data': { viewport: false } } })]);
	assert.equal(d.setting.viewport, 'fast');
});

test('a trigger never tried under other networks is set for every network, so the port is not the less eager side', () => {
	assert.equal(decidePrefetch([page('/a', { viewport: e(4, 8) })]).setting.viewport, 'all');
});

test('an original that fetches every link at load: idle and viewport on, with what the router cannot do said', () => {
	const d = decidePrefetch([page('/a', { load: e(20, 20), viewport: e(0, 0) })]);
	assert.deepEqual({ idle: d.setting.idle, viewport: d.setting.viewport }, { idle: 'none', viewport: 'all' }, 'viewport on every network covers what idle would');
	assert.ok(d.reasons.some((r) => /links off screen at load; the router has no such setting/.test(r.says)));
});

test('a trigger that fired on a minority of pages does not decide for the site', () => {
	const d = decidePrefetch([page('/a', { viewport: e(4, 3) }), page('/b', { viewport: e(4, 0) }), page('/c', { viewport: e(4, 0) })]);
	assert.equal(d.setting.viewport, 'none');
});

test('a page whose recording failed is left out and named', () => {
	const d = decidePrefetch([page('/a', { hover: e(2, 2) }), page('/b', {}, { error: 'browser died' })]);
	assert.deepEqual(d.failed, ['/b']);
	assert.equal(d.pages, 1);
});

test('the router options carry the setting only when the app\'s router takes it, and only the triggers it names', () => {
	const setting = { intent: 'all', viewport: 'all', idle: 'none', concurrency: 5 } as const;
	const networks = ['none', 'fast', 'all'];
	assert.equal(routerOptions(setting, undefined), '');
	assert.equal(routerOptions(setting, { triggers: ['intent', 'viewport', 'idle'], networks }), "{ prefetch: { intent: 'all', viewport: 'all', idle: 'none', concurrency: 5 } }");
	assert.equal(routerOptions(setting, { triggers: ['intent'], networks }), "{ prefetch: { intent: 'all', concurrency: 5 } }");
	assert.throws(() => routerOptions(setting, { triggers: ['intent'], networks: ['on', 'off'] }), /takes on, off for intent, not all/, 'a value the router does not take fails loudly');
});

test('vite.config.ts hands the router those options, and nothing when there are none', async () => {
	const { viteConfig } = await import('../src/convert/index.ts');
	assert.match(viteConfig([], { vercel: [] }, "{ prefetch: { intent: 'all', concurrency: 2 } }"), /router\(\{ prefetch: \{ intent: 'all', concurrency: 2 \} \}\)\]/);
	assert.match(viteConfig([]), /router\(\)\]/);
});

test('declared hints the recording could not see fetched stand for what the page does, never for nothing ahead', () => {
	const hints = { links: [{ rel: 'prefetch', href: '/a' }], speculationRules: [{ prefetch: [{ source: 'document', eagerness: 'moderate' }] }] };
	const d = decidePrefetch([page('/a', { load: e(10, 0), viewport: e(4, 0) }, { hints, unobserved: 'not seen' })]);
	assert.equal(d.setting.idle, 'all', JSON.stringify(d.setting));
	assert.equal(d.setting.intent, 'all');
	assert.ok(d.reasons.some((r) => /declare prefetch hints the recording could not see/.test(r.says)));
	assert.deepEqual([...declaredTriggers({ links: [], speculationRules: [{ prefetch: [{ source: 'list', urls: ['/x'] }] }, { prerender: [{ source: 'document', eagerness: 'conservative' }] }] })].sort(), ['pointerdown', 'visible']);
});

test('a timer after load reads as fetching at load, a first scroll as fetching in view', () => {
	assert.equal(decidePrefetch([page('/a', { timer: e(30, 30) })]).setting.viewport, 'all');
	assert.equal(decidePrefetch([page('/a', { scroll: e(4, 20), viewport: e(4, 0) })]).setting.viewport, 'all');
});

test('concurrency is capped at 6, and the cap is said', () => {
	const d = decidePrefetch([page('/a', { viewport: e(4, 40) }, { concurrency: 40 })]);
	assert.equal(d.setting.concurrency, MAX_CONCURRENCY);
	assert.ok(d.reasons.some((r) => /the original had 40, but past 6/.test(r.says)));
});

test('Save-Data is named by trigger, and a few links fetched at load under Save-Data do not make it a sentence', () => {
	const few = decidePrefetch([page('/a', { load: e(100, 4), hover: e(2, 2) }, { conditions: { 'save-data': { load: true, hover: true } } })]);
	assert.ok(few.reasons.some((r) => r.says === 'Under Save-Data the original still fetches links on hover. The router never fetches ahead under Save-Data, so there the port is less eager than the original.'), JSON.stringify(few.reasons));
	const none = decidePrefetch([page('/a', { load: e(100, 4), hover: e(2, 2) }, { conditions: { 'save-data': { load: true, hover: false } } })]);
	assert.ok(!none.reasons.some((r) => /Under Save-Data/.test(r.says)));
});

test('repeated condition runs that disagreed are said, and the port takes the more eager reading', () => {
	const d = decidePrefetch([page('/a', { viewport: e(4, 8) }, { conditions: { '3g': { viewport: true, runs: 3, disagreed: ['viewport'] } } })]);
	assert.equal(d.setting.viewport, 'all');
	assert.ok(d.reasons.some((r) => /disagreed on viewport on 3g/.test(r.says)));
});

test('the router support says why it cannot take the setting: not installed, or too old', async () => {
	const apps: string[] = [];
	const app = async (vite?: string) => {
		const dir = await mkdtemp(join(tmpdir(), 'mm-router-'));
		apps.push(dir);
		await writeFile(join(dir, 'package.json'), '{"name":"app","type":"module"}');
		if (vite !== undefined) {
			const pkg = join(dir, 'node_modules', '@markless', 'router');
			await mkdir(pkg, { recursive: true });
			await writeFile(join(pkg, 'package.json'), '{"name":"@markless/router","type":"module","exports":{"./vite":"./vite.js"}}');
			await writeFile(join(pkg, 'vite.js'), vite);
		}
		return dir;
	};
	try {
		assert.equal(((await routerPrefetchSupport(await app())) as { refused?: string }).refused, 'not installed');
		assert.equal(((await routerPrefetchSupport(await app('export const router = () => ({});'))) as { refused?: string }).refused, 'too old');
		const current = await app("export const router = () => ({}); export const PREFETCH_TRIGGERS = ['intent', 'viewport', 'idle']; export const PREFETCH_NETWORKS = ['none', 'fast', 'all'];");
		assert.deepEqual(await routerPrefetchSupport(current), { triggers: ['intent', 'viewport', 'idle'], networks: ['none', 'fast', 'all'] });
		assert.equal(routerOptions({ intent: 'all', viewport: 'all', idle: 'none', concurrency: 2 }, { refused: 'too old', says: '' }), '');
	} finally {
		for (const dir of apps) await rm(dir, { recursive: true, force: true });
	}
});

test('a partial convert decides from the last convert\'s pages and its own, and keeps the others in prefetch.json', async () => {
	const state = await mkdtemp(join(tmpdir(), 'mm-state-'));
	try {
		const stored = { routes: { '/a': page('/a', { viewport: e(4, 8) }), '/b': page('/b', { viewport: e(4, 8) }), '/gone': page('/gone', {}) } };
		await writeFile(join(state, 'prefetch.json'), JSON.stringify(stored));
		const recorder = await prefetchRecorder(state, 'http://127.0.0.1:9', ['/a', '/b', '/c'], () => {});
		assert.deepEqual(recorder.recorded().map((f) => f.route).sort(), ['/a', '/b'], 'a page no longer listed is not read');
		assert.equal(recorder.fromBefore(), 2);
		assert.equal(decidePrefetch(recorder.recorded()).setting.viewport, 'all');
		await recorder.save();
		assert.deepEqual(Object.keys((JSON.parse(await readFile(join(state, 'prefetch.json'), 'utf8')) as { routes: object }).routes).sort(), ['/a', '/b']);
	} finally {
		await rm(state, { recursive: true, force: true });
	}
});

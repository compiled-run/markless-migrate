import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routerOptions, routerPrefetchSupport } from '../src/convert/prefetch-config.ts';
import { prefetchRecorder, storedFacts } from '../src/prefetch/convert.ts';
import { decidePrefetch, declaredTriggers, MAX_CONCURRENCY } from '../src/prefetch/decide.ts';
import type { ConditionResult, PrefetchFacts, Trigger, TriggerEvidence } from '../src/prefetch/facts.ts';

// The prefetch kind's record version (src/convert/record-key.ts), as convert hands it to the recorder.
const VERSION = 'prefetch kind version';

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

test('an original that fetches nothing ahead, its hover, focus and press tried: intent alone, on fast connections only', () => {
	const d = decidePrefetch([page('/a', { load: e(10, 0), viewport: e(4, 0), hover: e(2, 0), focus: e(2, 0), pointerdown: e(2, 0) })]);
	assert.deepEqual(d.setting, { intent: 'fast', viewport: 'none', idle: 'none', concurrency: 2 });
	assert.ok(d.reasons.some((r) => /fetches nothing before a click.*on fast connections only/.test(r.says)), JSON.stringify(d.reasons));
});

test('intent the original could not be tried on stays on every network; tried and never fired, fast connections only', () => {
	assert.equal(decidePrefetch([page('/a', { viewport: e(4, 8) })]).setting.intent, 'all', 'every link was fetched in view before it could be hovered');
	const tried = decidePrefetch([page('/a', { viewport: e(4, 8), hover: e(2, 0) })]);
	assert.equal(tried.setting.intent, 'fast');
	assert.ok(tried.reasons.some((r) => /tried on the original and fetched nothing/.test(r.says)));
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

test('tried only on 4G is untested on slow networks, so every network; tried on a slow one where it stopped, fast only', () => {
	assert.equal(decidePrefetch([page('/a', { viewport: e(4, 8) }, { conditions: { '4g': { viewport: true }, 'no-info': { viewport: true } } })]).setting.viewport, 'all');
	assert.equal(decidePrefetch([page('/a', { viewport: e(4, 8) }, { conditions: { '4g': { viewport: true }, '3g': { viewport: false } } })]).setting.viewport, 'fast');
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

test('the router options carry the setting only when the app\'s router takes it, built as data, and say why not otherwise', () => {
	const setting = { intent: 'all', viewport: 'all', idle: 'none', concurrency: 5 } as const;
	const networks = ['none', 'fast', 'all'];
	assert.deepEqual(routerOptions(setting, { triggers: ['intent', 'viewport', 'idle'], networks }), { args: '{"prefetch":{"intent":"all","viewport":"all","idle":"none","concurrency":5}}', missing: [] });
	assert.deepEqual(routerOptions(setting, { triggers: ['intent'], networks }), { args: '{"prefetch":{"intent":"all","concurrency":5}}', missing: ['viewport'] });
	assert.deepEqual(routerOptions(setting, { triggers: ['intent'], networks: ['on', 'off'] }), { notApplied: "the app's router takes on, off for intent, not all" }, 'a value the router does not take leaves the setting out and says why');
	assert.deepEqual(routerOptions(setting, { refused: 'too old', says: 'old' }), { notApplied: 'old' });
	assert.ok(!('budget' in JSON.parse((routerOptions(setting, { triggers: ['intent', 'viewport', 'idle'], networks }) as { args: string }).args).prefetch), "the port's budget is the router's own: never derived from the original's bytes");
});

test('vite.config.ts hands the router those options, and nothing when there are none', async () => {
	const { viteConfig } = await import('../src/convert/index.ts');
	assert.ok(viteConfig([], { vercel: [] }, '{"prefetch":{"intent":"all","concurrency":2}}').includes('router({"prefetch":{"intent":"all","concurrency":2}})]'));
	assert.match(viteConfig([]), /router\(\)\]/);
});

test('declared hints the recording could not see fetched stand for what the page does, when they name its link targets', () => {
	const hints = { links: [{ rel: 'prefetch', href: '/b' }], speculationRules: [{ prefetch: [{ source: 'document', eagerness: 'moderate' }] }] };
	const d = decidePrefetch([page('/a', { load: e(10, 0), viewport: e(4, 0) }, { hints, targets: ['/b', '/c'], unobserved: 'not seen' })]);
	assert.equal(d.setting.idle, 'all', JSON.stringify(d.setting));
	assert.equal(d.setting.intent, 'all');
	assert.ok(d.reasons.some((r) => /declare prefetch hints the recording could not see/.test(r.says)));
	assert.deepEqual([...declaredTriggers({ hints: { links: [], speculationRules: [{ prefetch: [{ source: 'list', urls: ['/c'] }] }, { prerender: [{ source: 'document', eagerness: 'conservative' }] }] }, targets: ['/c'] })].sort(), ['pointerdown', 'visible']);
});

test('a prefetch hint for a file that is not one of the page\'s link targets (a script chunk) is not fetching pages', () => {
	const chunk = { hints: { links: [{ rel: 'prefetch', href: '/_next/static/chunks/12.js' }], speculationRules: [{ prefetch: [{ source: 'list', urls: ['/api/x'] }] }] }, targets: ['/b'] };
	assert.deepEqual([...declaredTriggers(chunk)], []);
	assert.equal(decidePrefetch([page('/a', { load: e(10, 0), viewport: e(4, 0) }, { ...chunk, unobserved: 'not seen' })]).setting.idle, 'none');
});

test('the original\'s bytes ahead are reported as a fact, never turned into a budget that could stop the port', () => {
	const d = decidePrefetch([page('/a', { load: e(10, 0), viewport: e(4, 0) }, { hints: { links: [{ rel: 'prefetch', href: '/b' }], speculationRules: [] }, targets: ['/b'], unobserved: 'not seen' })]);
	assert.equal(d.aheadBytes, 0);
	assert.equal(d.setting.idle, 'all');
	assert.ok(!('budgetCap' in d));
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

test('repeated condition runs that disagreed are said as the recorder decided them: by the majority of three', () => {
	const d = decidePrefetch([page('/a', { viewport: e(4, 8) }, { conditions: { '3g': { viewport: true, runs: 3, disagreed: ['viewport'] } } })]);
	assert.equal(d.setting.viewport, 'all');
	assert.ok(d.reasons.some((r) => r.says === 'Repeated runs disagreed on viewport on 3g; the recording kept the majority of three runs (a tie counts as fired).'));
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
		assert.equal(((await routerPrefetchSupport(await app('throw new Error("dist is broken");'))) as { refused?: string }).refused, 'unloadable', 'a router that fails to load leaves the setting out, never stops the convert');
		assert.equal(((await routerPrefetchSupport(await app('export const PREFETCH_TRIGGERS = "intent";'))) as { refused?: string }).refused, 'unreadable');
		const current = await app("export const router = () => ({}); export const PREFETCH_TRIGGERS = ['intent', 'viewport', 'idle']; export const PREFETCH_NETWORKS = ['none', 'fast', 'all'];");
		assert.deepEqual(await routerPrefetchSupport(current), { triggers: ['intent', 'viewport', 'idle'], networks: ['none', 'fast', 'all'] });
	} finally {
		for (const dir of apps) await rm(dir, { recursive: true, force: true });
	}
});

test('a partial convert decides from the last convert\'s pages and its own, and keeps the others in prefetch.json, each read back only at the page it was recorded from', async () => {
	const state = await mkdtemp(join(tmpdir(), 'mm-state-'));
	try {
		const at = (facts: object, page: string) => ({ ...facts, page });
		const stored = { version: VERSION, routes: { '/a': at(page('/a', { viewport: e(4, 8) }), 'pa'), '/b': at(page('/b', { viewport: e(4, 8) }), 'pb'), '/d': at(page('/d', { load: e(4, 8) }), 'old-d'), '/gone': at(page('/gone', {}), 'pg') } };
		await writeFile(join(state, 'prefetch.json'), JSON.stringify(stored));
		const pages: Record<string, string> = { '/a': 'pa', '/b': 'pb', '/c': 'pc', '/d': 'new-d' };
		const recorder = await prefetchRecorder(state, ['/a', '/b', '/c', '/d'], VERSION, async (route) => pages[route] ?? '', () => {});
		assert.deepEqual(recorder.recorded().map((f) => f.route).sort(), ['/a', '/b'], 'a page no longer listed, or whose old page changed since it was recorded, is not read');
		assert.deepEqual(recorder.fromBefore(), ['/a', '/b']);
		assert.deepEqual(recorder.unread(), [{ route: '/d', why: "its last convert's facts were recorded from an old page that has changed since" }], 'each listed page whose stored facts are not read back is named, with why');
		const older = await prefetchRecorder(state, ['/a'], 'another-version', async (route) => pages[route] ?? '', () => {});
		assert.deepEqual(older.unread(), [{ route: '/a', why: "its last convert's facts were recorded by another prefetch recorder version" }]);
		assert.equal(decidePrefetch(recorder.recorded()).setting.viewport, 'all');
		recorder.kept(page('/c', { viewport: e(4, 8) }));
		await recorder.save();
		const saved = JSON.parse(await readFile(join(state, 'prefetch.json'), 'utf8')) as { routes: Record<string, { page?: string }> };
		assert.deepEqual(Object.fromEntries(Object.entries(saved.routes).map(([route, f]) => [route, f.page])), { '/a': 'pa', '/b': 'pb', '/c': 'pc' }, 'each page is saved with the key of the old page it was recorded from');
	} finally {
		await rm(state, { recursive: true, force: true });
	}
});

test('a stored prefetch.json another recorder version wrote, or of another shape, is not read', async () => {
	const version = VERSION;
	const facts = page('/a', { viewport: e(4, 8) });
	const pages = new Map([['/a', 'pa']]);
	assert.deepEqual(Object.keys(storedFacts({ version, routes: { '/a': { ...facts, page: 'pa' } } }, version, pages)), ['/a']);
	assert.deepEqual(storedFacts({ version, routes: { '/a': facts } }, version, pages), {}, 'facts that name no page are not read');
	assert.deepEqual(storedFacts({ version, routes: { '/a': { ...facts, page: 'older' } } }, version, pages), {});
	assert.deepEqual(storedFacts({ version: 'older', routes: { '/a': { ...facts, page: 'pa' } } }, version, pages), {});
	assert.deepEqual(storedFacts({ routes: { '/a': { ...facts, page: 'pa' } } }, version, pages), {});
	assert.deepEqual(storedFacts({ version, routes: { '/a': { route: '/b', page: 'pa' } } }, version, pages), {});
});

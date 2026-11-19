import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routerOptions } from '../src/convert/prefetch-config.ts';
import { decidePrefetch } from '../src/prefetch/decide.ts';
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
	assert.equal(routerOptions(setting, undefined), '');
	assert.equal(routerOptions(setting, { triggers: ['intent', 'viewport', 'idle'] }), "{ prefetch: { intent: 'all', viewport: 'all', idle: 'none', concurrency: 5 } }");
	assert.equal(routerOptions(setting, { triggers: ['intent'] }), "{ prefetch: { intent: 'all', concurrency: 5 } }");
});

test('vite.config.ts hands the router those options, and nothing when there are none', async () => {
	const { viteConfig } = await import('../src/convert/index.ts');
	assert.match(viteConfig([], { vercel: [] }, "{ prefetch: { intent: 'all', concurrency: 2 } }"), /router\(\{ prefetch: \{ intent: 'all', concurrency: 2 \} \}\)\]/);
	assert.match(viteConfig([]), /router\(\)\]/);
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv, openPage } from '../src/check/browser.ts';
import { DEFAULT_FREEZE, pinnedBy } from '../src/check/freeze.ts';
import { blocker } from '../src/check/trackers.ts';
import { VIEWPORTS } from '../src/check/types.ts';

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser?.close());

async function sample(freeze = true) {
	const env = defaultEnv('http://127.0.0.1:1', freeze ? {} : { freeze: false });
	const { context, page } = await openPage(browser, env, VIEWPORTS[0]!);
	try {
		await page.route('http://127.0.0.1:1/', (route) => route.fulfill({ body: '<p>x</p>', contentType: 'text/html' }));
		await page.goto('http://127.0.0.1:1/');
		return await page.evaluate(async () => {
			const first = Date.now();
			const iso = new Date().toISOString();
			const later = await new Promise<number>((done) => setTimeout(() => done(Date.now()), 250));
			return {
				first,
				iso,
				later,
				asString: typeof Date(),
				instance: new Date() instanceof Date,
				explicit: new Date(0).getTime(),
				random: [Math.random(), Math.random()],
				bytes: [...crypto.getRandomValues(new Uint8Array(4))],
				uuid: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '',
				origin: performance.timeOrigin,
				zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				language: navigator.language,
			};
		});
	} finally {
		await context.close();
	}
}

test('the clock starts at a fixed instant and moves only when a timer fires, by the time it was due', async () => {
	const a = await sample();
	assert.equal(a.first, DEFAULT_FREEZE.time);
	assert.equal(a.iso, new Date(DEFAULT_FREEZE.time).toISOString());
	assert.equal(a.later, DEFAULT_FREEZE.time + 250);
	assert.equal(a.origin, DEFAULT_FREEZE.time);
	assert.equal(a.asString, 'string');
	assert.equal(a.instance, true);
	assert.equal(a.explicit, 0, 'a date built from a value is untouched');
});

test('randomness is seeded: two pages draw the same numbers, bytes and UUIDs, and UUIDs keep the v4 format', async () => {
	const [a, b] = [await sample(), await sample()];
	assert.deepEqual(a.random, b.random);
	assert.notEqual(a.random[0], a.random[1]);
	assert.deepEqual(a.bytes, b.bytes);
	assert.equal(a.uuid, b.uuid);
	assert.match(a.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('timezone and locale are emulated per run; unfrozen pages keep the real clock', async () => {
	const a = await sample();
	assert.equal(a.zone, 'UTC');
	assert.equal(a.language, 'en-US');
	const real = await sample(false);
	assert.ok(Math.abs(real.first - Date.now()) < 60_000);
});

test('tracker hosts and their subdomains are blocked; the list can be extended and overridden', () => {
	const block = blocker();
	assert.equal(block('www.googletagmanager.com'), true);
	assert.equal(block('googletagmanager.com'), true);
	assert.equal(block('notgoogletagmanager.com'), false);
	assert.equal(block('cms.example.com'), false);
	const custom = blocker({ add: ['ads.example.com'], allow: ['googletagmanager.com'] });
	assert.equal(custom('x.ads.example.com'), true);
	assert.equal(custom('www.googletagmanager.com'), false);
});

test('each nondeterminism source the scan finds is reported as pinned, blocked or left to the baseline', () => {
	assert.equal(pinnedBy('Math.random', 'client', DEFAULT_FREEZE), 'pinned in the browser (seeded)');
	assert.equal(pinnedBy('new Date', undefined, DEFAULT_FREEZE), 'pinned in the browser; on the server left to the noise baseline (fixed clock)');
	assert.equal(pinnedBy('Date.now', 'server', DEFAULT_FREEZE), 'not pinned: runs on the server, left to the noise baseline (repeated OLD loads)');
	assert.equal(pinnedBy('analytics', 'client', DEFAULT_FREEZE), 'blocked: its hosts are on the tracker block list');
	assert.equal(pinnedBy('performance.now', 'client', DEFAULT_FREEZE), 'not pinned: relative timers run in real time');
	assert.equal(pinnedBy('feature flag', 'client', DEFAULT_FREEZE), 'not pinned: left to the noise baseline');
	assert.equal(pinnedBy('Math.random', 'client', false), 'not pinned: freezing is off');
});

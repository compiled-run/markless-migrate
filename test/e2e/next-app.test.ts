import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureRoute } from '../../src/check/capture.ts';
import { compareRoute } from '../../src/check/compare.ts';
import { runCheck } from '../../src/check/run.ts';
import { VIEWPORTS } from '../../src/check/types.ts';
import { summarize } from '../../src/check/summary.ts';
import { plan } from '../../src/plan/inventory.ts';
import { buildNext, failuresIn as failure, limited, redDimensions, startNext, type App, type Mutation } from './harness.ts';

const ROUTES = ['/', '/en', '/fr', '/en/about', '/fr/about', '/en/contact', '/de', '/en/missing'];

const MUTATIONS: Mutation[] = [
	{
		name: 'title',
		route: '/en/about',
		edits: [{ file: 'app/dictionaries.ts', find: "title: 'About us | Harbour Coffee'", replace: "title: 'About | Harbour Coffee'" }],
		red: ['seo'],
		expect: (report) => {
			const title = failure(report, 'seo').find((f) => f.check === 'title');
			assert.equal(title?.expected, '"About us | Harbour Coffee"');
			assert.equal(title?.actual, '"About | Harbour Coffee"');
			assert.ok(failure(report, 'seo').some((f) => f.check === 'meta:og:title'));
		},
	},
	{
		name: 'hreflang',
		route: '/en',
		edits: [{ file: 'app/metadata.ts', find: 'fr: `/fr${path}`, ', replace: '' }],
		red: ['seo'],
		expect: (report) => {
			const seo = failure(report, 'seo');
			assert.deepEqual(seo.map((f) => f.check), ['hreflang:fr']);
			assert.equal(seo[0]!.expected, '"https://harbour.example/fr"');
			assert.equal(seo[0]!.actual, '(absent)');
		},
	},
	{
		name: 'heading',
		route: '/en',
		edits: [{ file: 'app/dictionaries.ts', find: "heading: 'Fresh coffee, roasted by the harbour'", replace: "heading: 'Fresh coffee from the harbour'" }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const aria = failure(report, 'rendered').find((f) => f.check === 'accessibility tree');
			assert.match(aria!.expected, /heading "Fresh coffee, roasted by the harbour"/);
			assert.match(aria!.actual, /heading "Fresh coffee from the harbour"/);
		},
	},
	{
		name: 'alt-text',
		route: '/en',
		edits: [{ file: 'app/[lang]/page.tsx', find: 'alt={t.heroAlt}', replace: 'alt=""' }],
		red: ['rendered'],
		expect: (report) => {
			const f = failure(report, 'rendered').find((x) => x.check === 'accessibility tree');
			assert.match(f!.expected, /img "Sacks of green coffee beans stacked by the roaster"/);
			assert.equal(f!.actual, '(absent)');
		},
	},
	{
		name: 'font-size',
		route: '/en',
		edits: [{ file: 'app/globals.css', find: '.lede { font-size: 18px;', replace: '.lede { font-size: 21px;' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const css = failure(report, 'css');
			assert.ok(css.length >= 1);
			assert.ok(css.every((f) => /paragraph "We roast in small batches/.test(f.check) && f.expected.startsWith('font-size: 18px') && f.actual.startsWith('font-size: 21px')), JSON.stringify(css, null, 1));
		},
	},
	{
		name: 'missing-image',
		route: '/en',
		edits: [{ file: 'public/hero.png', remove: true }],
		red: ['assets', 'visual'],
		expect: (report) => {
			const assets = failure(report, 'assets');
			assert.ok(assets.some((f) => f.check.startsWith('image #1') && f.expected === '640x320' && f.actual === 'broken'), JSON.stringify(assets, null, 1));
			assert.ok(assets.some((f) => f.check.startsWith('image /_next/image?url=%2Fhero.png') && /^4\d\d$/.test(f.actual)));
		},
	},
	{
		name: 'status-code',
		route: '/',
		edits: [{ file: 'next.config.ts', find: 'permanent: false', replace: 'permanent: true' }],
		red: ['http'],
		expect: (report) => {
			const [f] = failure(report, 'http');
			assert.equal(f?.check, 'redirect chain hop 1');
			assert.equal(f?.expected, '307 /');
			assert.equal(f?.actual, '308 /');
		},
	},
	{
		name: 'extra-js',
		route: '/en',
		edits: [
			{
				file: 'app/[lang]/counter.tsx',
				append: `\nconst table = [${Array.from({ length: 6000 }, (_, i) => (i * 7919) % 10007).join(',')}];\nlet sum = 0;\nfor (const n of table) sum += n;\n(globalThis as { checksum?: number }).checksum = sum;\n`,
			},
		],
		red: ['weight'],
		expect: (report) => {
			const checks = failure(report, 'weight').map((f) => f.check).sort();
			assert.deepEqual(checks, ['JavaScript downloaded', 'JavaScript run at load']);
		},
	},
	{
		name: 'noise-word',
		route: '/en',
		edits: [{ file: 'app/dictionaries.ts', find: "rendered: 'Page rendered at'", replace: "rendered: 'Page generated at'" }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const text = failure(report, 'rendered').find((f) => f.check === 'visible text');
			assert.match(text!.expected, /^Page rendered at \d{4}-/);
			assert.match(text!.actual, /^Page generated at \d{4}-/);
		},
	},
];

describe('next.js app router app', () => {
	let browser: Browser;
	let old: App;
	let twin: App;
	const mutants = new Map<string, App>();

	before(async () => {
		browser = await chromium.launch();
		const builds = [{ name: 'original', edits: [] }, { name: 'rebuild', edits: [] }, ...MUTATIONS];
		const dirs = await limited(builds, 3, (b) => buildNext(b.name, b.edits));
		const apps = await Promise.all(dirs.map(startNext));
		old = apps[0]!;
		twin = apps[1]!;
		MUTATIONS.forEach((m, i) => mutants.set(m.name, apps[i + 2]!));
	});

	after(async () => {
		await Promise.all([old?.stop(), twin?.stop(), ...[...mutants.values()].map((m) => m.stop())]);
		await browser?.close();
	});

	test('an independent rebuild of the same source is green on every route', async () => {
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ROUTES, browser });
		process.stdout.write(`\n${summarize(report)}`);
		assert.deepEqual(redDimensions(report), [], summarize(report));
	});

	test('without the noise baseline the same comparison goes red, so the baseline is doing work', async () => {
		const oldA = await captureRoute(browser, old.origin, '/en', VIEWPORTS);
		const next = await captureRoute(browser, twin.origin, '/en', VIEWPORTS);
		const result = compareRoute('/en', [oldA, oldA], next, new Map());
		assert.ok(result.failures.some((f) => f.dimension === 'rendered' && /Page rendered at/.test(f.expected)), JSON.stringify(result.failures, null, 1));
	});

	test('plan crawls every locale and records the root redirect', async () => {
		const inventory = await plan({ origin: old.origin, source: new URL('../../fixtures/next-app', import.meta.url).pathname, browser });
		assert.deepEqual(inventory.routes.map((r) => r.route), ['/', '/en', '/en/about', '/en/contact', '/fr', '/fr/about', '/fr/contact']);
		assert.equal(inventory.routes[0]!.redirectsTo, '/en');
		assert.deepEqual(inventory.locales, ['en', 'fr']);
		assert.equal(inventory.source?.framework, 'next');
		assert.deepEqual(inventory.source?.fileRoutes, ['/[lang]', '/[lang]/about', '/[lang]/contact', '/api/contact']);
	});

	for (const mutation of MUTATIONS) {
		test(`mutation "${mutation.name}" turns ${mutation.red.join(' + ')} red and nothing else`, async () => {
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: mutants.get(mutation.name)!.origin, routes: [mutation.route], browser });
			if (process.env.SHOW_SUMMARY) process.stdout.write(`\n${summarize(report)}`);
			assert.deepEqual(redDimensions(report), [...mutation.red].sort(), summarize(report));
			mutation.expect(report);
		});
	}
});

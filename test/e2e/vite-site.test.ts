import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureRoute } from '../../src/check/capture.ts';
import { compareRoute } from '../../src/check/compare.ts';
import { runCheck } from '../../src/check/run.ts';
import { summarize } from '../../src/check/summary.ts';
import { VIEWPORTS } from '../../src/check/types.ts';
import { plan } from '../../src/plan/inventory.ts';
import { connect, firstText } from '../mcp-client.ts';
import { buildVite, failuresIn, OTHER_FONT, redDimensions, startStatic, type App, type Mutation } from './harness.ts';

const ROUTES = ['/', '/about/', '/fr/', '/ar/', '/old-about', '/missing'];

const failure = failuresIn;

const MUTATIONS: Mutation[] = [
	{
		name: 'title',
		route: '/about/',
		edits: [{ file: 'about/index.html', find: '<title>About | Lighthouse Walks</title>', replace: '<title>About us | Lighthouse Walks</title>' }],
		red: ['seo'],
		expect: (report) => {
			const [f] = failure(report, 'seo');
			assert.equal(f?.check, 'title');
			assert.equal(f?.expected, '"About | Lighthouse Walks"');
			assert.equal(f?.actual, '"About us | Lighthouse Walks"');
		},
	},
	{
		name: 'hreflang',
		route: '/',
		edits: [{ file: 'index.html', find: '<link rel="alternate" hreflang="fr" href="https://lighthouse.example/fr/" />', replace: '' }],
		red: ['seo'],
		expect: (report) => {
			const [f] = failure(report, 'seo');
			assert.equal(f?.check, 'hreflang:fr');
			assert.equal(f?.actual, '(absent)');
			assert.match(f!.hint, /hreflang/);
		},
	},
	{
		name: 'heading',
		route: '/about/',
		edits: [{ file: 'about/index.html', find: '<h1>About the guides</h1>', replace: '<h1>Meet the guides</h1>' }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const aria = failure(report, 'rendered').find((f) => f.check === 'accessibility tree');
			assert.match(aria!.expected, /heading "About the guides"/);
			assert.match(aria!.actual, /heading "Meet the guides"/);
			assert.ok(failure(report, 'rendered').some((f) => f.check === 'visible text' && f.actual === 'Meet the guides'));
			assert.match(failure(report, 'visual')[0]!.actual, /near .*heading "Meet the guides"/);
		},
	},
	{
		name: 'alt-text',
		route: '/',
		edits: [{ file: 'index.html', find: ' alt="Cliff path leading to a white lighthouse"', replace: '' }],
		red: ['rendered'],
		expect: (report) => {
			const f = failure(report, 'rendered').find((x) => x.check === 'accessibility tree');
			assert.match(f!.expected, /img "Cliff path leading to a white lighthouse"/);
		},
	},
	{
		name: 'font-size',
		route: '/',
		edits: [{ file: 'src/style.css', find: '.lede { font-size: 18px;', replace: '.lede { font-size: 21px;' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const css = failure(report, 'css');
			assert.ok(css.length >= 1);
			assert.ok(css.every((f) => /paragraph "Six guided routes/.test(f.check) && f.expected.startsWith('font-size: 18px;') && f.actual.startsWith('font-size: 21px;')), JSON.stringify(css, null, 1));
		},
	},
	{
		name: 'missing-image',
		route: '/',
		edits: [{ file: 'public/hero.png', remove: true }],
		red: ['assets', 'visual'],
		expect: (report) => {
			const assets = failure(report, 'assets');
			assert.ok(assets.some((f) => f.check === 'image /hero.png' && f.actual.startsWith('404')), JSON.stringify(assets, null, 1));
			assert.ok(assets.some((f) => f.check.startsWith('image #2') && f.expected === '640x320' && f.actual === 'broken'));
		},
	},
	{
		name: 'status-code',
		route: '/missing',
		edits: [{ file: 'public/serve.json', find: '"notFoundStatus": 404', replace: '"notFoundStatus": 200' }],
		red: ['http'],
		expect: (report) => {
			const [f] = failure(report, 'http');
			assert.equal(f?.check, 'status');
			assert.equal(f?.expected, '404 /missing');
			assert.equal(f?.actual, '200 /missing');
			assert.match(f!.hint, /soft 404/);
		},
	},
	{
		name: 'extra-js',
		route: '/',
		edits: [
			{
				file: 'src/main.ts',
				append: `\nconst table = [${Array.from({ length: 4000 }, (_, i) => (i * 7919) % 10007).join(',')}];\nlet sum = 0;\nfor (const n of table) sum += n;\n(globalThis as { checksum?: number }).checksum = sum;\n`,
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
		route: '/',
		edits: [{ file: 'index.html', find: '<p>Page rendered at <time', replace: '<p>Page built at <time' }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const text = failure(report, 'rendered').find((f) => f.check === 'visible text');
			assert.match(text!.expected, /^Page rendered at \d{4}-/);
			assert.match(text!.actual, /^Page built at \d{4}-/);
		},
	},
	{
		name: 'renamed-public-file',
		route: '/',
		edits: [
			{ file: 'public/logo-2024.png', renameTo: 'public/logo-2025.png' },
			{ file: 'index.html', find: 'src="/logo-2024.png"', replace: 'src="/logo-2025.png"' },
		],
		red: ['assets'],
		expect: (report) => {
			const [f] = failure(report, 'assets');
			assert.equal(f?.check, 'image /logo-2024.png');
			assert.equal(f?.actual, '404 text/html');
		},
	},
	{
		name: 'font-swap',
		route: '/about/',
		edits: [{ file: 'public/inter-latin.woff2', copyFrom: OTHER_FONT }],
		red: ['assets', 'visual'],
		expect: (report) => {
			const fonts = failure(report, 'assets').filter((f) => f.check.startsWith('rendered font of'));
			assert.ok(fonts.length >= 1, JSON.stringify(failure(report, 'assets'), null, 1));
			assert.ok(fonts.every((f) => /^web font Inter.* \(sha256 \w{12}\)$/.test(f.expected) && /^web font Geist/.test(f.actual)), JSON.stringify(fonts, null, 1));
		},
	},
	{
		name: 'font-renamed',
		route: '/about/',
		edits: [
			{ file: 'src/style.css', find: "font-family: 'Inter';", replace: "font-family: 'Lighthouse Sans';" },
			{ file: 'src/style.css', find: "font-family: 'Inter', system-ui", replace: "font-family: 'Lighthouse Sans', system-ui" },
		],
		red: [],
		expect: () => {},
	},
];

describe('vite multi-page site', () => {
	let browser: Browser;
	let old: App;
	let twin: App;
	const mutants = new Map<string, App>();

	before(async () => {
		browser = await chromium.launch();
		const [dist, ...dists] = await Promise.all([buildVite('original'), buildVite('rebuild'), ...MUTATIONS.map((m) => buildVite(m.name, m.edits))]);
		old = await startStatic(dist!);
		twin = await startStatic(dists[0]!);
		for (const [i, mutation] of MUTATIONS.entries()) mutants.set(mutation.name, await startStatic(dists[i + 1]!));
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
		const oldA = await captureRoute(browser, old.origin, '/', VIEWPORTS);
		const next = await captureRoute(browser, twin.origin, '/', VIEWPORTS);
		const result = compareRoute('/', [oldA, oldA], next, new Map());
		assert.ok(result.failures.some((f) => f.dimension === 'rendered' && /Page rendered at/.test(f.expected)), JSON.stringify(result.failures, null, 1));
	});

	test('plan finds the sitemap and crawled routes and both locales', async () => {
		const inventory = await plan({ origin: old.origin, source: join(import.meta.dirname, '../../fixtures/vite-site'), browser });
		assert.deepEqual(inventory.routes.map((r) => r.route), ['/', '/about/', '/ar/', '/fr/']);
		assert.deepEqual(inventory.routes[0]!.foundIn, ['crawl', 'hreflang', 'sitemap']);
		assert.deepEqual(inventory.locales, ['ar', 'en', 'fr']);
		assert.equal(inventory.routes[1]!.seo.title, 'About | Lighthouse Walks');
		assert.ok(inventory.routes[0]!.assets.some((a) => a.url === '/hero.png' && a.contentType === 'image/png'));
		assert.equal(inventory.source?.framework, 'vite');
	});

	test('an agent calling check_route over MCP gets the failure, and status remembers it', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'mm-e2e-'));
		const client = await connect(cwd);
		try {
			const result = await client.callTool({ name: 'check_route', arguments: { old: old.origin, new: mutants.get('title')!.origin, route: '/about/' } });
			const structured = result.structuredContent as { ok: boolean; failures: { check: string; actual: string }[] };
			assert.equal(structured.ok, false);
			assert.deepEqual(structured.failures.map((f) => [f.check, f.actual]), [['title', '"About us | Lighthouse Walks"']]);
			assert.match(firstText(result), /fix: +Set the same <title>/);
			assert.match(firstText(await client.callTool({ name: 'status', arguments: {} })), /red +\/about\/ +\[seo\]/);
			assert.ok(JSON.parse(await readFile(join(cwd, '.migrate', 'report.json'), 'utf8')).routes[0].failures.length === 1);
		} finally {
			await client.close();
		}
	});

	test('check --open writes the visual report, boxes the changed heading and opens the page', async () => {
		const cwd = await realpath(await mkdtemp(join(tmpdir(), 'mm-open-')));
		const opener = join(cwd, 'opener.sh');
		await writeFile(opener, '#!/bin/sh\necho "$1" > "$(dirname "$0")/opened.txt"\n', { mode: 0o755 });
		const cli = join(import.meta.dirname, '../../src/cli.ts');
		const child = spawn(process.execPath, [cli, 'check', '--old', old.origin, '--new', mutants.get('heading')!.origin, '--route', '/about/', '--open'], { cwd, env: { ...process.env, MARKLESS_MIGRATE_OPENER: opener } });
		const result = { stdout: '', stderr: '', status: -1 };
		child.stdout.on('data', (chunk) => (result.stdout += chunk));
		child.stderr.on('data', (chunk) => (result.stderr += chunk));
		result.status = await new Promise<number>((done) => child.on('exit', (code) => done(code ?? -1)));
		assert.equal(result.status, 1, result.stderr);
		const html = join(cwd, '.migrate', 'report.html');
		assert.match(result.stdout, new RegExp(`Visual report: ${html}`));
		const opened = async (): Promise<string> => readFile(join(cwd, 'opened.txt'), 'utf8').catch(() => new Promise((done) => setTimeout(done, 50)).then(opened));
		assert.equal((await opened()).trim(), html, 'the detached opener got the report path');
		const page = await browser.newPage();
		try {
			await page.goto(`file://${html}`);
			const failing = page.locator('.shot', { has: page.locator('.badge.fail') });
			assert.ok((await failing.count()) >= 1);
			assert.ok((await failing.first().locator('.side figure').first().locator('rect').count()) >= 1);
			assert.ok(await page.getByRole('cell', { name: /The accessibility tree differs/ }).first().isVisible());
		} finally {
			await page.close();
		}
	});

	for (const mutation of MUTATIONS) {
		test(`mutation "${mutation.name}" ${mutation.red.length ? `turns ${mutation.red.join(' + ')} red and nothing else` : 'stays green'}`, async () => {
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: mutants.get(mutation.name)!.origin, routes: [mutation.route], browser });
			if (process.env.SHOW_SUMMARY) process.stdout.write(`\n${summarize(report)}`);
			assert.deepEqual(redDimensions(report), [...mutation.red].sort(), summarize(report));
			mutation.expect(report);
		});
	}
});

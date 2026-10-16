import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { openCommand } from '../src/check/open.ts';
import { writeReport } from '../src/check/run.ts';
import type { Report } from '../src/check/types.ts';
import { diffRegions } from '../src/check/visual.ts';

function png(width: number, height: number, color: [number, number, number]): Buffer {
	const image = new PNG({ width, height });
	for (let i = 0; i < width * height; i++) image.data.set([...color, 255], i * 4);
	return PNG.sync.write(image);
}

const report: Report = {
	version: 1,
	old: 'http://old.test',
	new: 'http://new.test',
	startedAt: '2026-10-16T12:00:00.000Z',
	ok: false,
	routes: [
		{
			route: '/about',
			ok: false,
			dimensions: { http: 'pass', rendered: 'pass', visual: 'fail', seo: 'pass', assets: 'pass', css: 'fail', weight: 'pass' } as Report['routes'][number]['dimensions'],
			failures: [{ route: '/about', dimension: 'css', check: 'computed style of heading "About" (main>heading/h1)', viewport: 'desktop', expected: 'color: rgb(0, 0, 0)', actual: 'color: rgb(255, 0, 0)', hint: 'Port <the rule> & keep it', old: { file: 'src/About.tsx', line: 12, column: 5, path: '/app/src/About.tsx', how: 'source map' }, new: { file: 'pages/about/index.tsrx', line: 3, how: 'source markup' }, where: 'old src/About.tsx:12 renders heading "About"; new pages/about/index.tsrx:3 renders it' }],
			weight: { old: { downloaded: 1024, source: 2048, executed: 512 }, new: { downloaded: 1024, source: 2048, executed: 512 } },
			visualDiffs: [{ viewport: 'desktop', png: png(40, 30, [255, 0, 80]) }],
			shots: [
				{ label: 'desktop', viewport: 'desktop', old: png(40, 30, [0, 0, 0]), new: png(40, 30, [255, 0, 0]), diff: png(40, 30, [255, 0, 80]), regions: [{ x: 4, y: 4, width: 10, height: 8 }], ok: false },
				{ label: 'mobile', viewport: 'mobile', old: png(20, 30, [0, 0, 0]), new: png(20, 30, [0, 0, 0]), regions: [], ok: true },
			],
			network: { old: ['server GET cms.test/news?fields=title,slug'], new: ['server GET cms.test/news?fields=title'], server: { old: true, new: true } },
			noise: { noisy: [{ viewport: 'desktop, mobile', element: 'time "12:01" (contentinfo/time)', why: 'comes from the server' }], blocked: { 'www.googletagmanager.com': 2 } },
			writes: [{ line: 'would POST /api/subscribe {email: string}', reason: 'POST request', sent: false, during: 'fill textbox "Email" and submit' }],
		},
	],
	pinned: ['clock: fixed'],
	sources: [{ file: 'app/layout.tsx', line: 12, kind: 'new Date', side: 'server', pinned: 'not pinned: runs on the server' }],
	writes: 'held back',
};

test('report.html is one self-contained page with every failure, its fix, and old, new and diff images', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-report-'));
	await writeReport(report, dir);
	const html = await readFile(join(dir, 'report.html'), 'utf8');
	assert.doesNotMatch(html, /(src|href)="(?!data:|#|vscode:)/, 'no external resources');
	assert.match(html, /old <a href="vscode:\/\/file\/app\/src\/About\.tsx:12:5" [^>]*>src\/About\.tsx:12<\/a> renders heading &#34;About&#34;; new <code [^>]*>pages\/about\/index\.tsrx:3<\/code> renders it/);
	assert.equal(html.match(/src="data:image\/png;base64,/g)?.length, 13, 'failing shot: 3 side by side, 2 slider, 2 blink; passing shot: 2 + 2 + 2');
	assert.match(html, /Port &#60;the rule&#62; &#38; keep it/);
	assert.match(html, /<rect x="4" y="4" width="10" height="8">/);
	assert.match(html, /Network contract: 1 old, 1 new, browser and server requests, 2 differ/);
	assert.match(html, /<li class="differs"><code>server GET cms.test\/news\?fields=title,slug<\/code>/);
	assert.match(html, /Noise: 1 element still varied between old loads, 1 tracker host blocked/);
	assert.match(html, /Writes: 1, 1 held back/);
	assert.match(html, /<code>app\/layout.tsx:12<\/code> new Date: not pinned: runs on the server/);
	assert.match(html, /Writes were held back/);
	const json = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
	assert.equal(json.routes[0].shots, undefined, 'screenshots stay out of the JSON report');

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(`file://${join(dir, 'report.html')}`);
		const shot = page.locator('.shot').first();
		assert.equal(await shot.locator('.side figure').count(), 3);
		await shot.getByRole('button', { name: 'Slider' }).click();
		assert.equal(await shot.getAttribute('data-mode'), 'slider');
		await shot.getByRole('slider').fill('20');
		assert.equal(await shot.locator('.slider .over').evaluate((el) => (el as HTMLElement).style.clipPath), 'inset(0px 80% 0px 0px)');
		await shot.getByRole('button', { name: 'Blink' }).click();
		await shot.getByText('Showing new').waitFor({ timeout: 2000 });
		assert.equal(await shot.getByRole('button', { name: 'Blink' }).getAttribute('aria-pressed'), 'true');
	} finally {
		await browser.close();
	}
});

test('differing pixels group into one box per cluster', () => {
	const boxes = diffRegions(200, 100, (x, y) => (x < 10 && y < 10) || (x >= 150 && x < 160 && y >= 60 && y < 70));
	assert.deepEqual(boxes, [
		{ x: 144, y: 48, width: 16, height: 32 },
		{ x: 0, y: 0, width: 16, height: 16 },
	]);
});

test('--open uses the platform opener, or MARKLESS_MIGRATE_OPENER', () => {
	assert.deepEqual(openCommand('/r.html', 'darwin', {}), ['open', ['/r.html']]);
	assert.deepEqual(openCommand('/r.html', 'linux', {}), ['xdg-open', ['/r.html']]);
	assert.deepEqual(openCommand('/r.html', 'linux', { MARKLESS_MIGRATE_OPENER: '/bin/true' }), ['/bin/true', ['/r.html']]);
});

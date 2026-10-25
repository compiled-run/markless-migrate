import { chromium } from 'playwright';
import { tree } from './lib/tree.ts';

const origin = process.argv[2] ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch();

async function open(path) {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const raw = await (await fetch(origin + path)).text();
	await page.goto(origin + path, { waitUntil: 'load' });
	await page.waitForTimeout(1000);
	const text = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ').trim();
	return { page, errors, raw, text };
}

const cases = {
	async 'async-in-child'() {
		const { page, raw, text } = await open('/async-in-child');
		const browserRuns = await page.evaluate(() => window.browserRuns ?? 0);
		return {
			expected: 'response has "item 1"; browser runs the recipe 0 times',
			actual: `response has ${raw.includes('item 1') ? '"item 1"' : '"loading 1" only'}; browser ran it ${browserRuns} times; shows "${await text()}"`,
			ok: raw.includes('item 1') && browserRuns === 0,
		};
	},
	async 'nested-async'() {
		const { text } = await open('/nested-async');
		const shown = await text();
		return { expected: 'item 1 item 2', actual: shown, ok: shown === 'item 1 item 2' };
	},
	async 'nested-try'() {
		const { text } = await open('/nested-try');
		const shown = await text();
		return { expected: 'outer inner', actual: shown, ok: shown === 'outer inner' };
	},
	async 'prop-text'() {
		const { page, text } = await open('/prop-text');
		await page.locator('.mixed').click();
		await page.waitForTimeout(300);
		const shown = await text();
		return { expected: 'solo [+9]', actual: shown, ok: shown === 'solo [+9]' };
	},
	async 'stateful-async-child'() {
		const { page, errors } = await open('/stateful-async-child');
		await page.locator('.row span').click();
		await page.waitForTimeout(300);
		const cls = await page.locator('.row span').getAttribute('class');
		return {
			expected: 'class "voted", no page errors',
			actual: `class "${cls}"; ${[...new Set(errors)].join(' / ') || 'no errors'}`,
			ok: cls === 'voted' && !errors.length,
		};
	},
	async 'two-boundaries'() {
		const { page, errors, text } = await open('/two-boundaries');
		await page.locator('.toggle').first().click();
		await page.waitForTimeout(300);
		const shown = await text();
		return {
			expected: 'head link [+] [-] second',
			actual: `${shown}; ${[...new Set(errors)].join(' / ') || 'no errors'}`,
			ok: shown === 'head link [+] [-] second' && !errors.length,
		};
	},
	async 'recursive-payload'() {
		const { raw, page, errors } = await open('/recursive-payload');
		const payload = [
			...raw.matchAll(/<script type="markless\/[^"]*"[^>]*>([\s\S]*?)<\/script>/g),
		].reduce((n, m) => n + m[1].length, 0);
		const json = JSON.stringify(tree(7)).length;
		await page.locator('.toggle').first().click();
		await page.waitForTimeout(300);
		const hidden = await page.locator('.node > div').first().getAttribute('hidden');
		return {
			expected: `payload within a few times the tree's own JSON (${json} B); the root toggle hides its subtree`,
			actual: `payload ${payload} B (${(payload / json).toFixed(0)}x the tree's JSON), HTML ${raw.length} B; root subtree hidden: ${hidden !== null}; ${[...new Set(errors)].join(' / ') || 'no errors'}`,
			ok: payload < json * 5 && hidden !== null,
		};
	},
	async 'settle-failure'() {
		const { page } = await open('/settle-failure');
		const shown = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 120);
		return { expected: 'failed (the @catch content)', actual: shown || '(an empty page)', ok: shown === 'failed' };
	},
	async 'arm-delay'() {
		const page = await browser.newPage();
		await page.addInitScript(() => {
			new MutationObserver(() => {
				if (!window.readyAt && document.getElementById('ready'))
					window.readyAt = performance.now();
			}).observe(document, { childList: true, subtree: true });
		});
		await page.goto(origin + '/arm-delay', { waitUntil: 'load' });
		await page.waitForTimeout(800);
		const t = await page.evaluate(() => ({
			arrived: performance.getEntriesByType('navigation')[0].responseEnd,
			shown: window.readyAt,
			fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
		}));
		await page.close();
		const lag = Math.round(t.shown - t.arrived);
		return {
			expected: 'shown within a frame or two (< 50 ms) of the response delivering it',
			actual: `response ended at ${Math.round(t.arrived)} ms, first paint ${Math.round(t.fcp)} ms, shown at ${Math.round(t.shown)} ms (${lag} ms later)`,
			ok: lag < 50,
		};
	},
	async 'first-click-cost'() {
		const firstClick = async (path) => {
			const { page } = await open(path);
			const cdp = await page.context().newCDPSession(page);
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
			const ms = await page.evaluate(
				() =>
					new Promise((done) => {
						const toggle = document.querySelector('.toggle');
						const start = performance.now();
						new MutationObserver(() => done(performance.now() - start)).observe(
							toggle,
							{ childList: true, characterData: true, subtree: true },
						);
						toggle.click();
					}),
			);
			await page.close();
			return Math.round(ms);
		};
		const few = await firstClick('/toggle-few');
		const many = await firstClick('/recursive-payload');
		return {
			expected:
				'the first click on a 255-node tree answers about as fast as on a 7-node one (4x CPU)',
			actual: `7 nodes ${few} ms, 255 nodes ${many} ms`,
			ok: many < few * 2 + 16,
		};
	},
};

let failed = 0;
for (const [name, run] of Object.entries(cases)) {
	const r = await run().catch((e) => ({
		expected: '-',
		actual: `threw ${e.message.split('\n')[0]}`,
		ok: false,
	}));
	if (!r.ok) failed++;
	console.log(
		`${r.ok ? 'PASS' : 'FAIL'} ${name}\n  expected: ${r.expected}\n  actual:   ${r.actual}`,
	);
}
await browser.close();
process.exit(failed ? 1 : 0);

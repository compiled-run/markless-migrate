// Times the grid's first interactions and a fast scroll through every row on the old and new app, with the CPU
// slowed 4x: node measure.mjs [old] [new] [--runs 5]
// An interaction is timed from the trusted input event to the next frame after the first DOM change it causes
// (as markless-migrate's responsiveness dimension does), each on a fresh page load.
import { chromium } from '../../../node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const OLD = args[0]?.startsWith('http') ? args[0] : 'http://127.0.0.1:4480/';
const NEW = args[1]?.startsWith('http') ? args[1] : 'http://localhost:4483/';
const RUNS = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 5;
const CPU = 4;

const median = (xs) => {
	const s = xs.filter((x) => x != null).sort((a, b) => a - b);
	return s.length ? s[Math.floor(s.length / 2)] : null;
};

async function fresh(browser, url) {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'en-US' });
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
	await page.addInitScript(() => {
		window.__mm = { input: 0, mutation: 0, frame: 0, longTasks: [] };
		for (const type of ['pointerdown', 'keydown']) {
			addEventListener(type, (e) => { if (!window.__mm.input) window.__mm.input = e.timeStamp; }, true);
		}
		new MutationObserver(() => {
			const m = window.__mm;
			if (m.input && !m.mutation) {
				m.mutation = performance.now();
				requestAnimationFrame(() => setTimeout(() => (m.frame = performance.now()), 0));
			}
		}).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
		new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__mm.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
	});
	await page.goto(url);
	await page.waitForSelector('.ag-center-cols-container .ag-row');
	await page.waitForTimeout(1500);
	return page;
}

async function arm(page) {
	await page.evaluate(() => Object.assign(window.__mm, { input: 0, mutation: 0, frame: 0 }));
}

async function latency(page) {
	await page.waitForFunction(() => window.__mm.frame > 0, null, { timeout: 10000 }).catch(() => {});
	return page.evaluate(() => (window.__mm.frame ? Math.round(window.__mm.frame - window.__mm.input) : null));
}

const SCENARIOS = {
	'sort click (Channel header)': async (page) => {
		await arm(page);
		await page.click('.ag-header-cell[col-id=channel] .ag-header-cell-label');
		return latency(page);
	},
	'second sort click (warm)': async (page) => {
		await page.click('.ag-header-cell[col-id=channel] .ag-header-cell-label');
		await page.waitForTimeout(500);
		await arm(page);
		await page.click('.ag-header-cell[col-id=channel] .ag-header-cell-label');
		return latency(page);
	},
	'open filter (Channel filter button)': async (page) => {
		await arm(page);
		await page.click('.ag-header-cell[col-id=channel] .ag-header-cell-filter-button');
		return latency(page);
	},
	'filter typing (first key in the filter box)': async (page) => {
		await page.click('.ag-header-cell[col-id=channel] .ag-header-cell-filter-button');
		await page.waitForTimeout(500);
		await arm(page);
		await page.keyboard.press('f');
		return latency(page);
	},
	'filter result (last key to filtered rows on screen, less the 500 ms debounce both apps share)': async (page) => {
		await page.click('.ag-header-cell[col-id=channel] .ag-header-cell-filter-button');
		await page.waitForTimeout(500);
		await page.keyboard.type('fi');
		await page.waitForTimeout(1000);
		const t0 = await page.evaluate(() => performance.now());
		await page.keyboard.press('l');
		const t1 = await page.evaluate(() => new Promise((resolve) => {
			const grid = document.querySelector('[role=grid]');
			const start = grid.getAttribute('aria-rowcount');
			const began = performance.now();
			const tick = () => (grid.getAttribute('aria-rowcount') !== start ? requestAnimationFrame(() => resolve(performance.now())) : performance.now() - began > 10000 ? resolve(null) : requestAnimationFrame(tick));
			tick();
		}));
		return t1 == null ? null : Math.round(t1 - t0 - 500);
	},
	'row click (select, details open)': async (page) => {
		await arm(page);
		await page.click('.ag-center-cols-container .ag-row[row-id="4990"] [col-id=args]');
		return latency(page);
	},
};

async function scroll(page) {
	return page.evaluate(async () => {
		const vp = document.querySelector('.ag-body-viewport');
		vp.scrollTop = 0;
		await new Promise((r) => setTimeout(r, 500));
		window.__mm.longTasks = [];
		const frames = [];
		let blank = 0;
		const step = vp.clientHeight;
		const t0 = performance.now();
		let last = t0;
		while (vp.scrollTop + vp.clientHeight < vp.scrollHeight - 1) {
			vp.scrollTop += step;
			await new Promise((r) => requestAnimationFrame(r));
			const now = performance.now();
			frames.push(now - last);
			last = now;
			const top = vp.scrollTop;
			const rows = [...document.querySelectorAll('.ag-center-cols-container .ag-row')].map((r) => Number(r.getAttribute('row-index')));
			const want = Math.floor(top / 29);
			if (!rows.includes(want)) blank++;
		}
		await new Promise((r) => setTimeout(r, 300));
		const long = window.__mm.longTasks.filter((t) => t.start >= t0);
		return {
			frames: frames.length,
			ms: Math.round(performance.now() - t0),
			slowFrames: frames.filter((f) => f > 50).length,
			worstFrame: Math.round(Math.max(...frames)),
			longTasks: long.length,
			blocking: Math.round(long.reduce((a, t) => a + Math.max(0, t.duration - 50), 0)),
			blankFrames: blank,
		};
	});
}

const browser = await chromium.launch();
const results = {};
for (const [label, url] of [['old', OLD], ['new', NEW]]) {
	results[label] = {};
	for (const [name, fn] of Object.entries(SCENARIOS)) {
		const times = [];
		for (let i = 0; i < RUNS; i++) {
			const page = await fresh(browser, url);
			times.push(await fn(page));
			await page.close();
		}
		results[label][name] = { median: median(times), runs: times };
	}
	const scrolls = [];
	for (let i = 0; i < Math.min(RUNS, 3); i++) {
		const page = await fresh(browser, url);
		scrolls.push(await scroll(page));
		await page.close();
	}
	results[label].scroll = scrolls;
}
await browser.close();

console.log(`CPU slowed ${CPU}x, 1280x800, median of ${RUNS} fresh loads`);
for (const name of Object.keys(SCENARIOS)) console.log(`${name}: old ${results.old[name].median} ms ${JSON.stringify(results.old[name].runs)} -> new ${results.new[name].median} ms ${JSON.stringify(results.new[name].runs)}`);
for (const label of ['old', 'new']) for (const s of results[label].scroll) console.log(`fast scroll ${label}: ${JSON.stringify(s)}`);

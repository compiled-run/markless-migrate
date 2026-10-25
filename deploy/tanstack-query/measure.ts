// Runs the data journeys of the kitchen-sink port on the old and the new app and prints what each did: requests, mock API calls,
// click to fetch start, click to result, what the result area showed on the way (swaps, pending time) and layout shift.
// `node deploy/tanstack-query/measure.ts <old origin> <new origin> [new server log]`; start the new server with KS_TRACE=1 and its output in that log.
import { readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const [oldOrigin = 'http://127.0.0.1:4520', newOrigin = 'http://127.0.0.1:4521', serverLog] = process.argv.slice(2);

interface Journey {
	readonly name: string;
	readonly start: string;
	/** Watched for swaps and pending time: the area the journey's result appears in. */
	readonly area: string;
	/** sessionStorage loaderDelay (and its cookie on the new app) before the page loads. */
	readonly delay?: number;
	run(page: Page): Promise<void>;
	/** Text that is on the page (or in a form field) once the journey has its result. */
	readonly done: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const JOURNEYS: Journey[] = [
	{
		name: 'create an invoice',
		start: '/dashboard/invoices',
		area: '.w-48',
		run: async (p) => {
			await p.fill('input[name=title]', 'Measured invoice');
			await p.fill('textarea[name=body]', 'Made by the measure script');
			await p.click('button:has-text("Create")');
		},
		done: '#11 - Measured i',
	},
	{
		name: 'edit an invoice',
		start: '/dashboard/invoices/3',
		area: '.w-48',
		run: async (p) => {
			await p.fill('input[name=title]', 'Edited title');
			await p.click('button:has-text("Save")');
		},
		done: '#3 - Edited tit',
	},
	{
		name: 'hover a link 600 ms, then follow it',
		start: '/dashboard/invoices',
		area: '.flex-1.border-l .flex-1.border-l',
		run: async (p) => {
			await p.hover('a[href="/dashboard/invoices/4"]');
			await sleep(600);
			await p.click('a[href="/dashboard/invoices/4"]');
		},
		done: 'eum et est occaecati',
	},
	{
		name: 'follow a link, then another 100 ms later',
		start: '/dashboard/users?usersView=%7B%7D',
		area: '.flex-initial',
		run: async (p) => {
			await p.click('text=Ervin Howell', { noWaitAfter: true });
			await sleep(100);
			await p.click('text=Clementine Bauch', { noWaitAfter: true });
		},
		done: '"username": "Samantha"',
	},
	{
		name: 'follow a link, then go back 100 ms later',
		start: '/dashboard/invoices',
		area: '.flex-1.border-l .flex-1.border-l',
		run: async (p) => {
			await p.click('a[href="/dashboard/invoices/5"]', { noWaitAfter: true });
			await sleep(100);
			await p.evaluate(() => history.back());
		},
		done: 'Create a new Invoice:',
	},
	{
		name: 'type into the users filter, 150 ms a key, with 300 ms answers',
		start: '/dashboard/users?usersView=%7B%7D',
		delay: 300,
		area: '.divide-y:has(select)',
		run: async (p) => {
			await p.click('input[placeholder="Search Names..."]');
			await p.keyboard.type('clem', { delay: 150 });
		},
		done: 'Clementine Bauch',
	},
];

// In the page before its own scripts: when each mock API call starts (the old app's loaderDelayFn reads sessionStorage first), what the area shows frame by frame, and layout shift.
function instrument() {
	const w = window as unknown as Record<string, unknown>;
	const calls: number[] = [];
	w.__calls = calls;
	const get = Storage.prototype.getItem;
	Storage.prototype.getItem = function (key: string) {
		if (key === 'loaderDelay' || key === 'actionDelay') calls.push(performance.now());
		return get.call(this, key);
	};
	let shift = 0;
	new PerformanceObserver((list) => {
		for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) shift += e.value;
	}).observe({ type: 'layout-shift', buffered: false });
	w.__shift = () => shift;
	w.__watch = (selector: string) => {
		const views: { at: number; text: string }[] = [];
		let click = 0;
		addEventListener('pointerdown', (e) => (click ||= e.timeStamp), { capture: true });
		addEventListener('keydown', (e) => (click ||= e.timeStamp), { capture: true });
		const read = () => (document.querySelector(selector) as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? '(gone)';
		views.push({ at: performance.now(), text: read() });
		const frame = () => {
			const text = read();
			if (text !== views[views.length - 1]!.text) views.push({ at: performance.now(), text });
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
		w.__views = () => ({ views, click });
	};
}

async function measure(origin: string, j: Journey, side: 'old' | 'new') {
	const browser = await chromium.launch();
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await context.newPage();
	await page.addInitScript(instrument);
	if (j.delay !== undefined) {
		await page.addInitScript((d) => sessionStorage.setItem('loaderDelay', String(d)), j.delay);
		await context.addCookies([{ name: 'loaderDelay', value: String(j.delay), url: origin }]);
	}
	const requests: { at: number; line: string }[] = [];
	page.on('request', (r) => {
		const u = new URL(r.url());
		if (/\.(js|css|png|svg|ico|woff2?)$/.test(u.pathname) || r.resourceType() === 'document') return;
		requests.push({ at: Date.now(), line: `${r.method()} ${u.host === new URL(origin).host ? '' : u.host}${u.pathname}${u.search}` });
	});
	await page.goto(origin + j.start, { waitUntil: 'networkidle' });
	await page.waitForTimeout(800);
	const tab = (await context.cookies()).find((c) => c.name === 'kitchen-sink-tab')?.value;
	await page.evaluate((s) => (window as unknown as { __watch(s: string): void }).__watch(s), j.area);
	const before = requests.length;
	const callsBefore = await page.evaluate(() => ((window as unknown as { __calls: number[] }).__calls).length);
	const shiftBefore = await page.evaluate(() => (window as unknown as { __shift(): number }).__shift());
	const t0 = Date.now();
	await j.run(page);
	const shows = (t: string) => document.body.innerText.includes(t) || [...document.querySelectorAll('input, textarea')].some((f) => (f as HTMLInputElement).value.includes(t));
	await page.waitForFunction(`(${shows.toString()})(${JSON.stringify(j.done)})`, undefined, { timeout: 10_000 }).catch(() => {});
	const doneAt = await page.evaluate(() => performance.now());
	await page.waitForTimeout(1200);
	const { views, click } = await page.evaluate(() => (window as unknown as { __views(): { views: { at: number; text: string }[]; click: number } }).__views());
	const fetches = await page.evaluate((n) => (window as unknown as { __calls: number[] }).__calls.slice(n), callsBefore);
	const entries = await page.evaluate((c) => performance.getEntriesByType('resource').filter((e) => e.startTime >= c && /fragment|\/api\//.test(e.name)).map((e) => e.startTime), click);
	const shift = (await page.evaluate(() => (window as unknown as { __shift(): number }).__shift())) - shiftBefore;
	const firstFetch = side === 'old' ? fetches[0] : entries[0];
	let pendingMs = 0;
	for (let i = 1; i < views.length - 1; i++) pendingMs += views[i + 1]!.at - views[i]!.at;
	const mock = side === 'new' && serverLog && tab ? readFileSync(serverLog, 'utf8').split('\n').filter((l) => l.startsWith('[mock] ')).map((l) => JSON.parse(l.slice(7)) as { tab: string; call: string; at: number }).filter((m) => m.tab === tab && m.at >= t0) : [];
	await browser.close();
	return {
		requests: requests.slice(before).map((r) => r.line),
		mockCalls: side === 'old' ? fetches.length : mock.filter((m) => !m.call.startsWith('GET ')).length,
		serverCalls: mock.map((m) => m.call),
		clickToFetchMs: firstFetch !== undefined && click ? Math.round(firstFetch - click) : undefined,
		clickToResultMs: click ? Math.round(doneAt - click) : undefined,
		swaps: views.length - 1,
		pendingMs: Math.round(pendingMs),
		inBetween: views.slice(1, -1).map((v) => v.text.slice(0, 50)),
		layoutShift: Math.round(shift * 1000) / 1000,
	};
}

for (const j of JOURNEYS) {
	const old = await measure(oldOrigin, j, 'old');
	const next = await measure(newOrigin, j, 'new');
	process.stdout.write(`${JSON.stringify({ journey: j.name, old, new: next }, null, 1)}\n`);
}

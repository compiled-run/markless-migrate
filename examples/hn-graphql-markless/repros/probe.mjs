// Drives every repro page of a running build and says, per repro, whether Markless did what the page expects: node probe.mjs [origin]
import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:4889';
const text = async (page, selector) =>
	(await page.locator(selector).allInnerTexts()).join(' ').replace(/\s+/g, ' ').trim();
const served = async (path) =>
	(await (await fetch(origin + path)).text())
		.match(/<p id="[a-z]+">[^<]*/g)
		?.map((p) => p.replace(/<p id="[a-z]+">/, ''))
		.join(' | ');
const clickRow = (path, out) => async (page) => {
	await page.goto(origin + path, { waitUntil: 'networkidle' });
	await page.locator('table a').nth(1).click();
	await page.waitForTimeout(1500);
	return text(page, out);
};
const clickThrice = (path) => async (page) => {
	await page.goto(origin + path, { waitUntil: 'networkidle' });
	const seen = [];
	for (let i = 0; i < 3; i++) {
		await page.locator('table a').first().click();
		await page.waitForTimeout(1200);
		seen.push(await text(page, 'table'));
	}
	return seen.join(' / ');
};
const browserRuns = (link, settle) => async (page) => {
	const asked = [];
	page.on('request', (r) => r.url().includes('/api/slow') && asked.push(new URL(r.url()).search));
	await page.goto(origin + '/nav-start', { waitUntil: 'networkidle' });
	await page.waitForTimeout(settle);
	await page.locator(link).click();
	await page.waitForTimeout(1500);
	return `${await text(page, '#out')}; browser asked /api/slow ${asked.length} times`;
};
const stateCopies = (path, marker) => async () => {
	const html = await (await fetch(origin + path)).text();
	const state = html.match(/<script type="markless\/state">([\s\S]*?)<\/script>/)?.[1] ?? '';
	return `${state.split(marker).length - 1} copies in the page state`;
};
// A race on whether Back lands before the next page's fragment arrives, so it is tried five times.
const backBeforeArrival = async (page) => {
	let refetched = 0;
	for (let i = 0; i < 5; i++) {
		const asked = [];
		const listen = (r) => r.url().includes('/api/slow') && asked.push(r.url());
		page.on('request', listen);
		await page.goto(origin + '/control-async-value-in-page', { waitUntil: 'networkidle' });
		await page.goto(origin + '/back-before-arrival-refetches', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		await page.locator('#next').click();
		await page.waitForTimeout(20);
		await page.goBack();
		await page.waitForTimeout(2000);
		page.off('request', listen);
		if (asked.length) refetched++;
	}
	return `the browser ran the recipe again in ${refetched} of 5 tries`;
};
const REPROS = [
	['fragment-row-handlers', clickRow('/fragment-row-handlers', '#out'), 'two'],
	[
		'fragment-row-handlers-async',
		clickRow('/fragment-row-handlers-async', 'table'),
		'one 1 two 1',
	],
	['derived-rows-over-async', clickRow('/derived-rows-over-async', '#out'), 'two'],
	['derived-rows-over-async-prop', clickRow('/derived-rows-over-async-prop', '#out'), 'two'],
	['row-component-prop', clickRow('/row-component-prop', 'table'), 'one 0 two 1'],
	['shared-field-in-async-recipe', () => served('/shared-field-in-async-recipe'), 'loaded 0'],
	['child-try-never-streams', () => served('/child-try-never-streams'), 'pending | loaded'],
	[
		'child-try-never-streams-prop',
		() => served('/child-try-never-streams-prop'),
		'pending | loaded',
	],
	[
		'nested-try-never-streams',
		() => served('/nested-try-never-streams'),
		'pending | outer | inner',
	],
	[
		'derived-rows-over-async-update',
		clickThrice('/derived-rows-over-async-update'),
		'one 1 two 0 / one 2 two 0 / one 3 two 0',
	],
	[
		'rows-in-branch-lose-handlers',
		clickThrice('/rows-in-branch-lose-handlers'),
		'one 1 two 1 / one 2 two 2 / one 3 two 3',
	],
	[
		'streamed-navigation-reruns-recipe',
		browserRuns('#below', 0),
		'from the server; browser asked /api/slow 0 times',
	],
	[
		'back-before-arrival-refetches',
		backBeforeArrival,
		'the browser ran the recipe again in 0 of 5 tries',
	],
	[
		'async-prop-state-twice',
		stateCopies('/async-prop-state-twice', 'payload-marker-one'),
		'1 copies in the page state',
	],
	[
		'control: rows refetched in a child, no branch',
		clickThrice('/control-rows-refetch'),
		'one 1 two 1 / one 2 two 2 / one 3 two 3',
	],
	[
		'control: fragment rows, one handler on the <tbody>, refetched',
		clickThrice('/control-fragment-rows-delegated'),
		'one 1 two 1 / one 2 two 2 / one 3 two 3',
	],
	[
		'control: one <tbody> per row, refetched',
		clickThrice('/control-tbody-rows-refetch'),
		'one 1 two 1 / one 2 two 2 / one 3 two 3',
	],
	[
		'control: sibling @try blocks stream',
		() => served('/control-sibling-try-streams'),
		'pending | pending | outer | inner',
	],
	[
		'control: an async value drawn in the page is in its state once',
		stateCopies('/control-async-value-in-page', 'payload-marker-one'),
		'1 copies in the page state',
	],
	[
		'control: a link prefetched before the click carries the value',
		browserRuns('#go', 1500),
		'from the server; browser asked /api/slow 0 times',
	],
];
const browser = await chromium.launch();
let failed = 0;
for (const [name, run, expected] of REPROS) {
	const page = await browser.newPage();
	const actual = await run(page).catch((error) => `threw: ${error.message.split('\n')[0]}`);
	await page.close();
	const ok = actual === expected;
	if (!ok) failed++;
	console.log(
		`${ok ? 'as expected' : 'BUG'}  ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
	);
}
await browser.close();
console.log(`${failed} of ${REPROS.length} differ from what the page expects`);

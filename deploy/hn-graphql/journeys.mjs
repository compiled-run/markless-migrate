// Runs the data journeys on one app and prints, per step, the app requests it made, the time from the click to the
// first of them starting, and to the page showing the result: node deploy/hn-graphql/journeys.mjs <origin> [--cpu 4]
import { chromium } from 'playwright';

const origin = process.argv[2];
const cpu = Number(process.argv[process.argv.indexOf('--cpu') + 1] || 1);
const user = `j${Date.now() % 1_000_000}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

const appRequest = (url) => {
	const u = new URL(url);
	return u.origin === origin && !/\.(js|mjs|css|gif|ico|png|woff2?)$/.test(u.pathname) && !/^\/(_next\/static|build|assets|@|node_modules)\//.test(u.pathname);
};
let requests = [];
page.on('request', (r) => {
	if (!appRequest(r.url())) return;
	let what = r.method() === 'POST' ? 'form' : '';
	try {
		what = JSON.parse(r.postData() ?? '').operationName ?? what;
	} catch {}
	requests.push({ at: performance.now(), line: `${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search}${what ? ` ${what}` : ''}` });
});
const ms = (n) => `${Math.round(n)} ms`;

async function step(name, act, done) {
	requests = [];
	const start = performance.now();
	await act();
	await done();
	const shown = performance.now() - start;
	await page.waitForTimeout(800);
	const first = requests[0] ? ms(requests[0].at - start) : '-';
	console.log(`${name}: ${requests.length} request${requests.length === 1 ? '' : 's'} [${requests.map((r) => r.line).join(', ')}], first after ${first}, result shown after ${ms(shown)}`);
}

const rows = () => page.locator('tr.athing').count();
await step('load /', () => page.goto(`${origin}/`), () => page.waitForSelector('a.storylink'));
await step('More (page 2)', () => page.locator('a.morelink').click(), () => page.waitForFunction(() => document.querySelector('.rank')?.textContent === '61.'));
await step('item page', () => page.locator('.subtext .age a').first().click(), () => page.waitForSelector('table.comment-tree', { state: 'attached' }));
await step('back to the feed', () => page.goBack(), () => page.waitForFunction(() => document.querySelector('.rank')?.textContent === '61.'));
await step('upvote, signed out', () => page.locator('.votelinks a').first().click(), () => page.waitForSelector('form[action="/login"]'));
await step('create account', async () => {
	await page.goto(`${origin}/login`);
	await page.locator('form[action="/register"] input[name=id]').fill(user);
	await page.locator('form[action="/register"] input[name=password]').fill('password123');
	await page.locator('input[value="create account"]').click();
}, () => page.waitForURL(/\/user\?id=/));
await step('home, signed in', () => page.goto(`${origin}/`), () => page.waitForSelector(`a[href="/user?id=${user}"]`));
await step('upvote #1', () => page.locator('.votelinks a').first().click(), () => page.waitForSelector('.votelinks a.nosee', { state: 'attached' }));
const before = await rows();
await step('hide #2', () => page.locator('.subtext a', { hasText: 'hide' }).nth(1).click(), () => page.waitForFunction((n) => document.querySelectorAll('tr.athing').length === n - 1, before));
await step('navigate to new mid-fetch', async () => {
	await page.locator('.pagetop a[href="/newest"]').click();
	await page.locator('.pagetop a[href="/show"]').click();
}, () => page.waitForURL(/\/show$/).then(() => page.waitForSelector('a[href="/showhn"]')));
await step('submit page', () => page.goto(`${origin}/submit`), () => page.waitForSelector('input[name=title]'));
await step('submit', async () => {
	await page.locator('input[name=title]').fill('Hello from the journey');
	await page.locator('input[name=url]').fill('https://example.com/journey');
	await page.waitForTimeout(500);
	await page.locator('input[value=submit]').click();
}, () => page.waitForTimeout(300));
console.log(`url after submit: ${new URL(page.url()).pathname}; header shows ${await page.locator('.pagetop').last().innerText()}`);
await browser.close();

// Checks each repro against a running build of this folder (`npm run build && PORT=4540 node .output/server/index.mjs`):
// `node verify.mjs http://127.0.0.1:4540` prints, per repro, whether the defect still shows and what was seen.
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4540';
const browser = await chromium.launch();

async function open(path) {
	const page = await browser.newPage();
	const log = { errors: [], console: [], requests: [] };
	page.on('pageerror', (e) => log.errors.push(e.message));
	page.on('console', (m) => log.console.push(m.text()));
	page.on('request', (r) => log.requests.push(r.url()));
	const loaded = await page.goto(base + path, { timeout: 8000 }).then(
		() => true,
		() => false,
	);
	await page.waitForTimeout(1200);
	return { page, log, loaded };
}

const text = (page) =>
	page.evaluate(
		() => document.querySelector('main')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
	);

async function streamed(path) {
	const res = await fetch(base + path, { signal: AbortSignal.timeout(4000) }).catch(
		() => undefined,
	);
	return res ? await res.text().catch(() => '(stream broke)') : '(no answer within 4 s)';
}

const results = [];
const report = (name, reproduced, seen) => results.push({ name, reproduced, seen });

{
	const html = await streamed('/child-async-not-streamed');
	const { page, log } = await open('/child-async-not-streamed');
	report(
		'child-async-not-streamed',
		!html.includes('loaded child') && log.console.some((c) => c.includes('slow() browser')),
		`response has the answer: ${html.includes('loaded child')}; browser ran the recipe again: ${log.console.some((c) => c.includes('slow() browser'))}; shows "${await text(page)}"`,
	);
}
{
	const { page } = await open('/shared-in-async-recipe');
	const seen = await text(page);
	report('shared-in-async-recipe', seen.includes('caught undefined'), `shows "${seen}"`);
}
{
	const { page, log } = await open('/state-from-prop-recipe');
	await page.click('button', { timeout: 5000 });
	await page.waitForTimeout(1200);
	const seen = await text(page);
	report(
		'state-from-prop-recipe',
		!seen.includes('v1') && log.errors.length > 0,
		`after the click shows "${seen}"; errors: ${log.errors.join(' | ')}`,
	);
}
{
	const { page, log } = await open('/async-row-reads-prop');
	await page.click('button');
	await page.waitForTimeout(1200);
	report(
		'async-row-reads-prop',
		log.errors.length > 0,
		`after the click shows "${await text(page)}"; errors: ${log.errors.join(' | ')}`,
	);
}
{
	const { page, log } = await open('/navigation-start');
	await page.click('a[href^="/navigation-reruns-recipe"]');
	await page.waitForTimeout(1500);
	const seen = await text(page);
	report(
		'navigation-reruns-recipe',
		seen.includes('(browser)'),
		`after the click shows "${seen}"; browser ran slow(): ${log.console.some((c) => c.includes('slow() browser'))}`,
	);
}
{
	const { page } = await open('/navigation-start');
	await page.click('a[href="/arm-link-handler"]');
	await page.waitForTimeout(1500);
	await page.click('a[href*="open=true"]');
	await page.waitForTimeout(800);
	const seen = await text(page);
	report(
		'arm-link-handler',
		!seen.includes('Close'),
		`after Open: address ${new URL(page.url()).pathname}${new URL(page.url()).search}, shows "${seen}"`,
	);
}
{
	const html = await streamed('/async-optional-and-whole');
	report(
		'async-optional-and-whole',
		!html.includes('loaded json'),
		`answer has the content: ${html.includes('loaded json')}`,
	);
}
{
	const { page } = await open('/navigation-start');
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.click('a[href="/sync-from-pending-async"]');
	await page.waitForTimeout(1500);
	report(
		'sync-from-pending-async',
		errors.length > 0,
		`after arriving: shows "${await text(page)}"; errors: ${errors.join(' | ')}`,
	);
}
{
	const { page } = await open('/textarea-value');
	const value = await page.evaluate(() => document.querySelector('textarea')?.value ?? '(none)');
	report('textarea-value', value === '', `textarea holds "${value}"`);
}
{
	const { page, log } = await open('/assignment-value');
	await page.click('button');
	await page.waitForTimeout(300);
	const logged = log.console.find((c) => c.startsWith('assigned')) ?? '(nothing logged)';
	report(
		'assignment-value',
		logged === 'assigned undefined',
		`logged "${logged}"; shows "${await text(page)}"`,
	);
}
// Last: when it reproduces, the server spins and answers nothing more until it is restarted.
{
	const html = await streamed('/loop-variable-shadows-async');
	report(
		'loop-variable-shadows-async',
		!html.includes('</html>') || !html.includes('loaded item'),
		html.startsWith('(')
			? html
			: `answer ends with the content: ${html.includes('loaded item')}`,
	);
}

for (const r of results)
	process.stdout.write(`${r.reproduced ? 'REPRODUCED' : 'not seen  '}  ${r.name}: ${r.seen}\n`);
await browser.close();

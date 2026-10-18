// Drives one app through a list of steps and prints what the grid shows after each: node lab.mjs <url> '<steps json>' [--shot prefix]
// A step is ["click", selector] | ["press", key] | ["type", text] | ["wait", ms] | ["scroll", top] | ["eval", js] | ["hover", selector] | ["drag", selector, dx, dy]
import { chromium } from '../../../node_modules/playwright/index.mjs';

const [url, stepsJson = '[]', ...rest] = process.argv.slice(2);
const shot = rest[0] === '--shot' ? rest[1] : undefined;
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'en-US' });
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error: ' + m.text().slice(0, 300)); });
await page.goto(url);
await page.waitForSelector('.ag-row', { timeout: 15000 }).catch(() => logs.push('no rows'));
await page.waitForTimeout(800);

const state = () => page.evaluate(() => {
	const describe = (el) => {
		if (!el || el === document.body) return 'body';
		const role = el.getAttribute('role');
		const bits = [el.tagName.toLowerCase()];
		if (role) bits.push(`role=${role}`);
		for (const a of ['col-id', 'row-id', 'aria-colindex', 'aria-rowindex', 'title', 'aria-label', 'placeholder', 'type']) if (el.hasAttribute(a)) bits.push(`${a}=${el.getAttribute(a)}`);
		const cls = [...el.classList].filter((c) => c.startsWith('ag-')).slice(0, 3).join('.');
		if (cls) bits.push('.' + cls);
		return bits.join(' ');
	};
	const rows = [...document.querySelectorAll('.ag-center-cols-container .ag-row')].sort((a, b) => Number(a.getAttribute('row-index')) - Number(b.getAttribute('row-index')));
	const vp = document.querySelector('.ag-body-viewport');
	const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const popup = [...document.querySelectorAll('.ag-popup')].find(visible);
	return {
		focus: describe(document.activeElement),
		sort: [...document.querySelectorAll('.ag-header-cell')].map((h) => `${h.getAttribute('col-id')}:${h.getAttribute('aria-sort')}${h.querySelector('.ag-sort-order:not(.ag-hidden)')?.textContent ?? ''}`).join(' '),
		widths: [...document.querySelectorAll('.ag-header-cell')].map((h) => h.style.width).join(' '),
		rowcount: document.querySelector('[role=grid]')?.getAttribute('aria-rowcount'),
		rendered: rows.length,
		range: rows.length ? `${rows[0].getAttribute('row-index')}..${rows.at(-1).getAttribute('row-index')}` : '',
		ids: rows.slice(0, 4).map((r) => r.getAttribute('row-id')).join(','),
		selected: [...document.querySelectorAll('.ag-row-selected')].map((r) => r.getAttribute('row-id')).join(','),
		focusedRow: document.querySelector('.ag-row-focus')?.getAttribute('row-id') ?? '',
		scrollTop: vp?.scrollTop,
		height: document.querySelector('.ag-center-cols-container')?.style.height,
		popup: popup ? popup.innerText.replace(/\s+/g, ' ').slice(0, 200) : '',
		detail: visible(document.querySelector('.react-json-view')) ? document.querySelector('.react-json-view').closest('.flex.h-full.flex-col').innerText.replace(/\s+/g, ' ').slice(0, 400) : '',
		live: document.querySelector('.ag-aria-description-container')?.textContent ?? '',
	};
});
console.log('load', JSON.stringify(await state()));
let i = 0;
for (const [kind, a, b, c] of steps) {
	if (kind === 'click') await page.click(a, b ? { modifiers: [b] } : undefined);
	else if (kind === 'press') await page.keyboard.press(a);
	else if (kind === 'type') await page.keyboard.type(a);
	else if (kind === 'wait') await page.waitForTimeout(a);
	else if (kind === 'scroll') await page.evaluate((t) => { document.querySelector('.ag-body-viewport').scrollTop = t; }, a);
	else if (kind === 'eval') console.log('  =>', JSON.stringify(await page.evaluate(a)));
	else if (kind === 'hover') await page.hover(a);
	else if (kind === 'drag') { const box = await page.locator(a).first().boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + b, box.y + box.height / 2 + c, { steps: 8 }); await page.mouse.up(); }
	await page.waitForTimeout(kind === 'wait' ? 0 : 250);
	if (kind !== 'eval') console.log(`${++i} ${kind} ${a ?? ''}`.slice(0, 80), JSON.stringify(await state()));
	if (shot) await page.screenshot({ path: `${shot}-${i}.png` });
}
if (logs.length) console.log(logs.join('\n'));
await browser.close();

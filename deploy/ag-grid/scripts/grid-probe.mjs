// Drives the grid behaviours markless-migrate's check does not reach (its journeys only use native controls) on the
// old and new app, one fresh page per scenario, and prints each scenario as same or with the first difference:
// node grid-probe.mjs [old] [new] [--only name] [--cpu 4]
import { chromium } from '../../../node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const OLD = args[0]?.startsWith('http') ? args[0] : 'http://127.0.0.1:4480/';
const NEW = args[1]?.startsWith('http') ? args[1] : 'http://localhost:4483/';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';

const H = (col) => `.ag-header-cell[col-id=${col}] .ag-header-cell-label`;
const F = (col) => `.ag-header-cell[col-id=${col}] .ag-header-cell-filter-button`;
const R = (id, col = 'channel') => `.ag-center-cols-container .ag-row[row-id="${id}"] [col-id=${col}]`;
const top = ['scroll', 0];

const textFilter = (col, text, type) => [
	['click', F(col)],
	...(type ? [['click', '.ag-popup:not(.ag-hidden) .ag-picker-field-wrapper >> nth=0'], ['click', `.ag-popup:not(.ag-hidden) .ag-select-list-item:has-text("${type}") >> nth=0`]] : []),
	...(text ? [['click', '.ag-popup:not(.ag-hidden) input[aria-label="Filter Value"] >> nth=0'], ['type', text]] : []),
	['wait', 700],
];

const SCENARIOS = {
	load: [],
	'scroll top': [top],
	'scroll middle': [['scroll', 72000]],
	'scroll through': [['scroll', 30000], ['scroll', 90000], ['scroll', 12345], ['scroll', 145000]],
	'wheel scroll': [['wheel', -3000], ['wheel', -1500]],
	'sort No. asc/desc/none': [['click', H('serialNumber')], top, ['click', H('serialNumber')], top, ['click', H('serialNumber')], top],
	'sort Time': [['click', H('timestamp')], top, ['click', H('timestamp')], top],
	'sort Direction': [['click', H('direction')], top, ['click', H('direction')], ['scroll', 50000]],
	'sort Channel': [['click', H('channel')], top, ['click', H('channel')], ['scroll', 99000]],
	'sort Data': [['click', H('args')], top, ['click', H('args')], top],
	'multi-sort Channel then Time desc': [['click', H('channel')], ['click', H('timestamp'), 'Shift'], ['click', H('timestamp'), 'Shift'], top],
	'filter Channel contains': [...textFilter('channel', 'file'), top],
	'filter Channel does not contain': [...textFilter('channel', 'file', 'Does not contain'), top],
	'filter Channel equals': [...textFilter('channel', 'ping', 'Equals'), top],
	'filter Channel not equal': [...textFilter('channel', 'ping', 'Does not equal'), top],
	'filter Channel begins with': [...textFilter('channel', 'store', 'Begins with'), top],
	'filter Channel ends with': [...textFilter('channel', 'SET', 'Ends with'), top],
	'filter Channel blank': [...textFilter('channel', '', 'Blank'), top],
	'filter Channel not blank': [...textFilter('channel', '', 'Not blank'), top],
	'filter Channel AND': [...textFilter('channel', 'set'), ['click', '.ag-popup:not(.ag-hidden) input[aria-label="Filter Value"] >> nth=1'], ['type', 'store'], ['wait', 700], top],
	'filter Channel OR': [...textFilter('channel', 'ping'), ['click', '.ag-popup:not(.ag-hidden) .ag-filter-condition-operator-or input'], ['click', '.ag-popup:not(.ag-hidden) input[aria-label="Filter Value"] >> nth=1'], ['type', 'pong'], ['wait', 700], top],
	'filter Data contains': [...textFilter('args', 'true'), top],
	'filter Data no match': [...textFilter('args', 'zzzz')],
	'filter Direction one': [['click', F('direction')], ['click', '.ag-popup:not(.ag-hidden) .cursor-pointer >> nth=2'], top],
	'filter Direction two then clear': [['click', F('direction')], ['click', '.ag-popup:not(.ag-hidden) .cursor-pointer >> nth=4'], ['click', '.ag-popup:not(.ag-hidden) .cursor-pointer >> nth=5'], top, ['click', 'text=Clear all']],
	'filter and sort': [...textFilter('channel', 'window'), ['press', 'Escape'], ['click', H('timestamp')], ['click', H('timestamp')], top],
	'filter popup Escape': [['click', F('channel')], ['press', 'Escape']],
	'filter popup outside click': [['click', F('channel')], ['click', '.ag-row >> nth=3']],
	'select row': [['click', R(4999)]],
	'select then another': [['click', R(4999)], ['click', R(4990, 'args')]],
	'ctrl-click deselect': [['click', R(4999)], ['click', R(4999), 'Meta']],
	'linked event': [['click', R(4990, 'args')], ['click', 'text=#4989']],
	'close details': [['click', R(4999)], ['click', 'button[title=""]']],
	'json fold nested twice': [['click', R(4990, 'args')], ['click', '.react-json-view .pushed-content .object-key-val > span > span'], ['click', '.react-json-view .pushed-content .object-key-val > span > span']],
	'json fold then other row': [['click', R(4990, 'args')], ['click', '.react-json-view .pushed-content .object-key-val > span > span'], ['click', '.react-json-view .pushed-content .object-key-val > span > span'], ['click', R(4983, 'args')], ['click', R(4990, 'args')], ['click', '.react-json-view .pushed-content .object-key-val > span > span']],
	'json fold root and ellipsis': [['click', R(4990, 'args')], ['click', '.react-json-view .icon-container >> nth=0'], ['click', '.react-json-view .node-ellipsis:visible'], ['click', '.react-json-view .icon-container >> nth=0'], ['click', R(4983, 'args')]],
	'ctrl+enter opens filter': [['click', H('channel')], ['press', 'Control+Enter'], ['type', 'set'], ['wait', 700]],
	'picker keyboard': [['click', F('channel')], ['press', 'Shift+Tab'], ['press', 'Enter'], ['press', 'ArrowDown'], ['press', 'ArrowDown'], ['press', 'Enter'], ['wait', 700]],
	'filter Enter key': [['click', F('channel')], ['type', 'log'], ['press', 'Enter'], ['wait', 200]],
	'row Space and End': [['click', R(4980)], ['press', 'Space'], ['wait', 400], ['press', 'Home'], ['wait', 400]],
	'json collapse': [['click', R(4990, 'args')], ['click', '.react-json-view .object-key-val .object-key-val > span > span']],
	'keyboard header': [['click', 'button[title="Clear all events"]'], ['press', 'Shift+Tab'], ['press', 'Tab'], ['press', 'Tab'], ['press', 'ArrowRight'], ['press', 'ArrowRight'], ['press', 'Enter'], ['press', 'Enter'], ['press', 'ArrowLeft'], ['press', 'Tab'], ['press', 'Tab'], ['press', 'Tab']],
	'keyboard row': [['click', R(4995)], ['press', 'ArrowUp'], ['wait', 400], ['press', 'Tab'], ['press', 'Tab']],
	'resize Channel': [['drag', '.ag-header-cell[col-id=channel] .ag-header-cell-resize', 60, 0, 30]],
	'resize Time': [['drag', '.ag-header-cell[col-id=timestamp] .ag-header-cell-resize', 40, 0, 30]],
	'move Direction after Channel': [['drag', '.ag-header-cell[col-id=direction] .ag-header-cell-label', 300, 0, 20], ['wait', 300]],
	'move Data to front then sort': [['drag', '.ag-header-cell[col-id=args] .ag-header-cell-label', -900, 0, 30], ['wait', 300], ['click', H('timestamp')]],
	'dark theme': [['click', 'button[title^="Switch between"]']],
	'detail below': [['click', R(4999)], ['click', 'button[title^="Toggle Detail"]'], ['wait', 300]],
	'clear events': [['click', R(4999)], ['click', 'button[title="Clear all events"]'], ['wait', 400]],
};

const state = (page) =>
	page.evaluate(() => {
		const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
		const describe = (el) => {
			if (!el || el === document.body) return 'body';
			const bits = [el.tagName.toLowerCase(), el.getAttribute('role') ?? '', el.getAttribute('col-id') ?? '', el.getAttribute('row-id') ?? '', el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? ''];
			return bits.filter(Boolean).join(' ');
		};
		const rows = [...document.querySelectorAll('.ag-center-cols-container .ag-row')].sort((a, b) => Number(a.getAttribute('row-index')) - Number(b.getAttribute('row-index')));
		const vp = document.querySelector('.ag-body-viewport');
		const viewTop = vp?.getBoundingClientRect().top ?? 0;
		const shown = rows.filter((r) => {
			const box = r.getBoundingClientRect();
			return box.bottom > viewTop && box.top < viewTop + (vp?.clientHeight ?? 0);
		});
		const popup = [...document.querySelectorAll('.ag-popup')].find(visible);
		const json = document.querySelector('.react-json-view');
		return {
			focus: describe(document.activeElement),
			headers: [...document.querySelectorAll('.ag-header-cell')].filter(visible).map((h) => `${h.getAttribute('col-id')}:${h.getAttribute('aria-sort')}:${h.style.width}:${h.querySelector('.ag-sort-order:not(.ag-hidden)')?.textContent ?? ''}${h.classList.contains('ag-header-cell-filtered') ? ':filtered' : ''}`).join(' '),
			rowcount: document.querySelector('[role=grid]')?.getAttribute('aria-rowcount'),
			rendered: rows.length ? `${rows[0].getAttribute('row-index')}..${rows.at(-1).getAttribute('row-index')} (${rows.length})` : 'none',
			shown: shown.map((r) => `${r.getAttribute('aria-rowindex')}:${r.getAttribute('row-id')}${r.getAttribute('aria-selected') === 'true' ? '*' : ''}`).join(' '),
			text: shown.slice(0, 3).map((r) => r.innerText.replace(/\s+/g, ' ')).join(' / '),
			scrollTop: vp?.scrollTop,
			popup: popup ? popup.innerText.replace(/\s+/g, ' ') : '',
			detail: visible(json) ? json.closest('.flex.h-full.flex-col').innerText.replace(/\s+/g, ' ') : '',
			overlay: visible(document.querySelector('.ag-overlay')) ? document.querySelector('.ag-overlay').innerText : '',
			theme: document.body.className,
			storage: JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
		};
	});

async function run(browser, url, steps) {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'en-US' });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url);
	await page.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 15000 });
	await page.waitForTimeout(600);
	const out = [];
	for (const [kind, a, b, c, d] of steps) {
		try {
			if (kind === 'click') await page.click(a, b ? { modifiers: [b], timeout: 5000 } : { timeout: 5000 });
			else if (kind === 'press') await page.keyboard.press(a);
			else if (kind === 'type') await page.keyboard.type(a);
			else if (kind === 'wait') await page.waitForTimeout(a);
			else if (kind === 'scroll') await page.evaluate((t) => { document.querySelector('.ag-body-viewport').scrollTop = t; }, a);
			else if (kind === 'wheel') { await page.mouse.move(640, 400); await page.mouse.wheel(0, a); }
			else if (kind === 'drag') {
				const box = await page.locator(a).first().boundingBox();
				await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
				await page.mouse.down();
				await page.mouse.move(box.x + box.width / 2 + b, box.y + box.height / 2 + c, { steps: d ?? 10 });
				await page.mouse.up();
			}
		} catch (error) {
			out.push({ error: `${kind} ${a}: ${error.message.split('\n')[0]}` });
			break;
		}
		await page.waitForTimeout(kind === 'wait' ? 0 : 450);
		out.push(await state(page));
	}
	if (!steps.length) out.push(await state(page));
	await page.close();
	return { out, errors };
}

const browser = await chromium.launch();
let same = 0;
let differ = 0;
for (const [name, steps] of Object.entries(SCENARIOS)) {
	if (only && !name.includes(only)) continue;
	const [a, b] = await Promise.all([run(browser, OLD, steps), run(browser, NEW, steps)]);
	const diffs = [];
	a.out.forEach((s, i) => {
		const t = b.out[i] ?? {};
		for (const key of Object.keys({ ...s, ...t })) if (JSON.stringify(s[key]) !== JSON.stringify(t[key])) diffs.push(`step ${i + 1} ${key}: old ${JSON.stringify(s[key])?.slice(0, 220)} | new ${JSON.stringify(t[key])?.slice(0, 220)}`);
	});
	if (b.errors.length) diffs.push(`new page errors: ${b.errors.join('; ')}`);
	if (diffs.length) {
		differ++;
		console.log(`DIFF ${name}\n  ${diffs.slice(0, 6).join('\n  ')}`);
	} else {
		same++;
		console.log(`same ${name}`);
	}
}
console.log(`${same} same, ${differ} differ`);
await browser.close();

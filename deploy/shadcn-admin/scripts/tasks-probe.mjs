// Drives the same steps on the old and new /tasks and prints what each shows: node tasks-probe.mjs <base> [only]
import { chromium } from 'playwright';
const [base, only] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultTimeout(4000);
p.on('pageerror', (e) => console.log('pageerror:', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
const click = (sel) => p.locator(sel).locator('visible=true').first().click();
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const show = async (label) =>
	console.log(
		label,
		JSON.stringify(
			await p.evaluate(() => {
				const vis = (el) => el && el.getClientRects().length > 0 && !el.closest('[hidden]');
				const text = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
				const rows = [...document.querySelectorAll('main tbody tr')].filter(vis);
				const act = document.activeElement;
				const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(vis).map((d) => text(d).slice(0, 160));
				const menus = [...document.querySelectorAll('[role=menu],[role=listbox]')].filter((m) => vis(m) && !m.closest('main table')).map((m) => text(m).slice(0, 120));
				const toasts = [...document.querySelectorAll('[data-sonner-toast]')].filter(vis).map((t) => `${t.dataset.type}: ${text(t).slice(0, 100)}`);
				return {
					url: location.pathname + location.search,
					rows: rows.length,
					first: rows.slice(0, 2).map((r) => [...r.querySelectorAll('td')].filter((td) => !td.hidden).map((td) => td.innerText.trim()).slice(1, 5).join('|')),
					label: text([...document.querySelectorAll('div.w-25')].find(vis)),
					toolbar: text([...document.querySelectorAll('[role=toolbar]')].find(vis)),
					live: [...document.querySelectorAll('[role=status]')].filter((e) => !e.closest('[hidden]')).map((e) => e.textContent).join('|'),
					headers: [...document.querySelectorAll('main thead th')].filter((th) => !th.hidden).map((th) => th.innerText.trim()).join('|'),
					checked: [...document.querySelectorAll('main [role=checkbox]')].filter((c) => c.getAttribute('aria-checked') !== 'false').length,
					active: act ? `${act.tagName} ${act.getAttribute('role') ?? ''} ${act.getAttribute('aria-label') ?? act.textContent.trim().slice(0, 24)}` : '',
					dialogs,
					menus,
					toasts,
					errors: [...document.querySelectorAll('[data-slot=form-message]')].filter(vis).map(text),
				};
			}),
		),
	);
const step = async (label, fn, wait = 350) => {
	if (only && !label.startsWith(only)) return;
	try {
		await fn();
		await p.waitForTimeout(wait);
		await show(label);
	} catch (e) {
		console.log(label, 'FAILED', e.message.split('\n')[0]);
	}
};
const fresh = async () => {
	await p.goto(`${base}/tasks`, { waitUntil: 'networkidle' });
	await p.waitForTimeout(300);
};
await fresh();
await show('initial');
await step('select row 1', () => click('tbody tr:first-child button[role=checkbox]'));
await step('select all', () => click('thead button[role=checkbox]'));
await step('select all again', () => click('thead button[role=checkbox]'));
await step('select row 2', () => click('tbody tr:nth-child(2) button[role=checkbox]'));
await step('bulk status menu', () => click('button[aria-label="Update status"]'));
await step('bulk status done', () => click('[role=menuitem]:has-text("Done")'));
await step('bulk status success', async () => {}, 2300);
await step('select row 3', () => click('tbody tr:nth-child(3) button[role=checkbox]'));
await step('bulk export', () => click('button[aria-label="Export tasks"]'));
await step('select row 4', () => click('tbody tr:nth-child(4) button[role=checkbox]'));
await step('bulk delete', () => click('button[aria-label="Delete selected tasks"]'));
await step('bulk delete type', () => p.keyboard.type('DELETE'));
await step('bulk delete confirm', () => click('[role=alertdialog] button:has-text("Delete")'));
await step('bulk delete done', async () => {}, 2300);
await fresh();
await step('sort title asc', async () => { await click('th button:has-text("Title")'); await p.waitForTimeout(200); await click('[role=menuitem]:has-text("Asc")'); });
await step('sort status desc', async () => { await click('th button:has-text("Status")'); await p.waitForTimeout(200); await click('[role=menuitem]:has-text("Desc")'); });
await step('hide priority', async () => { await click('th button:has-text("Priority")'); await p.waitForTimeout(200); await click('[role=menuitem]:has-text("Hide")'); });
await step('view menu', () => click('button:has-text("View")'));
await step('view toggle title', () => click('[role=menuitemcheckbox]:has-text("title")'));
await step('filter "ab"', () => p.fill('input[placeholder="Filter by title or ID..."]', 'ab'));
await step('filter "ab " trimmed', () => p.keyboard.type(' '));
await step('status facet', () => click('button[data-slot=popover-trigger]:has-text("Status")'));
await step('status todo', () => click('[cmdk-item]:has-text("Todo")'));
await step('status done', () => click('[cmdk-item]:has-text("Done")'));
await step('status canceled', () => click('[cmdk-item]:has-text("Canceled")'));
await step('status trigger', async () => console.log(flat(await p.$eval('button[data-slot=popover-trigger]', (e) => e.innerText))));
await step('facet type', () => p.keyboard.type('pro'));
await step('facet enter', () => p.keyboard.press('Enter'));
await step('escape popover', () => p.keyboard.press('Escape'));
await step('priority facet', () => click('button[data-slot=popover-trigger]:has-text("Priority")'));
await step('priority high', () => click('[cmdk-item]:has-text("High")'));
await step('priority clear', () => click('[cmdk-item]:has-text("Clear filters")'));
await step('escape popover 2', () => p.keyboard.press('Escape'));
await step('reset', () => click('main button:has-text("Reset")'));
await step('next page', () => click('button:has(span:text("Go to next page"))'));
await step('page 4', () => click('button:has(span:text("Go to page 4"))'));
await step('last page', () => click('button:has(span:text("Go to last page"))'));
await step('page size 20', async () => { await click('main button[role=combobox]'); await p.waitForTimeout(200); await click('[role=option]:has-text("20")'); });
await step('previous page', () => click('button:has(span:text("Go to previous page"))'));
await step('first page', () => click('button:has(span:text("Go to first page"))'));
await fresh();
await step('row menu', () => click('tbody tr:first-child button[data-slot=dropdown-menu-trigger]'));
await step('row menu arrow', () => p.keyboard.press('ArrowDown'));
await step('labels sub', () => p.hover('[data-slot=dropdown-menu-sub-trigger]'));
await step('labels pick', () => click('[role=menuitemradio]:has-text("Bug")'));
await step('row edit', async () => { await click('tbody tr:first-child button[data-slot=dropdown-menu-trigger]'); await p.waitForTimeout(200); await click('[role=menuitem]:has-text("Edit")'); }, 600);
await step('edit clear title', () => p.fill('#tasks-form-title, [role=dialog] input[name=title]', ''));
await step('edit save', () => click('[role=dialog] button:has-text("Save changes")'));
await step('edit type title', () => p.keyboard.type('New title'));
await step('edit save 2', () => click('[role=dialog] button:has-text("Save changes")'));
await step('row delete', async () => { await click('tbody tr:nth-child(2) button[data-slot=dropdown-menu-trigger]'); await p.waitForTimeout(200); await click('[role=menuitem]:has-text("Delete")'); }, 600);
await step('row delete confirm', () => click('[role=alertdialog] button:has-text("Delete")'));
await step('create', () => click('main button:has-text("Create")'), 600);
await step('create save empty', () => click('[role=dialog] button:has-text("Save changes")'));
await step('create title', () => p.keyboard.type('Write tests'));
await step('create status open', () => click('[role=dialog] button[role=combobox]'));
await step('create status todo', () => click('[role=option]:has-text("Todo")'));
await step('create label', () => click('[role=dialog] [role=radio][value=feature]'));
await step('create priority', () => click('[role=dialog] [role=radio][value=high]'));
await step('create priority arrow', () => p.keyboard.press('ArrowDown'));
await step('create save', () => click('[role=dialog] button:has-text("Save changes")'));
await step('create again escape', async () => { await click('main button:has-text("Create")'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); });
await step('import', () => click('main button:has-text("Import")'), 600);
await step('import empty', () => click('[role=dialog] button:has-text("Import")'));
await step('import txt', () => p.setInputFiles('[role=dialog] input[type=file]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }));
await step('import submit txt', () => click('[role=dialog] button:has-text("Import")'));
await step('import csv', () => p.setInputFiles('[role=dialog] input[type=file]', { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b') }));
await step('import submit csv', () => click('[role=dialog] button:has-text("Import")'));
await step('import close', async () => { await click('main button:has-text("Import")'); await p.waitForTimeout(400); await click('[role=dialog] button:has-text("Close") >> nth=0'); });
await b.close();

// Drives the users page's add, edit, invite and multi-delete dialogs on the old and new apps and prints what each shows: node users-dialogs-probe.mjs <base>
import { chromium } from 'playwright';
const base = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await p.goto(`${base}/users`, { waitUntil: 'networkidle' });
const dlg = '[role=dialog]:not([hidden]), [role=alertdialog]:not([hidden])';
const show = async (label) => console.log(label, JSON.stringify(await p.evaluate((dlg) => {
	const d = [...document.querySelectorAll(dlg)].find((e) => e.getClientRects().length);
	const a = document.activeElement;
	const toasts = [...document.querySelectorAll('[data-sonner-toast]')].filter((t) => !t.hidden && t.getClientRects().length).map((t) => `${t.dataset.type}:${t.querySelector('[data-title]')?.textContent}${t.querySelector('[data-description]:not([hidden]) code') ? ' ' + t.querySelector('[data-description] code').textContent.replace(/\s+/g, ' ') : ''}`);
	return {
		dialog: d ? `${d.getAttribute('role')} ${d.querySelector('h2')?.textContent.replace(/\s+/g, ' ').trim()}` : null,
		messages: d ? [...d.querySelectorAll('[data-slot=form-message]')].map((m) => m.textContent) : [],
		invalid: d ? [...d.querySelectorAll('[aria-invalid=true]')].map((e) => e.getAttribute('name') ?? e.getAttribute('role')) : [],
		errorLabels: d ? [...d.querySelectorAll('label[data-error=true]')].map((e) => e.textContent.trim()) : [],
		values: d ? [...d.querySelectorAll('input:not([type=hidden]), textarea, [role=combobox]')].map((e) => `${e.name ?? ''}=${e.value ?? e.textContent.trim()}${e.disabled ? '(disabled)' : ''}`) : [],
		submitDisabled: d ? [...d.querySelectorAll('button')].filter((e) => e.disabled).map((e) => e.textContent.trim()) : [],
		active: `${a?.tagName} ${a?.getAttribute('name') ?? a?.getAttribute('aria-label') ?? a?.textContent?.trim().slice(0, 20)}`,
		toasts,
		selected: document.querySelectorAll('tbody button[role=checkbox][aria-checked=true]').length,
		bodyPointer: document.body.style.pointerEvents,
	};
}, dlg)));
const step = async (label, fn, wait = 300) => { try { await fn(); await p.waitForTimeout(wait); await show(label); } catch (e) { console.log(label, 'FAILED', e.message.split('\n')[0]); } };
const inDlg = (sel) => p.locator('[role=dialog]:visible, [role=alertdialog]:visible').locator(sel).first();
await step('add open', () => p.click('button:has-text("Add User")'));
await step('add submit empty', () => inDlg('button:has-text("Save changes")').click());
await step('add type', async () => { await inDlg('input[name=firstName]').fill('Ann'); await inDlg('input[name=lastName]').fill('Lee'); await inDlg('input[name=username]').fill('ann'); await inDlg('input[name=email]').fill('ann@x'); await inDlg('input[name=phoneNumber]').fill('+1555'); });
await step('add password abc', () => inDlg('input[name=password]').fill('abc'));
await step('add password ok, confirm wrong', async () => { await inDlg('input[name=password]').fill('abcdefg1'); await inDlg('input[name=confirmPassword]').fill('abcdefg2'); });
await step('add show password', () => inDlg('button:has-text("Show password")').click());
await step('add role open', () => inDlg('[role=combobox]').click());
await step('add role pick', () => p.click('[role=option]:visible:has-text("Manager")'));
await step('add email fix + confirm fix', async () => { await inDlg('input[name=email]').fill('ann@x.com'); await inDlg('input[name=confirmPassword]').fill('abcdefg1'); });
await step('add submit', () => inDlg('button:has-text("Save changes")').click());
await step('add reopen', () => p.click('button:has-text("Add User")'));
await step('add escape', () => p.keyboard.press('Escape'));
await step('invite open', () => p.click('button:has-text("Invite User")'));
await step('invite submit empty', () => inDlg('button:has-text("Invite")').click());
await step('invite type', async () => { await inDlg('input[name=email]').fill('a@b.co'); await inDlg('[role=combobox]').click(); await p.waitForTimeout(200); await p.click('[role=option]:visible:has-text("Admin")'); await p.waitForTimeout(200); await inDlg('textarea').fill('hello'); });
await step('invite submit', () => inDlg('button:has-text("Invite")').click());
await step('invite reopen + cancel', async () => { await p.click('button:has-text("Invite User")'); await p.waitForTimeout(300); await inDlg('button:has-text("Cancel")').click(); });
await step('edit open', async () => { await p.click('tbody tr:first-child button[data-slot=dropdown-menu-trigger]'); await p.waitForTimeout(200); await p.click('[role=menuitem]:visible:has-text("Edit")'); });
await step('edit first name empty + submit', async () => { await inDlg('input[name=firstName]').fill(''); await inDlg('button:has-text("Save changes")').click(); });
await step('edit fix + submit', async () => { await inDlg('input[name=firstName]').fill('Zed'); await inDlg('button:has-text("Save changes")').click(); });
await step('select 2 rows', async () => { await p.click('tbody tr:nth-child(1) button[role=checkbox]'); await p.waitForTimeout(150); await p.click('tbody tr:nth-child(2) button[role=checkbox]'); });
await step('multi open', () => p.click('button[aria-label="Delete selected users"]'));
await step('multi type wrong + enter', async () => { await inDlg('input').fill('nope'); await inDlg('input').press('Enter'); });
await step('multi type DELETE', () => inDlg('input').fill('DELETE'));
await step('multi delete', () => inDlg('button:has-text("Delete")').last().click());
await step('multi settled', () => p.waitForTimeout(2200));
await b.close();

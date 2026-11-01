// The Base UI Toast port driven in a real browser over a stand-in for the Markless render convert's NotifyPlan writes,
// against what @base-ui/react 1.6's ToastStore, ToastViewport and ToastRoot do with shadcn's Toast styles.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

const PART = join(import.meta.dirname, '..', 'parts', 'base-ui', 'toast.ts');

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

// shadcn's base Toast classes, written out as plain CSS.
const CSS = `body{margin:0;font:16px sans-serif}
[data-slot=toast-viewport]{position:fixed;right:16px;bottom:16px;width:320px}
[data-slot=toast]{position:absolute;z-index:calc(1000 - var(--toast-index));right:0;bottom:0;width:100%;box-sizing:border-box;--gap:12px;--peek:12px;--height:var(--toast-frontmost-height,var(--toast-height));--offset-y:calc(var(--toast-offset-y)*-1 + calc(var(--toast-index)*var(--gap)*-1) + var(--toast-swipe-movement-y));--scale:calc(max(0,1 - (var(--toast-index)*0.1)));--shrink:calc(1 - var(--scale));height:var(--height);transform:translateX(var(--toast-swipe-movement-x)) translateY(calc(var(--toast-swipe-movement-y) - (var(--toast-index)*var(--peek)) - (var(--shrink)*var(--height)))) scale(var(--scale));transition:transform 500ms cubic-bezier(0.22,1,0.36,1),opacity 500ms,height 150ms}
[data-slot=toast][data-expanded]{height:var(--toast-height);transform:translateX(var(--toast-swipe-movement-x)) translateY(var(--offset-y))}
[data-slot=toast][data-limited]{opacity:0}
[data-slot=toast][data-starting-style]{transform:translateY(150%)}
[data-slot=toast][data-ending-style]:not([data-limited]):not([data-swipe-direction]){transform:translateY(150%)}
[data-slot=toast][data-ending-style][data-swipe-direction=down]{transform:translateY(calc(var(--toast-swipe-movement-y) + 150%))}
[data-slot=toast][data-ending-style][data-swipe-direction=right]{transform:translateX(calc(var(--toast-swipe-movement-x) + 150%)) translateY(var(--offset-y))}
[data-slot=toast-content]{height:60px;display:flex;align-items:center;gap:8px;padding:0 12px}`;

interface Spec {
	readonly label: string;
	readonly timeout?: number;
	readonly phases?: readonly { at: number; type?: string; text: string }[];
}

// Each control adds its toast; the commit renders roots keyed by id, as Markless's keyed @for keeps an element per item.
async function open(specs: readonly Spec[], provider = { timeout: 5000, limit: 3 }): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const toasts = specs.map((s, k) => ({ view: k, ...(s.timeout !== undefined ? { timeout: s.timeout } : {}), phases: (s.phases ?? [{ at: 0, text: s.label }]).map((p) => ({ at: p.at, ...(p.type ? { type: p.type } : {}), attrs: { role: 'dialog', tabindex: '0', 'data-slot': 'toast', ...(p.type ? { 'data-type': p.type } : {}) } })) }));
	const arms = specs.flatMap((s, k) => (s.phases ?? [{ at: 0, text: s.label }]).map((p, i) => ({ view: `${k}.${i}`, text: p.text })));
	const script = `import { baseToastAdd, baseToastViewport } from '/toast.js';
const T = ${JSON.stringify({ id: 'btst0', ...provider })};
const SPECS = ${JSON.stringify(toasts)};
const ARMS = ${JSON.stringify(arms)};
const viewport = document.querySelector('[data-slot=toast-viewport]');
const roots = new Map();
const commit = (view) => {
	if (view.style) viewport.setAttribute('style', view.style); else viewport.removeAttribute('style');
	if (view.expanded === undefined) viewport.removeAttribute('data-expanded'); else viewport.setAttribute('data-expanded', '');
	const keep = new Set(view.items.map((i) => i.id));
	for (const [id, el] of roots) if (!keep.has(id)) { el.remove(); roots.delete(id); }
	view.items.forEach((item, at) => {
		let el = roots.get(item.id);
		if (!el) {
			el = document.createElement('div');
			for (const arm of ARMS) el.insertAdjacentHTML('beforeend', '<div data-slot="toast-content" data-view="' + arm.view + '"><span>' + arm.text + '</span><button data-slot="toast-close" aria-label="Close toast">x</button></div>');
			roots.set(item.id, el);
		}
		for (const [n, v] of Object.entries(item.a)) if (v === undefined) el.removeAttribute(n); else el.setAttribute(n, v);
		for (const c of el.children) {
			c.style.display = c.dataset.view === item.view ? '' : 'none';
			for (const [n, v] of [['data-expanded', item.c.expanded], ['data-behind', item.c.behind]]) if (v === undefined) c.removeAttribute(n); else c.setAttribute(n, v);
		}
		if (viewport.children[at] !== el) viewport.insertBefore(el, viewport.children[at] ?? null);
	});
};
for (const e of ['mouseenter', 'mousemove', 'mouseleave', 'focusin', 'focusout', 'click', 'keydown', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel']) viewport.addEventListener(e, (event) => baseToastViewport(T, event, commit));
document.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => baseToastAdd(T, SPECS[Number(b.dataset.k)], commit)));
window.ready = true;`;
	await page.route('http://toast.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/toast.js') return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(await readFile(PART, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
		return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${CSS}</style></head><body><main>${specs.map((s, k) => `<button data-k="${k}">${s.label}</button>`).join('')}</main><div role="region" aria-live="polite" data-slot="toast-viewport" data-mm-base-toaster="btst0"></div><script type="module">${script}</script></body></html>` });
	});
	await page.goto('http://toast.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return page;
}

const roots = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-slot=toast]')].map((el) => {
			const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
			const content = [...el.children].find((c) => (c as HTMLElement).style.display !== 'none')!;
			return { text: content.textContent!.replace(/x$/, ''), y: Math.round(m.m42), scale: Math.round(m.m11 * 100) / 100, index: el.style.getPropertyValue('--toast-index').trim(), expanded: el.hasAttribute('data-expanded'), behind: content.hasAttribute('data-behind'), limited: el.hasAttribute('data-limited'), inert: el.hasAttribute('inert'), ending: el.hasAttribute('data-ending-style'), type: el.getAttribute('data-type') };
		}),
	);
const gone = (page: Page) => page.waitForFunction(() => !document.querySelector('[data-slot=toast]'), undefined, { timeout: 5000 });

test('Base UI Toast: a toast slides in from below, and toasts stack newest first, each behind scaled down and peeking above', async () => {
	const page = await open([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
	await page.click('text=A');
	await page.waitForTimeout(80);
	const entering = (await roots(page))[0]!;
	assert.ok(entering.y > 10, `entering from below, at ${entering.y}`);
	await page.waitForTimeout(900);
	assert.equal((await roots(page))[0]!.y, 0, 'at rest');
	assert.equal(await page.evaluate(() => document.querySelector<HTMLElement>('[data-slot=toast-viewport]')!.style.getPropertyValue('--toast-frontmost-height')), '60px');
	await page.click('text=B');
	await page.click('text=C');
	await page.waitForTimeout(900);
	assert.deepEqual((await roots(page)).map((r) => [r.text, r.index, r.scale, r.y, r.behind]), [
		['C', '0', 1, 0, false],
		['B', '1', 0.9, -18, true],
		['A', '2', 0.8, -36, true],
	]);
	await page.close();
});

test('Base UI Toast: hovering the viewport expands the stack by the heights before each toast and pauses every timer; leaving resumes them', async () => {
	const page = await open([{ label: 'A', timeout: 600 }, { label: 'B', timeout: 600 }]);
	await page.click('text=A');
	await page.click('text=B');
	await page.waitForTimeout(100);
	const front = (await page.locator('[data-slot=toast] >> nth=0').boundingBox())!;
	await page.mouse.move(front.x + 20, front.y + 20);
	await page.waitForTimeout(900);
	const open1 = await roots(page);
	assert.deepEqual(open1.map((r) => [r.text, r.expanded, r.y]), [
		['B', true, 0],
		['A', true, -72],
	]);
	assert.equal(await page.evaluate(() => document.querySelector('[data-slot=toast-viewport]')!.hasAttribute('data-expanded')), true);
	await page.mouse.move(5, 5);
	await page.waitForTimeout(150);
	assert.equal((await roots(page)).length, 2, 'the timers resume with what was left');
	await gone(page);
	await page.close();
});

test('Base UI Toast: its timeout closes it through data-ending-style, and it is removed once its transition ends', async () => {
	const page = await open([{ label: 'A', timeout: 300 }]);
	await page.click('text=A');
	await page.waitForTimeout(420);
	const [closing] = await roots(page);
	assert.ok(closing?.ending, 'leaving');
	await page.waitForTimeout(100);
	assert.equal((await roots(page)).length, 1, 'still there while it slides out');
	await gone(page);
	await page.close();
});

test('Base UI Toast: past the limit the oldest is limited (hidden, inert); its close button closes one', async () => {
	const page = await open([{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }]);
	for (const l of ['A', 'B', 'C', 'D']) await page.click(`main >> text=${l}`);
	await page.waitForTimeout(100);
	assert.deepEqual((await roots(page)).map((r) => [r.text, r.limited, r.inert]), [
		['D', false, false],
		['C', false, false],
		['B', false, false],
		['A', true, true],
	]);
	await page.mouse.move(5, 5);
	await page.locator('[data-slot=toast] >> nth=0').locator('[data-slot=toast-close]:visible').click();
	await page.waitForTimeout(50);
	assert.deepEqual((await roots(page)).map((r) => [r.text, r.ending, r.limited]), [
		['D', true, false],
		['C', false, false],
		['B', false, false],
		['A', false, false],
	]);
	await page.close();
});

test('Base UI Toast: a drag down past 40 px dismisses it in the swipe direction; a shorter one springs back', async () => {
	const page = await open([{ label: 'A' }]);
	await page.click('text=A');
	await page.waitForTimeout(700);
	const box = (await page.locator('[data-slot=toast]').boundingBox())!;
	const x = box.x + box.width - 30;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 4; i++) await page.mouse.move(x, y + i * 5);
	await page.mouse.up();
	await page.waitForTimeout(50);
	assert.equal(await page.evaluate(() => document.querySelector('[data-slot=toast]')!.hasAttribute('data-ending-style')), false, 'springs back');
	assert.equal(await page.evaluate(() => document.querySelector<HTMLElement>('[data-slot=toast]')!.style.getPropertyValue('--toast-swipe-movement-y').trim()), '0px');
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + i * 8);
	assert.equal(await page.evaluate(() => document.querySelector('[data-slot=toast]')!.getAttribute('data-swipe-direction')), 'down');
	await page.mouse.up();
	await page.waitForTimeout(50);
	assert.deepEqual(await page.evaluate(() => [document.querySelector('[data-slot=toast]')!.hasAttribute('data-ending-style'), document.querySelector('[data-slot=toast]')!.getAttribute('data-swipe-direction')]), [true, 'down']);
	await gone(page);
	await page.close();
});

test('Base UI Toast: a promise toast shows its loading markup with no timer, then its result, whose timeout starts then', async () => {
	const page = await open([{ label: 'P', timeout: 400, phases: [{ at: 0, type: 'loading', text: 'Creating' }, { at: 700, type: 'success', text: 'Created' }] }]);
	await page.click('text=P');
	await page.waitForTimeout(550);
	assert.deepEqual((await roots(page)).map((r) => [r.text, r.type, r.ending]), [['Creating', 'loading', false]]);
	await page.waitForTimeout(300);
	assert.deepEqual((await roots(page)).map((r) => [r.text, r.type, r.ending]), [['Created', 'success', false]]);
	await page.waitForTimeout(500);
	assert.equal((await roots(page))[0]?.ending ?? true, true);
	await page.close();
});



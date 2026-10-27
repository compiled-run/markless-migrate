import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, setAttr, walk, type Element as Tree } from './dom.ts';

/** Where the old page placed a Qwik UI floating panel against its anchor: floating-ui's placement and offset (its gutter). */
export interface QwikFloating {
	readonly id: string;
	readonly placement: string;
	readonly gutter: number;
}

export interface QwikFloatingCapture {
	readonly route: string;
	readonly panels: readonly QwikFloating[];
}

// Runs in the page: each floating panel (popover + data-floating, an id ending -panel) with how to open it and what it is
// placed against: a select's or dropdown's trigger, a combobox's control, a popover's popovertarget, a tooltip's trigger.
function findPanels(): { id: string; opener: string; anchor: string; hover: boolean }[] {
	const out: { id: string; opener: string; anchor: string; hover: boolean }[] = [];
	let n = 0;
	const tag = (el: Element) => {
		if (!el.hasAttribute('data-mm-float')) el.setAttribute('data-mm-float', String(n++));
		return `[data-mm-float="${el.getAttribute('data-mm-float')}"]`;
	};
	for (const panel of document.querySelectorAll<HTMLElement>('[popover][data-floating][id$="-panel"]')) {
		const base = panel.id.replace(/-panel$/, '');
		if (panel.getAttribute('role') === 'tooltip') {
			const trigger = document.querySelector(`[aria-describedby="${CSS.escape(base)}"]`);
			if (trigger) out.push({ id: panel.id, opener: tag(trigger), anchor: tag(trigger), hover: true });
			continue;
		}
		const input = document.querySelector(`input[role="combobox"][aria-controls="${CSS.escape(panel.id)}"]`);
		if (input) {
			const control = input.closest('[data-combobox-control]') ?? input;
			const opener = control.querySelector('button') ?? input;
			out.push({ id: panel.id, opener: tag(opener), anchor: tag(control), hover: false });
			continue;
		}
		const trigger = document.querySelector(`[popovertarget="${CSS.escape(panel.id)}"]`) ?? document.getElementById(`${base}-trigger`) ?? document.querySelector(`[aria-controls="${CSS.escape(panel.id)}"]`);
		if (trigger) out.push({ id: panel.id, opener: tag(trigger), anchor: tag(trigger), hover: false });
	}
	return out;
}

// Runs in the page: the side and alignment the panel ended up on, and its distance from the anchor.
function measure([id, anchor]: readonly [string, string]): { placement: string; gutter: number } | undefined {
	const panel = document.getElementById(id);
	const a = document.querySelector(anchor);
	if (!panel || !a || !panel.matches(':popover-open')) return undefined;
	const p = panel.getBoundingClientRect();
	const r = a.getBoundingClientRect();
	if (p.width === 0 || p.height === 0) return undefined;
	const near = (x: number, y: number) => Math.abs(x - y) <= 1.5;
	const align = (start: number, end: number, from: number, to: number) => (near((start + end) / 2, (from + to) / 2) ? '' : near(start, from) ? '-start' : near(end, to) ? '-end' : '');
	if (p.top >= r.bottom - 1) return { placement: `bottom${align(p.left, p.right, r.left, r.right)}`, gutter: Math.round(p.top - r.bottom) };
	if (p.bottom <= r.top + 1) return { placement: `top${align(p.left, p.right, r.left, r.right)}`, gutter: Math.round(r.top - p.bottom) };
	if (p.left >= r.right - 1) return { placement: `right${align(p.top, p.bottom, r.top, r.bottom)}`, gutter: Math.round(p.left - r.right) };
	if (p.right <= r.left + 1) return { placement: `left${align(p.top, p.bottom, r.top, r.bottom)}`, gutter: Math.round(r.left - p.right) };
	return undefined;
}

/**
 * Opens each Qwik UI floating panel on the old page as a visitor would (a click on its trigger, pointing at a tooltip's)
 * and records where floating-ui placed it once Qwik's code ran: its side and alignment, and its gap from the anchor.
 */
export async function captureQwikFloating(browser: Browser, origin: string, route: string, dir: string): Promise<QwikFloatingCapture> {
	const file = join(dir, `${createHash('sha256').update(`qwik-floating:v1:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as QwikFloatingCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const panels: QwikFloating[] = [];
	try {
		const url = new URL(route, origin).href;
		await loadPage(page, url);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		const found = await page.evaluate(findPanels);
		for (const f of found.slice(0, 60)) {
			const opener = page.locator(f.opener).first();
			if (!(await opener.isVisible().catch(() => false))) continue;
			await opener.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
			if (f.hover) await opener.hover({ timeout: 2000 }).catch(() => {});
			else await opener.click({ timeout: 2000 }).catch(() => {});
			// Placed once floating-ui has written its position; the first use waits for Qwik to load the handler's code.
			await page.waitForFunction((id) => { const p = document.getElementById(id); return !!p && p.matches(':popover-open') && (p.style.top !== '' || p.style.left !== ''); }, f.id, { timeout: 4000 }).catch(() => {});
			await page.waitForTimeout(100);
			const at = await page.evaluate(measure, [f.id, f.anchor] as const);
			if (at) panels.push({ id: f.id, ...at });
			await page.keyboard.press('Escape').catch(() => {});
			await page.mouse.move(1, 1);
			await page.evaluate((id) => {
				const p = document.getElementById(id);
				if (p?.matches(':popover-open')) p.hidePopover();
			}, f.id);
			await page.waitForTimeout(100);
		}
	} finally {
		await context.close();
	}
	const result = { route, panels };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(result));
	return result;
}

/** Writes what the old page showed of each panel onto the page's own panel element, for the Qwik UI parts to place it alike. */
export function applyQwikFloating(root: Tree, panels: readonly QwikFloating[]): number {
	const byId = new Map(panels.map((p) => [p.id, p]));
	let n = 0;
	for (const el of walk(root)) {
		const found = byId.get(attr(el, 'id') ?? '');
		if (!found) continue;
		setAttr(el, 'data-mm-placement', found.placement);
		setAttr(el, 'data-mm-gutter', String(found.gutter));
		n++;
	}
	return n;
}

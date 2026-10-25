import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import type { Reveal } from './reveal.ts';

/**
 * What choosing an option inside revealed content did on the old page: where the page went, what it copied, or the value
 * it gave the hidden form input beside the control (Base UI Select's, which no attribute of the option carries).
 */
export interface Choice {
	readonly href?: string;
	readonly copied?: string;
	readonly value?: string;
}

/** Options a library writes without a link (cmdk items, menu items), whose destination the old app's code computes. */
const OPTION = '[cmdk-item], [role="option"]:not(a), [role="menuitem"]:not(a)';
const MAX_OPTIONS = 800;

async function openOn(page: Page, origin: string, route: string, path: readonly number[]): Promise<boolean> {
	await loadPage(page, new URL(route, origin).href);
	await page.waitForTimeout(400);
	await page.evaluate(() => {
		const w = window as unknown as { __mmCopied?: string[] };
		w.__mmCopied = [];
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (w.__mmCopied!.push(t), Promise.resolve()), write: () => Promise.resolve(), readText: () => Promise.resolve('') } });
	});
	const trigger = await page.evaluateHandle((p) => {
		let el: Element | undefined = document.body;
		for (const i of p) el = el?.children[i];
		return el ?? null;
	}, path);
	const el = trigger.asElement();
	if (!el) return false;
	await el.click({ timeout: 2000 }).catch(() => {});
	await page.waitForTimeout(400);
	await finishAnimations(page).catch(() => {});
	return true;
}

// Base UI's Select.Root renders its hidden input right after its trigger.
const hiddenInputValue = (page: Page, path: readonly number[]) =>
	page.evaluate((p) => {
		let el: Element | undefined = document.body;
		for (const i of p) el = el?.children[i];
		const next = el?.getAttribute('role') === 'combobox' ? el.nextElementSibling : null;
		return next instanceof HTMLInputElement && next.getAttribute('aria-hidden') === 'true' ? next.value : undefined;
	}, path);

/**
 * Chooses, once per control, every option its revealed content offers without a link, and records where each sent the
 * page or what it copied, keyed by the option's value (cmdk's data-value) or its text.
 */
export async function captureChoices(browser: Browser, origin: string, route: string, reveal: Reveal, dir: string, log: (line: string) => void = () => {}): Promise<Record<string, Choice>> {
	const listbox = reveal.added.some((a) => a.html.includes('data-base-ui-portal') && a.html.includes('role="listbox"'));
	const file = join(dir, `${reveal.key.replace(/[^\w-]/g, '_')}${listbox ? `-${createHash('sha256').update(route).digest('hex').slice(0, 8)}.values` : ''}.json`);
	const cached = await readFile(file, 'utf8').then((t) => JSON.parse(t) as Record<string, Choice>, () => undefined);
	if (cached) return cached;
	const viewport = VIEWPORTS.find((v) => v.name === reveal.viewport) ?? VIEWPORTS[0]!;
	const { context, page } = await openPage(browser, defaultEnv(origin), viewport);
	const out: Record<string, Choice> = {};
	try {
		// One control's options are recorded or not; a control the page no longer has where it was is skipped.
		if (!(await openOn(page, origin, route, reveal.path))) return out;
		const keys = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((o) => o.getAttribute('data-value') ?? (o.textContent ?? '').trim()), OPTION);
		for (const key of keys.slice(0, MAX_OPTIONS)) {
			if (key in out) continue;
			const before = page.url();
			const byValue = page.locator(`[cmdk-item][data-value="${key.replace(/["\\]/g, '\\$&')}"]`).first();
			const target = (await byValue.count()) ? byValue : page.locator(OPTION).filter({ hasText: key }).first();
			await target.click({ timeout: 2000 }).catch(() => {});
			await page.waitForTimeout(500);
			const copied = await page.evaluate(() => (window as unknown as { __mmCopied?: string[] }).__mmCopied?.at(-1));
			const after = page.url();
			const value = listbox && after === before ? await hiddenInputValue(page, reveal.path) : undefined;
			out[key] = after !== before ? { href: new URL(after).pathname + new URL(after).search + new URL(after).hash } : copied !== undefined ? { copied } : value !== undefined ? { value } : {};
			if (after !== before || copied !== undefined || !(await target.isVisible().catch(() => false))) await openOn(page, origin, route, reveal.path);
		}
		log(`choices of ${reveal.key} on ${route}: ${Object.keys(out).length} options`);
	} catch (error) {
		log(`choices of ${reveal.key} on ${route}: not recorded (${(error as Error).message.split('\n')[0]})`);
	} finally {
		await context.close().catch(() => {});
	}
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(out));
	return out;
}

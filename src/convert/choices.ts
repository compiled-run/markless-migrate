import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, textContent, type Element as Tree } from './dom.ts';
import type { Reveal } from './reveal.ts';
import { lit, type Binding } from './tsrx.ts';
import type { Limit } from './limit.ts';

/**
 * What choosing an option inside revealed content did on the old page: where the page went, what it copied, or, for a
 * Base UI Select, the value it gave the hidden form input beside the control and the text the trigger then showed (the
 * Root's items' label, which need not be the option's own text). No attribute of the option carries either.
 */
export interface Choice {
	readonly href?: string;
	readonly copied?: string;
	readonly value?: string;
	readonly shown?: string;
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

// Base UI's Select.Root renders its hidden input right after its trigger; Select.Value shows the chosen item's label.
const chosenOf = (page: Page, path: readonly number[]) =>
	page.evaluate((p) => {
		let el: Element | undefined = document.body;
		for (const i of p) el = el?.children[i];
		if (el?.getAttribute('role') !== 'combobox') return {};
		const next = el.nextElementSibling;
		const value = next instanceof HTMLInputElement && next.getAttribute('aria-hidden') === 'true' ? next.value : undefined;
		const shown = (el.querySelector('[data-slot="select-value"]') ?? el).textContent?.trim();
		return { ...(value !== undefined ? { value } : {}), ...(shown ? { shown } : {}) };
	}, path);

// Options past this many are chosen on further pages at once, each page starting from the control opened afresh.
const OPTIONS_PER_PAGE = 20;

/**
 * Chooses, once per control, every option its revealed content offers without a link, and records where each sent the
 * page or what it copied, keyed by the option's value (cmdk's data-value) or its text. Each page it opens runs under `limit`.
 */
export async function captureChoices(browser: Browser, origin: string, route: string, reveal: Reveal, dir: string, log: (line: string) => void = () => {}, limit: Limit = (task) => task()): Promise<Record<string, Choice>> {
	const listbox = reveal.added.some((a) => a.html.includes('data-base-ui-portal') && a.html.includes('role="listbox"'));
	const file = join(dir, `${reveal.key.replace(/[^\w-]/g, '_')}${listbox ? `-${createHash('sha256').update(route).digest('hex').slice(0, 8)}.chosen` : ''}.json`);
	const cached = await readFile(file, 'utf8').then((t) => JSON.parse(t) as Record<string, Choice>, () => undefined);
	if (cached) return cached;
	const viewport = VIEWPORTS.find((v) => v.name === reveal.viewport) ?? VIEWPORTS[0]!;
	let failure: string | undefined;
	const choose = async (page: Page, keys: readonly string[]): Promise<Record<string, Choice>> => {
		const out: Record<string, Choice> = {};
		try {
			for (const key of keys) {
				if (key in out) continue;
				const before = page.url();
				const byValue = page.locator(`[cmdk-item][data-value="${key.replace(/["\\]/g, '\\$&')}"]`).first();
				const target = (await byValue.count()) ? byValue : page.locator(OPTION).filter({ hasText: key }).first();
				await target.click({ timeout: 2000 }).catch(() => {});
				await page.waitForTimeout(500);
				const copied = await page.evaluate(() => (window as unknown as { __mmCopied?: string[] }).__mmCopied?.at(-1));
				const after = page.url();
				const chosen = listbox && after === before ? await chosenOf(page, reveal.path) : {};
				out[key] = after !== before ? { href: new URL(after).pathname + new URL(after).search + new URL(after).hash } : copied !== undefined ? { copied } : chosen;
				if (after !== before || copied !== undefined || !(await target.isVisible().catch(() => false))) await openOn(page, origin, route, reveal.path);
			}
		} catch (error) {
			failure ??= (error as Error).message.split('\n')[0];
		}
		return out;
	};
	const session = async <T>(use: (page: Page) => Promise<T>): Promise<T> => {
		const { context, page } = await openPage(browser, defaultEnv(origin), viewport);
		try {
			return await use(page);
		} finally {
			await context.close().catch(() => {});
		}
	};
	// One control's options are recorded or not; a control the page no longer has where it was is skipped. The first page
	// reads the options and chooses the first of them; the rest are chosen on further pages as soon as they are known.
	let known!: (keys: readonly string[] | undefined) => void;
	const keysRead = new Promise<readonly string[] | undefined>((done) => (known = done));
	const first = limit(() =>
		session(async (page) => {
			try {
				if (!(await openOn(page, origin, route, reveal.path))) return void known(undefined);
				const found = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((o) => o.getAttribute('data-value') ?? (o.textContent ?? '').trim()), OPTION);
				const keys = [...new Set(found.slice(0, MAX_OPTIONS))];
				known(keys);
				return choose(page, keys.slice(0, OPTIONS_PER_PAGE));
			} catch (error) {
				failure ??= (error as Error).message.split('\n')[0];
				known([]);
				return {};
			}
		}),
	);
	first.catch(() => known([]));
	const keys = await keysRead;
	const rest: string[][] = [];
	for (let i = OPTIONS_PER_PAGE; i < (keys?.length ?? 0); i += OPTIONS_PER_PAGE) rest.push(keys!.slice(i, i + OPTIONS_PER_PAGE));
	const [own, ...more] = await Promise.all([first, ...rest.map((chunk) => limit(() => session(async (page) => ((await openOn(page, origin, route, reveal.path).catch(() => false)) ? choose(page, chunk) : {}))))]);
	if (!keys) return {};
	const out: Record<string, Choice> = Object.assign({}, own, ...more);
	log(failure === undefined ? `choices of ${reveal.key} on ${route}: ${Object.keys(out).length} options` : `choices of ${reveal.key} on ${route}: not recorded (${failure})`);
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(out));
	return out;
}

/**
 * A menu item whose choosing copied text on the old page (a data table row's "Copy payment ID"): its click writes the same
 * text, as the old page's handler did, a refusal (no clipboard permission) left to surface as it did there.
 */
export function copyBinding(el: Tree, choices: Readonly<Record<string, Choice>> | undefined): Binding | undefined {
	if (!choices || !/^menuitem/.test(attr(el, 'role') ?? '')) return undefined;
	const copied = choices[textContent(el).trim()]?.copied;
	return copied === undefined ? undefined : { extra: [`onClick={() => { void navigator.clipboard.writeText(${lit(copied)}); }}`] };
}

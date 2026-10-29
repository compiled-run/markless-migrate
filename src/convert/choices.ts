import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page, Request } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, body, parseDocument, setAttr, textContent, walk, type Element as Tree } from './dom.ts';
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
// In the list or menu the control opened: a menubar's own triggers are menuitems too.
const OPTION = '[cmdk-item], [role="listbox"] [role="option"]:not(a), [role="menu"] [role="menuitem"]:not(a)';

const isOption = (el: Tree) => el.tagName !== 'a' && (attr(el, 'cmdk-item') !== undefined || /^(option|menuitem)$/.test(attr(el, 'role') ?? ''));
/** What choosing `el` is recorded under: cmdk's data-value, else the option's text, as captureChoices reads it in the page. */
export const optionKey = (el: Tree): string => attr(el, 'data-value') ?? textContent(el).trim();

/**
 * The options a reveal shows, by the keys their choices are recorded under. A control showing other options on another page
 * (a docs palette listing the components of the page's own library) is chosen again there; the same options, never.
 */
export function optionsShown(reveal: Reveal): string {
	const keys = reveal.added.flatMap((a) => [...walk(body(parseDocument(`<body>${a.html}</body>`)))].filter(isOption).map(optionKey));
	return createHash('sha256').update(JSON.stringify(keys)).digest('hex').slice(0, 8);
}

/** A cmdk item whose choosing went somewhere on the old page names that address, which the cmdk part goes to when it is chosen. */
export function markChosenHref(el: Tree, chosen: Readonly<Record<string, Choice>> | undefined): void {
	const href = chosen && attr(el, 'cmdk-item') !== undefined ? chosen[optionKey(el)]?.href : undefined;
	if (href !== undefined) setAttr(el, 'data-mm-href', href);
}

const MAX_OPTIONS = 800;

// What a page shows and holds, to tell a page put back after a choice from the one a fresh load gave: the document
// without the scripts, styles and resource hints a framework adds as it loads code, form values, storage, scroll and address.
const stateOf = (page: Page) =>
	page.evaluate(() => {
		const root = document.documentElement.cloneNode(true) as HTMLElement;
		// React Aria's live region and an emptied Base UI portal stay behind a closed layer, and show nothing.
		for (const el of root.querySelectorAll('script, style, link, noscript, [data-live-announcer], [data-base-ui-portal]:empty')) el.remove();
		// A scroll lock lifted leaves an empty style attribute behind, which shows nothing.
		for (const el of [root, ...root.querySelectorAll('[style=""]')]) if (el.getAttribute('style') === '') el.removeAttribute('style');
		const values = [...document.querySelectorAll('input, textarea, select')].map((el) => (el instanceof HTMLInputElement ? `${el.value}|${el.checked}` : (el as HTMLTextAreaElement | HTMLSelectElement).value));
		const stored = (s: Storage) => Object.keys(s).sort().map((k) => `${k}=${s.getItem(k)}`);
		const text = JSON.stringify([root.outerHTML, document.title, values, stored(localStorage), stored(sessionStorage), document.cookie, scrollX, scrollY, location.href]);
		let hash = 0x811c9dc5;
		for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
		return hash >>> 0;
	});

// The state each page's last fresh load had before its control was opened, and the document that load made.
const loaded = new WeakMap<Page, { state: number; doc: string }>();

async function openOn(page: Page, origin: string, route: string, path: readonly number[]): Promise<boolean> {
	await loadPage(page, new URL(route, origin).href);
	await page.waitForTimeout(400);
	const doc = await page.evaluate(() => {
		const w = window as unknown as { __mmCopied?: string[]; __mmWent?: string[]; __mmDoc?: string };
		w.__mmCopied = [];
		w.__mmWent = [];
		w.__mmDoc = Math.random().toString(36).slice(2);
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (w.__mmCopied!.push(t), Promise.resolve()), write: () => Promise.resolve(), readText: () => Promise.resolve('') } });
		// A router sent to the address the page is already at replaces the history entry: the address alone shows no move.
		for (const name of ['pushState', 'replaceState'] as const) {
			const own = history[name];
			history[name] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
				if (url != null) w.__mmWent!.push(new URL(url, location.href).href);
				return own.call(this, data, unused, url);
			};
		}
		return w.__mmDoc;
	});
	loaded.set(page, { state: await stateOf(page), doc });
	return openTrigger(page, path);
}

async function openTrigger(page: Page, path: readonly number[]): Promise<boolean> {
	const trigger = await page.evaluateHandle((p) => {
		let el: Element | undefined = document.body;
		for (const i of p) el = el?.children[i];
		return el ?? null;
	}, path);
	const el = trigger.asElement();
	if (!el) return false;
	await el.click({ timeout: 2000 }).catch(() => {});
	// A loaded page slow to answer its trigger shows its options later than 400 ms: they are waited for, a while.
	await Promise.all([page.waitForTimeout(400), page.locator(OPTION).first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => {})]);
	await finishAnimations(page).catch(() => {});
	return true;
}

/**
 * Opens the control again for the next option: on the same document when the choice left it as the fresh load had it (a
 * client router's move taken back first), else on a fresh load. Choosing on a page put back records what a fresh one would.
 */
async function reopenOn(page: Page, origin: string, route: string, path: readonly number[], before: string): Promise<boolean> {
	const fresh = loaded.get(page);
	const same = fresh && (await page.evaluate((doc) => (window as unknown as { __mmDoc?: string }).__mmDoc === doc, fresh.doc).catch(() => false));
	if (fresh && same) {
		if (page.url() !== before) {
			await page.evaluate(() => history.back()).catch(() => {});
			await page.waitForURL(before, { timeout: 3000 }).catch(() => {});
		}
		// A closed layer hands focus back to its trigger; a fresh load has nothing focused.
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {});
		const deadline = Date.now() + 2000;
		for (;;) {
			await finishAnimations(page).catch(() => {});
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))).catch(() => {});
			if (page.url() === before && (await stateOf(page).catch(() => undefined)) === fresh.state) return openTrigger(page, path);
			if (Date.now() >= deadline) break;
			await page.waitForTimeout(100);
		}
	}
	return openOn(page, origin, route, path);
}

/** The requests a page has open, and when the last one ended. */
function requestsOf(page: Page): { readonly open: Set<Request>; ended: number } {
	const seen = { open: new Set<Request>(), ended: 0 };
	page.on('request', (r) => seen.open.add(r));
	const end = (r: Request) => {
		if (seen.open.delete(r)) seen.ended = Date.now();
	};
	page.on('requestfinished', end);
	page.on('requestfailed', end);
	return seen;
}

// What choosing an option started is read after 500 ms, or, while it is still fetching what it goes to (a client router
// loads the next page before it changes the address), once that has answered: at most 5 s.
async function afterChoosing(page: Page, before: string, requests: ReturnType<typeof requestsOf>, earlier: ReadonlySet<Request>): Promise<void> {
	await page.waitForTimeout(500);
	const deadline = Date.now() + 4500;
	const busy = () => [...requests.open].some((r) => !earlier.has(r)) || Date.now() - requests.ended < 150;
	while (page.url() === before && busy() && Date.now() < deadline) await page.waitForTimeout(50);
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
	const file = join(dir, `${reveal.key.replace(/[^\w-]/g, '_')}${listbox ? `-${createHash('sha256').update(route).digest('hex').slice(0, 8)}.chosen` : `-${optionsShown(reveal)}.shown`}.json`);
	const cached = await readFile(file, 'utf8').then((t) => JSON.parse(t) as Record<string, Choice>, () => undefined);
	if (cached) return cached;
	const viewport = VIEWPORTS.find((v) => v.name === reveal.viewport) ?? VIEWPORTS[0]!;
	let failure: string | undefined;
	const choose = async (page: Page, keys: readonly string[]): Promise<Record<string, Choice>> => {
		const out: Record<string, Choice> = {};
		const requests = requestsOf(page);
		try {
			for (const key of keys) {
				if (key in out) continue;
				const before = page.url();
				const byValue = page.locator(`[cmdk-item][data-value="${key.replace(/["\\]/g, '\\$&')}"]`).first();
				const target = (await byValue.count()) ? byValue : page.locator(OPTION).filter({ hasText: key }).first();
				const earlier = new Set(requests.open);
				requests.ended = 0;
				await page.evaluate(() => {
					const w = window as unknown as { __mmCopied?: string[]; __mmWent?: string[] };
					w.__mmCopied = [];
					w.__mmWent = [];
				});
				// A click that cannot land (the list still opening under something) chose nothing: tried once more on a fresh load.
				if (!(await target.click({ timeout: 2000 }).then(() => true, () => false)) && !((await openOn(page, origin, route, reveal.path)) && (await target.click({ timeout: 5000 }).then(() => true, () => false)))) {
					failure ??= `could not choose ${key}`;
					await openOn(page, origin, route, reveal.path);
					continue;
				}
				await afterChoosing(page, before, requests, earlier);
				const copied = await page.evaluate(() => (window as unknown as { __mmCopied?: string[] }).__mmCopied?.at(-1));
				const went = await page.evaluate(() => (window as unknown as { __mmWent?: string[] }).__mmWent?.at(-1));
				const after = page.url();
				const chosen = listbox && after === before ? await chosenOf(page, reveal.path) : {};
				const moved = after !== before || went === before;
				out[key] = moved ? { href: new URL(after).pathname + new URL(after).search + new URL(after).hash } : copied !== undefined ? { copied } : chosen;
				if (moved || copied !== undefined || !(await target.isVisible().catch(() => false))) await reopenOn(page, origin, route, reveal.path, before);
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

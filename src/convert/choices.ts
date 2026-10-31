import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page, Request } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { quiet, settle, trackSettling } from './settle.ts';
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
	return createHash('sha256').update(JSON.stringify(optionKeys(reveal))).digest('hex').slice(0, 8);
}

const optionKeys = (reveal: Reveal): string[] => reveal.added.flatMap((a) => [...walk(body(parseDocument(`<body>${a.html}</body>`)))].filter(isOption).map(optionKey));

/**
 * Whether a control's choices are the same on every page that shows its options (not a Base UI listbox, whose values are
 * its page's) and are many: a site-wide palette. A capture shard leaves those to the convert that has every shard's
 * reveals, which records each once.
 */
export function sharedChoices(reveal: Reveal): boolean {
	return !isListbox(reveal) && optionKeys(reveal).length > OPTIONS_PER_PAGE;
}

const isListbox = (reveal: Reveal) => reveal.added.some((a) => a.html.includes('data-base-ui-portal') && a.html.includes('role="listbox"'));

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
		const text = JSON.stringify([root.outerHTML, document.title, values, stored(localStorage), stored(sessionStorage), document.cookie, scrollX, scrollY, location.href, (window as unknown as { __mmDrawn?: number }).__mmDrawn ?? 0]);
		let hash = 0x811c9dc5;
		for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
		return hash >>> 0;
	});

// The state each page's last fresh load had before its control was opened, and the document that load made.
const loaded = new WeakMap<Page, { state: number; doc: string; selected?: string }>();

async function openOn(page: Page, origin: string, route: string, path: readonly number[]): Promise<boolean> {
	await loadPage(page, new URL(route, origin).href);
	await settle(page, 400);
	const doc = await page.evaluate((token) => {
		const w = window as unknown as { __mmCopied?: string[]; __mmWent?: string[]; __mmDoc?: string };
		w.__mmCopied = [];
		w.__mmWent = [];
		w.__mmDoc = token;
		// The seeded randomness a choice drew from moves on: the next choice on this page would draw what a fresh load does not.
		const drawn = w as unknown as { __mmDrawn: number };
		drawn.__mmDrawn = 0;
		const counted = <A extends unknown[], R>(own: (...a: A) => R) => function (this: unknown, ...a: A): R {
			drawn.__mmDrawn++;
			return own.apply(this, a);
		};
		Math.random = counted(Math.random);
		const proto = Object.getPrototypeOf(crypto) as Crypto;
		for (const name of ['getRandomValues', 'randomUUID'] as const) if (typeof proto[name] === 'function') Object.defineProperty(proto, name, { value: counted(proto[name] as (...a: unknown[]) => unknown), writable: true, configurable: true });
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
	}, randomUUID());
	const entry: { state: number; doc: string; selected?: string } = { state: await stateOf(page), doc };
	loaded.set(page, entry);
	const opened = await openTrigger(page, path);
	// The option a select shows chosen on a fresh load, which choosing again puts the page back.
	const selected = await page.evaluate((option) => document.querySelector(`:is(${option})[aria-selected="true"]`)?.textContent?.trim(), OPTION).catch(() => undefined);
	if (selected) entry.selected = selected;
	return opened;
}

async function openTrigger(page: Page, path: readonly number[]): Promise<boolean> {
	const trigger = await page.evaluateHandle(({ p, option }) => {
		// The page's own options (a docs page demoing a command menu) are not the control's: only those it opens are chosen.
		(window as unknown as { __mmBefore?: WeakSet<Element> }).__mmBefore = new WeakSet(document.querySelectorAll(option));
		let el: Element | undefined = document.body;
		for (const i of p) el = el?.children[i];
		return el ?? null;
	}, { p: path, option: OPTION });
	const el = trigger.asElement();
	if (!el) return false;
	await el.click({ timeout: 2000 }).catch(() => {});
	// A loaded page slow to answer its trigger shows its options later than 400 ms: they are waited for, a while.
	const clicked = Date.now();
	await page.locator(OPTION).first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
	await settle(page, 400 - (Date.now() - clicked));
	await finishAnimations(page).catch(() => {});
	return true;
}

/**
 * Opens the control again for the next option: on the same document when the choice left it as the fresh load had it (a
 * client router's move taken back first), else on a fresh load. Choosing on a page put back records what a fresh one would.
 */
const backFails = new WeakSet<Page>();

async function reopenOn(page: Page, origin: string, route: string, path: readonly number[], before: string, listbox: boolean, requests: ReturnType<typeof requestsOf>): Promise<boolean> {
	const fresh = loaded.get(page);
	const putBack = async () => {
		// A closed layer hands focus back to its trigger; a fresh load has nothing focused.
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {});
		await settle(page, 500);
		await finishAnimations(page).catch(() => {});
		return page.url() === before && (await stateOf(page).catch(() => undefined)) === fresh!.state;
	};
	const same = fresh && (await page.evaluate((doc) => (window as unknown as { __mmDoc?: string }).__mmDoc === doc, fresh.doc).catch(() => false));
	const moved = page.url() !== before;
	// A router whose page differs after Back (Next.js re-renders it) is not taken back again on this page.
	if (fresh && same && !(moved && backFails.has(page))) {
		if (moved) {
			const earlier = new Set(requests.open);
			requests.ended = 0;
			await page.evaluate(() => history.back()).catch(() => {});
			await page.waitForURL(before, { timeout: 3000 }).catch(() => {});
			// A router fetches the page it takes back to and commits it later: the page is compared once that is done.
			await afterChoosing(page, requests, earlier);
		}
		if (await putBack()) return openTrigger(page, path);
		if (moved) backFails.add(page);
		// A select keeps the value chosen: choosing the one it loaded with puts it back.
		if (listbox && fresh.selected !== undefined && (await openTrigger(page, path))) {
			await page.locator(OPTION).filter({ hasText: fresh.selected }).first().click({ timeout: 2000 }).catch(() => {});
			await settle(page, 500);
			if (await putBack()) return openTrigger(page, path);
		}
	}
	return openOn(page, origin, route, path);
}

/** The requests a page has open, and when the last one ended. */
function requestsOf(page: Page): { readonly open: Set<Request>; ended: number } {
	const seen = { open: new Set<Request>(), ended: 0 };
	// A document the page loads ends what the one it left had open, up to when it shows: those get no finished or failed event.
	let loading = false;
	page.on('request', (r) => {
		if (r.isNavigationRequest() && r.frame() === page.mainFrame()) loading = true;
		seen.open.add(r);
	});
	page.on('framenavigated', (frame) => {
		if (frame !== page.mainFrame() || !loading) return;
		loading = false;
		for (const r of seen.open) if (!r.isNavigationRequest()) seen.open.delete(r);
	});
	const end = (r: Request) => {
		if (seen.open.delete(r) && MOVING.has(r.resourceType())) seen.ended = Date.now();
	};
	page.on('requestfinished', end);
	page.on('requestfailed', end);
	return seen;
}

// What choosing an option started is read once the page has finished moving: its requests answered, its address unchanged
// and nothing due for 150 ms (a server redirect moves it a second time, a router commits after its data). At most 10 s;
// what was still moving then, if anything.
const MOVED_MS = 150;
async function afterChoosing(page: Page, requests: ReturnType<typeof requestsOf>, earlier: ReadonlySet<Request>): Promise<string | undefined> {
	await settle(page, 500);
	const deadline = Date.now() + 10_000;
	let url = page.url();
	let since = Date.now();
	for (;;) {
		if (page.url() !== url) [url, since] = [page.url(), Date.now()];
		const open = [...requests.open].filter((r) => !earlier.has(r) && MOVING.has(r.resourceType()));
		const fetching = open.length > 0 || Date.now() - requests.ended < MOVED_MS;
		const still = !fetching && Date.now() - since >= MOVED_MS;
		if (still && (await quiet(page))) return undefined;
		if (Date.now() >= deadline) return still ? undefined : open.length ? `fetching ${open.map((r) => new URL(r.url()).pathname).join(', ')}` : `at ${new URL(url).pathname}`;
		await page.waitForTimeout(50);
	}
}

// The requests that move a page: a router's data, a document. Images, fonts and scripts the next page loads do not.
const MOVING = new Set(['fetch', 'xhr', 'document']);

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

// The option the control opened that is recorded under `key`, as the options were read.
const optionOf = (page: Page, key: string) =>
	page.evaluateHandle(
		({ selector, key }) => {
			const before = (window as unknown as { __mmBefore?: WeakSet<Element> }).__mmBefore;
			return [...document.querySelectorAll(selector)].find((o) => !before?.has(o) && (o.getAttribute('data-value') ?? (o.textContent ?? '').trim()) === key) ?? null;
		},
		{ selector: OPTION, key },
	);

/** Where the old server's redirects take `href` (a path on `origin`), the fragment kept as a browser keeps it. */
async function landing(origin: string, href: string): Promise<string> {
	let url = new URL(href, origin);
	for (let hops = 0; hops < 5; hops++) {
		const response = await fetch(url, { method: 'HEAD', redirect: 'manual' }).catch(() => undefined);
		const to = response && response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
		if (!to) break;
		const next = new URL(to, url);
		if (next.origin !== url.origin) break;
		if (!next.hash) next.hash = url.hash;
		url = next;
	}
	return url.pathname + url.search + url.hash;
}

// Options past this many are chosen on further pages at once, each page starting from the control opened afresh.
const OPTIONS_PER_PAGE = 20;

/**
 * Chooses, once per control, every option its revealed content offers without a link, and records where each sent the
 * page or what it copied, keyed by the option's value (cmdk's data-value) or its text. Each page it opens runs under `limit`.
 */
export async function captureChoices(browser: Browser, origin: string, route: string, reveal: Reveal, dir: string, log: (line: string) => void = () => {}, limit: Limit = (task) => task()): Promise<Record<string, Choice>> {
	const listbox = isListbox(reveal);
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
				const earlier = new Set(requests.open);
				requests.ended = 0;
				await page.evaluate(() => {
					const w = window as unknown as { __mmCopied?: string[]; __mmWent?: string[] };
					w.__mmCopied = [];
					w.__mmWent = [];
				});
				// A click that cannot land (the list still opening under something) chose nothing: tried once more on a fresh load.
				const click = async (timeout: number) => {
					const target = (await optionOf(page, key)).asElement();
					if (!target) return false;
					if (await target.click({ timeout }).then(() => true, () => false)) return true;
					// An option the page cannot be scrolled to (a Radix Select lines its chosen item up with the trigger) is chosen from the keyboard.
					const focused = await target.evaluate((el) => ((el as HTMLElement).focus(), document.activeElement === el)).catch(() => false);
					return focused && (await page.keyboard.press('Enter').then(() => true, () => false));
				};
				if (!(await click(2000)) && !((await openOn(page, origin, route, reveal.path)) && (await click(5000)))) {
					failure ??= `could not choose ${key}`;
					return out;
				}
				// A page still moving after 10 s is chosen once more on a fresh load.
				let moving = await afterChoosing(page, requests, earlier);
				if (moving !== undefined && (await openOn(page, origin, route, reveal.path))) {
					const again = new Set(requests.open);
					requests.ended = 0;
					if (await click(5000)) moving = await afterChoosing(page, requests, again);
				}
				if (moving !== undefined) {
					failure ??= `${key} was still moving the page after 10 s (${moving})`;
					return out;
				}
				const copied = await page.evaluate(() => (window as unknown as { __mmCopied?: string[] }).__mmCopied?.at(-1));
				const went = await page.evaluate(() => (window as unknown as { __mmWent?: string[] }).__mmWent?.at(-1));
				const after = page.url();
				const chosen = listbox && after === before ? await chosenOf(page, reveal.path) : {};
				const moved = after !== before || went === before;
				out[key] = moved ? { href: new URL(after).pathname + new URL(after).search + new URL(after).hash } : copied !== undefined ? { copied } : chosen;
				if (moved || copied !== undefined || !(await (await optionOf(page, key)).asElement()?.isVisible().catch(() => false))) await reopenOn(page, origin, route, reveal.path, before, listbox, requests);
			}
		} catch (error) {
			failure ??= (error as Error).message.split('\n')[0];
		}
		return out;
	};
	const session = async <T>(use: (page: Page) => Promise<T>): Promise<T> => {
		const { context, page } = await openPage(browser, defaultEnv(origin), viewport);
		await trackSettling(context);
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
				const found = await page.evaluate((selector) => {
					const before = (window as unknown as { __mmBefore?: WeakSet<Element> }).__mmBefore;
					// A disabled option does nothing when chosen.
					const usable = (o: Element) => !before?.has(o) && o.getAttribute('aria-disabled') !== 'true' && !['', 'true'].includes(o.getAttribute('data-disabled') ?? 'false');
					return [...document.querySelectorAll(selector)].filter(usable).map((o) => o.getAttribute('data-value') ?? (o.textContent ?? '').trim());
				}, OPTION);
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
	// A partial record would depend on which options happened to fail on this machine: refused, never written.
	if (failure !== undefined) {
		log(`choices of ${reveal.key} on ${route}: not recorded (${failure})`);
		throw new Error(`choices of ${reveal.key} on ${route}: ${failure}`);
	}
	// A router that prefetched a redirected route goes straight to where it lands, one that did not goes to the route: the
	// server's redirects are followed, so the record is the same from every page.
	const landed = new Map<string, Promise<string>>();
	for (const [key, choice] of Object.entries(out)) {
		if (choice.href === undefined) continue;
		if (!landed.has(choice.href)) landed.set(choice.href, landing(origin, choice.href));
		out[key] = { ...choice, href: await landed.get(choice.href)! };
	}
	log(`choices of ${reveal.key} on ${route}: ${Object.keys(out).length} options`);
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

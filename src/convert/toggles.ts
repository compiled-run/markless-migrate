import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';

/** A control as the old page showed it in one state: its attributes and its children's markup. */
export interface ToggleState {
	readonly attrs: Readonly<Record<string, string>>;
	readonly inner: string;
}

/**
 * A control the old page switches between two states in place (a checkbox, a switch, a pressed toggle) or a group of
 * which one is chosen (radios): each control's markup in each state, captured by using it, so Markless state renders
 * the states and nothing is written to the DOM by hand.
 */
export interface ToggleGroup {
	/** `toggle`: each control on and off by itself; `radio`: one chosen at a time. */
	readonly kind: 'toggle' | 'radio';
	/** Choosing the chosen radio again clears the group (a single-choice toggle group). */
	readonly clears?: boolean;
	readonly controls: readonly {
		/** The control's tag, data-slot and text, and which element with them it is in document order. */
		readonly sig: string;
		readonly nth: number;
		readonly role: string;
		/** Its state when the page loaded: on, or the chosen radio. */
		readonly initial: boolean;
		readonly on: ToggleState;
		readonly off: ToggleState;
	}[];
}

export interface ToggleCapture {
	readonly route: string;
	readonly groups: readonly ToggleGroup[];
	readonly skipped: readonly string[];
}

// Controls that switch state in place, outside menus and listboxes (those are portaled layers, captured as reveals).
const SELECTOR = '[role="checkbox"], [role="switch"], [role="radio"], button[aria-pressed]';

const key = (route: string) => createHash('sha256').update(`toggles:${route}`).digest('hex').slice(0, 16);

interface Found {
	readonly id: number;
	readonly sig: string;
	readonly nth: number;
	readonly role: string;
	/** The radio group's id, for radios. */
	readonly group?: number;
	readonly visible: boolean;
}

async function find(page: Page): Promise<Found[]> {
	return page.evaluate((selector) => {
		const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
		const counts = new Map<string, number>();
		const order = new Map<Element, number>();
		for (const el of document.body.querySelectorAll('*')) {
			if (el.closest('template')) continue;
			const sig = sigOf(el);
			const n = counts.get(sig) ?? 0;
			counts.set(sig, n + 1);
			order.set(el, n);
		}
		const w = window as unknown as { __mmToggles: Element[] };
		w.__mmToggles = [];
		const groups = new Map<Element, number>();
		const out = [];
		for (const el of document.body.querySelectorAll(selector)) {
			if (el.closest('template, [role="menu"], [role="listbox"], [cmdk-root], [data-mm-layer]')) continue;
			if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled')) continue;
			const rect = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
			const role = el.getAttribute('role') ?? 'pressed';
			let group: number | undefined;
			if (role === 'radio') {
				const holder = el.closest('[role="radiogroup"]') ?? el.closest('[role="group"]') ?? el.parentElement!;
				if (!groups.has(holder)) groups.set(holder, groups.size);
				group = groups.get(holder);
			}
			out.push({ id: w.__mmToggles.length, sig: sigOf(el), nth: order.get(el) ?? 0, role, ...(group !== undefined ? { group } : {}), visible });
			w.__mmToggles.push(el);
		}
		return out;
	}, SELECTOR);
}

async function stateOf(page: Page, id: number): Promise<ToggleState & { on: boolean }> {
	return page.evaluate((id) => {
		const el = (window as unknown as { __mmToggles: Element[] }).__mmToggles[id]!;
		// A style attribute as the CSSOM writes it: React's server markup and its later writes spell it differently.
		const value = (n: Element, a: Attr) => (a.name === 'style' && n instanceof HTMLElement ? n.style.cssText : a.value);
		const attrs = Object.fromEntries([...el.attributes].map((a) => [a.name, value(el, a)]));
		const on = el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true';
		// Children with their attributes in name order: a library that re-sets an attribute moves it to the end.
		const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const canon = (n: Node): string => {
			if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
			if (!(n instanceof Element)) return '';
			const tag = n.tagName.toLowerCase();
			const list = [...n.attributes].sort((a, b) => (a.name < b.name ? -1 : 1)).map((a) => ` ${a.name}="${value(n, a).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
			return /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
		};
		return { attrs, inner: [...el.childNodes].map(canon).join(''), on };
	}, id);
}

async function use(page: Page, id: number): Promise<string | undefined> {
	const handle = await page.evaluateHandle((id) => (window as unknown as { __mmToggles: Element[] }).__mmToggles[id]!, id);
	const el = handle.asElement();
	if (!el) return 'not found';
	try {
		await el.click({ timeout: 2000 });
	} catch (error) {
		return `could not click: ${(error as Error).message.split('\n')[0]}`;
	}
	await page.waitForTimeout(150);
	await finishAnimations(page).catch(() => {});
	return undefined;
}

// The tab stop follows focus, which using a control moves: it is not the control's state.
const settled = (attrs: Readonly<Record<string, string>>) => JSON.stringify(Object.entries(attrs).filter(([k]) => k !== 'tabindex').sort());
const same = (a: ToggleState, b: ToggleState) => a.inner === b.inner && settled(a.attrs) === settled(b.attrs);

/** Uses every in-place control of a route on the desktop viewport and records each state it shows. Cached by route. */
export async function captureToggles(browser: Browser, origin: string, route: string, dir: string): Promise<ToggleCapture> {
	const file = join(dir, `${key(route)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as ToggleCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const groups: ToggleGroup[] = [];
	const skipped: string[] = [];
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForTimeout(300);
		const found = await find(page);
		for (const c of found.filter((f) => f.role !== 'radio')) {
			if (!c.visible) {
				skipped.push(`${c.sig}#${c.nth}: not visible`);
				continue;
			}
			const first = await stateOf(page, c.id);
			const failed = await use(page, c.id);
			if (failed) {
				skipped.push(`${c.sig}#${c.nth}: ${failed}`);
				continue;
			}
			const second = await stateOf(page, c.id);
			await use(page, c.id);
			const back = await stateOf(page, c.id);
			if (same(first, second) || !same(first, back)) {
				skipped.push(`${c.sig}#${c.nth}: ${same(first, second) ? 'using it changed nothing in place' : 'using it twice did not restore it'}`);
				continue;
			}
			const [on, off] = first.on ? [first, second] : [second, first];
			groups.push({ kind: 'toggle', controls: [{ sig: c.sig, nth: c.nth, role: c.role, initial: first.on, on: { attrs: on.attrs, inner: on.inner }, off: { attrs: off.attrs, inner: off.inner } }] });
		}
		const radios = new Map<number, Found[]>();
		for (const r of found.filter((f) => f.role === 'radio')) (radios.get(r.group!) ?? radios.set(r.group!, []).get(r.group!)!).push(r);
		for (const members of radios.values()) {
			if (members.some((m) => !m.visible)) {
				skipped.push(`${members[0]!.sig}#${members[0]!.nth}: a radio of its group is not visible`);
				continue;
			}
			const initial = await Promise.all(members.map((m) => stateOf(page, m.id)));
			const on = new Map<number, ToggleState>();
			const off = new Map<number, ToggleState>();
			initial.forEach((s, i) => (s.on ? on : off).set(i, s));
			let failed: string | undefined;
			for (let i = 0; i < members.length && !failed; i++) {
				failed = await use(page, members[i]!.id);
				const after = await Promise.all(members.map((m) => stateOf(page, m.id)));
				after.forEach((s, k) => {
					if (s.on && !on.has(k)) on.set(k, s);
					if (!s.on && !off.has(k)) off.set(k, s);
				});
			}
			// Choosing the chosen one again: a radio group keeps it, a single-choice toggle group clears.
			const last = members.length - 1;
			await use(page, members[last]!.id);
			const clears = !(await stateOf(page, members[last]!.id)).on;
			const chosen = initial.findIndex((s) => s.on);
			if (chosen >= 0) await use(page, members[chosen]!.id);
			if (failed || members.some((_, k) => !on.has(k) || !off.has(k))) {
				skipped.push(`${members[0]!.sig}#${members[0]!.nth}: ${failed ?? 'a radio never showed both states'}`);
				continue;
			}
			groups.push({ kind: 'radio', ...(clears ? { clears } : {}), controls: members.map((m, k) => ({ sig: m.sig, nth: m.nth, role: m.role, initial: initial[k]!.on, on: on.get(k)!, off: off.get(k)! })) });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: ToggleCapture = { route, groups, skipped };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/** Captures every route's in-place controls, `concurrency` at a time. */
export async function captureAllToggles(browser: Browser, origin: string, routes: readonly string[], dir: string, options: { concurrency?: number; log?: (line: string) => void } = {}): Promise<ToggleCapture[]> {
	const out: ToggleCapture[] = new Array(routes.length);
	let next = 0;
	let done = 0;
	const worker = async () => {
		while (next < routes.length) {
			const index = next++;
			out[index] = await captureToggles(browser, origin, routes[index]!, dir).catch((error: Error) => ({ route: routes[index]!, groups: [], skipped: [`the route: ${error.message.split('\n')[0]}`] }));
			done++;
			if (out[index]!.groups.length) options.log?.(`toggles ${done}/${routes.length} ${routes[index]} (${out[index]!.groups.length} groups)`);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
	return out;
}

/** A site-listed control that only switches attributes in place (a sidebar's trigger), and what one use changed. */
export interface Switch {
	readonly sig: string;
	readonly nth: number;
	/** Each attribute one use changed, on the element with that signature and occurrence: before, and after. */
	readonly changes: readonly { readonly sig: string; readonly nth: number; readonly attr: string; readonly before?: string; readonly after?: string }[];
	/** The cookies the first use wrote, and those the second use (back to the first state) wrote. */
	readonly cookiesOn: readonly CookieWrite[];
	readonly cookiesOff: readonly CookieWrite[];
}

export interface CookieWrite {
	readonly name: string;
	readonly value: string;
	readonly path: string;
	/** Seconds the cookie lives, from its expiry when it was written. */
	readonly maxAge?: number;
	readonly sameSite?: string;
}

export interface SwitchCapture {
	readonly route: string;
	readonly switches: readonly Switch[];
	readonly skipped: readonly string[];
}

async function written(page: Page, before: Map<string, string>): Promise<CookieWrite[]> {
	const now = Date.now() / 1000;
	return (await page.context().cookies())
		.filter((c) => before.get(c.name) !== c.value)
		.map((c) => ({ name: c.name, value: c.value, path: c.path, ...(c.expires > 0 ? { maxAge: Math.round(c.expires - now) } : {}), ...(c.sameSite && c.sameSite !== 'None' ? { sameSite: c.sameSite } : {}) }));
}

/** Uses each control the site lists as switching attributes in place and records every attribute and cookie one use changes. */
export async function captureSwitches(browser: Browser, origin: string, route: string, dir: string, selectors: readonly string[]): Promise<SwitchCapture> {
	const file = join(dir, `${createHash('sha256').update(`switches:${route}|${JSON.stringify(selectors)}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as SwitchCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const switches: Switch[] = [];
	const skipped: string[] = [];
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForTimeout(300);
		const count = await page.evaluate((selector) => {
			const w = window as unknown as { __mmSwitches: Element[] };
			w.__mmSwitches = [...document.body.querySelectorAll(selector)].filter((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0;
			});
			return w.__mmSwitches.length;
		}, selectors.join(', '));
		for (let id = 0; id < count; id++) {
			const record = async () =>
				page.evaluate(() => {
					const w = window as unknown as { __mmObserved?: MutationRecord[]; __mmObserver?: MutationObserver };
					w.__mmObserved = [];
					w.__mmObserver?.disconnect();
					w.__mmObserver = new MutationObserver((list) => w.__mmObserved!.push(...list));
					w.__mmObserver.observe(document.body, { attributes: true, attributeOldValue: true, subtree: true });
				});
			const collect = async () =>
				page.evaluate(() => {
					const w = window as unknown as { __mmObserved?: MutationRecord[]; __mmObserver?: MutationObserver };
					w.__mmObserver?.disconnect();
					const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
					const counts = new Map<string, number>();
					const order = new Map<Element, number>();
					for (const el of document.body.querySelectorAll('*')) {
						const sig = sigOf(el);
						const n = counts.get(sig) ?? 0;
						counts.set(sig, n + 1);
						order.set(el, n);
					}
					const seen = new Map<string, { sig: string; nth: number; attr: string; before?: string; after?: string }>();
					for (const r of w.__mmObserved ?? []) {
						const el = r.target as Element;
						const attr = r.attributeName!;
						if (!el.isConnected || attr === 'tabindex') continue;
						const key = `${order.get(el)}|${sigOf(el)}|${attr}`;
						const after = el.getAttribute(attr) ?? undefined;
						const was = seen.get(key);
						seen.set(key, { sig: sigOf(el), nth: order.get(el) ?? 0, attr, before: was ? was.before : (r.oldValue ?? undefined), after });
					}
					return [...seen.values()].filter((c) => c.before !== c.after);
				});
			const cookies = new Map((await context.cookies()).map((c) => [c.name, c.value]));
			const control = await page.evaluate((id) => {
				const el = (window as unknown as { __mmSwitches: Element[] }).__mmSwitches[id]!;
				const sigOf = (e: Element) => `${e.tagName.toLowerCase()}|${e.getAttribute('data-slot') ?? ''}|${(e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				const sig = sigOf(el);
				let nth = 0;
				for (const e of document.body.querySelectorAll('*')) {
					if (e === el) break;
					if (sigOf(e) === sig) nth++;
				}
				return { sig, nth };
			}, id);
			const handle = (await page.evaluateHandle((id) => (window as unknown as { __mmSwitches: Element[] }).__mmSwitches[id]!, id)).asElement();
			if (!handle) continue;
			await record();
			const failed = await handle.click({ timeout: 2000 }).then(() => undefined, (e: Error) => e.message.split('\n')[0]);
			if (failed) {
				skipped.push(`${control.sig}#${control.nth}: ${failed}`);
				continue;
			}
			await page.waitForTimeout(400);
			await finishAnimations(page).catch(() => {});
			const changes = await collect();
			const cookiesOn = await written(page, cookies);
			const between = new Map((await context.cookies()).map((c) => [c.name, c.value]));
			await record();
			await handle.click({ timeout: 2000 }).catch(() => {});
			await page.waitForTimeout(400);
			await finishAnimations(page).catch(() => {});
			const back = await collect();
			const cookiesOff = await written(page, between);
			const restored = changes.every((c) => back.some((b) => b.sig === c.sig && b.nth === c.nth && b.attr === c.attr && b.after === c.before));
			if (!changes.length || !restored) {
				skipped.push(`${control.sig}#${control.nth}: ${changes.length ? 'using it twice did not restore it' : 'using it changed no attribute'}`);
				continue;
			}
			switches.push({ ...control, changes, cookiesOn, cookiesOff });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: SwitchCapture = { route, switches, skipped };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/** Captures every route's site-listed switches, `concurrency` at a time. */
export async function captureAllSwitches(browser: Browser, origin: string, routes: readonly string[], dir: string, selectors: readonly string[], options: { concurrency?: number; log?: (line: string) => void } = {}): Promise<SwitchCapture[]> {
	if (!selectors.length) return [];
	const out: SwitchCapture[] = new Array(routes.length);
	let next = 0;
	const worker = async () => {
		while (next < routes.length) {
			const index = next++;
			out[index] = await captureSwitches(browser, origin, routes[index]!, dir, selectors).catch((error: Error) => ({ route: routes[index]!, switches: [], skipped: [`the route: ${error.message.split('\n')[0]}`] }));
			if (out[index]!.switches.length) options.log?.(`switches ${routes[index]} (${out[index]!.switches.length})`);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
	return out;
}

/** Whether submitting each form of a route left the page on the old site (a JavaScript-handled form does not). */
export interface FormCapture {
	readonly route: string;
	readonly forms: readonly { readonly sig: string; readonly nth: number; readonly navigates: boolean }[];
}

/** Submits every visible form once, from a fresh load each, and records whether the page went somewhere. */
export async function captureForms(browser: Browser, origin: string, route: string, dir: string): Promise<FormCapture> {
	const file = join(dir, `${createHash('sha256').update(`forms:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as FormCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const forms: { sig: string; nth: number; navigates: boolean }[] = [];
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	try {
		const url = new URL(route, origin).href;
		// The old page's script takes the form over once it runs: submit only after it has.
		const ready = async () => {
			await loadPage(page, url);
			await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
			await page.waitForTimeout(300);
		};
		await ready();
		const found = await page.evaluate(() => {
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const counts = new Map<string, number>();
			const out: { sig: string; nth: number; index: number }[] = [];
			const all = [...document.body.querySelectorAll('form')];
			for (const el of document.body.querySelectorAll('*')) {
				const sig = sigOf(el);
				const n = counts.get(sig) ?? 0;
				counts.set(sig, n + 1);
				const index = all.indexOf(el as HTMLFormElement);
				const r = el.getBoundingClientRect();
				if (index >= 0 && r.width > 0 && r.height > 0) out.push({ sig, nth: n, index });
			}
			return out;
		});
		for (const f of found.slice(0, 20)) {
			if (page.url() !== url) await ready();
			// A native submission loads a new document: the mark set on this one is gone. A script's own history
			// change (a router updating the query) keeps the document.
			await page.evaluate((i) => {
				(window as unknown as { __mmMark?: boolean }).__mmMark = true;
				const form = document.body.querySelectorAll('form')[i];
				// Constraint validation would stop a native submission before it starts: what is asked is who handles it.
				if (form) form.noValidate = true;
				form?.requestSubmit();
			}, f.index).catch(() => {});
			await page.waitForTimeout(1500);
			await page.waitForLoadState('load').catch(() => {});
			const went = !(await page.evaluate(() => (window as unknown as { __mmMark?: boolean }).__mmMark === true).catch(() => false));
			forms.push({ sig: f.sig, nth: f.nth, navigates: went });
			if (went) await ready();
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: FormCapture = { route, forms };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

export async function captureAllForms(browser: Browser, origin: string, routes: readonly string[], dir: string, options: { concurrency?: number } = {}): Promise<FormCapture[]> {
	const out: FormCapture[] = new Array(routes.length);
	let next = 0;
	const worker = async () => {
		while (next < routes.length) {
			const index = next++;
			out[index] = await captureForms(browser, origin, routes[index]!, dir).catch(() => ({ route: routes[index]!, forms: [] }));
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
	return out;
}

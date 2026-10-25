import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, elementChildren, setAttr, walk, type Element as Tree } from './dom.ts';

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
	/**
	 * Elements outside the controls whose markup follows the group's state (a caption naming the chosen value), by
	 * signature and occurrence at load, with their markup in each state: `on`/`off` for a toggle, a radio's index, or
	 * `-1` for a cleared group.
	 */
	readonly dependents?: readonly Dependent[];
}

export interface Dependent {
	readonly sig: string;
	readonly nth: number;
	readonly states: Readonly<Record<string, ToggleState>>;
}

export interface ToggleCapture {
	readonly route: string;
	readonly groups: readonly ToggleGroup[];
	readonly skipped: readonly string[];
}

// Controls that switch state in place, outside menus and listboxes (those are portaled layers, captured as reveals).
// React Aria's Checkbox, Switch and Radio are a label around a visually hidden input: the label is the control.
const SELECTOR = '[role="checkbox"], [role="switch"], [role="radio"], button[aria-pressed], label[data-rac]:has(input[type="checkbox"]), label[data-rac]:has(input[type="radio"])';

// The selector is part of the key: controls it did not find before are captured again.
const key = (route: string) => createHash('sha256').update(`toggles:${route}|${SELECTOR}|dependents`).digest('hex').slice(0, 16);

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
			if (el.matches('input') && el.closest('label[data-rac]')) continue;
			if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled')) continue;
			const rect = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
			const input = el.matches('label[data-rac]') ? el.querySelector('input') : null;
			const role = input ? (input.getAttribute('role') ?? input.type) : (el.getAttribute('role') ?? 'pressed');
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
		// React Aria's hover, press and focus states follow the pointer and focus, not the control's state (its port writes them).
		const kept = (n: Element, a: Attr) => !(/^data-(hovered|pressed|focused|focus-visible|focus-visible-within)$/.test(a.name) && (n.hasAttribute('data-rac') || n.hasAttribute('data-react-aria-pressable')));
		const attrs = Object.fromEntries([...el.attributes].filter((a) => kept(el, a)).map((a) => [a.name, value(el, a)]));
		const on = el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || (el.matches('label[data-rac]') && el.hasAttribute('data-selected'));
		// Children with their attributes in name order: a library that re-sets an attribute moves it to the end.
		const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const canon = (n: Node): string => {
			if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
			if (!(n instanceof Element)) return '';
			const tag = n.tagName.toLowerCase();
			const list = [...n.attributes].filter((a) => kept(n, a)).sort((a, b) => (a.name < b.name ? -1 : 1)).map((a) => ` ${a.name}="${value(n, a).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
			return /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
		};
		return { attrs, inner: [...el.childNodes].map(canon).join(''), on };
	}, id);
}

/**
 * Every element's own attributes and text (not its descendants'), aligned to the elements the page had when this was
 * first called: what using a control changed elsewhere is where two of these differ.
 */
async function snapshot(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const w = window as unknown as { __mmAll?: Element[] };
		w.__mmAll ??= [...document.body.querySelectorAll('*')].filter((el) => !el.closest('template, [data-mm-layer]'));
		// Focus, hover and press follow the pointer and keyboard, not a control's state.
		const transient = /^(tabindex|data-(hovered|pressed|focused|focus-visible|focus-visible-within|focus-within|highlighted))$/;
		return w.__mmAll.map((el) => (el.isConnected ? `${[...el.attributes].filter((a) => !transient.test(a.name)).map((a) => `${a.name}=${a.value}`).sort().join(' ')}|${[...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('')}` : '∅'));
	});
}

/**
 * The elements outside the controls that differ from `base` in some state and are as they were once the group is back
 * in its first state (a clock or a carousel changing on its own is not): the innermost of each, by signature at load.
 */
async function dependentsOf(page: Page, controls: readonly number[], base: readonly string[], states: readonly (readonly string[])[], restored: readonly string[]): Promise<{ index: number; sig: string; nth: number }[]> {
	const changed = [...base.keys()].filter((i) => base[i] !== '∅' && restored[i] === base[i] && states.some((s) => s[i] !== base[i] && s[i] !== '∅'));
	if (!changed.length) return [];
	return page.evaluate(
		({ changed, controls }) => {
			const w = window as unknown as { __mmAll: Element[]; __mmToggles: Element[] };
			const own = controls.map((id) => w.__mmToggles[id]!);
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const counts = new Map<string, number>();
			const order = new Map<Element, number>();
			for (const el of document.body.querySelectorAll('*')) {
				if (el.closest('template')) continue;
				const sig = sigOf(el);
				order.set(el, counts.get(sig) ?? 0);
				counts.set(sig, (counts.get(sig) ?? 0) + 1);
			}
			const els = changed.map((i) => w.__mmAll[i]!).filter((el) => !own.some((c) => c.contains(el) || el.contains(c)));
			return els.filter((el) => !els.some((o) => o !== el && el.contains(o))).map((el) => ({ index: w.__mmAll.indexOf(el), sig: sigOf(el), nth: order.get(el) ?? 0 }));
		},
		{ changed, controls },
	);
}

/** The dependents' markup as the page shows them now. */
async function dependentMarkup(page: Page, indexes: readonly number[]): Promise<ToggleState[]> {
	return page.evaluate((indexes) => {
		const w = window as unknown as { __mmAll: Element[] };
		const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const value = (n: Element, a: Attr) => (a.name === 'style' && n instanceof HTMLElement ? n.style.cssText : a.value);
		const canon = (n: Node): string => {
			if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
			if (!(n instanceof Element)) return '';
			const tag = n.tagName.toLowerCase();
			const list = [...n.attributes].sort((a, b) => (a.name < b.name ? -1 : 1)).map((a) => ` ${a.name}="${value(n, a).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
			return /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
		};
		return indexes.map((i) => {
			const el = w.__mmAll[i]!;
			return { attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, value(el, a)])), inner: [...el.childNodes].map(canon).join('') };
		});
	}, indexes);
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
			const base = await snapshot(page);
			const failed = await use(page, c.id);
			if (failed) {
				skipped.push(`${c.sig}#${c.nth}: ${failed}`);
				continue;
			}
			const second = await stateOf(page, c.id);
			const used = await snapshot(page);
			await use(page, c.id);
			const back = await stateOf(page, c.id);
			if (same(first, second) || !same(first, back)) {
				skipped.push(`${c.sig}#${c.nth}: ${same(first, second) ? 'using it changed nothing in place' : 'using it twice did not restore it'}`);
				continue;
			}
			const [on, off] = first.on ? [first, second] : [second, first];
			const found = await dependentsOf(page, [c.id], base, [used], await snapshot(page));
			let dependents: Dependent[] | undefined;
			if (found.length) {
				const now = await dependentMarkup(page, found.map((d) => d.index));
				await use(page, c.id);
				const other = await dependentMarkup(page, found.map((d) => d.index));
				await use(page, c.id);
				dependents = found.map((d, k) => ({ sig: d.sig, nth: d.nth, states: { [first.on ? 'on' : 'off']: now[k]!, [first.on ? 'off' : 'on']: other[k]! } }));
			}
			groups.push({ kind: 'toggle', controls: [{ sig: c.sig, nth: c.nth, role: c.role, initial: first.on, on: { attrs: on.attrs, inner: on.inner }, off: { attrs: off.attrs, inner: off.inner } }], ...(dependents ? { dependents } : {}) });
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
			const base = await snapshot(page);
			const snaps: string[][] = [];
			let failed: string | undefined;
			for (let i = 0; i < members.length && !failed; i++) {
				failed = await use(page, members[i]!.id);
				const after = await Promise.all(members.map((m) => stateOf(page, m.id)));
				after.forEach((s, k) => {
					if (s.on && !on.has(k)) on.set(k, s);
					if (!s.on && !off.has(k)) off.set(k, s);
				});
				snaps.push(await snapshot(page));
			}
			// Choosing the chosen one again: a radio group keeps it, a single-choice toggle group clears.
			const last = members.length - 1;
			await use(page, members[last]!.id);
			const clears = !(await stateOf(page, members[last]!.id)).on;
			if (clears) snaps.push(await snapshot(page));
			const chosen = initial.findIndex((s) => s.on);
			if (chosen >= 0) await use(page, members[chosen]!.id);
			if (failed || members.some((_, k) => !on.has(k) || !off.has(k))) {
				skipped.push(`${members[0]!.sig}#${members[0]!.nth}: ${failed ?? 'a radio never showed both states'}`);
				continue;
			}
			const found = await dependentsOf(page, members.map((m) => m.id), base, snaps, await snapshot(page));
			let dependents: Dependent[] | undefined;
			if (found.length) {
				const states = found.map(() => ({}) as Record<string, ToggleState>);
				const record = async (state: string) => (await dependentMarkup(page, found.map((d) => d.index))).forEach((m, k) => (states[k]![state] = m));
				for (let i = 0; i < members.length; i++) {
					await use(page, members[i]!.id);
					// Choosing the chosen one of a group that clears clears it: once more chooses it.
					if (!(await stateOf(page, members[i]!.id)).on) await use(page, members[i]!.id);
					await record(String(i));
				}
				if (clears) {
					await use(page, members[last]!.id);
					await record('-1');
				}
				if (chosen >= 0) await use(page, members[chosen]!.id);
				dependents = found.map((d, k) => ({ sig: d.sig, nth: d.nth, states: states[k]! }));
			}
			groups.push({ kind: 'radio', ...(clears ? { clears } : {}), controls: members.map((m, k) => ({ sig: m.sig, nth: m.nth, role: m.role, initial: initial[k]!.on, on: on.get(k)!, off: off.get(k)! })), ...(dependents ? { dependents } : {}) });
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
	const file = join(dir, `${createHash('sha256').update(`switches:v2:${route}|${JSON.stringify(selectors)}`).digest('hex').slice(0, 16)}.json`);
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
						// What a resize redraws (a chart's SVG and its responsive container) is the layout's, not the switch's.
						if (!el.isConnected || attr === 'tabindex' || el.closest('svg') || el.closest('[class*="recharts"]')) continue;
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

/** A site-listed control whose use shows a notification in a live region (a toast), and how long it stayed. */
export interface Notify {
	readonly sig: string;
	readonly nth: number;
	/** The live region it went into, the element before which it went (null at the end), its markup and lifetime. */
	readonly into: { readonly sig: string; readonly nth: number };
	readonly html: string;
	readonly ms: number;
}

export interface NotifyCapture {
	readonly route: string;
	readonly notifications: readonly Notify[];
}

/** Uses each listed control on a fresh load and records what it added inside a live region, until that went away. */
export async function captureNotifications(browser: Browser, origin: string, route: string, dir: string, selectors: readonly string[]): Promise<NotifyCapture> {
	const file = join(dir, `${createHash('sha256').update(`notify:${route}|${JSON.stringify(selectors)}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as NotifyCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const notifications: Notify[] = [];
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const url = new URL(route, origin).href;
	const fresh = async () => {
		await loadPage(page, url);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(300);
	};
	try {
		await fresh();
		const count = await page.evaluate((selector) => [...document.body.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().width > 0).length, selectors.join(', '));
		for (let i = 0; i < Math.min(count, 24); i++) {
			if (i > 0) await fresh();
			const found = await page.evaluate(
				({ selector, i }) => {
					const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
					const nthOf = (el: Element) => {
						const sig = sigOf(el);
						let n = 0;
						for (const e of document.body.querySelectorAll('*')) {
							if (e === el) break;
							if (sigOf(e) === sig) n++;
						}
						return n;
					};
					const control = [...document.body.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().width > 0)[i]!;
					const w = window as unknown as { __mmAdded: { node: Element; region: Element }[]; __mmRegions: Map<Element, { sig: string; nth: number }> };
					w.__mmAdded = [];
					w.__mmRegions = new Map([...document.body.querySelectorAll('[aria-live]')].map((r) => [r, { sig: sigOf(r), nth: nthOf(r) }]));
					new MutationObserver((records) => {
						for (const r of records)
							for (const n of r.addedNodes) {
								if (!(n instanceof Element)) continue;
								const region = [...w.__mmRegions.keys()].find((x) => x.contains(n) && x !== n);
								if (region && !w.__mmAdded.some((a) => a.node.contains(n))) w.__mmAdded.push({ node: n, region });
							}
					}).observe(document.body, { childList: true, subtree: true });
					(window as unknown as { __mmControl: Element }).__mmControl = control;
					return { sig: sigOf(control), nth: nthOf(control) };
				},
				{ selector: selectors.join(', '), i },
			);
			const handle = (await page.evaluateHandle(() => (window as unknown as { __mmControl: Element }).__mmControl)).asElement();
			if (!handle || (await handle.click({ timeout: 2000 }).then(() => false, () => true))) continue;
			const started = Date.now();
			await page.waitForTimeout(600);
			const added = await page.evaluate(() => {
				const w = window as unknown as { __mmAdded: { node: Element; region: Element }[]; __mmRegions: Map<Element, { sig: string; nth: number }> };
				// The region's own top element the addition went under: the notification's outermost new node.
				return w.__mmAdded.filter((a) => a.node.isConnected).map((a) => {
					let top = a.node;
					while (top.parentElement && top.parentElement !== a.region && !w.__mmAdded.some((b) => b.node === top.parentElement)) top = top.parentElement;
					return { into: w.__mmRegions.get(a.region)!, html: a.node.outerHTML };
				})[0];
			});
			if (!added) continue;
			let ms = 0;
			while (Date.now() - started < 15000) {
				const gone = await page.evaluate(() => (window as unknown as { __mmAdded: { node: Element }[] }).__mmAdded.every((a) => !a.node.isConnected));
				if (gone) {
					ms = Date.now() - started;
					break;
				}
				await page.waitForTimeout(250);
			}
			notifications.push({ sig: found.sig, nth: found.nth, into: added.into, html: added.html, ms: ms || 15000 });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: NotifyCapture = { route, notifications };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/** An accordion of the old page, by its root's signature and occurrence, and whether two of its items stayed open together. */
export interface AccordionMode {
	readonly sig: string;
	readonly nth: number;
	readonly multiple: boolean;
}

export interface AccordionCapture {
	readonly route: string;
	readonly accordions: readonly AccordionMode[];
}

/**
 * Opens two items of each accordion one after the other on a fresh load: if the first stays open when the second opens,
 * the accordion lets several items be open at once (Radix `type="multiple"`, Base UI `multiple`).
 */
export async function captureAccordions(browser: Browser, origin: string, route: string, dir: string): Promise<AccordionCapture> {
	const file = join(dir, `${createHash('sha256').update(`accordion:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as AccordionCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const accordions: AccordionMode[] = [];
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(300);
		const roots = await page.evaluate(() => {
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const counts = new Map<string, number>();
			const order = new Map<Element, number>();
			for (const el of document.body.querySelectorAll('*')) {
				const sig = sigOf(el);
				order.set(el, counts.get(sig) ?? 0);
				counts.set(sig, (counts.get(sig) ?? 0) + 1);
			}
			return [...document.querySelectorAll('[data-slot="accordion"]')].map((root, i) => ({ i, sig: sigOf(root), nth: order.get(root) ?? 0 }));
		});
		for (const root of roots) {
			const pick = (n: number) =>
				page.evaluate(
					({ i, n }) => {
						const root = document.querySelectorAll('[data-slot="accordion"]')[i];
						const own = [...(root?.querySelectorAll<HTMLElement>('[data-slot="accordion-trigger"]') ?? [])].filter((t) => t.closest('[data-slot="accordion"]') === root && !t.matches('[disabled], [aria-disabled="true"], [data-disabled]') && t.getBoundingClientRect().width > 0);
						const closed = own.filter((t) => t.getAttribute('aria-expanded') !== 'true');
						const t = closed[n];
						if (!t) return false;
						t.setAttribute('data-mm-probe', String(n));
						return own.length >= 2;
					},
					{ i: root.i, n },
				);
			if (!(await pick(0)) || !(await pick(1))) continue;
			const ok = await page.click('[data-mm-probe="0"]', { timeout: 2000 }).then(() => page.click('[data-mm-probe="1"]', { timeout: 2000 })).then(() => true, () => false);
			if (!ok) continue;
			await page.waitForTimeout(300);
			const multiple = await page.evaluate(() => [...document.querySelectorAll('[data-mm-probe]')].every((t) => t.getAttribute('aria-expanded') === 'true'));
			await page.evaluate(() => {
				for (const t of document.querySelectorAll('[data-mm-probe]')) t.removeAttribute('data-mm-probe');
			});
			accordions.push({ sig: root.sig, nth: root.nth, multiple });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: AccordionCapture = { route, accordions };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/** A hover card trigger of the old page and the delays it opened and closed after, in ms. */
export interface HoverDelay {
	readonly sig: string;
	readonly nth: number;
	readonly open: number;
	readonly close: number;
}

/**
 * Hovers each hover card trigger on the old page and times, in the page, from the pointer entering to the trigger
 * marked open, and from it leaving to the trigger marked closed: each instance's own delays, floored to 10 ms.
 */
export async function captureHoverDelays(browser: Browser, origin: string, route: string, dir: string, others: readonly { readonly sig: string; readonly nth: number }[] = []): Promise<{ readonly route: string; readonly delays: readonly HoverDelay[] }> {
	const file = join(dir, `${createHash('sha256').update(`hover-delay:v3:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; delays: HoverDelay[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const delays: HoverDelay[] = [];
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		// The hover card triggers, and those `others` names: a trigger rendered through its child, found by its signature.
		const count = await page.evaluate((others) => {
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const seen = new Map<string, number>();
			const marked: Element[] = [];
			for (const e of document.body.querySelectorAll('*')) {
				const sig = sigOf(e);
				const nth = seen.get(sig) ?? 0;
				seen.set(sig, nth + 1);
				if ((e.getAttribute('data-slot') === 'hover-card-trigger' || others.some((o) => o.sig === sig && o.nth === nth)) && e.getBoundingClientRect().width > 0) marked.push(e);
			}
			marked.forEach((e, i) => e.setAttribute('data-mm-hover-i', String(i)));
			return marked.length;
		}, others);
		for (let i = 0; i < Math.min(count, 24); i++) {
			await page.mouse.move(1, 1);
			await page.waitForTimeout(800);
			const found = await page.evaluate((i) => {
				const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				const t = document.querySelector<HTMLElement>(`[data-mm-hover-i="${i}"]`)!;
				let nth = 0;
				for (const e of document.body.querySelectorAll('*')) {
					if (e === t) break;
					if (sigOf(e) === sigOf(t)) nth++;
				}
				// Radix's data-state, Base UI's data-popup-open, React Aria's PreviewTrigger's aria-expanded.
				const opened = () => t.getAttribute('data-state') === 'open' || t.hasAttribute('data-popup-open') || (t.hasAttribute('data-rac') && t.getAttribute('aria-expanded') === 'true');
				const w = window as unknown as { __mmTimes: number[] };
				w.__mmTimes = [];
				t.addEventListener('pointerenter', () => w.__mmTimes.length === 0 && w.__mmTimes.push(performance.now()), { once: true });
				t.addEventListener('pointerleave', () => w.__mmTimes.length === 2 && w.__mmTimes.push(performance.now()));
				const observer = new MutationObserver(() => {
					const n = w.__mmTimes.length;
					if (n === 1 && opened()) w.__mmTimes.push(performance.now());
					if (n === 3 && !opened()) {
						w.__mmTimes.push(performance.now());
						observer.disconnect();
					}
				});
				observer.observe(t, { attributes: true });
				t.setAttribute('data-mm-probe', '');
				return { sig: sigOf(t), nth };
			}, i);
			await page.hover('[data-mm-probe]', { timeout: 2000 }).catch(() => {});
			await page.waitForFunction(() => (window as unknown as { __mmTimes: number[] }).__mmTimes.length >= 2, undefined, { timeout: 3000 }).catch(() => {});
			await page.mouse.move(1, 1);
			await page.waitForFunction(() => (window as unknown as { __mmTimes: number[] }).__mmTimes.length >= 4, undefined, { timeout: 3000 }).catch(() => {});
			const times = await page.evaluate(() => {
				document.querySelector('[data-mm-probe]')?.removeAttribute('data-mm-probe');
				return (window as unknown as { __mmTimes: number[] }).__mmTimes;
			});
			if (times.length < 4) continue;
			const floor = (ms: number) => Math.max(0, Math.floor(ms / 10) * 10);
			delays.push({ ...found, open: floor(times[1]! - times[0]!), close: floor(times[3]! - times[2]!) });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture = { route, delays };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

// Whether a carousel moves over a delay and a half, after a move already under way has settled.
async function movesWithin(page: Page, i: number, delay: number): Promise<boolean> {
	const read = () => page.evaluate((i) => document.querySelectorAll('[data-slot="carousel"]')[i]?.querySelector<HTMLElement>('[data-slot="carousel-content"] > *')?.style.transform ?? '', i);
	await page.waitForTimeout(700);
	const before = await read();
	await page.waitForTimeout(delay * 1.5);
	return (await read()) !== before;
}

/** What the pointer over an autoplaying carousel does to its autoplay: the page's own mouseenter and mouseleave handlers decide. */
async function hoverEffect(page: Page, i: number, delay: number): Promise<CarouselFacts['hover']> {
	const root = page.locator('[data-slot="carousel"]').nth(i);
	await root.scrollIntoViewIfNeeded().catch(() => {});
	const box = await root.boundingBox();
	if (!box) return undefined;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	const moved = await movesWithin(page, i, delay);
	await page.mouse.move(0, 0);
	if (moved) return undefined;
	return (await movesWithin(page, i, delay)) ? 'pause' : 'stop';
}

// An autoplaying carousel was captured wherever Autoplay had taken it: served as Embla shows it at load, on its first snap.
export function restCarousel(root: Tree): void {
	const els = [...walk(root)];
	const track = els.find((e) => attr(e, 'data-slot') === 'carousel-content');
	const first = track && elementChildren(track)[0];
	const style = first && attr(first, 'style');
	if (first && style !== undefined) setAttr(first, 'style', style.replace(/transform:\s*translate3d\([^)]*\)/, 'transform: translate3d(0px, 0px, 0px)'));
	for (const button of els.filter((e) => /^carousel-(previous|next)$/.test(attr(e, 'data-slot') ?? ''))) {
		const off = attr(button, 'data-slot') === 'carousel-previous';
		const rac = attr(button, 'data-rac') !== undefined;
		button.attrs = button.attrs.filter((a) => a.name !== 'disabled' && !(rac && (a.name === 'data-disabled' || a.name === 'tabindex')));
		if (off) button.attrs.push({ name: 'disabled', value: '' }, ...(rac ? [{ name: 'data-disabled', value: 'true' }] : []));
		else if (rac) button.attrs.push({ name: 'tabindex', value: '0' });
	}
}

export interface CarouselFacts {
	readonly sig: string;
	readonly nth: number;
	/** Embla's `align` the snaps were measured with: the one whose first step lands where the old page's did. */
	readonly align: 'start' | 'center' | 'end';
	/** Milliseconds between two moves no one asked for (Embla Autoplay's delay), when the carousel moved by itself. */
	readonly autoplay?: number;
	/** What the pointer over an autoplaying carousel does: `stop` it for good, or `pause` it until the pointer leaves. */
	readonly hover?: 'stop' | 'pause';
}

/**
 * Measures each carousel on the old page: whether it moves by itself (Autoplay) and how often, then presses its Next
 * button once and reads where the track went, to tell which alignment the source gave Embla (its options are passed
 * through as a variable, so the source does not say).
 */
export async function captureCarousels(browser: Browser, origin: string, route: string, dir: string): Promise<{ readonly route: string; readonly carousels: readonly CarouselFacts[] }> {
	const file = join(dir, `${createHash('sha256').update(`carousel:2:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; carousels: CarouselFacts[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const carousels: CarouselFacts[] = [];
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		const moves = await page.evaluate(async () => {
			const roots = [...document.querySelectorAll<HTMLElement>('[data-slot="carousel"]')];
			// A move starts when the track changes after resting at least 300 ms (a settling track's last frames are not starts).
			const starts = roots.map(() => [] as number[]);
			const last = roots.map((r) => r.querySelector<HTMLElement>('[data-slot="carousel-content"] > *')?.style.transform ?? '');
			const changed = roots.map(() => performance.now());
			const t0 = performance.now();
			while (performance.now() - t0 < 6000) {
				await new Promise((r) => setTimeout(r, 25));
				const at = performance.now();
				roots.forEach((r, i) => {
					const now = r.querySelector<HTMLElement>('[data-slot="carousel-content"] > *')?.style.transform ?? '';
					if (now === last[i]) return;
					if (at - changed[i]! >= 300) starts[i]!.push(at);
					changed[i] = at;
					last[i] = now;
				});
			}
			return starts;
		});
		const count = moves.length;
		for (let i = 0; i < count; i++) {
			const found = await page.evaluate((i) => {
				const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				const root = document.querySelectorAll<HTMLElement>('[data-slot="carousel"]')[i]!;
				let nth = 0;
				for (const e of document.body.querySelectorAll('*')) {
					if (e === root) break;
					if (sigOf(e) === sigOf(root)) nth++;
				}
				return { sig: sigOf(root), nth, visible: root.getBoundingClientRect().width > 0 };
			}, i);
			if (!found.visible) continue;
			const starts = moves[i]!;
			const autoplay = starts.length >= 2 ? Math.round((starts[starts.length - 1]! - starts[starts.length - 2]!) / 100) * 100 : undefined;
			const next = page.locator('[data-slot="carousel"]').nth(i).locator('[data-slot="carousel-next"]');
			let align: CarouselFacts['align'] = 'center';
			if (!autoplay && (await next.count()) && (await next.isEnabled().catch(() => false))) {
				await next.scrollIntoViewIfNeeded().catch(() => {});
				await next.click({ timeout: 2000 }).catch(() => {});
				await page.waitForTimeout(1500);
				align = await page.evaluate((i) => {
					const root = document.querySelectorAll<HTMLElement>('[data-slot="carousel"]')[i]!;
					const track = root.querySelector<HTMLElement>('[data-slot="carousel-content"] > *')!;
					const vertical = getComputedStyle(track).flexDirection.startsWith('column');
					const rtl = getComputedStyle(track).direction === 'rtl';
					const m = new DOMMatrixReadOnly(getComputedStyle(track).transform === 'none' ? undefined : getComputedStyle(track).transform);
					const at = vertical ? m.m42 : rtl ? -m.m41 : m.m41;
					const box = track.getBoundingClientRect();
					const size = (r: DOMRect) => (vertical ? r.height : r.width);
					const start = (r: DOMRect) => (vertical ? r.top - box.top : rtl ? box.right - r.right : r.left - box.left);
					const slides = [...track.children].map((s) => s.getBoundingClientRect());
					const view = size(box);
					const content = start(slides[slides.length - 1]!) + size(slides[slides.length - 1]!);
					const second = slides[1];
					if (!second) return 'center' as const;
					const snap = (offset: number) => Math.max(-content + view, Math.min(0, -start(second) + offset));
					const options = { start: snap(0), center: snap((view - size(second)) / 2), end: snap(view - size(second)) };
					return (Object.entries(options).sort((a, b) => Math.abs(a[1] - at) - Math.abs(b[1] - at))[0]![0]) as 'start' | 'center' | 'end';
				}, i);
			}
			const hover = autoplay ? await hoverEffect(page, i, autoplay) : undefined;
			carousels.push({ sig: found.sig, nth: found.nth, align, ...(autoplay ? { autoplay } : {}), ...(hover ? { hover } : {}) });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture = { route, carousels };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

export interface ComboboxEmpty {
	readonly sig: string;
	readonly nth: number;
	/** What the combobox's empty element holds on the old page once nothing matches (Base UI renders it only then). */
	readonly html: string;
}

/** Opens each combobox `controls` names on the old page, types what no item contains, and records the empty element's content. */
export async function captureComboboxEmpties(browser: Browser, origin: string, route: string, dir: string, controls: readonly { readonly sig: string; readonly nth: number }[]): Promise<{ readonly route: string; readonly empties: readonly ComboboxEmpty[] }> {
	const file = join(dir, `${createHash('sha256').update(`combobox-empty:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; empties: ComboboxEmpty[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const empties: ComboboxEmpty[] = [];
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		for (const control of controls) {
			const marked = await page.evaluate(({ sig, nth }) => {
				const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				let n = 0;
				for (const e of document.body.querySelectorAll('*')) {
					if (sigOf(e) !== sig) continue;
					if (n++ === nth) {
						e.setAttribute('data-mm-probe', '');
						return true;
					}
				}
				return false;
			}, control);
			if (!marked) continue;
			await page.click('[data-mm-probe]', { timeout: 2000 }).catch(() => {});
			await page.waitForTimeout(300);
			await page.keyboard.type('zqxjzqxj');
			await page.waitForTimeout(400);
			const html = await page.evaluate(() => [...document.querySelectorAll('[data-slot="combobox-empty"]')].find((e) => e.getBoundingClientRect().height > 0 && e.innerHTML.trim())?.innerHTML ?? '');
			for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
			await page.keyboard.press('Escape');
			await page.keyboard.press('Escape');
			await page.evaluate(() => document.querySelector('[data-mm-probe]')?.removeAttribute('data-mm-probe'));
			await page.waitForTimeout(200);
			if (html) empties.push({ ...control, html });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture = { route, empties };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/** How the input whose empty state is read is reached from the control: beside it (a ComboBox's button), in the layer it opens (a dialog's Autocomplete), or the control itself. */
export type EmptyReach = 'beside' | 'opens' | 'self';

/**
 * What a React Aria collection filtered by an input renders once nothing matches (its renderEmptyState, which keeps a
 * ComboBox's popover open): the input is reached from the control at sig/nth, typed into, and the listbox's or menu's
 * content read whole.
 */
export async function captureRacEmpties(browser: Browser, origin: string, route: string, dir: string, controls: readonly { readonly sig: string; readonly nth: number; readonly reach: EmptyReach }[]): Promise<{ readonly route: string; readonly empties: readonly ComboboxEmpty[] }> {
	const file = join(dir, `${createHash('sha256').update(`rac-empty:1:${route}|${JSON.stringify(controls)}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; empties: ComboboxEmpty[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const empties: ComboboxEmpty[] = [];
	for (const control of controls) {
		const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
		try {
			await loadPage(page, new URL(route, origin).href);
			await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
			const mark = (reach: EmptyReach) =>
				page.evaluate(({ sig, nth, reach }) => {
					const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
					const visible = (e: Element) => e.getClientRects().length > 0;
					const el = reach === 'opens' ? [...document.querySelectorAll('input[data-rac][aria-autocomplete="list"]')].find((e) => visible(e) && e.closest('[role="dialog"], [data-trigger]')) : [...document.body.querySelectorAll('*')].filter((e) => sigOf(e) === sig)[nth];
					const input = reach === 'beside' ? el?.closest('[data-rac]:has(input[role="combobox"])')?.querySelector('input[role="combobox"]') : el;
					input?.setAttribute('data-mm-probe', '');
					return Boolean(input);
				}, { ...control, reach });
			if (control.reach === 'opens') {
				const opened = await page.evaluate(({ sig, nth }) => {
					const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
					const el = [...document.body.querySelectorAll('*')].filter((e) => sigOf(e) === sig)[nth];
					el?.setAttribute('data-mm-trigger', '');
					return Boolean(el);
				}, control);
				if (!opened) continue;
				await page.click('[data-mm-trigger]', { timeout: 2000 }).catch(() => {});
				await page.waitForTimeout(500);
			}
			if (!(await mark(control.reach))) continue;
			await page.click('[data-mm-probe]', { timeout: 2000 }).catch(() => {});
			await page.keyboard.type('zqxjzqxj');
			await page.waitForTimeout(400);
			const html = await page.evaluate(() => {
				const input = document.querySelector('[data-mm-probe]');
				const named = document.getElementById(input?.getAttribute('aria-controls') ?? '');
				const collection = named?.matches('[data-empty]') ? named : [...document.querySelectorAll('[role="listbox"][data-empty], [role="menu"][data-empty]')].find((e) => e.getClientRects().length);
				return collection ? [...collection.children].map((c) => c.outerHTML).join('') : '';
			});
			if (html) empties.push({ sig: control.sig, nth: control.nth, html });
		} catch {
			// a control whose input cannot be reached keeps no empty state
		} finally {
			await context.close().catch(() => {});
		}
	}
	const capture = { route, empties };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

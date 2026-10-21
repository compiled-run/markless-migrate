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

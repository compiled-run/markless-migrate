import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, walk, type Element as Markup } from './dom.ts';
import { lit, type Binding } from './tsrx.ts';

/** One input-otp field on the old page, as using it showed: the fake caret its active empty slot renders, and app text that shows its value. */
export interface OtpField {
	/** The container's tag, data-slot and text, and which element with them it is in document order. */
	readonly sig: string;
	readonly nth: number;
	/** The children of the active empty slot beyond its character (the site's fake caret), as HTML. */
	readonly caret?: string;
	/** Elements outside the field whose text follows its value: their text empty, and with `typed` in the field. */
	readonly texts: readonly { readonly sig: string; readonly nth: number; readonly empty: string; readonly filled: string; readonly typed: string }[];
}

export interface OtpCapture {
	readonly route: string;
	readonly fields: readonly OtpField[];
}

const CONTAINER = '[data-input-otp-container]';

/**
 * Uses each enabled input-otp field on a fresh load of the old page: clears it with the keyboard (the active empty slot
 * shows the site's caret), then types two characters its pattern accepts, recording which text outside the field changed.
 */
export async function captureOtps(browser: Browser, origin: string, route: string, dir: string): Promise<OtpCapture> {
	const file = join(dir, `${createHash('sha256').update(`otp:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as OtpCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const fields: OtpField[] = [];
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(300);
		const found = await page.evaluate((selector) => {
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const counts = new Map<string, number>();
			const at = new Map<Element, { sig: string; nth: number }>();
			for (const el of document.body.querySelectorAll('*')) {
				if (el.closest('template')) continue;
				const sig = sigOf(el);
				const n = counts.get(sig) ?? 0;
				counts.set(sig, n + 1);
				at.set(el, { sig, nth: n });
			}
			const w = window as unknown as { __mmOtpAt: Map<Element, { sig: string; nth: number }>; __mmOtps: Element[] };
			w.__mmOtpAt = at;
			w.__mmOtps = [...document.body.querySelectorAll(selector)].filter((c) => !c.closest('template'));
			return w.__mmOtps.map((c, i) => ({ i, ...at.get(c)!, disabled: c.querySelector('input')?.disabled ?? true, pattern: c.querySelector('input')?.getAttribute('pattern') ?? null }));
		}, CONTAINER);
		for (const f of found) {
			if (f.disabled) continue;
			const input = page.locator(CONTAINER).nth(f.i).locator('input');
			const watch = () =>
				page.evaluate((i) => {
					const w = window as unknown as { __mmOtps: Element[]; __mmSeen: Set<Element>; __mmObs?: MutationObserver };
					const container = w.__mmOtps[i]!;
					w.__mmSeen = new Set();
					w.__mmObs?.disconnect();
					w.__mmObs = new MutationObserver((records) => {
						for (const r of records) {
							const el = r.target instanceof Element ? r.target : r.target.parentElement;
							if (el && !container.contains(el)) w.__mmSeen.add(el);
						}
					});
					w.__mmObs.observe(document.body, { subtree: true, childList: true, characterData: true });
				}, f.i);
			const changed = () =>
				page.evaluate((i) => {
					const w = window as unknown as { __mmOtps: Element[]; __mmSeen: Set<Element>; __mmObs?: MutationObserver; __mmOtpAt: Map<Element, { sig: string; nth: number }> };
					w.__mmObs?.disconnect();
					const container = w.__mmOtps[i]!;
					// The nearest element holding every change, within the field's demo, that the page had at load.
					let common: Element | null = null;
					for (const el of w.__mmSeen) {
						if (!el.isConnected) continue;
						if (!common) common = el;
						else while (common && !common.contains(el)) common = common.parentElement;
					}
					while (common && !w.__mmOtpAt.has(common)) common = common.parentElement;
					if (!common || common.contains(container)) return undefined;
					return { ...w.__mmOtpAt.get(common)!, text: (common.textContent ?? '').trim() };
				}, f.i);
			try {
				await input.focus({ timeout: 2000 });
				await watch();
				await page.keyboard.press('ControlOrMeta+a');
				for (let k = 0; k < 12; k++) await page.keyboard.press('Backspace');
				await page.waitForTimeout(150);
				const cleared = await changed();
				const caret = await page.evaluate((i) => {
					const w = window as unknown as { __mmOtps: Element[] };
					const slot = w.__mmOtps[i]!.querySelector('[data-active="true"]');
					return slot ? slot.innerHTML : undefined;
				}, f.i);
				const typed = ['12', 'ab'].find((t) => !f.pattern || new RegExp(f.pattern).test(t)) ?? '';
				await watch();
				if (typed) await page.keyboard.type(typed);
				await page.waitForTimeout(150);
				const filled = typed ? await changed() : undefined;
				const texts: OtpField['texts'][number][] = [];
				const host = filled ?? cleared;
				if (host && typed) {
					const text = () => page.evaluate(([sig, nth]) => [...(window as unknown as { __mmOtpAt: Map<Element, { sig: string; nth: number }> }).__mmOtpAt].find(([, v]) => v.sig === sig && v.nth === nth)?.[0].textContent?.trim() ?? '', [host.sig, host.nth] as const);
					const filledText = await text();
					await page.keyboard.press('ControlOrMeta+a');
					for (let k = 0; k < 12; k++) await page.keyboard.press('Backspace');
					await page.waitForTimeout(150);
					const emptyText = await text();
					if (filledText.includes(typed) && filledText !== emptyText) texts.push({ sig: host.sig, nth: host.nth, empty: emptyText, filled: filledText, typed });
				}
				fields.push({ sig: f.sig, nth: f.nth, ...(caret ? { caret } : {}), texts });
			} catch {
				fields.push({ sig: f.sig, nth: f.nth, texts: [] });
			}
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: OtpCapture = { route, fields };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/**
 * input-otp fields on Markless state: per field a state() for the value, the input's mirrored selection and focus, set
 * by the field's `mmotp` handler (the input-otp part dispatches it). Each slot binds data-active and shows its
 * character, with the site's fake caret in an @if arm; the input binds value and the library's data attributes; app
 * text that shows the value follows it.
 */
export class OtpPlan {
	private readonly bindings = new Map<Markup, Binding>();
	private n = 0;

	bind(el: Markup): Binding | undefined {
		return this.bindings.get(el);
	}

	/** `locate` finds an element of the page by its signature; `caretMarkup` turns captured HTML into tsrx. */
	add(fields: readonly OtpField[], locate: (sig: string, nth: number) => Markup | undefined, caretMarkup: (html: string) => string): number {
		let count = 0;
		for (const field of fields) {
			const container = locate(field.sig, field.nth);
			if (!container || attr(container, 'data-input-otp-container') === undefined) continue;
			const all = [...walk(container)];
			const input = all.find((el) => el.tagName === 'input' && attr(el, 'data-input-otp') !== undefined);
			const slots = all.filter((el) => attr(el, 'data-active') !== undefined);
			const maxLength = Number(attr(input ?? container, 'maxlength'));
			if (!input || attr(input, 'disabled') !== undefined || !slots.length || slots.length !== maxLength) continue;
			const name = `otp${this.n++}`;
			const [v, s, e, f] = [name, `${name}s`, `${name}e`, `${name}f`];
			const at = (a: string) => (attr(input, a) !== undefined ? Number(attr(input, a)) : -1);
			const declare = [`let ${v} = state(${lit(attr(input, 'value') ?? '')});`, `let ${s} = state(${at('data-input-otp-mss')});`, `let ${e} = state(${at('data-input-otp-mse')});`, `let ${f} = state(false);`];
			this.bindings.set(container, { declare, extra: [`onMmotp={(event) => { const d = (event as CustomEvent<{ v: string; s: number; e: number; f: boolean }>).detail; ${v} = d.v; ${s} = d.s; ${e} = d.e; ${f} = d.f; }}`] });
			this.bindings.set(input, {
				declare,
				omit: ['value', 'data-input-otp-placeholder-shown', 'data-input-otp-mss', 'data-input-otp-mse'],
				extra: [`value={${v}}`, `data-input-otp-placeholder-shown={${v}.length === 0 ? "true" : undefined}`, `data-input-otp-mss={${s} === -1 ? undefined : ${s}}`, `data-input-otp-mse={${e} === -1 ? undefined : ${e}}`],
			});
			slots.forEach((slot, i) => {
				const active = `${f} && ((${s} === ${e} && ${i} === ${s}) || (${i} >= ${s} && ${i} < ${e}))`;
				const caret = field.caret ? `@if (${active} && ${v}.length <= ${i}) { ${caretMarkup(field.caret)} }` : '';
				this.bindings.set(slot, { declare, omit: ['data-active'], extra: [`data-active={${active} ? "true" : "false"}`], children: `{${v}.charAt(${i})}${caret}` });
			});
			for (const t of field.texts) {
				const el = locate(t.sig, t.nth);
				// Only an element holding text alone: its children become the one expression.
				if (!el || [...walk(el)].length !== 1) continue;
				const [before, after] = t.filled.split(t.typed) as [string, string];
				this.bindings.set(el, { declare, children: `{${v} === "" ? ${lit(t.empty)} : ${lit(before)} + ${v} + ${lit(after)}}` });
			}
			count++;
		}
		return count;
	}
}

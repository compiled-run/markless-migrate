import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { settle } from '../check/capture.ts';
import { DEFAULT_FREEZE } from '../check/freeze.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { dayPickerLabel, dayPickerModel, dayPickerView, type DayPickerEffect, type DayModel, type DayPickerConfig, type DayPickerModel, type LocaleTable, type Matcher, type When } from '../../parts/day-picker.ts';
import { attr, childrenOf, elementChildren, isElement, isText, walk, type Element, type Text } from './dom.ts';
import { emitChildren, emitElement, mergeBindings, type Binding } from './tsrx.ts';
import { parseFragment } from 'parse5';

// react-day-picker's DayPicker on Markless state (parts/day-picker.ts). What each calendar on the old page was given is
// read from its DayPicker context at two clock settings, so a date that follows today (a selection of `new Date()`, a
// matcher on days after today) is told from a fixed one; the port's first render on the capture clock is checked against
// the markup the old page showed, and the calendar's template is written from that markup.

type Triple = readonly [number, number, number];
type RawMatcher = true | { readonly dow: readonly number[] } | { readonly spans: readonly (readonly [number | null, number | null])[] };
type RawDates = { readonly start?: Triple; readonly end?: Triple; readonly endProp?: Triple; readonly month?: Triple; readonly today?: Triple; readonly selected?: readonly (Triple | null)[] };
type RawMatchers = { readonly disabled?: readonly RawMatcher[]; readonly hidden?: readonly RawMatcher[]; readonly modifiers?: readonly (readonly [string, readonly RawMatcher[]])[] };

/** What one calendar on the old page was given, as its DayPicker context holds it. */
export interface RawPicker {
	readonly sig: string;
	readonly nth: number;
	/** Why the calendar cannot be ported, when it uses what the port does not do. */
	readonly why?: string;
	readonly config?: Omit<DayPickerConfig, 'start' | 'end' | 'endProp' | 'month' | 'today' | 'selected' | 'disabled' | 'hidden' | 'modifiers' | 'code'> & { readonly code: string | null };
	readonly dates?: RawDates;
	readonly matchers?: RawMatchers;
	/** DayPicker's merged classNames, which tell the parts of its markup apart. */
	readonly ui?: Readonly<Record<string, string>>;
	/** Whether a key that moves the focused day also moves the browser's focus (DayPicker's DayButton focuses itself). */
	readonly movesFocus?: boolean;
	/** Buttons beside the calendar whose click changed its selection or month, and what they set. */
	readonly effects?: readonly RawEffect[];
	/** Whether choosing a day, and moving a month, mounts the calendar's markup again (a day button, a nav button replaced). */
	readonly remounts?: { readonly select: boolean; readonly month: boolean };
	/** In a layer: found by its signature and place in the layer, not the page. */
	readonly inLayer?: true;
	/** The control whose layer holds the calendar (a date picker's trigger), and what that control shows as days are picked. */
	readonly opener?: LayerOpener;
}

/** A date picker's trigger and what it showed: its children before, after one day was picked, and after a second (range). */
export interface LayerOpener {
	readonly sig: string;
	readonly nth: number;
	/** Its place among the elements of its tag and data-slot. */
	readonly k: number;
	readonly before: string;
	readonly picks: readonly { readonly days: readonly Triple[]; readonly html: string; readonly open: boolean }[];
}

interface RawEffect {
	readonly sig: string;
	readonly nth: number;
	readonly selected?: readonly (Triple | null)[];
	readonly month?: Triple;
}

export interface CapturedPickers {
	readonly route: string;
	readonly at: number;
	readonly pickers: readonly RawPicker[];
	readonly later: readonly RawPicker[];
}

/** The second clock: a later year, month, day and weekday than the capture clock, so a date relative to today moves in each. */
export const LATER = Date.UTC(2027, 4, 20, 12, 0, 0);

// Bumped when what is read changes, so a cached read is taken again.
const READ_VERSION = 6;
const fileFor = (dir: string, route: string) => join(dir, `${createHash('sha256').update(`day-picker:${READ_VERSION}:${route}`).digest('hex').slice(0, 16)}.json`);

/** Reads every DayPicker on a route at the capture clock and at LATER, and whether its keys move the browser's focus. */
export async function captureDayPickers(browser: Browser, origin: string, route: string, dir: string, openers: readonly { readonly sig: string; readonly nth: number }[] = []): Promise<CapturedPickers> {
	const file = openers.length ? fileFor(dir, `${route}|${JSON.stringify(openers)}`) : fileFor(dir, route);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as CapturedPickers, () => undefined);
	if (cached && cached.route === route) return cached;
	const read = async (time: number, probe: boolean, ks: readonly (number | undefined)[] = []): Promise<RawPicker[]> => {
		const env = defaultEnv(origin, { freeze: { ...DEFAULT_FREEZE, time } });
		const { context, page } = await openPage(browser, env, VIEWPORTS[0]!);
		try {
			await loadPage(page, new URL(route, origin).href);
			await settle(page);
			const pickers = await page.evaluate(readPickers, [time - 150 * 365 * 86_400_000, time + 60 * 365 * 86_400_000] as const);
			const out: RawPicker[] = [...pickers];
			// Probes that use each calendar first, then the buttons beside them (which may change more of the page).
			if (probe)
				for (let i = 0; i < out.length; i++) {
					if (out[i]!.why) continue;
					out[i] = { ...out[i]!, movesFocus: await movesFocus(page, i), remounts: await remounts(page, i) };
				}
			for (let i = 0; i < out.length; i++) {
				const picker = out[i]!;
				if (picker.why || picker.config?.cal) continue;
				const effects = await effectsOf(page, i, picker.config?.mode);
				if (effects.length) out[i] = { ...picker, effects };
			}
			// Each opener on the page as loaded: a pick changes what its trigger (and so its signature) shows.
			for (const [i, opener] of openers.entries()) {
				if (i > 0) {
					await loadPage(page, new URL(route, origin).href);
					await settle(page);
				}
				out.push(...(await openerPickers(page, { ...opener, ...(ks[i] !== undefined ? { k: ks[i] } : {}) }, time, probe)));
			}
			return out;
		} finally {
			await context.close().catch(() => {});
		}
	};
	const pickers = await read(DEFAULT_FREEZE.time, true);
	const ks = openers.map((o) => pickers.find((p) => p.opener?.sig === o.sig && p.opener.nth === o.nth)?.opener?.k);
	const captured: CapturedPickers = { route, at: DEFAULT_FREEZE.time, pickers, later: await read(LATER, false, ks) };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(captured));
	return captured;
}

/**
 * Opens a date picker's trigger on the old page and reads the calendars its layer shows; with `probe`, also picks a day
 * (two in range mode) and records what the trigger then shows and whether the layer stayed open.
 */
async function openerPickers(page: Page, opener: { readonly sig: string; readonly nth: number; readonly k?: number }, time: number, probe: boolean): Promise<RawPicker[]> {
	// Found by its signature, or (at the second clock, where a trigger showing a date relative to today reads otherwise)
	// as the k-th element of its tag and data-slot.
	const k = await page.evaluate(({ sig, nth, k }) => {
		const sigOf = (el: HTMLElement) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
		const prefix = sig.split('|').slice(0, 2).join('|');
		const kin = [...document.body.querySelectorAll<HTMLElement>('*')].filter((e) => sigOf(e).startsWith(`${prefix}|`));
		let n = 0;
		let el = kin.find((e) => sigOf(e) === sig && n++ === nth);
		if (!el && k !== undefined) el = kin[k];
		if (!el) return -1;
		el.setAttribute('data-mm-opener', '');
		return kin.indexOf(el);
	}, opener);
	if (k < 0) return [];
	const trigger = page.locator('[data-mm-opener]');
	try {
		await trigger.scrollIntoViewIfNeeded().catch(() => {});
		await trigger.click({ timeout: 2000 });
		await page.waitForTimeout(500);
		const before = await trigger.evaluate((e) => e.innerHTML);
		const all = await page.evaluate(readPickers, [time - 150 * 365 * 86_400_000, time + 60 * 365 * 86_400_000] as const);
		const own = all.filter((p) => p.inLayer);
		if (!probe || own.length !== 1 || own[0]!.why) return own.map((p) => ({ ...p, opener: { sig: opener.sig, nth: opener.nth, k, before, picks: [] } }));
		const picks: { days: Triple[]; html: string; open: boolean }[] = [];
		const count = own[0]!.config?.mode === 'range' ? 2 : 1;
		for (let k = 0; k < count; k++) {
			const day = await page.evaluate((k) => {
				const root = (window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots().find((r) => r.closest('[data-radix-popper-content-wrapper], [data-base-ui-portal]'));
				const cells = [...(root?.querySelectorAll<HTMLElement>('td[role="gridcell"]:not([data-outside]):not([data-selected]):not([data-disabled])') ?? [])];
				const cell = cells[Math.min(cells.length - 1, 4 + k * 5)];
				const button = cell?.querySelector<HTMLButtonElement>('button:not([disabled])');
				const iso = cell?.getAttribute('data-day');
				if (!button || !iso) return undefined;
				button.click();
				const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
				return [y, m - 1, d] as [number, number, number];
			}, k);
			if (!day) break;
			await page.waitForTimeout(400);
			const html = await trigger.evaluate((e) => e.innerHTML);
			const open = await trigger.evaluate((e) => e.getAttribute('aria-expanded') === 'true' || e.getAttribute('data-state') === 'open');
			picks.push({ days: [...(picks.at(-1)?.days ?? []), day], html, open });
			if (!open) break;
		}
		return [{ ...own[0]!, opener: { sig: opener.sig, nth: opener.nth, k, before, picks } }];
	} catch {
		return [];
	} finally {
		await page.keyboard.press('Escape').catch(() => {});
		await page.waitForTimeout(300);
		await page.evaluate(() => document.querySelector('[data-mm-opener]')?.removeAttribute('data-mm-opener')).catch(() => {});
	}
}

async function movesFocus(page: Page, index: number): Promise<boolean> {
	const marked = await page.evaluate((i) => {
		const root = (window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots()[i];
		const button = root?.querySelector('td > button[tabindex="0"]:not([disabled])');
		if (!button) return false;
		button.setAttribute('data-mm-probe', '');
		return true;
	}, index);
	if (!marked) return false;
	try {
		await page.focus('[data-mm-probe]');
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(150);
		return await page.evaluate(() => {
			const probe = document.querySelector('[data-mm-probe]');
			const active = document.activeElement;
			return Boolean(active && probe && active !== probe && active.tagName === 'BUTTON' && active.parentElement?.getAttribute('role') === 'gridcell');
		});
	} finally {
		await page.evaluate(() => document.querySelector('[data-mm-probe]')?.removeAttribute('data-mm-probe')).catch(() => {});
	}
}

/** Whether choosing a day and moving a month replace the calendar's markup (its wrapper mounting it again). */
async function remounts(page: Page, index: number): Promise<{ select: boolean; month: boolean }> {
	const use = (selector: string) =>
		page.evaluate(
			([i, selector]) => {
				const target = (window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots()[Number(i)]?.querySelector<HTMLElement>(selector);
				if (!target) return false;
				(window as unknown as { __mmUsed?: HTMLElement }).__mmUsed = target;
				target.click();
				return true;
			},
			[String(index), selector] as const,
		);
	const replaced = () => page.evaluate(() => (window as unknown as { __mmUsed?: HTMLElement }).__mmUsed?.isConnected === false);
	let select = false;
	let month = false;
	if (await use('td[role="gridcell"]:not([data-outside]):not([data-selected]) > button:not([disabled])')) {
		await page.waitForTimeout(150);
		select = await replaced();
	}
	if (await use('nav > button:last-child:not([aria-disabled="true"])')) {
		await page.waitForTimeout(150);
		month = await replaced();
	}
	return { select, month };
}

/**
 * The buttons beside a calendar (within two levels of its root) that set its selection or month when clicked, as a
 * presets row does: each clicked once, in order, with what the calendar showed after.
 */
async function effectsOf(page: Page, index: number, mode: DayPickerConfig['mode']): Promise<RawEffect[]> {
	const count = await page.evaluate((i) => {
		const root = (window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots()[i];
		let scope = root?.parentElement;
		for (let depth = 0; scope && scope !== document.body && depth < 2; depth++, scope = scope.parentElement) {
			const roots = (window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots();
			const buttons = [...scope.querySelectorAll('button')].filter((b) => !roots.some((r) => r.contains(b)) && !b.disabled && !b.hasAttribute('aria-haspopup') && !b.hasAttribute('aria-expanded') && !b.closest('form') && b.getBoundingClientRect().width > 0);
			if (!buttons.length) continue;
			buttons.forEach((b, k) => b.setAttribute('data-mm-effect', `${i}-${k}`));
			return buttons.length;
		}
		return 0;
	}, index);
	const effects: RawEffect[] = [];
	// What the calendar shows: React's fiber on a DOM node goes stale across updates, its markup does not.
	const state = () =>
		page.evaluate((i) => {
			const root = (window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots()[i];
			if (!root) return 'gone';
			const selected = [...new Set([...root.querySelectorAll('td[data-selected]')].map((t) => t.getAttribute('data-day') ?? ''))];
			const month = root.querySelector('td[role="gridcell"]:not([data-outside])')?.getAttribute('data-day') ?? '';
			return JSON.stringify({ selected, month });
		}, index);
	const triple = (iso: string): Triple | undefined => {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
		return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : undefined;
	};
	let before = await state().catch(() => 'gone');
	for (let k = 0; k < count && before !== 'gone'; k++) {
		const button = `[data-mm-effect="${index}-${k}"]`;
		const where = await page.evaluate((selector) => {
			const el = document.querySelector<HTMLElement>(selector)!;
			const sigOf = (e: HTMLElement) => `${e.tagName.toLowerCase()}|${e.getAttribute('data-slot') ?? ''}|${(e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			let nth = 0;
			for (const e of document.body.querySelectorAll<HTMLElement>('*')) {
				if (e === el) break;
				if (sigOf(e) === sigOf(el)) nth++;
			}
			return { sig: sigOf(el), nth };
		}, button);
		// The calendar is moved two months back first, so a button that also sets the month (today's, or one near it) shows it.
		for (let step = 0; step < 2; step++) {
			await page
				.evaluate((i) => {
					const prev = (window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots()[i]?.querySelector('nav')?.querySelectorAll('button')[0] as HTMLButtonElement | undefined;
					if (prev && prev.getAttribute('aria-disabled') !== 'true') prev.click();
				}, index)
				.catch(() => {});
			await page.waitForTimeout(60);
		}
		await page.waitForTimeout(100);
		before = await state().catch(() => 'gone');
		if (before === 'gone') break;
		await page.click(button, { timeout: 2000 }).catch(() => {});
		await page.waitForTimeout(150);
		const after = await state().catch(() => 'gone');
		if (after === 'gone') break;
		if (after !== before) {
			const now = JSON.parse(after) as { selected: string[]; month: string };
			const was = JSON.parse(before) as { selected: string[]; month: string };
			const selected = now.selected.map(triple);
			const month = triple(now.month);
			if (selected.some((t) => !t) || !month) break;
			const list = selected as Triple[];
			effects.push({ ...where, ...(now.selected.join() !== was.selected.join() ? { selected: list.length > 2 && mode === 'range' ? [list[0]!, list[list.length - 1]!] : list } : {}), ...(now.month.slice(0, 7) !== was.month.slice(0, 7) ? { month: [month[0], month[1], 1] as const } : {}) });
		}
		before = after;
	}
	return effects;
}

/** Runs in the old page: each DayPicker root's props, locale and matchers, from the context DayPicker provides. */
function readPickers([from, to]: readonly [number, number]): RawPicker[] {
	type Fiber = { return: Fiber | null; type: unknown; memoizedProps?: { value?: Record<string, unknown> } };
	type Lib = Record<string, (...args: unknown[]) => unknown> & { options: Record<string, unknown>; overrides?: unknown };
	type Props = Record<string, unknown>;
	const DAY = 86_400_000;
	const sigOf = (el: HTMLElement) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const triple = (d: unknown): [number, number, number] | undefined => (d instanceof Date && !Number.isNaN(d.getTime()) ? [d.getFullYear(), d.getMonth(), d.getDate()] : undefined);
	// A DayPicker's root: the first host element under its context provider. Found again on each use, since a wrapper
	// that mounts the calendar again replaces it.
	const contextOf = (el: HTMLElement): Record<string, unknown> | undefined => {
		const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
		if (!key) return undefined;
		let fiber = ((el as unknown as Record<string, Fiber>)[key] as Fiber).return;
		while (fiber) {
			if (typeof fiber.type === 'string') return undefined;
			const value = fiber.memoizedProps?.value;
			if (value && typeof value === 'object' && 'dayPickerProps' in value && 'months' in value) return value;
			fiber = fiber.return;
		}
		return undefined;
	};
	(window as unknown as { __mmPickerRoots: () => HTMLElement[] }).__mmPickerRoots = () => [...document.body.querySelectorAll<HTMLElement>('*')].filter((el) => contextOf(el));
	const all = [...document.body.querySelectorAll<HTMLElement>('*')];
	const out: RawPicker[] = [];
	for (const el of all) {
		const ctx = contextOf(el);
		if (!ctx) continue;
		const sig = sigOf(el);
		// A calendar inside a layer (a date picker's popover) is found again by its place in the layer, as the converter
		// renders the layer apart from the page.
		const layer = el.closest('[data-radix-popper-content-wrapper], [data-base-ui-portal]');
		let nth = 0;
		for (const e of layer ? [...layer.querySelectorAll<HTMLElement>('*')] : all) {
			if (e === el) break;
			if (sigOf(e) === sig) nth++;
		}
		const p = ctx.dayPickerProps as Props;
		const months = ctx.months as { date: Date; weeks: { days: { dateLib: Lib }[] }[] }[];
		const lib = months[0]?.weeks[0]?.days[0]?.dateLib;
		const fail = (why: string) => out.push({ sig, nth, why, ...(layer ? { inLayer: true as const } : {}) });
		if (!lib) {
			fail('no days shown');
			continue;
		}
		const jalali = lib.getYear!(new Date(2025, 5, 12)) === 1404;
		const unsupported = [
			p.timeZone && 'timeZone',
			p.broadcastCalendar && 'broadcastCalendar',
			p.navLayout && 'navLayout',
			p.labels && 'labels',
			(p.styles || p.modifiersStyles) && 'styles',
			p.animate && 'animate',
			lib.overrides && !jalali && 'a custom dateLib',
			p.formatters && Object.keys(p.formatters as object).some((k) => k !== 'formatMonthDropdown') && `formatters ${Object.keys(p.formatters as object).join(', ')}`,
			p.captionLayout && !['label', 'dropdown', 'dropdown-months', 'dropdown-years'].includes(p.captionLayout as string) && `captionLayout ${String(p.captionLayout)}`,
		].filter(Boolean);
		if (unsupported.length) {
			fail(`uses ${unsupported.join(', ')}`);
			continue;
		}
		const options = lib.options;
		const locale = options.locale as { code?: string; options?: { weekStartsOn?: number; firstWeekContainsDate?: number }; localize: { month: (i: number, o: object) => string; day: (i: number, o: object) => string; ordinalNumber: (n: number, o: object) => string }; formatLong: { date: (o: object) => string } };
		const table = (fn: (i: number, o: object) => string, count: number, widths: readonly string[]) => {
			const t: Record<string, string[]> = {};
			for (const width of widths) for (const context of ['formatting', 'standalone']) t[`${width}:${context}`] = Array.from({ length: count }, (_, i) => fn(i, { width, context }));
			return t;
		};
		const loc: LocaleTable = {
			ws: (options.weekStartsOn as number | undefined) ?? locale.options?.weekStartsOn ?? 0,
			fwcd: (options.firstWeekContainsDate as number | undefined) ?? locale.options?.firstWeekContainsDate ?? 1,
			full: locale.formatLong.date({ width: 'full' }),
			months: table(locale.localize.month, 12, ['narrow', 'abbreviated', 'wide']),
			days: table(locale.localize.day, 7, ['narrow', 'short', 'abbreviated', 'wide']),
			ord: Array.from({ length: 31 }, (_, i) => locale.localize.ordinalNumber(i + 1, { unit: 'date' })),
			mord: Array.from({ length: 12 }, (_, i) => locale.localize.ordinalNumber(i + 1, { unit: 'month' })),
		};
		const numerals = options.numerals as string | undefined;
		const digits = numerals && numerals !== 'latn' ? Array.from({ length: 10 }, (_, i) => (lib as unknown as { replaceDigits: (s: string) => string }).replaceDigits(String(i))) : undefined;
		const formatters = ctx.formatters as Record<string, (d: Date, l: unknown) => string>;
		let monthLabels: string[] | undefined;
		if ((p.formatters as Props | undefined)?.formatMonthDropdown) {
			const of = (year: number) => Array.from({ length: 12 }, (_, i) => formatters.formatMonthDropdown!(lib.newDate!(year, i, 1) as Date, lib));
			const a = of(lib.getYear!(new Date()) as number);
			const b = of((lib.getYear!(new Date()) as number) - 7);
			if (a.join('\n') !== b.join('\n')) {
				fail('a month dropdown formatter that changes with the year');
				continue;
			}
			monthLabels = a;
		}
		// shadcn's CalendarDayButton writes the day as toLocaleDateString of the locale it was given, or of none.
		const button = el.querySelector('td[role="gridcell"] > button');
		const shown = button?.getAttribute('data-day');
		let code: string | null = null;
		if (shown != null) {
			const cell = button!.parentElement!;
			const day = months.flatMap((m) => m.weeks.flatMap((w) => w.days)).find((d) => (lib.format!((d as unknown as { date: Date }).date, 'yyyy-MM-dd') as string) === cell.getAttribute('data-day')) as unknown as { date: Date } | undefined;
			const prop = (p.locale as { code?: string } | undefined)?.code;
			if (day && day.date.toLocaleDateString() === shown) code = null;
			else if (day && prop && day.date.toLocaleDateString(prop) === shown) code = prop;
			else {
				fail(`a day button's data-day (${shown}) that is no toLocaleDateString`);
				continue;
			}
		}
		const classNames = ctx.classNames as Record<string, string>;
		const keep = ['day', 'focused', 'disabled', 'hidden', 'outside', 'today', 'selected', 'range_start', 'range_end', 'range_middle'];
		const cls: Record<string, string> = {};
		for (const k of keep) if (classNames[k]) cls[k] = classNames[k]!;
		// Matchers: days of the week as they are; anything else as the spans of days it matches over the window.
		const dateOf = (n: number) => {
			const u = new Date(n * DAY);
			return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
		};
		const diff = (a: Date, b: Date) => lib.differenceInCalendarDays!(a, b) as number;
		const one = (date: Date, m: unknown): boolean => {
			if (typeof m === 'boolean') return m;
			if (m instanceof Date) return lib.isSameDay!(date, m) as boolean;
			if (Array.isArray(m) && m.every((x) => x instanceof Date)) return m.includes(date);
			if (m && typeof m === 'object') {
				const o = m as Record<string, Date | undefined>;
				if ('from' in o) {
					let { from: a, to: b } = o;
					if (a && b) {
						if (diff(b, a) < 0) [a, b] = [b, a];
						return diff(date, a) >= 0 && diff(b, date) >= 0;
					}
					if (b) return lib.isSameDay!(b, date) as boolean;
					if (a) return lib.isSameDay!(a, date) as boolean;
					return false;
				}
				if ('before' in o && 'after' in o) {
					const before = diff(o.before!, date) > 0;
					const after = diff(o.after!, date) < 0;
					return lib.isAfter!(o.before, o.after) ? after && before : before || after;
				}
				if ('after' in o) return diff(date, o.after!) > 0;
				if ('before' in o) return diff(o.before!, date) > 0;
			}
			if (typeof m === 'function') return Boolean((m as (d: Date) => unknown)(date));
			return false;
		};
		const first = Math.round(from / DAY);
		const last = Math.round(to / DAY);
		const sample = (m: unknown): RawMatcher | undefined => {
			if (m === false || m == null) return undefined;
			if (m === true) return true;
			if (typeof m === 'object' && 'dayOfWeek' in (m as object)) {
				const dow = (m as { dayOfWeek: number | number[] }).dayOfWeek;
				return { dow: Array.isArray(dow) ? dow : [dow] };
			}
			const spans: [number | null, number | null][] = [];
			let open: number | null | undefined;
			for (let n = first; n <= last; n++) {
				const hit = one(dateOf(n), m);
				if (hit && open === undefined) open = n === first ? null : n;
				else if (!hit && open !== undefined) {
					spans.push([open, n - 1]);
					open = undefined;
				}
			}
			if (open !== undefined) spans.push([open, null]);
			return { spans };
		};
		const matchers = (value: unknown) => (value === undefined ? undefined : (Array.isArray(value) ? value : [value]).map(sample).filter((m): m is RawMatcher => m !== undefined));
		const selected = ctx.selected;
		const mode = p.mode as DayPickerConfig['mode'];
		const selectedDates: (Triple | null)[] | undefined =
			mode === 'range' ? (selected && typeof selected === 'object' && 'from' in selected ? [triple((selected as { from?: Date }).from) ?? null, triple((selected as { to?: Date }).to) ?? null] : undefined) : mode === 'multiple' ? ((selected as Date[] | undefined) ?? []).map((d) => triple(d)!).filter(Boolean) : mode === 'single' ? (selected ? [triple(selected)!] : []) : undefined;
		const start = p.startMonth ?? p.fromMonth ?? (p.fromYear ? lib.newDate!(p.fromYear, 0, 1) : undefined);
		const end = p.endMonth ?? p.toMonth ?? (p.toYear ? lib.newDate!(p.toYear, 11, 31) : undefined);
		const dates: RawDates = {
			...(triple(start) ? { start: triple(start)! } : {}),
			...(triple(end) ? { end: triple(end)! } : {}),
			...(triple(p.endMonth) ? { endProp: triple(p.endMonth)! } : {}),
			...(triple(p.month || p.defaultMonth) ? { month: triple(p.month || p.defaultMonth)! } : {}),
			...(triple(p.today) ? { today: triple(p.today)! } : {}),
			...(selectedDates ? { selected: selectedDates } : {}),
		};
		const custom = p.modifiers as Record<string, unknown> | undefined;
		out.push({
			sig,
			nth,
			...(layer ? { inLayer: true as const } : {}),
			config: {
				...(jalali ? { cal: 'jalali' as const } : {}),
				loc,
				...(digits ? { digits } : {}),
				code,
				...(mode ? { mode } : {}),
				interactive: mode !== undefined || p.onDayClick !== undefined,
				...(p.required ? { required: true } : {}),
				...(typeof p.min === 'number' ? { min: p.min } : {}),
				...(typeof p.max === 'number' ? { max: p.max } : {}),
				n: typeof p.numberOfMonths === 'number' ? p.numberOfMonths : 1,
				caption: ((p.captionLayout as string | undefined) ?? 'label') as DayPickerConfig['caption'],
				...(p.showOutsideDays ? { outside: true } : {}),
				...(p.fixedWeeks ? { fixed: true } : {}),
				...(p.showWeekNumber ? { weekNumbers: true } : {}),
				...(p.ISOWeek ? { iso: true } : {}),
				...(p.disableNavigation ? { noNav: true } : {}),
				...(p.reverseMonths ? { reverse: true } : {}),
				...(p.pagedNavigation ? { paged: true } : {}),
				...(p.dir === 'rtl' ? { rtl: true } : {}),
				...(p.excludeDisabled ? { excludeDisabled: true } : {}),
				cls,
				...(p.modifiersClassNames ? { modCls: p.modifiersClassNames as Record<string, string> } : {}),
				...(monthLabels ? { monthLabels } : {}),
				...(shown != null ? { shadcn: true } : {}),
			},
			dates,
			matchers: {
				...(p.disabled !== undefined ? { disabled: matchers(p.disabled)! } : {}),
				...(p.hidden !== undefined ? { hidden: matchers(p.hidden)! } : {}),
				...(custom ? { modifiers: Object.entries(custom).map(([name, value]) => [name, matchers(value) ?? []] as const) } : {}),
			},
			ui: { ...classNames },
		});
	}
	return out;
}

// --- Dates read at two clocks ----------------------------------------------------------------------------------

const DAY = 86_400_000;
const dayNumber = ([y, m, d]: Triple) => Math.round(Date.UTC(y, m, d) / DAY);
const tripleOf = (n: number): Triple => {
	const date = new Date(n * DAY);
	return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
};
const todayAt = (time: number): Triple => tripleOf(Math.floor(time / DAY));

/** The date both clocks agree on: fixed, a number of days from today, or fixed or relative per component; else undefined. */
export function whenOf(a: Triple, b: Triple, at: number = DEFAULT_FREEZE.time, later: number = LATER): When | undefined {
	const ta = todayAt(at);
	const tb = todayAt(later);
	if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) return { y: a[0], m: a[1], d: a[2] };
	const offset = dayNumber(a) - dayNumber(ta);
	if (offset === dayNumber(b) - dayNumber(tb)) return { t: offset };
	const part = (i: 0 | 1 | 2): [number, boolean] | undefined => (a[i] === b[i] ? [a[i], false] : a[i] - ta[i] === b[i] - tb[i] ? [a[i] - ta[i], true] : undefined);
	const y = part(0);
	const m = part(1);
	const d = part(2);
	if (!y || !m || !d) return undefined;
	return { y: y[0], m: m[0], d: d[0], ...(y[1] ? { ry: 1 as const } : {}), ...(m[1] ? { rm: 1 as const } : {}), ...(d[1] ? { rd: 1 as const } : {}) };
}

const fixed = (t: Triple): When => ({ y: t[0], m: t[1], d: t[2] });

function pairWhen(a: Triple | undefined, b: Triple | undefined, note: (what: string) => void, what: string): When | undefined {
	if (!a) return undefined;
	const w = b ? whenOf(a, b) : undefined;
	if (!w) note(`${what} (${a.join('-')}) follows the clock in a way the port cannot: kept as on the capture clock`);
	return w ?? fixed(a);
}

function pairMatchers(a: readonly RawMatcher[] | undefined, b: readonly RawMatcher[] | undefined, note: (what: string) => void, what: string): Matcher[] | undefined {
	if (!a) return undefined;
	const out: Matcher[] = [];
	a.forEach((m, i) => {
		if (m === true || 'dow' in m) {
			out.push(m === true ? true : { dow: m.dow });
			return;
		}
		const other = b?.[i];
		const paired = other && other !== true && 'spans' in other && other.spans.length === m.spans.length ? other.spans : undefined;
		if (!paired) note(`${what}: its days change with the clock in a way the port cannot follow; kept as on the capture clock`);
		m.spans.forEach(([from, to], k) => {
			const span: { from?: When; to?: When } = {};
			if (from !== null) span.from = pairWhen(tripleOf(from), paired?.[k]?.[0] != null ? tripleOf(paired[k]![0]!) : undefined, note, what);
			if (to !== null) span.to = pairWhen(tripleOf(to), paired?.[k]?.[1] != null ? tripleOf(paired[k]![1]!) : undefined, note, what);
			out.push(span);
		});
	});
	return out;
}

/** The port's configuration for a calendar, from what it was given at the capture clock and at LATER. */
export function configOf(at: RawPicker, later: RawPicker | undefined, note: (what: string) => void): DayPickerConfig {
	const c = at.config!;
	const d = at.dates ?? {};
	const l = later?.dates ?? {};
	const m = at.matchers ?? {};
	const lm = later?.matchers ?? {};
	const { code, ...rest } = c;
	const start = pairWhen(d.start, l.start, note, 'startMonth');
	const end = pairWhen(d.end, l.end, note, 'endMonth');
	const endProp = pairWhen(d.endProp, l.endProp, note, 'endMonth');
	const month = pairWhen(d.month, l.month, note, 'month');
	const today = pairWhen(d.today, l.today, note, 'today');
	const selected = d.selected?.map((t, i) => (t ? pairWhen(t, l.selected?.[i] ?? undefined, note, 'selected')! : null));
	const disabled = pairMatchers(m.disabled, lm.disabled, note, 'disabled');
	const hidden = pairMatchers(m.hidden, lm.hidden, note, 'hidden');
	const modifiers = m.modifiers?.map(([name, list]) => [name, pairMatchers(list, lm.modifiers?.find(([n]) => n === name)?.[1], note, `modifier ${name}`) ?? []] as const);
	return {
		...rest,
		...(code !== null ? { code } : {}),
		...(start ? { start } : {}),
		...(end ? { end } : {}),
		...(endProp ? { endProp } : {}),
		...(month ? { month } : {}),
		...(today ? { today } : {}),
		...(selected ? { selected } : {}),
		...(disabled ? { disabled } : {}),
		...(hidden ? { hidden } : {}),
		...(modifiers ? { modifiers } : {}),
	};
}

// --- The markup DayPicker rendered, part by part ----------------------------------------------------------------

const classOf = (el: Element) => attr(el, 'class') ?? '';
const is = (ui: Readonly<Record<string, string>>, key: string) => (el: Element) => Boolean(ui[key]) && classOf(el) === ui[key];
const firstText = (el: Element) => childrenOf(el).find(isText) as Text | undefined;

interface Shape {
	readonly months: Element[];
	readonly nav?: Element;
	readonly cells: { readonly td: Element; readonly button?: Element }[][][];
}

function shapeOf(root: Element, ui: Readonly<Record<string, string>>): Shape | undefined {
	const container = elementChildren(root).find(is(ui, 'months'));
	if (!container) return undefined;
	const months = elementChildren(container).filter(is(ui, 'month'));
	const nav = elementChildren(container).find(is(ui, 'nav'));
	const cells = months.map((month) => {
		const table = [...walk(month)].find((e) => e.tagName === 'table');
		const tbody = table && elementChildren(table).find((e) => e.tagName === 'tbody');
		return (tbody ? elementChildren(tbody) : []).map((tr) =>
			elementChildren(tr)
				.filter((td) => attr(td, 'role') === 'gridcell')
				.map((td) => ({ td, ...(elementChildren(td)[0] ? { button: elementChildren(td)[0]! } : {}) })),
		);
	});
	return { months, ...(nav ? { nav } : {}), cells };
}

const CELL_ATTRS = ['class', 'aria-selected', 'aria-label', 'data-day', 'data-month', 'data-selected', 'data-disabled', 'data-hidden', 'data-outside', 'data-focused', 'data-today'] as const;
const BUTTON_ATTRS = ['disabled', 'tabindex', 'aria-label'] as const;
const SHADCN_ATTRS = ['data-day', 'data-selected-single', 'data-range-start', 'data-range-end', 'data-range-middle'] as const;

const cellValues = (d: DayModel): Record<(typeof CELL_ATTRS)[number], string | undefined> => ({ class: d.cls, 'aria-selected': d.ariaSelected, 'aria-label': d.cellLabel, 'data-day': d.iso, 'data-month': d.dataMonth, 'data-selected': d.selected, 'data-disabled': d.disabled, 'data-hidden': d.hidden, 'data-outside': d.outside, 'data-focused': d.focused, 'data-today': d.today });
const buttonValues = (d: DayModel): Record<string, string | undefined> => ({ disabled: d.btnDisabled, tabindex: d.tabindex, 'aria-label': d.label, 'data-day': d.localeDay, 'data-selected-single': d.single, 'data-range-start': d.rangeStart, 'data-range-end': d.rangeEnd, 'data-range-middle': d.rangeMiddle });

/** The first way the port's render of `model` differs from the old page's markup of the calendar, or undefined. */
export function differs(root: Element, ui: Readonly<Record<string, string>>, config: DayPickerConfig, model: DayPickerModel): string | undefined {
	const shape = shapeOf(root, ui);
	if (!shape) return 'no months container';
	if (shape.months.length !== model.months.length) return `${shape.months.length} months shown, the port ${model.months.length}`;
	if (shape.nav) {
		const [prev, next] = elementChildren(shape.nav);
		const pairs: [Element | undefined, string, string | undefined][] = [
			[prev, 'tabindex', model.prevTabindex],
			[prev, 'aria-disabled', model.prevDisabled],
			[next, 'tabindex', model.nextTabindex],
			[next, 'aria-disabled', model.nextDisabled],
		];
		for (const [el, name, want] of pairs) if (el && attr(el, name) !== want) return `nav ${name}: ${attr(el, name)} on the old page, ${want} on the port`;
	}
	for (let m = 0; m < model.months.length; m++) {
		const month = model.months[m]!;
		const el = shape.months[m]!;
		const table = [...walk(el)].find((e) => e.tagName === 'table');
		if (table && attr(table, 'aria-label') !== month.grid) return `grid label ${attr(table, 'aria-label')} vs ${month.grid}`;
		const labels = [...walk(el)].filter(is(ui, 'caption_label'));
		const status = [...walk(el)].find((e) => attr(e, 'role') === 'status');
		if (status && textOf(status) !== month.caption) return `caption ${textOf(status)} vs ${month.caption}`;
		const selects = [...walk(el)].filter((e) => e.tagName === 'select');
		for (const select of selects) {
			const options = elementChildren(select);
			const years = classOf(select).includes(ui.years_dropdown ?? '\0');
			const want = years ? month.yearOptions : month.monthOptions;
			if (options.length !== want.length) return `${options.length} options vs ${want.length}`;
			for (let i = 0; i < want.length; i++) {
				const o = options[i]!;
				const w = want[i]!;
				if (attr(o, 'value') !== w.value || textOf(o) !== w.label || attr(o, 'disabled') !== w.disabled) return `option ${attr(o, 'value')} ${textOf(o)} vs ${w.value} ${w.label}`;
			}
		}
		for (const label of labels) {
			const text = firstText(label)?.value ?? '';
			const dropdownRoot = label.parentNode as Element;
			const select = elementChildren(dropdownRoot).find((e) => e.tagName === 'select');
			if (!select) continue;
			const want = classOf(select).includes(ui.years_dropdown ?? '\0') ? month.yearLabel : month.monthLabel;
			if (text !== want) return `dropdown label ${text} vs ${want}`;
		}
		const rows = shape.cells[m]!;
		if (rows.length !== month.weeks.length) return `${rows.length} weeks in ${month.caption}, the port ${month.weeks.length}`;
		for (let w = 0; w < rows.length; w++) {
			const row = rows[w]!;
			const week = month.weeks[w]!;
			if (row.length !== week.days.length) return `${row.length} days in a week, the port ${week.days.length}`;
			for (let i = 0; i < row.length; i++) {
				const { td, button } = row[i]!;
				const d = week.days[i]!;
				const cell = cellValues(d);
				for (const name of CELL_ATTRS) if (attr(td, name) !== cell[name]) return `${d.iso} ${name}: ${JSON.stringify(attr(td, name))} on the old page, ${JSON.stringify(cell[name])} on the port`;
				if (Boolean(button) !== d.button) return `${d.iso}: a button ${button ? 'on the old page only' : 'on the port only'}`;
				if (button) {
					const values = buttonValues(d);
					for (const name of [...BUTTON_ATTRS, ...(config.shadcn ? SHADCN_ATTRS : [])]) if (attr(button, name) !== values[name]) return `${d.iso} button ${name}: ${JSON.stringify(attr(button, name))} on the old page, ${JSON.stringify(values[name])} on the port`;
					if ((firstText(button)?.value ?? '') !== d.text) return `${d.iso} button text ${firstText(button)?.value} vs ${d.text}`;
				} else if (textOf(td) !== d.text) return `${d.iso} text ${textOf(td)} vs ${d.text}`;
			}
		}
	}
	return undefined;
}

function textOf(el: Element): string {
	return childrenOf(el)
		.map((n) => (isText(n) ? n.value : isElement(n) ? textOf(n) : ''))
		.join('');
}

// --- The template -----------------------------------------------------------------------------------------------

/**
 * The day buttons' attributes beyond DayPicker's and shadcn's own: the same on every button (copied), or present only on
 * the disabled ones (Base UI's Button writes data-disabled), bound to the day's disabled state; anything else is unknown.
 */
function buttonAttributes(shape: Shape, config: DayPickerConfig): { readonly withDisabled: string[] } | string {
	const known = new Set<string>([...BUTTON_ATTRS, ...(config.shadcn ? SHADCN_ATTRS : [])]);
	const buttons = shape.cells.flat(2).flatMap((c) => (c.button ? [c.button] : []));
	const names = new Set(buttons.flatMap((b) => b.attrs.map((a) => a.name)).filter((n) => !known.has(n)));
	const withDisabled: string[] = [];
	for (const name of names) {
		const values = buttons.map((b) => attr(b, name));
		if (values.every((v) => v === values[0])) continue;
		if (buttons.every((b, i) => (attr(b, 'disabled') !== undefined ? values[i] === '' : values[i] === undefined))) withDisabled.push(name);
		else return `day buttons' ${name} that follows nothing the port knows`;
	}
	return { withDisabled };
}

/** The extra element a custom DayButton renders after the day (one shell, its text per weekday and outside), if any. */
function extrasOf(shape: Shape, model: DayPickerModel, shellOf: (el: Element) => string): { readonly table: number[]; readonly texts: string[]; readonly shell: Element } | undefined | 'mixed' {
	const table: (number | undefined)[] = Array.from({ length: 14 }, () => undefined);
	const texts: string[] = [];
	let shell: Element | undefined;
	let any = false;
	let mixed = false;
	shape.cells.forEach((rows, m) =>
		rows.forEach((row, w) =>
			row.forEach(({ button }, i) => {
				if (!button) return;
				const d = model.months[m]!.weeks[w]!.days[i]!;
				const rest = childrenOf(button).filter((n) => n !== firstText(button) && !(isText(n) && !n.value.trim()));
				const slot = weekdayOfIso(d) * 2 + (d.outside ? 1 : 0);
				let index = -1;
				if (rest.length) {
					any = true;
					const el = rest[0]!;
					if (rest.length !== 1 || !isElement(el) || elementChildren(el).length || (shell && shellOf(shell) !== shellOf(el))) {
						mixed = true;
						return;
					}
					shell ??= el;
					const text = textOf(el);
					index = texts.indexOf(text);
					if (index < 0) index = texts.push(text) - 1;
				}
				if (table[slot] !== undefined && table[slot] !== index) mixed = true;
				table[slot] = index;
			}),
		),
	);
	if (!any) return undefined;
	// A grid shows every weekday inside the month, not always outside it: an outside weekday it did not show gets what every
	// outside day it showed got.
	const outside = [...new Set(table.filter((_, i) => i % 2 === 1 && table[i] !== undefined))];
	for (let i = 1; i < 14; i += 2) if (table[i] === undefined && outside.length === 1) table[i] = outside[0];
	if (mixed || table.some((v) => v === undefined) || !shell) return 'mixed';
	return { table: table as number[], texts, shell };
}
const weekdayOfIso = (d: DayModel) => (((d.n + 4) % 7) + 7) % 7;

/**
 * The template of a calendar: DayPicker's structure, each part's static markup from the old page's, bound to the model
 * `m`. It holds no branch and no handler in a row, so Markless can build a month's weeks in the browser: the months shown
 * are written once each, a day's button is always in its cell (hidden where DayPicker renders none), and the calendar's
 * events are handled on its root.
 */
function template(root: Element, ui: Readonly<Record<string, string>>, config: DayPickerConfig, m: string, extra: Element | undefined, withDisabled: readonly string[]): string | undefined {
	const shape = shapeOf(root, ui);
	if (!shape) return undefined;
	const container = elementChildren(root).find(is(ui, 'months'))!;
	const shell = (el: Element, binding: Binding) => emitElement(el, { bind: (x) => (x === el ? binding : undefined) });
	const svg = (button: Element, flag: string) => {
		const chevron = elementChildren(button)[0];
		return chevron ? shell(chevron, { omit: ['disabled'], extra: [`disabled={${m}.${flag}}`] }) : '';
	};
	let nav = '';
	if (shape.nav) {
		const [prev, next] = elementChildren(shape.nav);
		if (!prev || !next) return undefined;
		const button = (el: Element, side: 'prev' | 'next') => shell(el, { omit: ['tabindex', 'aria-disabled'], extra: [`tabindex={${m}.${side}Tabindex}`, `aria-disabled={${m}.${side}Disabled}`], children: svg(el, `${side}SvgDisabled`) });
		nav = shell(shape.nav, { children: button(prev, 'prev') + button(next, 'next') });
	}
	const monthEl = shape.months[0];
	if (!monthEl) return undefined;
	const sample = shape.cells.flat(2).find((c) => c.button) ?? shape.cells.flat(2)[0];
	if (!sample || (config.interactive && !sample.button)) return undefined;
	const extraMarkup = extra ? shell(extra, { omit: ['hidden'], extra: ['hidden={day.extraHidden}'], children: '{day.extraText}' }) : '';
	const buttonMarkup = sample.button ? shell(sample.button, { omit: [...BUTTON_ATTRS, ...(config.shadcn ? SHADCN_ATTRS : []), ...withDisabled, 'hidden'], extra: [`disabled={day.btnDisabled}`, ...withDisabled.map((name) => `${name}={day.btnDisabled}`), `tabindex={day.tabindex}`, `aria-label={day.label}`, ...(config.shadcn ? ['data-day={day.localeDay}', 'data-selected-single={day.single}', 'data-range-start={day.rangeStart}', 'data-range-end={day.rangeEnd}', 'data-range-middle={day.rangeMiddle}'] : []), 'hidden={day.btnHidden}'], children: `{day.text}${extraMarkup}` }) : '';
	const cell = shell(sample.td, { omit: [...CELL_ATTRS], extra: ['class={day.cls}', 'aria-selected={day.ariaSelected}', 'aria-label={day.cellLabel}', 'data-day={day.iso}', 'data-month={day.dataMonth}', 'data-selected={day.selected}', 'data-disabled={day.disabled}', 'data-hidden={day.hidden}', 'data-outside={day.outside}', 'data-focused={day.focused}', 'data-today={day.today}'], children: `${config.interactive ? buttonMarkup : ''}{day.plain}` });
	// Written once per month shown: `month` stands for that month's model.
	const caption = (el: Element, month: string): string | undefined => {
		const parts: string[] = [];
		for (const child of elementChildren(el)) {
			if (is(ui, 'caption_label')(child)) parts.push(shell(child, { children: `{${month}.caption}` }));
			else if (is(ui, 'dropdowns')(child)) {
				const inner: string[] = [];
				for (const part of elementChildren(child)) {
					const select = elementChildren(part).find((e) => e.tagName === 'select');
					if (attr(part, 'role') === 'status') inner.push(shell(part, { children: `{${month}.caption}` }));
					else if (select) {
						const years = classOf(select).includes(ui.years_dropdown ?? '\0');
						const option = elementChildren(select)[0];
						if (!option) return undefined;
						const options = `@for (const o of ${month}.${years ? 'yearOptions' : 'monthOptions'}; key o.key) { ${shell(option, { omit: ['value', 'disabled', 'selected'], extra: ['value={o.value}', 'disabled={o.disabled}', 'selected={o.selected}'], children: '{o.label}' })} }`;
						const label = elementChildren(part).find((e) => e !== select);
						const chevron = label ? elementChildren(label)[0] : undefined;
						inner.push(shell(part, { children: shell(select, { children: options }) + (label ? shell(label, { children: `{${month}.${years ? 'yearLabel' : 'monthLabel'}}${chevron ? emitElement(chevron) : ''}` }) : '') }));
					} else if (elementChildren(part).length === 0) inner.push(shell(part, { children: config.caption === 'dropdown-years' ? `{${month}.monthLabel}` : `{${month}.yearText}` }));
					else return undefined;
				}
				parts.push(shell(child, { children: inner.join('') }));
			} else parts.push(emitElement(child));
		}
		return shell(el, { children: parts.join('') });
	};
	const numberText = (el: Element): string => {
		const kids = elementChildren(el);
		if (kids.length === 1 && kids[0]) return shell(kids[0], { children: '{week.number}' });
		return '{week.number}';
	};
	const grid = (table: Element, month: string): string | undefined => {
		const parts: string[] = [];
		for (const child of elementChildren(table)) {
			if (child.tagName !== 'tbody') {
				parts.push(emitElement(child));
				continue;
			}
			const tr = elementChildren(child)[0];
			if (!tr) return undefined;
			const numberCell = elementChildren(tr).find((e) => attr(e, 'role') !== 'gridcell');
			const numberMarkup = numberCell ? shell(numberCell, { omit: ['aria-label'], extra: ['aria-label={week.numberLabel}'], children: numberText(numberCell) }) : '';
			parts.push(shell(child, { children: `@for (const week of ${month}.weeks; key week.key) { ${shell(tr, { children: `${numberMarkup}@for (const day of week.days; key day.key) { ${cell} }` })} }` }));
		}
		return shell(table, { omit: ['aria-label'], extra: [`aria-label={${month}.grid}`], children: parts.join('') });
	};
	const months: string[] = [];
	for (let k = 0; k < config.n; k++) {
		const month = `${m}.months[${k}]`;
		const parts: string[] = [];
		for (const child of elementChildren(monthEl)) {
			const out = is(ui, 'month_caption')(child) ? caption(child, month) : child.tagName === 'table' ? grid(child, month) : undefined;
			if (out === undefined) return undefined;
			parts.push(out);
		}
		months.push(shell(monthEl, { omit: ['hidden'], extra: [`hidden={${month}.absent}`], children: parts.join('') }));
	}
	const rest = elementChildren(root)
		.filter((e) => e !== container)
		.map((e) => emitElement(e))
		.join('');
	return shell(container, { children: nav + months.join('') }) + rest;
}

/** The locale's names the calendar's formats read: the full date pattern's, captions' ("LLLL y"), weekdays' ("cccc", "cccccc"). */
export function pruneLocale(loc: LocaleTable, keep = ''): LocaleTable {
	// `keep`: a pattern the page formats with besides DayPicker's own (a date picker's trigger label).
	const tokens = `${loc.full} LLLL cccc cccccc ${keep.replace(/P{2,3}/g, loc.full)}`.replace(/'(''|[^'])*'/g, '').match(/([A-Za-z])\1*o?/g) ?? [];
	const months = new Set<string>();
	const days = new Set<string>();
	let ord = false;
	let mord = false;
	for (const t of tokens) {
		const width = (n: number, short: boolean) => (n === 3 ? 'abbreviated' : n === 5 ? 'narrow' : n === 6 && short ? 'short' : n <= 3 ? 'abbreviated' : 'wide');
		if (t === 'do') ord = true;
		else if (t === 'Mo' || t === 'Lo') mord = true;
		else if (/^M{3,}$/.test(t)) months.add(`${width(t.length, false)}:formatting`);
		else if (/^L{3,}$/.test(t)) months.add(`${width(t.length, false)}:standalone`);
		else if (/^E+$/.test(t)) days.add(`${width(t.length, true)}:formatting`);
		else if (/^c{3,}$/.test(t)) days.add(`${width(t.length, true)}:standalone`);
	}
	const pick = (table: Readonly<Record<string, readonly string[]>>, keys: Set<string>) => Object.fromEntries(Object.entries(table).filter(([k]) => keys.has(k)));
	return { ws: loc.ws, fwcd: loc.fwcd, full: loc.full, months: pick(loc.months, months), days: pick(loc.days, days), ord: ord ? loc.ord : [], ...(mord && loc.mord ? { mord: loc.mord } : {}) };
}

/** Where the calendars' configurations are written, under the app's lib/parts/, and the names they are exported by. */
export const CONFIGS_MODULE = 'day-picker-configs.ts';
export const CONFIG_PREFIX = 'dpc_';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10);

// --- The plan ------------------------------------------------------------------------------------------------------

/**
 * Each DayPicker on Markless state: the root declares the calendar's configuration, a state() view and a computed()
 * model, renders the template from the model, and applies what the part dispatches (`mmdaypicker`).
 */
export class DayPickerPlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;
	private readonly configs = new Map<string, DayPickerConfig>();
	readonly notes: string[] = [];

	private configName(config: DayPickerConfig): string {
		const name = `${CONFIG_PREFIX}${hash(config)}`;
		this.configs.set(name, config);
		return name;
	}

	/** The module of every calendar's configuration, its locale and class tables shared by the calendars that use the same. */
	configsModule(): string {
		const tables = new Map<string, string>();
		const table = (prefix: string, value: unknown) => {
			const name = `${prefix}${hash(value)}`;
			tables.set(name, `const ${name} = ${JSON.stringify(value)};`);
			return name;
		};
		const exports = [...this.configs].sort(([a], [b]) => a.localeCompare(b)).map(([name, { loc, cls, ...own }]) => {
			const l = table('loc_', loc);
			const k = table('cls_', cls);
			return `export const ${name}: DayPickerConfig = { ...${JSON.stringify(own)}, loc: ${l}, cls: ${k} };`;
		});
		return `// Generated by markless-migrate convert: each react-day-picker calendar's configuration, read from the old page; change the converter, not this file.\nimport type { DayPickerConfig } from './day-picker.ts';\n\n${[...tables.values()].join('\n')}\n\n${exports.join('\n')}\n`;
	}

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	handles(el: Element): boolean {
		return this.bindings.has(el);
	}

	add(route: string, captured: CapturedPickers, locate: (sig: string, nth: number) => Element | undefined): number {
		let count = 0;
		captured.pickers.forEach((raw, i) => {
			// A calendar in a layer (a date picker's popover) is bound as its layer is rendered (`layer`).
			if (raw.inLayer) return;
			const note = (what: string) => this.notes.push(`${route} calendar ${i + 1}: ${what}`);
			if (raw.why || !raw.config || !raw.ui) {
				note(`not ported: ${raw.why ?? 'nothing read'}`);
				return;
			}
			const root = locate(raw.sig, raw.nth);
			if (!root) {
				note('not found in the converted page');
				return;
			}
			const k = this.n++;
			const v = `dp${k}`;
			const planned = this.planOne(route, captured, i, root, note, k, v, [`let ${v} = state(dayPickerView(CONFIG));`]);
			if (!planned) return;
			for (const [e, effect] of (raw.effects ?? []).entries()) {
				const button = locate(effect.sig, effect.nth);
				const paired = captured.later[i]?.effects?.[e];
				if (!button || !paired || paired.sig !== effect.sig) {
					note(`a button beside the calendar (${effect.sig}) set it, but not the same way on the second clock: left as it is`);
					continue;
				}
				// A month that is the selected day's own at both clocks follows the selection.
				const ownMonth = (sel: readonly (Triple | null)[] | undefined, month: Triple | undefined) => Boolean(sel?.[0] && month && sel[0][0] === month[0] && sel[0][1] === month[1]);
				const follows = ownMonth(effect.selected, effect.month) && ownMonth(paired.selected, paired.month);
				const set: DayPickerEffect = {
					...(effect.selected ? { s: effect.selected.map((t, k) => (t ? pairWhen(t, paired.selected?.[k] ?? undefined, note, 'a preset selection')! : null)) } : {}),
					...(follows ? { m: 'selected' as const } : effect.month ? { m: pairWhen(effect.month, paired.month, note, 'a preset month')! } : {}),
				};
				this.bindings.set(button, mergeBindings(this.bindings.get(button), { declare: planned.declare, extra: [`onClick={() => (${v} = dayPickerSet(${planned.c}, ${v}, ${JSON.stringify(set)}, ${planned.id}))}`] })!);
			}
			this.bindings.set(root, planned.root);
			count++;
		});
		return count;
	}

	/** The binding of one calendar's root, rendered from the view `v` (`declare` makes it, CONFIG standing for its configuration). */
	private planOne(route: string, captured: CapturedPickers, i: number, root: Element, note: (what: string) => void, k: number, v: string, make: readonly string[], closes = false, keep = ''): { root: Binding; declare: string[]; c: string; id: string; config: DayPickerConfig } | undefined {
		const raw = captured.pickers[i]!;
		const read = configOf(raw, captured.later[i], note);
		const config: DayPickerConfig = { ...read, loc: pruneLocale(read.loc, keep) };
		const at = Math.floor(captured.at / DAY);
		const model = dayPickerModel(config, dayPickerView(config, at));
		const off = differs(root, raw.ui!, config, model);
		if (off) {
			note(`not ported: the port's render differs from the old page's: ${off}`);
			return undefined;
		}
		const shape = shapeOf(root, raw.ui!)!;
		const learned = extrasOf(shape, model, (el) => emitElement(el, { bind: (x) => (x === el ? { children: '' } : undefined) }));
		if (learned === 'mixed') {
			note('not ported: a custom day button whose extra content is not one element per weekday');
			return undefined;
		}
		const behaviour: Partial<DayPickerConfig> = { ...(raw.movesFocus ? { focusDays: true } : {}), ...(raw.remounts?.select ? { remountSelect: true } : {}), ...(raw.remounts?.month ? { remountMonth: true } : {}) };
		const full: DayPickerConfig = { ...config, ...behaviour, ...(learned ? { extras: learned.table, extraTexts: learned.texts } : {}) };
		const m = `dpm${k}`;
		const c = this.configName(full);
		// Names the calendar's writes not yet applied (dayPickerEvent): unique on the page and across pages.
		const id = JSON.stringify(`${route}#${k}`);
		const attrs = buttonAttributes(shape, full);
		if (typeof attrs === 'string') {
			note(`not ported: ${attrs}`);
			return undefined;
		}
		const markup = template(root, raw.ui!, full, m, learned?.shell, attrs.withDisabled);
		if (markup === undefined) {
			note('not ported: markup the template does not know');
			return undefined;
		}
		// The configuration is an import (CONFIGS_MODULE): Markless inlines a body const into every closure that reads it.
		const declare = [...make.map((line) => line.replaceAll('CONFIG', c)), `const ${m} = computed(() => dayPickerModel(${c}, ${v}));`];
		// A date picker that sets its popover closed on select closes its layer when a day is picked.
		const apply = closes ? `if (next) { const picked = next.s !== ${v}.s; ${v} = next; if (picked && event.type === 'click') dayPickerClose(); }` : `if (next) ${v} = next;`;
		return {
			declare,
			c,
			id,
			config: full,
			root: {
				declare,
				extra: [
					'data-mm-day-picker=""',
					...['onClick', 'onFocusIn', 'onFocusOut', 'onKeyDown', 'onChange'].map((on) => `${on}={(event) => { const next = dayPickerEvent(${c}, ${v}, event, ${id}); ${on === 'onClick' ? apply : 'if (next) ' + v + ' = next;'} }}`),
					// Once the page is idle: today's date where the page shows it, written even when it is the same view, so Markless
					// resumes and draws the calendar then and not on its first use.
					`onIdle={() => { ${v} = dayPickerWake(${c}, ${v}, ${id}); }}`,
				],
				children: markup,
			},
		};
	}

	private readonly shared: string[] = [];
	private readonly openers = new Map<string, { k: number; c: string; config: DayPickerConfig; opener: LayerOpener; label: ReturnType<typeof labelOf> }>();

	/**
	 * The calendar in a layer a control opens (a date picker's popover): bound inside the layer, on a view shared at page
	 * scope with what its opener shows (`opener`). Undefined when the layer holds no captured calendar.
	 */
	layer(route: string, captured: CapturedPickers, reveal: { readonly sig?: string; readonly nth?: number }, kept: readonly Element[]): { readonly bind: (el: Element) => Binding | undefined; readonly declare: readonly string[] } | undefined {
		const i = captured.pickers.findIndex((p) => p.inLayer && p.opener && p.opener.sig === reveal.sig && p.opener.nth === (reveal.nth ?? 0));
		const raw = captured.pickers[i];
		if (!raw?.opener) return undefined;
		const note = (what: string) => this.notes.push(`${route} date picker ${raw.opener!.sig}: ${what}`);
		if (raw.why || !raw.config || !raw.ui) {
			note(`not ported: ${raw.why ?? 'nothing read'}`);
			return undefined;
		}
		const inside = kept.flatMap((top) => [...walk(top)].slice(1));
		const sigOf = (el: Element) => `${el.tagName}|${attr(el, 'data-slot') ?? ''}|${textContent(el).trim().replace(/\s+/g, ' ').slice(0, 60)}`;
		const root = inside.filter((el) => sigOf(el) === raw.sig)[raw.nth];
		if (!root) {
			// A layer's other nodes (focus guards beside the popover) are rendered as layers of their own.
			const calendars = inside.filter((el) => attr(el, 'data-slot') === 'calendar').map(sigOf);
			if (calendars.length) note(`not found in its layer (${raw.sig.slice(0, 50)} #${raw.nth}; the layer has ${calendars.map((c) => c.slice(0, 50)).join(', ')})`);
			return undefined;
		}
		const key = `${route}|${raw.opener.sig}#${raw.opener.nth}`;
		const known = this.openers.get(key);
		const k = known?.k ?? this.n++;
		const holder = `dps${k}`;
		const v = `${holder}.v`;
		const closes = raw.opener.picks.some((p) => !p.open);
		// The trigger's label is learned on the whole locale, and its pattern's names are kept in the calendar's.
		const label = known?.label ?? labelOf(raw.opener, configOf(raw, captured.later[i], () => {}));
		const planned = this.planOne(route, captured, i, root, note, k, v, [`const ${holder} = dpShared${k}();`], closes, label?.pattern ?? '');
		if (!planned) return undefined;
		if (!known) {
			this.shared.push(`export const dpShared${k} = shared(() => {\n\tconst view = state({ v: dayPickerView(${planned.c}) });\n\treturn view;\n});`);
			this.openers.set(key, { k, c: planned.c, config: planned.config, opener: raw.opener, label });
		}
		return { bind: (el) => (el === root ? planned.root : undefined), declare: planned.declare };
	}

	/** The module of the views shared between a date picker's layer and its opener, at page scope. */
	sharedModule(configsPath: string, partsPath: string): string | undefined {
		if (!this.shared.length) return undefined;
		const configs = [...new Set(this.shared.join('\n').match(new RegExp(`\\b${CONFIG_PREFIX}[0-9a-f]{10}\\b`, 'g')) ?? [])];
		return `// Generated by markless-migrate convert: each date picker's calendar view, shared by its popover and its trigger; change the converter, not this file.\nimport { shared, state } from '@markless/core';\nimport { dayPickerView } from '${partsPath}/day-picker.ts';\nimport { ${configs.join(', ')} } from '${configsPath}';\n\n${this.shared.join('\n')}\n`;
	}

	/**
	 * What a date picker's trigger shows, from the shared view: the old page's pattern (learned from what it showed for the
	 * days picked on it) where a day is picked, its own children before. Undefined when the pattern is not one of date-fns's
	 * this knows, or nothing changed.
	 */
	opener(route: string, trigger: Element, opener: { readonly sig: string; readonly nth: number }): Binding | undefined {
		const known = this.openers.get(`${route}|${opener.sig}#${opener.nth}`);
		if (!known) return undefined;
		const { k, c } = known;
		const learned = known.label;
		if (!learned) {
			this.notes.push(`${route} date picker ${opener.sig}: its label's pattern is not one this knows`);
			return undefined;
		}
		const holder = `dps${k}`;
		const label = `dpl${k}`;
		const binding: Binding = {
			declare: [`const ${holder} = dpShared${k}();`, `const ${label} = computed(() => dayPickerLabel(${c}, ${holder}.v, ${JSON.stringify(learned.pattern)}, ${JSON.stringify(learned.join)}));`],
			children: `${learned.prefix}@if (${label} !== undefined) { <>{${label}}</> } @else { <>${learned.rest}</> }`,
		};
		this.bindings.set(trigger, mergeBindings(this.bindings.get(trigger), binding)!);
		return binding;
	}

}

const textContent = (el: Element): string => childrenOf(el).map((n) => (isText(n) ? (n as Text).value : isElement(n) ? textContent(n) : '')).join('');

// The date-fns patterns a date picker's trigger is likely written with, tried in turn against what the old page showed.
const LABEL_PATTERNS = ['PPP', 'PP', 'PPPP', 'LLL dd, y', 'MMM dd, y', 'MMM d, y', 'MMMM d, yyyy', 'MMMM dd, yyyy', 'M/d/yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'd MMM yyyy'];
const LABEL_JOINS = [' - ', ' – ', ' to '];

/** The pattern (and a range's join) that renders what the trigger showed after each pick, its unchanged leading nodes, and the rest it showed before. */
export function labelOf(opener: LayerOpener, config: DayPickerConfig): { readonly pattern: string; readonly join: string; readonly prefix: string; readonly rest: string } | undefined {
	const last = opener.picks.at(-1);
	if (!last) return undefined;
	const nodes = (html: string) => childrenOf(parseFragment(html) as unknown as Element);
	const outer = (n: unknown) => JSON.stringify(n, (k, v) => (k === 'parentNode' || k === 'sourceCodeLocation' ? undefined : v));
	const before = nodes(opener.before);
	const after = nodes(last.html);
	let shared = 0;
	while (shared < before.length && shared < after.length && outer(before[shared]) === outer(after[shared])) shared++;
	const fragment = (list: readonly unknown[]) => emitChildren({ nodeName: '#document-fragment', childNodes: list } as never);
	const text = (html: string) => nodes(html).slice(shared).map((n) => (isText(n) ? (n as Text).value : isElement(n) ? textContent(n) : '')).join('').trim();
	const day = (t: Triple) => Math.round(Date.UTC(t[0], t[1], t[2]) / 86_400_000);
	// Each pick shows the day just picked, alone or as one end of a range whose other end may be a day picked before it.
	const one = (pattern: string, t: Triple) => dayPickerLabel(config, { t: 0, m: 0, s: [day(t)], f: null, lf: null }, pattern);
	for (const pattern of LABEL_PATTERNS)
		for (const join of LABEL_JOINS) {
			const fits = opener.picks.every((p) => {
				const shown = text(p.html);
				const parts = shown.split(join);
				const own = one(pattern, p.days.at(-1)!);
				return parts.length <= 2 && own !== undefined && parts.includes(own) && parts.every((part) => part.length === own.length || /\D/.test(part));
			});
			if (fits) return { pattern, join, prefix: fragment(before.slice(0, shared)), rest: fragment(before.slice(shared)) };
		}
	return undefined;
}

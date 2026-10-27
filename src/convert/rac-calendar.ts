import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { settle } from '../check/capture.ts';
import { DEFAULT_FREEZE } from '../check/freeze.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { racCalendarModel, racCalendarView, type CalendarMessages, type RacCalendarConfig, type RenderTable, type When } from '../../parts/react-aria/calendar.ts';
import { LATER, whenOf } from './day-picker.ts';
import { parseFragment } from 'parse5';
import { attr, childrenOf, elementChildren, isElement, isText, walk, type Element, type Node } from './dom.ts';
import { emitElement, lit, mergeBindings, type Binding } from './tsrx.ts';
import { outer as outerOf } from './dom.ts';

// React Aria's Calendar and RangeCalendar on Markless state (parts/react-aria/calendar.ts). What each calendar on the old
// page was given is read from React's fibers at two clock settings, so a date that follows today is told from a fixed one;
// the cell's class and its own element's attributes are its render functions evaluated for every combination of the
// render props they read; the port's first render on the capture clock is checked against the old page's markup.

type Triple = readonly [number, number, number];

/** What one calendar on the old page was given, as React Aria's state and props hold it. */
export interface RawCalendar {
	readonly sig: string;
	readonly nth: number;
	/** A calendar in a popover: the control that opened it, and its place among the calendars the popover shows. */
	readonly layer?: { readonly sig: string; readonly nth: number; readonly index: number };
	readonly why?: string;
	readonly locale?: string;
	readonly rtl?: boolean;
	readonly cal?: string;
	readonly tz?: string;
	readonly months?: number;
	readonly range?: boolean;
	readonly multiple?: boolean;
	readonly disabled?: boolean;
	readonly readOnly?: boolean;
	readonly invalid?: boolean;
	readonly firstDayOfWeek?: RacCalendarConfig['firstDayOfWeek'];
	readonly weeks?: number;
	readonly pageBehavior?: 'visible' | 'single';
	readonly dates?: { readonly today?: Triple; readonly min?: Triple; readonly max?: Triple; readonly value?: Triple | null; readonly values?: readonly Triple[]; readonly range?: readonly [Triple, Triple] | null; readonly focused?: Triple };
	readonly unavailable?: readonly (readonly [Triple, Triple])[];
	readonly headerFormat?: RacCalendarConfig['headerFormat'];
	readonly monthFormat?: string;
	readonly yearFormat?: RacCalendarConfig['yearFormat'];
	readonly cls?: RenderTable;
	readonly inner?: RacCalendarConfig['inner'];
	/** What choosing in a popover's calendar did to the control that opened it: its markup before and after, the label formats the chosen value matches, whether the popover closed. */
	readonly effect?: RawEffect;
}

export interface RawEffect {
	readonly before: string;
	readonly after: string;
	readonly closed: boolean;
	readonly candidates: readonly { readonly text: string; readonly label: DateLabel }[];
	/** The inputs' values and the text-only elements' texts in the control's field (React Aria's Group around an input and its button), before and after. */
	readonly field?: { readonly inputs: readonly FieldChange[]; readonly texts: readonly FieldChange[] };
}

export interface FieldChange {
	readonly index: number;
	readonly before: string;
	readonly after: string;
}

/** How a page writes a chosen value as text: toLocaleDateString's or a DateTimeFormat's, for one date or a range. */
export interface DateLabel {
	readonly loc: string | null;
	readonly opts: Intl.DateTimeFormatOptions;
	readonly range?: 'format' | ' - ' | ' – ';
}

export interface CapturedCalendars {
	readonly route: string;
	readonly calendars: readonly RawCalendar[];
	readonly later: readonly RawCalendar[];
}

const READ_VERSION = 6;
const fileFor = (dir: string, route: string) => join(dir, `${createHash('sha256').update(`rac-calendar:${READ_VERSION}:${route}`).digest('hex').slice(0, 16)}.json`);

/**
 * Reads every React Aria calendar on a route at the capture clock and at LATER, and those the controls given (whose
 * reveal showed a calendar) open in a popover. Cached by route and controls.
 */
export async function captureRacCalendars(browser: Browser, origin: string, route: string, dir: string, controls: readonly { readonly sig: string; readonly nth: number; readonly path?: readonly number[] }[] = []): Promise<CapturedCalendars> {
	const file = fileFor(dir, `${route}|${JSON.stringify(controls)}`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as CapturedCalendars, () => undefined);
	if (cached && cached.route === route) return cached;
	const read = async (time: number): Promise<RawCalendar[]> => {
		const { context, page } = await openPage(browser, defaultEnv(origin, { freeze: { ...DEFAULT_FREEZE, time } }), VIEWPORTS[0]!);
		try {
			await loadPage(page, new URL(route, origin).href);
			await settle(page);
			const own = await page.evaluate(readCalendars, null);
			const triggers = controls;
			const inLayers: RawCalendar[] = [];
			for (const t of triggers) {
				const opened = await page.evaluate(({ sig, nth, path }) => {
					const sigOf = (el: globalThis.Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
					// By its place in the page (the same at both clocks, where its text may name a date that follows today), else by signature.
					let at: globalThis.Element | undefined = document.body;
					for (const i of path ?? []) at = at?.children[i];
					const el = (at && path?.length && at.tagName === sig.split('|')[0]!.toUpperCase() ? at : [...document.querySelectorAll('*')].filter((e) => sigOf(e) === sig)[nth]) as HTMLElement | undefined;
					if (!el) return false;
					el.setAttribute('data-mm-probe', '');
					return true;
				}, t);
				if (!opened) continue;
				await page.click('[data-mm-probe]', { timeout: 2000 }).catch(() => {});
				await page.waitForTimeout(500);
				const found = await page.evaluate(readCalendars, { sig: t.sig, nth: t.nth });
				inLayers.push(...found);
				await page.evaluate(() => document.querySelector('[data-mm-probe]')?.removeAttribute('data-mm-probe'));
				await page.keyboard.press('Escape').catch(() => {});
				await page.waitForTimeout(400);
			}
			return [...own, ...inLayers];
		} finally {
			await context.close().catch(() => {});
		}
	};
	// What choosing a day (a range: two) in a popover's first calendar does to the control that opened it, on a fresh page each.
	const effectOf = async (t: (typeof controls)[number], locale: string | undefined): Promise<RawEffect | undefined> => {
		const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
		try {
			await loadPage(page, new URL(route, origin).href);
			await settle(page);
			const marked = await page.evaluate(({ sig, nth, path }) => {
				const sigOf = (el: globalThis.Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				let at: globalThis.Element | undefined = document.body;
				for (const i of path ?? []) at = at?.children[i];
				const el = at && path?.length && at.tagName === sig.split('|')[0]!.toUpperCase() ? at : [...document.querySelectorAll('*')].filter((e) => sigOf(e) === sig)[nth];
				el?.setAttribute('data-mm-probe', '');
				return Boolean(el);
			}, t);
			if (!marked) return undefined;
			await page.click('[data-mm-probe]', { timeout: 2000 });
			await page.waitForTimeout(500);
			const range = await page.evaluate(() => [...document.querySelectorAll('[data-trigger] [role="application"], [role="dialog"] [role="application"]')].some((c) => c.querySelector('table[aria-multiselectable]')));
			const chosen = await page.evaluate(chooseIn, range);
			if (!chosen) return undefined;
			for (let i = 0; i < chosen.chosen.length; i++) await page.click(`[data-mm-pick="${i}"]`, { timeout: 2000 });
			await page.waitForTimeout(500);
			return await page.evaluate(afterChoice, { ...chosen, locale });
		} catch {
			return undefined;
		} finally {
			await context.close().catch(() => {});
		}
	};
	const calendars = await read(DEFAULT_FREEZE.time);
	const effects = new Map<string, RawEffect>();
	for (const t of controls) {
		if (!calendars.some((c) => c.layer?.sig === t.sig && c.layer.nth === t.nth && !c.why)) continue;
		const effect = await effectOf(t, calendars.find((c) => c.layer?.sig === t.sig && c.layer.nth === t.nth)?.locale);
		if (effect) effects.set(`${t.sig}|${t.nth}`, effect);
	}
	const captured: CapturedCalendars = { route, calendars: calendars.map((c) => (c.layer && c.layer.index === 0 && effects.has(`${c.layer.sig}|${c.layer.nth}`) ? { ...c, effect: effects.get(`${c.layer.sig}|${c.layer.nth}`)! } : c)), later: await read(LATER) };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(captured));
	return captured;
}

/** Runs in the old page: marks a selectable day (for a range, two) in the open popover's calendar to click; returns what it read first. */
function chooseIn(range: boolean): { before: string; chosen: string[]; fieldBefore?: { inputs: string[]; texts: string[] } } | undefined {
	const probe = document.querySelector('[data-mm-probe]');
	const popover = [...document.querySelectorAll('[data-trigger], [role="dialog"]')].find((p) => p.querySelector('[role="application"]') && !p.closest('[data-slot="preview"]'));
	if (!probe || !popover) return undefined;
	const cells = [...popover.querySelectorAll<HTMLElement>('[role="gridcell"]:not([aria-disabled]):not([aria-selected="true"]) > [role="button"]')];
	const picks = range ? [cells[3], cells[8]] : [cells[5]];
	if (picks.some((c) => !c)) return undefined;
	const before = probe.innerHTML;
	const field = probe.closest('[data-slot="field"]');
	const fieldBefore = field ? { inputs: [...field.querySelectorAll('input')].map((i) => i.value), texts: [...field.querySelectorAll('*')].filter((e) => e.childElementCount === 0).map((e) => e.textContent ?? '') } : undefined;
	// Each day as y-m-d, from the props React Aria's cell rendered with (its label is in the calendar's locale).
	const dayOf = (el: globalThis.Element): string => {
		const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
		for (let f = key ? (el as unknown as Record<string, { return?: unknown; memoizedProps?: { date?: { year: number; month: number; day: number } } }>)[key] : undefined; f; f = f.return as typeof f) {
			const d = f.memoizedProps?.date;
			if (d && typeof d.year === 'number') return `${d.year}-${d.month}-${d.day}`;
		}
		return '';
	};
	const chosen = picks.map((c) => dayOf(c!));
	picks.forEach((c, i) => c!.setAttribute('data-mm-pick', String(i)));
	return { before, chosen, ...(fieldBefore ? { fieldBefore } : {}) };
}

/** Runs in the old page after a choice: the control's markup, the formats the chosen days match in it, whether the popover closed. */
function afterChoice(read: { before: string; chosen: string[]; fieldBefore?: { inputs: string[]; texts: string[] }; locale?: string }): RawEffect | undefined {
	const probe = document.querySelector('[data-mm-probe]');
	if (!probe) return undefined;
	const after = probe.innerHTML;
	const scope = probe.closest('[data-slot="field"]');
	const changes = (before: string[] | undefined, after: string[]) => (before && before.length === after.length ? after.flatMap((a, index) => (a !== before[index] ? [{ index, before: before[index]!, after: a }] : [])) : []);
	const field = scope && read.fieldBefore ? { inputs: changes(read.fieldBefore.inputs, [...scope.querySelectorAll('input')].map((i) => i.value)), texts: changes(read.fieldBefore.texts, [...scope.querySelectorAll('*')].filter((e) => e.childElementCount === 0).map((e) => e.textContent ?? '')) } : undefined;
	if (after === read.before && !field?.inputs.length && !field?.texts.length) return undefined;
	const closed = ![...document.querySelectorAll('[data-trigger], [role="dialog"]')].some((p) => p.querySelector('[role="application"]') && !p.closest('[data-slot="preview"]') && (p as HTMLElement).getClientRects().length);
	const dates = read.chosen.map((ymd) => {
		const m = /^(\d+)-(\d+)-(\d+)$/.exec(ymd);
		return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
	});
	if (dates.some((d) => !d || Number.isNaN(d.getTime()))) return undefined;
	const options: Intl.DateTimeFormatOptions[] = [{ dateStyle: 'long' }, { dateStyle: 'medium' }, { dateStyle: 'short' }, { dateStyle: 'full' }, {}, { day: '2-digit', month: 'long', year: 'numeric' }, { day: 'numeric', month: 'long', year: 'numeric' }, { month: 'short', day: 'numeric', year: 'numeric' }, { month: 'long', day: 'numeric' }, { month: 'short', day: 'numeric' }];
	const near = read.locale ?? probe.closest('[lang]')?.getAttribute('lang') ?? null;
	const locales = [null, near, document.documentElement.lang || null, 'en-US', ...(near ? [`${near}-u-nu-latn`] : [])].filter((l, i, all) => all.indexOf(l) === i);
	const candidates: RawEffect['candidates'][number][] = [];
	const text = [(probe as HTMLElement).innerText, ...(field ? [...field.inputs, ...field.texts].map((c) => c.after) : [])].join('\n');
	for (const loc of locales)
		for (const opts of options) {
			const f = new Intl.DateTimeFormat(loc ?? undefined, opts);
			if (dates.length === 1) candidates.push({ text: dates[0]!.toLocaleDateString(loc ?? undefined, opts), label: { loc, opts } });
			else {
				candidates.push({ text: f.formatRange(dates[0]!, dates[1]!), label: { loc, opts, range: 'format' } });
				for (const sep of [' - ', ' – '] as const) candidates.push({ text: `${f.format(dates[0]!)}${sep}${f.format(dates[1]!)}`, label: { loc, opts, range: sep } });
			}
		}
	return { before: read.before, after, closed, candidates: candidates.filter((c) => text.includes(c.text)), ...(field ? { field } : {}) };
}

/** Runs in the old page: each calendar's state, props, locale and render functions, from React's fibers. */
function readCalendars(layer: { readonly sig: string; readonly nth: number } | null): RawCalendar[] {
	type DomEl = globalThis.Element;
	type Fiber = { memoizedProps?: Record<string, unknown>; return?: Fiber | null; child?: Fiber | null; sibling?: Fiber | null; type?: unknown };
	type CDate = { year: number; month: number; day: number; calendar: { identifier: string }; add(d: Record<string, number>): CDate; toDate(tz: string): Date; compare(o: CDate): number };
	const fiberOf = (el: DomEl): Fiber | undefined => (el as unknown as Record<string, Fiber>)[Object.keys(el).find((k) => k.startsWith('__reactFiber'))!];
	const sigOf = (el: DomEl) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const order = new Map<DomEl, number>();
	for (const el of document.body.querySelectorAll('*')) {
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	const out: RawCalendar[] = [];
	let index = 0;
	for (const root of document.querySelectorAll('[role="application"][data-rac]')) {
		if (!root.querySelector('table[role="grid"]') || root.closest('template')) continue;
		// In the page, or (reading what a control opened) in a popover.
		const popover = root.closest('[data-trigger], [role="dialog"]') && !root.closest('[data-slot="preview"]');
		if (Boolean(layer) !== Boolean(popover)) continue;
		const base = { sig: sigOf(root), nth: order.get(root) ?? 0, ...(layer ? { layer: { ...layer, index: index++ } } : {}) };
		const cell = root.querySelector('[role="gridcell"] > [role="button"]');
		if (!cell) {
			out.push({ ...base, why: 'no cell' });
			continue;
		}
		let state: Record<string, unknown> | undefined;
		let props: Record<string, unknown> | undefined;
		let cellProps: Record<string, unknown> | undefined;
		let locale: { locale: string; direction: string } | undefined;
		for (let f = fiberOf(cell); f; f = f.return ?? undefined) {
			const p = f.memoizedProps;
			if (!p) continue;
			const v = p.value as Record<string, unknown> | undefined;
			if (!state && v && typeof v === 'object' && 'visibleRange' in v) state = v;
			if (!cellProps && 'date' in p && ('className' in p || 'children' in p)) cellProps = p;
			if (!props && 'visibleDuration' in p) props = p;
			if (!locale && v && typeof v === 'object' && typeof v.locale === 'string' && 'direction' in v) locale = v as unknown as { locale: string; direction: string };
		}
		if (!state || !props || !cellProps) {
			out.push({ ...base, why: 'React Aria state not found' });
			continue;
		}
		const tz = state.timeZone as string;
		const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
		const triple = (d: CDate | null | undefined): Triple | undefined => {
			if (!d) return undefined;
			const [y, m, day] = parts.format(d.toDate(tz)).split('-').map(Number) as [number, number, number];
			return [y, m - 1, day];
		};
		const focused = state.focusedDate as CDate;
		const range = 'highlightedRange' in state;
		const value = state.value as CDate | CDate[] | { start: CDate; end: CDate } | null;
		const startOf = (state.visibleRange as { start: CDate }).start;
		// isDateUnavailable over the years around the visible range, as inclusive spans.
		const isUnavailable = state.isCellUnavailable as (d: CDate) => boolean;
		const spans: [Triple, Triple][] = [];
		if (typeof props.isDateUnavailable === 'function') {
			let open: Triple | undefined;
			let last: Triple | undefined;
			for (let k = -800; k <= 1200; k++) {
				const d = startOf.add({ days: k });
				const t = triple(d)!;
				if (isUnavailable.call(state, d)) {
					if (!open) open = t;
					last = t;
				} else if (open) {
					spans.push([open, last!]);
					open = undefined;
				}
			}
			if (open) spans.push([open, last!]);
		}
		// A render function's output for every combination of the render props it reads.
		const KEYS = ['isToday', 'isSelected', 'isSelectionStart', 'isSelectionEnd', 'isUnavailable', 'isDisabled', 'isOutsideMonth', 'isOutsideVisibleRange', 'isInvalid', 'isFocused', 'isFocusVisible', 'isHovered', 'isPressed'];
		const valuesOf = (on: readonly string[], extra: Record<string, unknown> = {}) => ({ ...Object.fromEntries(KEYS.map((k) => [k, on.includes(k)])), date: cellProps!.date, formattedDate: '\u0000', defaultChildren: '\u0000', defaultClassName: 'react-aria-CalendarCell', ...extra });
		const tableOf = <T,>(fn: (v: Record<string, unknown>) => T, same: (a: T, b: T) => boolean): { keys: string[]; outputs: T[] } | string => {
			const plain = fn(valuesOf([]));
			const keys = KEYS.filter((k) => !same(fn(valuesOf([k])), plain));
			if (keys.some((k) => k === 'isHovered' || k === 'isPressed' || k === 'isFocusVisible')) return `it renders differently on ${keys.join(', ')}`;
			if (keys.length > 9) return 'it reads too many render props';
			const outputs: T[] = [];
			for (let mask = 0; mask < 1 << keys.length; mask++) outputs.push(fn(valuesOf(keys.filter((_, i) => mask & (1 << i)))));
			return { keys, outputs };
		};
		let cls: RenderTable | undefined;
		if (typeof cellProps.className === 'function') {
			const t = tableOf((v) => String((cellProps!.className as (v: unknown) => unknown)(v) ?? ''), (a, b) => a === b);
			if (typeof t === 'string') {
				out.push({ ...base, why: `the cell's class: ${t}` });
				continue;
			}
			cls = { keys: t.keys, table: t.outputs };
		}
		let inner: RacCalendarConfig['inner'];
		if (typeof cellProps.children === 'function') {
			type El = { type?: unknown; props?: Record<string, unknown> };
			const attrsOf = (el: unknown): Record<string, string> | string => {
				const e = el as El;
				if (!e || typeof e !== 'object' || typeof e.type !== 'string') return 'not one element';
				const p = e.props ?? {};
				if (p.children !== '\u0000') return 'children besides the day';
				const out: Record<string, string> = {};
				for (const [k, v] of Object.entries(p)) {
					if (k === 'children' || v == null || typeof v === 'function') continue;
					out[k === 'className' ? 'class' : k] = typeof v === 'boolean' ? (/^(data|aria)-/.test(k) ? String(v) : v ? '' : '\u0001') : String(v);
				}
				return out;
			};
			const t = tableOf((v) => JSON.stringify(attrsOf((cellProps!.children as (v: unknown) => unknown)(v))), (a, b) => a === b);
			if (typeof t === 'string') {
				out.push({ ...base, why: `the cell's content: ${t}` });
				continue;
			}
			const parsed = t.outputs.map((o) => JSON.parse(o) as Record<string, string> | string);
			const bad = parsed.find((p) => typeof p === 'string');
			// A day other than the first renders the same: the content does not follow the date.
			const other = (cellProps.children as (v: unknown) => unknown)(valuesOf([], { date: (cellProps.date as CDate).add({ days: 9 }) }));
			if (bad || JSON.stringify(attrsOf(other)) !== t.outputs[0]) {
				out.push({ ...base, why: `the cell's content: ${typeof bad === 'string' ? bad : 'it follows the date'}` });
				continue;
			}
			const names = [...new Set(parsed.flatMap((p) => Object.keys(p as Record<string, string>)))];
			inner = { attrs: names, keys: t.keys, table: parsed.map((p) => names.map((n) => (p as Record<string, string>)[n] ?? '\u0001')) };
		}
		// The heading's format and the month and year pickers': props of the components rendered under the root.
		let headerFormat: RacCalendarConfig['headerFormat'];
		let monthFormat: string | undefined;
		let yearFormat: RacCalendarConfig['yearFormat'];
		const pickers: Record<string, unknown>[] = [];
		const visit = (f: Fiber | null | undefined, depth: number) => {
			for (let n = f; n && depth < 80; n = n.sibling) {
				const p = n.memoizedProps;
				if (p && typeof p === 'object' && 'offset' in p && 'format' in p && !('children' in p && typeof p.children === 'function')) headerFormat ??= (p.format as RacCalendarConfig['headerFormat']) ?? undefined;
				if (p && typeof p === 'object' && 'format' in p && typeof p.children === 'function' && !('offset' in p)) pickers.push(p);
				visit(n.child, depth + 1);
			}
		};
		visit(fiberOf(root)?.child, 0);
		if (pickers[0]) monthFormat = (pickers[0].format as string | undefined) ?? undefined;
		if (pickers[1]) yearFormat = (pickers[1].format as RacCalendarConfig['yearFormat']) ?? undefined;
		const duration = state.visibleDuration as { months?: number; weeks?: number; days?: number; years?: number };
		if (duration.weeks || duration.days || duration.years || !duration.months) {
			out.push({ ...base, why: 'a visible duration other than months' });
			continue;
		}
		const fdow = props.firstDayOfWeek as RacCalendarConfig['firstDayOfWeek'];
		out.push({
			...base,
			locale: locale?.locale ?? document.documentElement.lang ?? 'en-US',
			...(locale?.direction === 'rtl' ? { rtl: true } : {}),
			cal: startOf.calendar.identifier,
			tz,
			months: duration.months,
			...(range ? { range: true } : {}),
			...(state.selectionMode === 'multiple' ? { multiple: true } : {}),
			...(state.isDisabled ? { disabled: true } : {}),
			...(state.isReadOnly ? { readOnly: true } : {}),
			...(props.isInvalid ? { invalid: true } : {}),
			...(fdow ? { firstDayOfWeek: fdow } : {}),
			...(typeof props.weeksInMonth === 'number' ? { weeks: props.weeksInMonth } : {}),
			...(props.pageBehavior === 'single' ? { pageBehavior: 'single' as const } : {}),
			dates: {
				today: (() => {
					const [y, m, day] = parts.format(new Date()).split('-').map(Number) as [number, number, number];
					return [y, m - 1, day] as const;
				})(),
				...(state.minValue ? { min: triple(state.minValue as CDate) } : {}),
				...(state.maxValue ? { max: triple(state.maxValue as CDate) } : {}),
				...(range ? { range: value && (value as { start: CDate }).start ? [triple((value as { start: CDate }).start)!, triple((value as { end: CDate }).end)!] as const : null } : Array.isArray(value) ? { values: value.map((v) => triple(v)!) } : { value: value ? triple(value as CDate) : null }),
				...(props.focusedValue || props.defaultFocusedValue ? { focused: triple(focused) } : {}),
			},
			...(spans.length ? { unavailable: spans } : {}),
			...(headerFormat ? { headerFormat } : {}),
			...(monthFormat ? { monthFormat } : {}),
			...(yearFormat ? { yearFormat } : {}),
			...(cls ? { cls } : {}),
			...(inner ? { inner } : {}),
		});
	}
	return out;
}

// --- Messages -------------------------------------------------------------------------------------------------------

const MESSAGE_KEYS = ['next', 'previous', 'todayDate', 'todayDateSelected', 'dateSelected', 'selectedDateDescription', 'selectedRangeDescription', 'dateRange', 'minimumDate', 'maximumDate'] as const;

/**
 * React Aria's calendar messages for a locale, read from the old source's react-aria package (its intl/calendar
 * modules), chosen as LocalizedStringDictionary chooses: the locale, else one of its language, else en-US.
 */
export async function racCalendarMessages(source: string | undefined, locale: string): Promise<CalendarMessages | undefined> {
	if (!source) return undefined;
	let dir: string;
	try {
		const fromSource = createRequire(join(source, 'package.json'));
		const rac = dirname(fromSource.resolve('react-aria-components/package.json'));
		dir = join(dirname(createRequire(join(rac, 'package.json')).resolve('react-aria/package.json')), 'dist', 'private', 'intl', 'calendar');
	} catch {
		return undefined;
	}
	const { readdir } = await import('node:fs/promises');
	const files = await readdir(dir).catch(() => [] as string[]);
	const available = files.filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
	const language = new Intl.Locale(locale).language;
	const pick = available.find((l) => l === locale) ?? available.find((l) => new Intl.Locale(l).language === language) ?? (available.includes('en-US') ? 'en-US' : undefined);
	if (!pick) return undefined;
	const mod = (await import(pathToFileURL(join(dir, `${pick}.mjs`)).href)) as { default: Record<string, string | ((args: Record<string, string>) => string)> };
	const args = { date: '{date}', dateRange: '{dateRange}', startDate: '{startDate}', endDate: '{endDate}' };
	const out: Record<string, string> = {};
	for (const key of MESSAGE_KEYS) {
		const m = mod.default[key];
		if (m === undefined) return undefined;
		out[key] = typeof m === 'function' ? m(args) : m;
	}
	return out as unknown as CalendarMessages;
}

// --- Pairing the two clocks --------------------------------------------------------------------------------------------

const fixed = (t: Triple): When => ({ y: t[0], m: t[1], d: t[2] });
function pair(a: Triple | undefined | null, b: Triple | undefined | null, note: (what: string) => void, what: string): When | undefined {
	if (!a) return undefined;
	const w = b ? whenOf(a, b) : undefined;
	if (!w) note(`${what} (${a.join('-')}) follows the clock in a way the port cannot: kept as on the capture clock`);
	return w ?? fixed(a);
}

export function configOf(at: RawCalendar, later: RawCalendar | undefined, msgs: CalendarMessages, note: (what: string) => void): RacCalendarConfig {
	const d = at.dates ?? {};
	const l = later?.dates ?? {};
	const unavailable = at.unavailable?.map(([a, b], i) => [pair(a, later?.unavailable?.[i]?.[0], note, 'an unavailable day')!, pair(b, later?.unavailable?.[i]?.[1], note, 'an unavailable day')!] as const);
	return {
		locale: at.locale!,
		...(at.rtl ? { rtl: true } : {}),
		cal: at.cal!,
		months: at.months!,
		...(at.range ? { range: true } : {}),
		...(at.multiple ? { multiple: true } : {}),
		...(at.disabled ? { disabled: true } : {}),
		...(at.readOnly ? { readOnly: true } : {}),
		...(at.invalid ? { invalid: true } : {}),
		...(at.firstDayOfWeek ? { firstDayOfWeek: at.firstDayOfWeek } : {}),
		...(at.weeks ? { weeks: at.weeks } : {}),
		...(at.pageBehavior ? { pageBehavior: at.pageBehavior } : {}),
		...(d.min ? { min: pair(d.min, l.min, note, 'minValue')! } : {}),
		...(d.max ? { max: pair(d.max, l.max, note, 'maxValue')! } : {}),
		...(unavailable?.length ? { unavailable } : {}),
		...(at.range ? { rangeValue: d.range ? ([pair(d.range[0], l.range?.[0], note, 'the range start')!, pair(d.range[1], l.range?.[1], note, 'the range end')!] as const) : null } : at.multiple ? { values: (d.values ?? []).map((t, i) => pair(t, l.values?.[i], note, 'a value')!) } : { value: d.value ? pair(d.value, l.value, note, 'the value')! : null }),
		...(d.focused ? { focused: pair(d.focused, l.focused, note, 'focusedValue')! } : {}),
		msgs,
		...(at.headerFormat ? { headerFormat: at.headerFormat } : {}),
		...(at.monthFormat ? { monthFormat: at.monthFormat } : {}),
		...(at.yearFormat ? { yearFormat: at.yearFormat } : {}),
		...(at.cls ? { cls: at.cls } : {}),
		...(at.inner ? { inner: at.inner } : {}),
	};
}

// --- The markup React Aria rendered -------------------------------------------------------------------------------------

const textOf = (el: Element): string => childrenOf(el).map((n) => (isText(n) ? n.value : isElement(n) ? textOf(n) : '')).join('');
const ABSENT = '\u0001';
const CELL_ATTRS = ['aria-selected', 'aria-disabled', 'aria-invalid'] as const;
const BUTTON_ATTRS = ['tabindex', 'aria-label', 'aria-disabled', 'aria-invalid', 'data-unavailable', 'data-disabled', 'data-outside-visible-range', 'data-outside-month', 'data-selected', 'data-selection-start', 'data-selection-end', 'data-invalid', 'data-today', 'class'] as const;
// What the interactions part writes as the pointer and focus move.
const LIVE = ['data-focused', 'data-hovered', 'data-pressed', 'data-focus-visible'];

interface Shape {
	readonly tables: readonly Element[];
	readonly prev?: Element;
	readonly next?: Element;
	readonly hiddenNext?: Element;
	readonly title?: Element;
}
function shapeOf(root: Element): Shape | undefined {
	const tables = [...walk(root)].filter((e) => e.tagName === 'table' && attr(e, 'role') === 'grid');
	if (!tables.length) return undefined;
	const buttons = [...walk(root)].filter((e) => e.tagName === 'button');
	const kids = elementChildren(root);
	const title = kids[0] && [...walk(kids[0])].find((e) => e.tagName === 'h2');
	const last = kids[kids.length - 1];
	const hiddenNext = last && last !== kids[0] ? [...walk(last)].find((e) => e.tagName === 'button' && attr(e, 'tabindex') === '-1') : undefined;
	return { tables, prev: buttons.find((b) => attr(b, 'slot') === 'previous'), next: buttons.find((b) => attr(b, 'slot') === 'next'), ...(hiddenNext ? { hiddenNext } : {}), ...(title ? { title } : {}) };
}

const cellValues = (d: ReturnType<typeof racCalendarModel>['months'][number]['weeks'][number]['days'][number]): Record<string, string | undefined> => ({
	'aria-selected': d.ariaSelected,
	'aria-disabled': d.ariaDisabled,
	'aria-invalid': d.ariaInvalid,
});
const buttonValues = (d: ReturnType<typeof racCalendarModel>['months'][number]['weeks'][number]['days'][number]): Record<string, string | undefined> => ({
	tabindex: d.tabindex,
	'aria-label': d.label,
	'aria-disabled': d.ariaDisabled,
	'aria-invalid': d.ariaInvalid,
	'data-unavailable': d.unavailable,
	'data-disabled': d.disabled,
	'data-outside-visible-range': d.outsideRange,
	'data-outside-month': d.outsideMonth,
	'data-selected': d.selected,
	'data-selection-start': d.selectionStart,
	'data-selection-end': d.selectionEnd,
	'data-invalid': d.invalid,
	'data-today': d.today,
	class: d.cls || undefined,
});

/** Where the port's first render differs from the old page's markup, or undefined when it does not. */
export function differs(root: Element, config: RacCalendarConfig, model: ReturnType<typeof racCalendarModel>): string | undefined {
	const shape = shapeOf(root);
	if (!shape) return 'no grid';
	if (attr(root, 'aria-label') !== model.label) return `the calendar's label: ${attr(root, 'aria-label')} vs ${model.label}`;
	if (shape.tables.length !== model.months.length) return `${shape.tables.length} grids vs ${model.months.length}`;
	for (const [k, table] of shape.tables.entries()) {
		const month = model.months[k]!;
		if (attr(table, 'aria-label') !== month.grid) return `grid ${k}'s label: ${attr(table, 'aria-label')} vs ${month.grid}`;
		const tbody = elementChildren(table).find((e) => e.tagName === 'tbody');
		const rows = tbody ? elementChildren(tbody) : [];
		if (rows.length !== month.weeks.length) return `grid ${k}: ${rows.length} weeks vs ${month.weeks.length}`;
		for (const [w, tr] of rows.entries()) {
			const cells = elementChildren(tr);
			for (const [i, td] of cells.entries()) {
				const day = month.weeks[w]!.days[i];
				if (!day) return `grid ${k} week ${w}: a cell the port does not render`;
				const button = elementChildren(td)[0];
				if (!button || day.key.includes(':')) return `grid ${k} week ${w} day ${i}: an empty cell`;
				for (const [name, value] of Object.entries(cellValues(day))) if (attr(td, name) !== value) return `cell ${day.key} ${name}: ${attr(td, name)} vs ${value}`;
				for (const [name, value] of Object.entries(buttonValues(day))) if (attr(button, name) !== value) return `cell ${day.key} ${name}: ${attr(button, name)} vs ${value}`;
				const inner = elementChildren(button)[0];
				if (config.inner) {
					if (!inner) return `cell ${day.key}: no inner element`;
					for (const [j, name] of config.inner.attrs.entries()) {
						const want = day.inner[j] === ABSENT ? undefined : day.inner[j];
						if (attr(inner, name) !== want) return `cell ${day.key} inner ${name}: ${attr(inner, name)} vs ${want}`;
					}
					if (textOf(inner) !== day.text) return `cell ${day.key} text: ${textOf(inner)} vs ${day.text}`;
				} else if (textOf(button) !== day.text) return `cell ${day.key} text: ${textOf(button)} vs ${day.text}`;
			}
		}
	}
	return undefined;
}

// --- The template ----------------------------------------------------------------------------------------------------

/**
 * The calendar's markup bound to the model `m`: its own static markup from the old page, the grid's weeks and days in
 * @for loops (no branch, no handler inside, so Markless builds a month in the browser), each month's heading, grid label
 * and pickers' values, and the navigation buttons' disabled state.
 */
function template(root: Element, config: RacCalendarConfig, model: ReturnType<typeof racCalendarModel>, m: string): string | undefined {
	const shape = shapeOf(root)!;
	const bound = new Map<Element, Binding>();
	const disabledBinding = (expr: string): Binding => ({ omit: ['disabled', 'data-disabled'], extra: [`disabled={${expr} ? true : undefined}`, `data-disabled={${expr}}`] });
	if (shape.title) bound.set(shape.title, { children: `{${m}.label}` });
	if (shape.prev) bound.set(shape.prev, disabledBinding(`${m}.prevDisabled`));
	if (shape.next) bound.set(shape.next, disabledBinding(`${m}.nextDisabled`));
	if (shape.hiddenNext) bound.set(shape.hiddenNext, { omit: ['disabled'], extra: [`disabled={${m}.nextDisabled ? true : undefined}`] });
	// Each month's heading and pickers, found by the text the port renders for them.
	const used = new Set<Element>();
	for (const [k, month] of model.months.entries()) {
		const at = `${m}.months[${k}]`;
		const table = shape.tables[k]!;
		const scope = table.parentNode as Element;
		const heading = [...walk(scope)].find((e) => !used.has(e) && e.tagName !== 'table' && elementChildren(e).length === 0 && textOf(e).trim() === month.heading && !e.attrs.some((a) => a.name === 'aria-hidden'));
		if (heading) {
			used.add(heading);
			bound.set(heading, { children: `{${at}.heading}` });
		}
		for (const [label, field] of [[month.monthLabel, 'monthLabel'], [month.yearLabel, 'yearLabel']] as const) {
			const trigger = [...walk(scope)].find((e) => !used.has(e) && attr(e, 'aria-haspopup') === 'listbox' && [...walk(e)].some((v) => attr(v, 'data-slot') === 'select-value' && textOf(v).trim() === label));
			if (!trigger) continue;
			used.add(trigger);
			const valueEl = [...walk(trigger)].find((v) => attr(v, 'data-slot') === 'select-value')!;
			const text = [...walk(valueEl)].find((e) => e !== valueEl && textOf(e).trim() === label && elementChildren(e).length === 0) ?? valueEl;
			bound.set(text, { children: `{${at}.${field}}` });
		}
		bound.set(table, { omit: ['aria-label'], extra: [`aria-label={${at}.grid}`] });
		const tbody = elementChildren(table).find((e) => e.tagName === 'tbody');
		const tr = tbody && elementChildren(tbody)[0];
		const td = tr && elementChildren(tr)[0];
		const button = td && elementChildren(td)[0];
		if (!tbody || !tr || !td || !button) return undefined;
		const inner = config.inner ? elementChildren(button)[0] : undefined;
		if (config.inner && !inner) return undefined;
		const innerMarkup = inner
			? emitElement(inner, { bind: (x) => (x === inner ? { omit: [...config.inner!.attrs], extra: config.inner!.attrs.map((name, j) => `${name}={day.inner[${j}] === ${JSON.stringify(ABSENT)} ? undefined : day.inner[${j}]}`), children: '{day.text}' } : undefined) })
			: '{day.text}';
		const buttonMarkup = emitElement(button, { bind: (x) => (x === button ? { omit: [...BUTTON_ATTRS, ...LIVE], extra: ['tabindex={day.tabindex}', 'aria-label={day.label}', 'aria-disabled={day.ariaDisabled}', 'aria-invalid={day.ariaInvalid}', 'data-unavailable={day.unavailable}', 'data-disabled={day.disabled}', 'data-outside-visible-range={day.outsideRange}', 'data-outside-month={day.outsideMonth}', 'data-selected={day.selected}', 'data-selection-start={day.selectionStart}', 'data-selection-end={day.selectionEnd}', 'data-invalid={day.invalid}', 'data-today={day.today}', 'class={day.cls || undefined}'], children: innerMarkup } : undefined) });
		const cellMarkup = emitElement(td, { bind: (x) => (x === td ? { omit: [...CELL_ATTRS], extra: ['aria-selected={day.ariaSelected}', 'aria-disabled={day.ariaDisabled}', 'aria-invalid={day.ariaInvalid}'], children: buttonMarkup } : undefined) });
		const rowMarkup = emitElement(tr, { bind: (x) => (x === tr ? { children: `@for (const day of week.days; key day.key) { ${cellMarkup} }` } : undefined) });
		bound.set(tbody, { children: `@for (const week of ${at}.weeks; key week.key) { ${rowMarkup} }` });
	}
	return childrenOf(root)
		.filter(isElement)
		.map((e) => emitElement(e, { bind: (x) => bound.get(x) }))
		.join('');
}

// --- The plan ------------------------------------------------------------------------------------------------------------

export const RAC_CONFIGS_MODULE = 'rac-calendar-configs.ts';
export const RAC_CONFIG_PREFIX = 'rcc_';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10);

/** Each React Aria calendar on Markless state: a state() view, a computed() model, the template, and the root's handlers. */
export class RacCalendarPlan {
	private readonly bindings = new Map<Element, Binding>();
	private readonly roots = new Set<Element>();
	private readonly configs = new Map<string, RacCalendarConfig>();
	private readonly layerPlaced = new Set<string>();
	private n = 0;
	private labels = 0;
	readonly notes: string[] = [];

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/** How many calendars are on Markless state, in pages and layers. */
	get placed(): number {
		return this.roots.size;
	}

	/** Whether an element is inside a calendar this plan renders (its pickers are not the select plan's). */
	within(el: Element): boolean {
		for (let n: Element | null = el; n && 'tagName' in n; n = n.parentNode as Element | null) if (this.roots.has(n)) return true;
		return false;
	}

	configsModule(): string {
		const exports = [...this.configs].sort(([a], [b]) => a.localeCompare(b)).map(([name, config]) => `export const ${name}: RacCalendarConfig = ${JSON.stringify(config)};`);
		return `// Generated by markless-migrate convert: each React Aria calendar's configuration, read from the old page; change the converter, not this file.\nimport type { RacCalendarConfig } from './react-aria/calendar.ts';\n\n${exports.join('\n')}\n`;
	}

	add(route: string, captured: CapturedCalendars, messages: (locale: string) => CalendarMessages | undefined, locate: (sig: string, nth: number) => Element | undefined, emit?: (html: string) => string): number {
		let count = 0;
		captured.calendars.forEach((raw, i) => {
			if (raw.layer) {
				if (raw.effect && emit && this.layerPlaced.has(`${route}|${raw.layer.sig}|${raw.layer.nth}|${raw.layer.index}`)) this.labelTrigger(route, raw, locate(raw.layer.sig, raw.layer.nth), emit);
				return;
			}
			const root = raw.why ? undefined : locate(raw.sig, raw.nth);
			if (this.place(route, raw, captured.later[i], root, messages, i)) count++;
		});
		return count;
	}

	/** The calendars a popover's layer shows, among its kept elements: bound like the page's. */
	addLayer(route: string, captured: CapturedCalendars, messages: (locale: string) => CalendarMessages | undefined, control: { readonly sig: string; readonly nth: number }, kept: readonly Element[]): number {
		const roots = kept.flatMap((top) => [...walk(top)].filter((e) => attr(e, 'role') === 'application' && attr(e, 'data-rac') !== undefined));
		if (!roots.length) return 0;
		let count = 0;
		captured.calendars.forEach((raw, i) => {
			if (!raw.layer || raw.layer.sig !== control.sig || raw.layer.nth !== control.nth) return;
			const root = roots[raw.layer.index];
			if (root && this.roots.has(root)) return;
			if (this.place(route, raw, captured.later[i], root, messages, i)) {
				this.layerPlaced.add(`${route}|${raw.layer.sig}|${raw.layer.nth}|${raw.layer.index}`);
				count++;
			}
		});
		return count;
	}

	/**
	 * The control that opened a popover's calendar shows what was chosen as the page wrote it: its markup after a choice,
	 * the chosen text a state() the calendar's `mmcalendar` event sets; before any choice, its markup as it was.
	 */
	private labelTrigger(route: string, raw: RawCalendar, trigger: Element | undefined, emit: (html: string) => string): void {
		const note = (what: string): void => void this.notes.push(`${route} React Aria calendar in what ${raw.layer!.sig.split('|')[2]} opens: ${what}`);
		const effect = raw.effect!;
		if (!trigger) return note('its control was not found in the converted page');
		const textNodes = (html: string) => {
			const out: { value: string }[] = [];
			const visit = (n: Node) => {
				if (isText(n)) out.push(n as unknown as { value: string });
				else if (isElement(n)) for (const c of childrenOf(n)) visit(c);
			};
			for (const c of childrenOf(parseFragment(html) as unknown as Element)) visit(c);
			return out;
		};
		const inField = this.labelField(raw, trigger);
		if (effect.after === effect.before) return inField ? undefined : note('what its field shows after a choice is not a date format the port knows');
		const afterTexts = textNodes(effect.after);
		const pick = effect.candidates.find((c) => afterTexts.some((t) => t.value.trim() === c.text));
		if (!pick) return note('what it shows after a choice is not a date format the port knows');
		const TOKEN = 'MMCALENDARLABEL';
		const k = this.labels++;
		const v = `rcl${k}`;
		// The after markup with the chosen text as the state's value.
		const afterHtml = (() => {
			const frag = parseFragment(effect.after) as unknown as Element;
			const nodes: { value: string }[] = [];
			const visit = (n: Node) => {
				if (isText(n)) nodes.push(n as unknown as { value: string });
				else if (isElement(n)) for (const c of childrenOf(n)) visit(c);
			};
			for (const c of childrenOf(frag)) visit(c);
			const target = nodes.find((t) => t.value.trim() === pick.text)!;
			target.value = target.value.replace(pick.text, TOKEN);
			return childrenOf(frag).map((c) => (isText(c) ? c.value : outerOf(c))).join('');
		})();
		const valueArm = emit(afterHtml).split(TOKEN).join(`{${v}}`);
		const beforeTexts = textNodes(effect.before).map((t) => t.value.trim()).filter(Boolean);
		// Already showing a value (a range picked on load): the same markup, its text the state's first value.
		const shown = beforeTexts.find((t) => effect.candidates.some((c) => c.label === pick.label) && t !== pick.text && /\d/.test(t) && emit(effect.before).split(t).length === 2 && emit(effect.before).split(t).join(TOKEN) === emit(afterHtml).split(TOKEN).join(TOKEN));
		const declare = [`let ${v} = state(${shown ? lit(shown) : 'null'} as string | null);`];
		const handler = `onMmcalendar={(event) => (${v} = racDateLabel(${JSON.stringify(pick.label)}, (event as CustomEvent<readonly string[]>).detail) || null)}`;
		const children = shown ? valueArm : `@if (${v} === null) { <>${emit(effect.before)}</> } @else { <>${valueArm}</> }`;
		this.bindings.set(trigger, mergeBindings(this.bindings.get(trigger), { declare, extra: [handler], children })!);
	}

	/** The inputs and texts of the control's field the page rewrote with the chosen day: each its format of the values the calendar's `mmcalendar` event carries. */
	private labelField(raw: RawCalendar, trigger: Element): boolean {
		const effect = raw.effect!;
		if (!effect.field) return false;
		let scope: Element | undefined = trigger;
		while (scope && attr(scope, 'data-slot') !== 'field') scope = scope.parentNode && isElement(scope.parentNode as Node) ? (scope.parentNode as Element) : undefined;
		if (!scope) return false;
		const all = [...walk(scope)];
		const inputs = all.filter((e) => e.tagName === 'input');
		const leaves = all.filter((e) => !childrenOf(e).some(isElement));
		const textOf = (e: Element) => childrenOf(e).map((c) => (isText(c) ? c.value : '')).join('');
		const k = this.labels++;
		const labelOf = (after: string) => effect.candidates.find((c) => c.text === after.trim())?.label;
		const sets: string[] = [];
		const declare: string[] = [];
		const inTrigger = new Set([trigger, ...walk(trigger)]);
		const bind = (el: Element, before: string, label: DateLabel, binding: (v: string) => Binding) => {
			if (inTrigger.has(el)) return;
			const v = `rcf${k}_${sets.length}`;
			declare.push(`let ${v} = state(${lit(before)});`);
			sets.push(`${v} = racDateLabel(${JSON.stringify(label)}, values);`);
			this.bindings.set(el, mergeBindings(this.bindings.get(el), { declare, ...binding(v) })!);
		};
		for (const c of effect.field.inputs) {
			const el = inputs[c.index];
			const label = labelOf(c.after);
			if (el && label && (attr(el, 'value') ?? '') === c.before) bind(el, c.before, label, (v) => ({ omit: ['value'], extra: [`value={${v}}`] }));
		}
		for (const c of effect.field.texts) {
			const el = leaves[c.index];
			const label = labelOf(c.after);
			if (el && label && textOf(el) === c.before) bind(el, c.before, label, (v) => ({ children: `{${v}}` }));
		}
		if (!sets.length) return false;
		this.bindings.set(scope, mergeBindings(this.bindings.get(scope), { declare, extra: [`onMmcalendar={(event) => { const values = (event as CustomEvent<readonly string[]>).detail; if (values.length) { ${sets.join(' ')} } }}`] })!);
		return true;
	}

	private place(route: string, raw: RawCalendar, later: RawCalendar | undefined, root: Element | undefined, messages: (locale: string) => CalendarMessages | undefined, i: number): boolean {
		const note = (what: string) => this.notes.push(`${route} React Aria calendar ${i + 1}${raw.layer ? ` (in what ${raw.layer.sig.split('|')[2] || raw.layer.sig} opens)` : ''}: ${what}`);
		if (raw.why) return note(`not ported: ${raw.why}`), false;
		const msgs = messages(raw.locale!);
		if (!msgs) return note(`not ported: React Aria's messages for ${raw.locale} were not found in the old source`), false;
		if (!root) return note('not found in the converted page'), false;
		const config: RacCalendarConfig = { ...configOf(raw, later, msgs, note), ...(raw.effect?.closed ? { closeOnChange: true } : {}) };
		const today = raw.dates?.today;
		const todayIso = today ? `${today[0]}-${String(today[1] + 1).padStart(2, '0')}-${String(today[2]).padStart(2, '0')}` : undefined;
		const model = racCalendarModel(config, racCalendarView(config, todayIso));
		const off = differs(root, config, model);
		if (off) return note(`not ported: the port's render differs from the old page's: ${off}`), false;
		const k = this.n++;
		const v = `rc${k}`;
		const m = `rcm${k}`;
		const name = `${RAC_CONFIG_PREFIX}${hash(config)}`;
		const markup = template(root, config, model, m);
		if (markup === undefined) return note('not ported: markup the template does not know'), false;
		this.configs.set(name, config);
		this.roots.add(root);
		const declare = [`let ${v} = state(racCalendarView(${name}));`, `const ${m} = computed(() => racCalendarModel(${name}, ${v}));`];
		this.bindings.set(root, {
			declare,
			omit: ['aria-label', 'data-invalid'],
			extra: [
				'data-mm-rac-calendar=""',
				`aria-label={${m}.label}`,
				`data-invalid={${m}.invalid}`,
				...['onClick', 'onKeyDown', 'onFocusIn', 'onFocusOut', 'onPointerOver', 'onPointerDown', 'onPointerUp', 'onMmchoose'].map((on) => `${on}={(event) => { const next = racCalendarEvent(${name}, structuredClone(${v}), event); if (next) ${v} = next; }}`),
				`onIdle={() => { ${v} = racCalendarWake(${name}, ${v}); }}`,
			],
			children: markup,
		});
		return true;
	}
}

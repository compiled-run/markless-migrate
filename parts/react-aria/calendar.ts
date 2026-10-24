import { CalendarDate, DateFormatter, GregorianCalendar, createCalendar, endOfMonth, getDayOfWeek, getLocalTimeZone, getWeeksInMonth, isSameDay, isSameMonth, maxDate, minDate, startOfMonth, startOfWeek, toCalendar, today as todayIn, type Calendar, type DateDuration } from '@internationalized/date';
import { holdPressed, keyboardModality } from './interactions.ts';
import { closeOverlay, overlayOf } from './overlay.ts';

// React Aria's Calendar and RangeCalendar (react-aria-components 1.20: useCalendarState, useRangeCalendarState,
// useCalendarGrid, useCalendarCell, useCalendarHeading, the month and year pickers) on Markless state: the page keeps a
// view (the visible range's start, the focused date, the selection, a range's anchor) in a state(), renders the grid from
// racCalendarModel, and its root's handlers apply React Aria's own moves (racCalendarEvent). Dates are ISO strings of the
// Gregorian day; the calendar system, locale and time zone are the old page's, read by the converter.

/** A date the converter read: fixed, `t` days from today, or fixed or following today per component (as day-picker.ts). */
export type When = { readonly t: number } | { readonly y: number; readonly m: number; readonly d: number; readonly ry?: 1; readonly rm?: 1; readonly rd?: 1 };

/** React Aria's calendar messages for the page's locale, as templates of {date}, {dateRange}, {startDate}, {endDate}. */
export interface CalendarMessages {
	readonly next: string;
	readonly previous: string;
	readonly todayDate: string;
	readonly todayDateSelected: string;
	readonly dateSelected: string;
	readonly selectedDateDescription: string;
	readonly selectedRangeDescription: string;
	readonly dateRange: string;
	readonly minimumDate: string;
	readonly maximumDate: string;
}

/** A value per combination of render props: `keys` are the props that change it, `table[mask]` its value (bit i = keys[i]). */
export interface RenderTable {
	readonly keys: readonly string[];
	readonly table: readonly string[];
}

export interface RacCalendarConfig {
	readonly locale: string;
	readonly rtl?: boolean;
	/** The calendar system (the locale's `-u-ca-`, else its default). */
	readonly cal: string;
	/** The time zone of the value, when it was not the visitor's own. */
	readonly tz?: string;
	readonly months: number;
	readonly range?: boolean;
	readonly multiple?: boolean;
	readonly disabled?: boolean;
	readonly readOnly?: boolean;
	readonly invalid?: boolean;
	readonly firstDayOfWeek?: 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
	readonly weeks?: number;
	readonly pageBehavior?: 'visible' | 'single';
	readonly min?: When;
	readonly max?: When;
	/** The days isDateUnavailable answered true for, as inclusive spans, over the years around the capture. */
	readonly unavailable?: readonly (readonly [When, When])[];
	readonly value?: When | null;
	readonly values?: readonly When[];
	readonly rangeValue?: readonly [When, When] | null;
	readonly focused?: When;
	readonly msgs: CalendarMessages;
	readonly headerFormat?: { readonly day?: string; readonly month?: string; readonly year?: string; readonly era?: string };
	readonly monthFormat?: string;
	readonly yearFormat?: { readonly year?: string; readonly era?: string };
	/** The cell's class name per render props (CalendarCell's className function, evaluated by the converter). */
	readonly cls?: RenderTable;
	/** The cell's own element's attributes (shadcn's day div) per render props: attrs[i] takes table[mask][i]. */
	readonly inner?: { readonly attrs: readonly string[]; readonly keys: readonly string[]; readonly table: readonly (readonly string[])[] };
	/** In a popover: choosing closes it (the page's onChange closed the popover it controls). */
	readonly closeOnChange?: boolean;
}

/** What the page keeps on state(). */
export interface RacCalendarView {
	/** Today, as the page last saw it. */
	readonly t: string;
	/** The visible range's start. */
	readonly s: string;
	readonly f: string;
	readonly v: readonly string[];
	/** A range calendar's committed range, and the anchor of one being chosen. */
	readonly r?: readonly [string, string] | null;
	readonly a?: string | null;
	/** Whether the calendar has focus (state.isFocused): the focused cell then carries data-focused. */
	readonly o?: boolean;
	/** Bumped on each change, so a write the page has not applied yet is not lost. */
	readonly n?: number;
}

export interface CellModel {
	readonly key: string;
	readonly ariaSelected?: string;
	readonly ariaDisabled?: string;
	readonly ariaInvalid?: string;
	readonly tabindex?: string;
	readonly label: string;
	readonly unavailable?: string;
	readonly disabled?: string;
	readonly outsideRange?: string;
	readonly outsideMonth?: string;
	readonly selected?: string;
	readonly selectionStart?: string;
	readonly selectionEnd?: string;
	readonly invalid?: string;
	readonly today?: string;
	readonly cls: string;
	readonly inner: readonly string[];
	readonly text: string;
}

export interface MonthModel {
	readonly key: string;
	readonly heading: string;
	readonly grid: string;
	readonly monthLabel: string;
	readonly yearLabel: string;
	readonly weeks: readonly { readonly key: string; readonly days: readonly CellModel[] }[];
}

export interface RacCalendarModel {
	readonly label: string;
	readonly prevDisabled?: string;
	readonly nextDisabled?: string;
	readonly invalid?: string;
	readonly multiselectable?: string;
	readonly months: readonly MonthModel[];
}

// --- Dates ---------------------------------------------------------------------------------------------------------

const gregorian = new GregorianCalendar();
const iso = (d: CalendarDate) => toCalendar(d, gregorian).toString();
const calendars = new Map<string, Calendar>();
const calendarOf = (config: RacCalendarConfig) => calendars.get(config.cal) ?? (calendars.set(config.cal, createCalendar(config.cal as Parameters<typeof createCalendar>[0])), calendars.get(config.cal)!);
function dateOf(config: RacCalendarConfig, value: string): CalendarDate {
	const [y, m, d] = value.split('-').map(Number) as [number, number, number];
	return toCalendar(new CalendarDate(y, m, d), calendarOf(config));
}
const zone = (config: RacCalendarConfig) => config.tz ?? getLocalTimeZone();
export const todayIso = (config: RacCalendarConfig): string => iso(todayIn(zone(config)));

/** A converter's When on today's date (ISO). */
export function resolve(when: When, today: string): string {
	const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
	if ('t' in when) return new CalendarDate(ty, tm, td).add({ days: when.t }).toString();
	const date = new CalendarDate(when.ry ? ty + when.y : when.y, 1, 1).add({ months: (when.rm ? tm - 1 + when.m : when.m) }).add({ days: (when.rd ? td - 1 + when.d : when.d - 1) });
	return date.toString();
}

const formatters = new Map<string, DateFormatter>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): DateFormatter {
	const key = `${locale}|${JSON.stringify(options)}`;
	return formatters.get(key) ?? (formatters.set(key, new DateFormatter(locale, options)), formatters.get(key)!);
}
const fill = (template: string, args: Readonly<Record<string, string>>) => template.replace(/\{(\w+)\}/g, (_, k: string) => args[k] ?? '');

interface Bounds {
	readonly min?: CalendarDate;
	readonly max?: CalendarDate;
}
const isInvalid = (d: CalendarDate, b: Bounds) => (b.min != null && d.compare(b.min) < 0) || (b.max != null && d.compare(b.max) > 0);
function constrain(d: CalendarDate, b: Bounds): CalendarDate {
	if (b.min) d = maxDate(d, b.min) ?? d;
	if (b.max) d = minDate(d, b.max) ?? d;
	return d;
}

// alignStart, alignEnd, alignCenter and constrainStart (react-stately calendar utils) for a duration of months.
function alignStart(config: RacCalendarConfig, date: CalendarDate, duration: DateDuration, b: Bounds = {}): CalendarDate {
	return constrainStart(config, date, duration.years ? date.set({ month: 1, day: 1 }) : startOfMonth(date), duration, b);
}
function alignEnd(config: RacCalendarConfig, date: CalendarDate, duration: DateDuration, b: Bounds = {}): CalendarDate {
	const d = { ...duration } as { months?: number; years?: number };
	if (d.months) d.months--;
	else if (d.years) d.years--;
	return constrainStart(config, date, alignStart(config, date, duration).subtract(d), duration, b);
}
function alignCenter(config: RacCalendarConfig, date: CalendarDate, duration: DateDuration, b: Bounds = {}): CalendarDate {
	const half: Record<string, number> = {};
	for (const [key, value] of Object.entries(duration) as [string, number][]) {
		half[key] = Math.floor(value / 2);
		if (half[key]! > 0 && value % 2 === 0) half[key]!--;
	}
	return constrainStart(config, date, alignStart(config, date, duration).subtract(half), duration, b);
}
function constrainStart(config: RacCalendarConfig, date: CalendarDate, aligned: CalendarDate, duration: DateDuration, b: Bounds): CalendarDate {
	if (b.min && date.compare(b.min) >= 0) aligned = maxDate(aligned, alignStart(config, b.min, duration)) ?? aligned;
	if (b.max && date.compare(b.max) <= 0) aligned = minDate(aligned, alignEnd(config, b.max, duration)) ?? aligned;
	return aligned;
}

// --- The state React Aria derives from props and the view ------------------------------------------------------------

interface State {
	readonly config: RacCalendarConfig;
	readonly view: RacCalendarView;
	readonly duration: DateDuration;
	readonly page: DateDuration;
	readonly start: CalendarDate;
	readonly end: CalendarDate;
	readonly focused: CalendarDate;
	readonly today: CalendarDate;
	/** The bounds cells are judged by (a range's anchor narrows them past the nearest unavailable days). */
	readonly bounds: Bounds;
	/** The props' own bounds. */
	readonly given: Bounds;
	readonly unavailable: (d: CalendarDate) => boolean;
	readonly value: readonly CalendarDate[];
	readonly highlighted: { readonly start: CalendarDate; readonly end: CalendarDate } | null;
	readonly anchor: CalendarDate | null;
	readonly valueInvalid: boolean;
}

const spansOf = new WeakMap<RacCalendarConfig, Map<string, readonly (readonly [string, string])[]>>();
function unavailableSpans(config: RacCalendarConfig, today: string): readonly (readonly [string, string])[] {
	const byToday = spansOf.get(config) ?? (spansOf.set(config, new Map()), spansOf.get(config)!);
	return byToday.get(today) ?? (byToday.set(today, (config.unavailable ?? []).map(([a, b]) => [resolve(a, today), resolve(b, today)] as const)), byToday.get(today)!);
}

// nextUnavailableDate (useRangeCalendarState): the first unavailable day from the anchor, within a page either way.
function nextUnavailable(anchor: CalendarDate, unavailable: (d: CalendarDate) => boolean, duration: DateDuration, dir: 1 | -1): CalendarDate | undefined {
	let next = anchor.add({ days: dir });
	const limit = (dir === -1 ? anchor.subtract(duration) : anchor.add(duration));
	while (dir === -1 ? next.compare(limit) >= 0 : next.compare(limit) <= 0) {
		if (unavailable(next)) return next.add({ days: -dir });
		next = next.add({ days: dir });
	}
	return undefined;
}

function stateOf(config: RacCalendarConfig, view: RacCalendarView): State {
	const duration: DateDuration = { months: config.months };
	const page: DateDuration = config.pageBehavior === 'single' ? { months: 1 } : duration;
	const spans = unavailableSpans(config, view.t);
	const unavailable = (d: CalendarDate) => {
		const g = iso(d);
		return spans.some(([a, b]) => g >= a && g <= b);
	};
	const given: Bounds = { ...(config.min ? { min: dateOf(config, resolve(config.min, view.t)) } : {}), ...(config.max ? { max: dateOf(config, resolve(config.max, view.t)) } : {}) };
	const anchor = view.a ? dateOf(config, view.a) : null;
	let bounds = given;
	if (config.range && anchor && config.unavailable?.length) {
		const lo = nextUnavailable(anchor, unavailable, duration, -1);
		const hi = nextUnavailable(anchor, unavailable, duration, 1);
		bounds = { min: given.min && lo ? maxDate(given.min, lo) ?? lo : (lo ?? given.min), max: given.max && hi ? minDate(given.max, hi) ?? hi : (hi ?? given.max) } as Bounds;
	}
	const start = dateOf(config, view.s);
	const end = start.add({ ...duration }).subtract({ days: 1 });
	const value = config.range ? (view.r ? [dateOf(config, view.r[0]), dateOf(config, view.r[1])] : []) : view.v.map((v) => dateOf(config, v));
	const focused = dateOf(config, view.f);
	const range = (a: CalendarDate, b: CalendarDate) => (b.compare(a) < 0 ? { start: b, end: a } : { start: a, end: b });
	const highlighted = config.range ? (anchor ? range(anchor, focused) : value.length === 2 ? range(value[0]!, value[1]!) : null) : null;
	const valueInvalid = Boolean(config.invalid) || (config.range ? !anchor && value.length === 2 && (unavailable(value[0]!) || unavailable(value[1]!) || isInvalid(value[0]!, given) || isInvalid(value[1]!, given)) : value.some((d) => unavailable(d) || isInvalid(d, given)));
	return { config, view, duration, page, start, end, focused, today: dateOf(config, view.t), bounds, given, unavailable, value, highlighted, anchor, valueInvalid };
}

const cellDisabled = (s: State, d: CalendarDate) => Boolean(s.config.disabled) || d.compare(s.start) < 0 || d.compare(s.end) > 0 || isInvalid(d, s.bounds);
function isSelected(s: State, d: CalendarDate): boolean {
	if (cellDisabled(s, d) || s.unavailable(d)) return false;
	if (s.highlighted) return d.compare(s.highlighted.start) >= 0 && d.compare(s.highlighted.end) <= 0;
	return s.value.some((v) => isSameDay(v, d));
}

// --- The view on load ----------------------------------------------------------------------------------------------

/** The view a calendar opens with: today, the value, and the focused date and visible range React Aria derives from them. */
export function racCalendarView(config: RacCalendarConfig, today: string = todayIso(config)): RacCalendarView {
	const values = config.range ? [] : config.multiple ? (config.values ?? []).map((w) => resolve(w, today)) : config.value ? [resolve(config.value, today)] : [];
	const r = config.range && config.rangeValue ? ([resolve(config.rangeValue[0], today), resolve(config.rangeValue[1], today)] as const) : null;
	const base: RacCalendarView = { t: today, s: today, f: today, v: values, ...(config.range ? { r } : {}) };
	const s = stateOf(config, base);
	const first = config.focused ? dateOf(config, resolve(config.focused, today)) : config.range ? (r ? dateOf(config, r[0]) : s.today) : (s.value[0] ?? s.today);
	const focused = constrain(first, s.given);
	let alignment: 'center' | 'start' = 'center';
	if (config.range && r) {
		const from = alignCenter(config, dateOf(config, r[0]), s.duration, s.given);
		if (dateOf(config, r[1]).compare(from.add({ ...s.duration }).subtract({ days: 1 })) > 0) alignment = 'start';
	}
	const start = alignment === 'start' ? alignStart(config, focused, s.duration, s.given) : alignCenter(config, focused, s.duration, s.given);
	return { ...base, f: iso(focused), s: iso(start) };
}

// --- The model the page renders ----------------------------------------------------------------------------------------

function bits(table: RenderTable | { keys: readonly string[] } | undefined, props: Readonly<Record<string, boolean>>): number {
	let mask = 0;
	table?.keys.forEach((key, i) => {
		if (props[key]) mask |= 1 << i;
	});
	return mask;
}

/** The range or month that the calendar's labels name, as React Aria's useVisibleRangeDescription writes it. */
function rangeDescription(s: State, start: CalendarDate, end: CalendarDate, aria: boolean): string {
	const { locale, msgs } = s.config;
	const tz = zone(s.config);
	const opts = { calendar: start.calendar.identifier, timeZone: tz };
	const monthFmt = formatter(locale, { month: 'long', year: 'numeric', ...opts });
	const dateFmt = formatter(locale, { month: 'long', year: 'numeric', day: 'numeric', ...opts });
	const formattable = (d: CalendarDate) => ((d.calendar as Calendar & { getFormattableMonth?: (d: CalendarDate) => CalendarDate }).getFormattableMonth?.(d) ?? d);
	const ranged = (f: DateFormatter, a: CalendarDate, b: CalendarDate) => {
		const parts = f.formatRangeToParts(a.toDate(tz), b.toDate(tz));
		let sep = -1;
		for (let i = 0; i < parts.length; i++) {
			const p = parts[i]!;
			if (p.source === 'shared' && p.type === 'literal') sep = i;
			else if (p.source === 'endRange') break;
		}
		let from = '';
		let to = '';
		parts.forEach((p, i) => {
			if (i < sep) from += p.value;
			else if (i > sep) to += p.value;
		});
		return fill(msgs.dateRange, { startDate: from, endDate: to });
	};
	if (isSameDay(start, startOfMonth(start))) {
		const a = formattable(start);
		const b = formattable(end);
		if (isSameDay(end, endOfMonth(start))) return monthFmt.format(a.toDate(tz));
		if (isSameDay(end, endOfMonth(end))) return aria ? ranged(monthFmt, a, b) : monthFmt.formatRange(a.toDate(tz), b.toDate(tz));
	}
	return aria ? ranged(dateFmt, start, end) : dateFmt.formatRange(start.toDate(tz), end.toDate(tz));
}

function selectedDescription(s: State): string {
	const { locale, msgs } = s.config;
	const tz = zone(s.config);
	const fmt = formatter(locale, { weekday: 'long', month: 'long', year: 'numeric', day: 'numeric', timeZone: tz });
	if (s.anchor) return '';
	const start = s.highlighted?.start ?? s.value[0];
	const end = s.highlighted?.end ?? s.value[s.value.length - 1];
	if (!start || !end) return '';
	if (isSameDay(start, end)) return fill(msgs.selectedDateDescription, { date: fmt.format(start.toDate(tz)) });
	if (s.config.range) {
		const parts = fmt.formatRangeToParts(start.toDate(tz), end.toDate(tz));
		let sep = -1;
		for (let i = 0; i < parts.length; i++) {
			const p = parts[i]!;
			if (p.source === 'shared' && p.type === 'literal') sep = i;
			else if (p.source === 'endRange') break;
		}
		let a = '';
		let b = '';
		parts.forEach((p, i) => {
			if (i < sep) a += p.value;
			else if (i > sep) b += p.value;
		});
		return fill(msgs.selectedRangeDescription, { dateRange: fill(msgs.dateRange, { startDate: a, endDate: b }) });
	}
	return fill(msgs.selectedDateDescription, { date: new Intl.ListFormat(locale).format(s.value.map((d) => fmt.format(d.toDate(tz)))) });
}

function cellOf(s: State, date: CalendarDate, month: CalendarDate, describe: string): CellModel {
	const { config } = s;
	const tz = zone(config);
	const outsideMonth = !isSameMonth(month, date);
	const focusedCell = Boolean(s.view.o) && isSameDay(date, s.focused) && !outsideMonth;
	const disabled = cellDisabled(s, date) || outsideMonth;
	const unavailable = s.unavailable(date);
	const selectable = !disabled && !unavailable;
	let selected = isSelected(s, date) && selectable;
	let invalid = false;
	if (s.valueInvalid) {
		if (config.range) invalid = !s.anchor && s.highlighted != null && date.compare(s.highlighted.start) >= 0 && date.compare(s.highlighted.end) <= 0;
		else invalid = s.value.some((v) => isSameDay(v, date));
	}
	if (invalid && !disabled) selected = true;
	const today = isSameDay(date, s.today);
	const fmt = formatter(config.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
	let label = '';
	if (config.range && s.value.length === 2 && !s.anchor && (isSameDay(date, s.value[0]!) || isSameDay(date, s.value[1]!))) label = `${describe}, `;
	label += fmt.format(date.toDate(tz));
	if (today) label = fill(selected ? config.msgs.todayDateSelected : config.msgs.todayDate, { date: label });
	else if (selected) label = fill(config.msgs.dateSelected, { date: label });
	if (s.given.min && isSameDay(date, s.given.min)) label += `, ${config.msgs.minimumDate}`;
	else if (s.given.max && isSameDay(date, s.given.max)) label += `, ${config.msgs.maximumDate}`;
	const start = Boolean(s.highlighted && isSameDay(date, s.highlighted.start));
	const end = Boolean(s.highlighted && isSameDay(date, s.highlighted.end));
	const outsideRange = date.compare(s.start) < 0 || date.compare(s.end) > 0;
	const props: Record<string, boolean> = { isToday: today, isSelected: selected, isSelectionStart: start, isSelectionEnd: end, isUnavailable: unavailable, isDisabled: disabled, isOutsideMonth: outsideMonth, isOutsideVisibleRange: outsideRange, isInvalid: invalid, isFocused: focusedCell };
	const text = formatter(config.locale, { day: 'numeric', timeZone: tz, calendar: date.calendar.identifier }).formatToParts(date.toDate(tz)).find((p) => p.type === 'day')!.value;
	const t = (v: boolean) => (v ? 'true' : undefined);
	return {
		key: iso(date),
		ariaSelected: t(selected),
		ariaDisabled: t(!selectable),
		ariaInvalid: t(invalid),
		tabindex: disabled ? undefined : isSameDay(date, s.focused) ? '0' : '-1',
		label,
		unavailable: t(unavailable),
		disabled: t(disabled),
		outsideRange: t(outsideRange),
		outsideMonth: t(outsideMonth),
		selected: t(selected),
		selectionStart: t(start),
		selectionEnd: t(end),
		invalid: t(invalid),
		today: t(today),
		cls: config.cls?.table[bits(config.cls, props)] ?? '',
		inner: config.inner?.table[bits(config.inner, props)] ?? [],
		text,
	};
}

function weeksIn(s: State, month: CalendarDate): number {
	return s.config.weeks || getWeeksInMonth(month, s.config.locale, s.config.firstDayOfWeek);
}

function datesInWeek(s: State, week: number, from: CalendarDate): (CalendarDate | null)[] {
	let date = startOfWeek(from.add({ weeks: week }), s.config.locale, s.config.firstDayOfWeek);
	const out: (CalendarDate | null)[] = [];
	for (let i = 0; i < getDayOfWeek(date, s.config.locale, s.config.firstDayOfWeek); i++) out.push(null);
	while (out.length < 7) {
		out.push(date);
		const next = date.add({ days: 1 });
		if (isSameDay(date, next)) break;
		date = next;
	}
	while (out.length < 7) out.push(null);
	return out;
}

/** The years the year picker lists (useCalendarYearPicker: 20 around the focused date, kept inside the bounds). */
function pickerYears(s: State): CalendarDate[] {
	let lo = s.focused.subtract({ years: 10 });
	let hi = s.focused.add({ years: 9 });
	if (s.given.max && hi.compare(s.given.max) > 0) {
		hi = s.given.max;
		lo = hi.subtract({ years: 19 });
	}
	if (s.given.min && lo.compare(s.given.min) < 0) {
		lo = s.given.min;
		hi = lo.add({ years: 19 });
		if (s.given.max && hi.compare(s.given.max) > 0) hi = s.given.max;
	}
	const out: CalendarDate[] = [];
	for (let d = lo; d.compare(hi) <= 0; d = d.add({ years: 1 })) out.push(d);
	return out;
}
const yearLabel = (s: State, d: CalendarDate) => formatter(s.config.locale, { year: (s.config.yearFormat?.year ?? 'numeric') as 'numeric', ...(s.config.yearFormat?.era ? { era: s.config.yearFormat.era as 'short' } : {}), calendar: d.calendar.identifier, timeZone: zone(s.config) }).format(d.toDate(zone(s.config)));
const monthLabelOf = (s: State, d: CalendarDate) => {
	const shown = (d.calendar as Calendar & { getFormattableMonth?: (d: CalendarDate) => CalendarDate }).getFormattableMonth?.(d) ?? d;
	return formatter(s.config.locale, { month: (s.config.monthFormat ?? 'short') as 'short', calendar: d.calendar.identifier, timeZone: zone(s.config) }).format(shown.toDate(zone(s.config)));
};

export function racCalendarModel(config: RacCalendarConfig, view: RacCalendarView): RacCalendarModel {
	const s = stateOf(config, view);
	const describe = selectedDescription(s);
	const tz = zone(config);
	const h = config.headerFormat;
	const months: MonthModel[] = [];
	for (let k = 0; k < config.months; k++) {
		const month = s.start.add({ months: k });
		const weeks = Array.from({ length: weeksIn(s, month) }, (_, w) => ({ key: `${k}:${w}`, days: datesInWeek(s, w, month).map((d) => (d ? cellOf(s, d, month, describe) : ({ key: `${k}:${w}:x`, label: '', cls: '', inner: [], text: '' } as CellModel))) }));
		const headingFmt = formatter(config.locale, { ...(h?.day ? { day: h.day as 'numeric' } : {}), month: (h?.month ?? 'long') as 'long', year: (h?.year ?? 'numeric') as 'numeric', ...(h?.era ? { era: h.era as 'short' } : {}), calendar: month.calendar.identifier, timeZone: tz });
		const shown = (month.calendar as Calendar & { getFormattableMonth?: (d: CalendarDate) => CalendarDate }).getFormattableMonth?.(month) ?? month;
		months.push({ key: String(k), heading: headingFmt.format(shown.toDate(tz)), grid: rangeDescription(s, month, endOfMonth(month), true), monthLabel: monthLabelOf(s, s.focused), yearLabel: yearLabel(s, s.focused), weeks });
	}
	const t = (v: boolean) => (v ? 'true' : undefined);
	const prev = s.start.subtract({ days: 1 });
	const next = s.end.add({ days: 1 });
	return {
		label: rangeDescription(s, s.start, s.end, true),
		prevDisabled: t(Boolean(config.disabled) || isSameDay(prev, s.start) || isInvalid(prev, s.bounds)),
		nextDisabled: t(Boolean(config.disabled) || isSameDay(next, s.end) || isInvalid(next, s.bounds)),
		invalid: t(s.valueInvalid),
		multiselectable: t(Boolean(config.range || config.multiple)),
		months,
	};
}

// --- Moves -----------------------------------------------------------------------------------------------------------

function withFocus(config: RacCalendarConfig, view: RacCalendarView, s: State, date: CalendarDate): RacCalendarView {
	const focused = constrain(date, s.bounds);
	let start = s.start;
	if (focused.compare(s.start) < 0) start = alignEnd(config, focused, s.duration, s.given);
	else if (focused.compare(s.end) > 0) start = alignStart(config, focused, s.duration, s.given);
	return { ...view, f: iso(focused), s: iso(start), o: true };
}

function page(config: RacCalendarConfig, view: RacCalendarView, s: State, dir: 1 | -1): RacCalendarView {
	const start = dir === 1 ? s.start.add(s.page) : s.start.subtract(s.page);
	const focused = constrain(dir === 1 ? s.focused.add(s.page) : s.focused.subtract(s.page), s.given);
	const aligned = alignStart(config, constrainStart(config, s.focused, start, s.page, s.given), s.page);
	return { ...view, f: iso(focused), s: iso(aligned) };
}

// previousAvailableDate: a chosen unavailable day falls back to the nearest available one before it.
function previousAvailable(s: State, date: CalendarDate): CalendarDate | null {
	while (date.compare(s.start) >= 0 && s.unavailable(date)) date = date.subtract({ days: 1 });
	return date.compare(s.start) >= 0 ? date : null;
}

function select(config: RacCalendarConfig, view: RacCalendarView, s: State, date: CalendarDate): RacCalendarView {
	if (config.disabled || config.readOnly) return view;
	if (config.range) {
		const chosen = previousAvailable(s, constrain(date, s.bounds));
		if (!chosen) return view;
		if (!s.anchor) return { ...view, a: iso(chosen) };
		const [a, b] = s.anchor.compare(chosen) <= 0 ? [s.anchor, chosen] : [chosen, s.anchor];
		return { ...view, r: [iso(a), iso(b)], a: null };
	}
	const chosen = previousAvailable(s, constrain(date, s.given));
	if (!chosen) return view;
	if (config.multiple) {
		const at = view.v.indexOf(iso(chosen));
		return { ...view, v: at >= 0 ? [...view.v.slice(0, at), ...view.v.slice(at + 1)] : [...view.v, iso(chosen)] };
	}
	return { ...view, v: [iso(chosen)] };
}

export type RacCalendarAction =
	| { readonly t: 'focus'; readonly date: string }
	| { readonly t: 'press'; readonly date: string; readonly month: number; readonly phase: 'start' | 'up' | 'click'; readonly pointer: string }
	| { readonly t: 'hover'; readonly date: string }
	| { readonly t: 'key'; readonly key: string; readonly shift: boolean }
	| { readonly t: 'page'; readonly dir: 1 | -1 }
	| { readonly t: 'blur' }
	| { readonly t: 'release' }
	| { readonly t: 'month'; readonly month: number }
	| { readonly t: 'year'; readonly label: string };

// A press that began on the anchor it set (useCalendarCell's isAnchorPressed) does not finish the range on release.
const anchorPressed = new WeakMap<object, boolean>();

export function racCalendarNext(config: RacCalendarConfig, view: RacCalendarView, action: RacCalendarAction, root?: object): RacCalendarView {
	const s = stateOf(config, view);
	const bump = (next: RacCalendarView): RacCalendarView => (next === view ? view : { ...next, n: (view.n ?? 0) + 1 });
	switch (action.t) {
		case 'focus': {
			const d = dateOf(config, action.date);
			if (cellDisabled(s, d)) return view;
			return bump(withFocus(config, view, s, d));
		}
		case 'blur':
			return view.o ? bump({ ...view, o: false }) : view;
		case 'hover':
			if (!config.range || !s.anchor) return view;
			return bump(withFocus(config, view, s, dateOf(config, action.date)));
		case 'page':
			return bump(page(config, view, s, action.dir));
		case 'month':
			return bump(withFocus(config, view, s, s.focused.set({ month: action.month })));
		case 'year': {
			const years = pickerYears(s);
			let found = years.find((d) => yearLabel(s, d) === action.label);
			for (let k = 1; !found && k < 300; k++) found = [s.focused.add({ years: k }), s.focused.subtract({ years: k })].find((d) => yearLabel(s, d) === action.label);
			return found ? bump(withFocus(config, view, s, found)) : view;
		}
		case 'release':
			if (root) anchorPressed.set(root, false);
			return view;
		case 'press': {
			const d = dateOf(config, action.date);
			const selectable = !cellDisabled(s, d) && !s.unavailable(d) && isSameMonth(d, s.start.add({ months: action.month }));
			if (!selectable || config.readOnly) return view;
			if (!config.range) {
				if (action.phase !== 'click') return view;
				return bump(withFocus(config, select(config, view, s, d), s, d));
			}
			if (action.phase === 'start') {
				if (s.anchor) return view;
				if (s.highlighted && !s.valueInvalid && (isSameDay(d, s.highlighted.start) || isSameDay(d, s.highlighted.end))) {
					if (root) anchorPressed.set(root, false);
					const other = isSameDay(d, s.highlighted.start) ? s.highlighted.end : s.highlighted.start;
					return bump(withFocus(config, { ...view, a: iso(other) }, s, d));
				}
				if (root) anchorPressed.set(root, true);
				const next = select(config, view, s, d);
				return bump(withFocus(config, next, stateOf(config, next), d));
			}
			if (action.phase === 'up') {
				const pressed = root ? anchorPressed.get(root) : false;
				if (root) anchorPressed.set(root, false);
				if (s.anchor && !pressed) {
					const next = select(config, view, s, d);
					return bump(withFocus(config, next, stateOf(config, next), d));
				}
			}
			return view;
		}
		case 'key': {
			const rtl = Boolean(config.rtl);
			const at = s.focused;
			switch (action.key) {
				case 'ArrowLeft':
					return bump(withFocus(config, view, s, at.add({ days: rtl ? 1 : -1 })));
				case 'ArrowRight':
					return bump(withFocus(config, view, s, at.add({ days: rtl ? -1 : 1 })));
				case 'ArrowUp':
					return bump(withFocus(config, view, s, at.subtract({ weeks: 1 })));
				case 'ArrowDown':
					return bump(withFocus(config, view, s, at.add({ weeks: 1 })));
				case 'Home':
					return bump(withFocus(config, view, s, startOfMonth(at)));
				case 'End':
					return bump(withFocus(config, view, s, endOfMonth(at)));
				case 'PageUp':
					return bump(withFocus(config, view, s, action.shift ? at.subtract({ years: 1 }) : at.subtract({ months: 1 })));
				case 'PageDown':
					return bump(withFocus(config, view, s, action.shift ? at.add({ years: 1 }) : at.add({ months: 1 })));
				case 'Escape':
					return config.range && s.anchor ? bump({ ...view, a: null }) : view;
				case 'Enter':
				case ' ': {
					if (s.unavailable(at) || cellDisabled(s, at)) return view;
					if (!config.range) return bump(withFocus(config, select(config, view, s, at), s, at));
					// useCalendarCell's keyboard press: the first sets the anchor and moves to the nearest available day.
					const next = select(config, view, s, at);
					const ns = stateOf(config, next);
					if (!s.anchor && ns.anchor) {
						const bad = (d: CalendarDate) => isInvalid(d, ns.bounds);
						let near = at.add({ days: 1 });
						if (bad(near)) near = at.subtract({ days: 1 });
						return bump(bad(near) ? next : withFocus(config, next, ns, near));
					}
					return bump(next);
				}
				default:
					return view;
			}
		}
	}
}

// --- Browser events -----------------------------------------------------------------------------------------------

const ROOT = '[data-mm-rac-calendar]';
const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ', 'Escape']);
const latest = new WeakMap<Element, RacCalendarView>();

/** The date of the cell an element is in, by its place in the grid (React Aria writes no date on a cell). */
function placeOf(root: Element, el: Element | null): { readonly month: number; readonly week: number; readonly day: number } | undefined {
	const td = el?.closest('td');
	const table = td?.closest('table');
	if (!td || !table || !root.contains(table)) return undefined;
	const tr = td.parentElement!;
	const month = [...root.querySelectorAll('table')].indexOf(table);
	const week = [...tr.parentElement!.children].indexOf(tr);
	return { month, week, day: [...tr.children].indexOf(td) };
}
function dateAt(config: RacCalendarConfig, view: RacCalendarView, root: Element, el: Element | null): { readonly date: string; readonly month: number } | undefined {
	const at = placeOf(root, el);
	if (!at) return undefined;
	const key = racCalendarModel(config, view).months[at.month]?.weeks[at.week]?.days[at.day]?.key;
	return key && !key.includes(':') ? { date: key, month: at.month } : undefined;
}
const inCell = (root: Element, el: Element | null) => Boolean(placeOf(root, el)) && Boolean(el?.closest('[role="button"]'));

function actionOf(config: RacCalendarConfig, view: RacCalendarView, event: Event, root: Element): RacCalendarAction | undefined {
	const target = event.target instanceof Element ? event.target : null;
	if (!target) return undefined;
	const cell = inCell(root, target) ? dateAt(config, view, root, target) : undefined;
	const date = cell?.date ?? null;
	const pointer = (event as PointerEvent).pointerType || 'mouse';
	switch (event.type) {
		case 'focusin':
			return date ? { t: 'focus', date } : undefined;
		case 'focusout': {
			const to = (event as FocusEvent).relatedTarget;
			return to instanceof Node && root.querySelector('table')?.contains(to) ? undefined : target.closest('table') ? { t: 'blur' } : undefined;
		}
		case 'pointerover':
			return date && pointer !== 'touch' ? { t: 'hover', date } : undefined;
		case 'pointerdown':
			return cell && (event as PointerEvent).button === 0 ? { t: 'press', date: cell.date, month: cell.month, phase: 'start', pointer } : undefined;
		case 'pointerup':
			return cell ? { t: 'press', date: cell.date, month: cell.month, phase: 'up', pointer } : { t: 'release' };
		case 'click': {
			if (cell) return { t: 'press', date: cell.date, month: cell.month, phase: 'click', pointer };
			const nav = target.closest('button[slot="previous"], button[slot="next"]');
			if (nav && !nav.hasAttribute('disabled')) return { t: 'page', dir: nav.getAttribute('slot') === 'next' ? 1 : -1 };
			return undefined;
		}
		case 'keydown': {
			const e = event as KeyboardEvent;
			return date && KEYS.has(e.key) ? { t: 'key', key: e.key, shift: e.shiftKey } : undefined;
		}
		case 'mmchoose': {
			const trigger = target.closest('[aria-haspopup="listbox"]');
			const label = (event as CustomEvent<string>).detail;
			if (!trigger || typeof label !== 'string') return undefined;
			const pickers = [...root.querySelectorAll('[aria-haspopup="listbox"]')];
			const which = pickers.indexOf(trigger) % 2;
			if (which === 0) {
				const key = Number(document.querySelector(`[data-mm-layer="${CSS.escape(trigger.id)}"] [role="option"][aria-selected="true"]`)?.getAttribute('data-key'));
				return Number.isFinite(key) ? { t: 'month', month: key } : undefined;
			}
			return { t: 'year', label: label.trim() };
		}
		default:
			return undefined;
	}
}

/** The view after a browser event on the calendar's root; undefined when the event changes nothing. */
export function racCalendarEvent(config: RacCalendarConfig, read: RacCalendarView, event: Event): RacCalendarView | undefined {
	// Markless delegates events: the calendar is the root around the target, not the event's currentTarget.
	const root = event.target instanceof Element ? event.target.closest(ROOT) : null;
	if (!root) return undefined;
	const had = latest.get(root);
	const view = had && (had.n ?? 0) > (read.n ?? 0) ? had : read;
	if (event.type === 'keydown' && KEYS.has((event as KeyboardEvent).key) && inCell(root, event.target as Element)) event.preventDefault();
	const action = actionOf(config, view, event, root);
	if (!action) return undefined;
	const next = racCalendarNext(config, view, action, root);
	if (next === view) return undefined;
	latest.set(root, next);
	settle(config, root, view, next, event.type === 'keydown' || event.type === 'click' || event.type === 'pointerdown');
	if (JSON.stringify(next.v) !== JSON.stringify(view.v) || JSON.stringify(next.r ?? null) !== JSON.stringify(view.r ?? null)) changed(config, root, next);
	return next;
}

// The month and year pickers' listboxes are layers the select part opens: the option chosen is the one the picker shows.
function syncPicker(root: Element, target: Element): void {
	const trigger = target.closest('[aria-haspopup="listbox"]');
	if (!trigger || !root.contains(trigger) || !trigger.id) return;
	const shown = (trigger.querySelector('[data-slot="select-value"]')?.textContent ?? '').trim();
	for (const option of document.querySelectorAll<HTMLElement>(`[data-mm-layer="${CSS.escape(trigger.id)}"] [role="option"]`)) {
		const on = (option.textContent ?? '').trim() === shown;
		option.setAttribute('aria-selected', String(on));
		if (on) option.setAttribute('data-selected', 'true');
		else option.removeAttribute('data-selected');
		for (const icon of option.querySelectorAll('[data-mm-indicator]')) icon.toggleAttribute('hidden', !on);
	}
}

/**
 * Once Markless has drawn the new view: the focused cell takes the browser's focus when React Aria's would (it moved by
 * key or press while the calendar had focus), and a button that became disabled hands focus to the grid, as
 * useCalendarBase does.
 */
function settle(config: RacCalendarConfig, root: Element, before: RacCalendarView, after: RacCalendarView, moved: boolean): void {
	if (typeof requestAnimationFrame !== 'function') return;
	const wantsFocus = moved && after.o && (before.f !== after.f || before.s !== after.s || !before.o);
	if (!wantsFocus) return;
	const model = racCalendarModel(config, after);
	let place: [number, number, number] | undefined;
	model.months.forEach((m, k) => m.weeks.forEach((w, i) => w.days.forEach((d, j) => {
		if (!place && d.key === after.f && d.tabindex === '0') place = [k, i, j];
	})));
	const drawn = () => {
		if (!place) return null;
		const cell = root.querySelectorAll('table')[place[0]]?.querySelector('tbody')?.children[place[1]]?.children[place[2]]?.querySelector<HTMLElement>('[role="button"][tabindex="0"]');
		return cell && cell.getAttribute('aria-label') === model.months[place[0]]!.weeks[place[1]]!.days[place[2]]!.label ? cell : null;
	};
	const apply = () => {
		const cell = drawn();
		if (cell && document.activeElement !== cell) cell.focus({ preventScroll: !keyboardModality() });
	};
	requestAnimationFrame(() => {
		if (drawn()) return apply();
		const watch = new MutationObserver(() => {
			if (!drawn()) return;
			watch.disconnect();
			apply();
		});
		watch.observe(root, { subtree: true, attributes: true, attributeFilter: ['tabindex', 'aria-label'] });
		setTimeout(() => watch.disconnect(), 1000);
	});
}

/**
 * A popover's calendar tells the control that opened it what was chosen (the page shows it there: convert's trigger
 * label), and closes the popover when the page's onChange did.
 */
function changed(config: RacCalendarConfig, root: Element, view: RacCalendarView): void {
	const o = overlayOf(root);
	if (!o) return;
	const values = config.range ? (view.r ? [...view.r] : []) : [...view.v];
	o.trigger.dispatchEvent(new CustomEvent('mmcalendar', { detail: values, bubbles: true }));
	if (config.closeOnChange && values.length) {
		holdPressed(o.trigger, false);
		closeOverlay(o);
	}
}

/** How a page writes a chosen value: toLocaleDateString's or a DateTimeFormat's (convert's DateLabel). */
export interface DateLabel {
	readonly loc: string | null;
	readonly opts: Intl.DateTimeFormatOptions;
	readonly range?: 'format' | ' - ' | ' – ';
}

/** The text a page shows for chosen days (ISO, local), as it wrote it with the label's format. */
export function racDateLabel(label: DateLabel, values: readonly string[]): string {
	const dates = values.map((v) => {
		const [y, m, d] = v.split('-').map(Number) as [number, number, number];
		return new Date(y, m - 1, d);
	});
	if (!dates.length) return '';
	const loc = label.loc ?? undefined;
	if (!label.range) return dates[0]!.toLocaleDateString(loc, label.opts);
	const f = new Intl.DateTimeFormat(loc, label.opts);
	if (dates.length < 2) return f.format(dates[0]!);
	return label.range === 'format' ? f.formatRange(dates[0]!, dates[1]!) : `${f.format(dates[0]!)}${label.range}${f.format(dates[1]!)}`;
}

/** The view written once the page is idle: today where the page shows it (the server rendered the capture's). */
export function racCalendarWake(config: RacCalendarConfig, view: RacCalendarView): RacCalendarView {
	const today = todayIso(config);
	if (today === view.t) return { ...view, n: (view.n ?? 0) + 1 };
	return { ...racCalendarView(config, today), n: (view.n ?? 0) + 1 };
}

/** The part: a calendar key is prevented at once (the page must not scroll), as useCalendarGrid's useKeyboard does. */
export function keydown(target: Element, event: KeyboardEvent): boolean {
	const root = target.closest(ROOT);
	if (!root) return false;
	if (KEYS.has(event.key) && inCell(root, target)) event.preventDefault();
	syncPicker(root, target);
	return false;
}

/** The part runs before the select part opens a picker: its options first show the calendar's month or year. */
export function pointerdown(target: Element): boolean {
	const root = target.closest(ROOT);
	if (root) syncPicker(root, target);
	return false;
}


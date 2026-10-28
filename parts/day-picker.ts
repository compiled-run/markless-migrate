// react-day-picker 9.8 (DayPicker) on Markless state: the page renders the calendar from a state() view through
// dayPickerModel, which computes what DayPicker renders (useCalendar, createGetModifiers, useFocus, the selection hooks,
// the default formatters and labels) on whole days, and its handlers apply DayPicker's own (dayPickerNext). Dates are day
// numbers (days since 1970-01-01, local); a Jalali DateLib (react-day-picker/persian) is date-fns-jalali's arithmetic.

/**
 * A date the converter read from the old page: fixed, following today's date (`t` days from it, or per component), or
 * the local day of an instant (`at`, ms: a date-only string the page parsed as UTC midnight).
 */
export type When = { readonly t: number } | { readonly at: number } | { readonly y: number; readonly m: number; readonly d: number; readonly ry?: 1; readonly rm?: 1; readonly rd?: 1 };
/** A DayPicker matcher: every day, days of the week, or the days from `from` to `to` (an absent end is open). */
export type Matcher = true | { readonly dow: readonly number[] } | { readonly from?: When; readonly to?: When };

/** The date-fns locale the calendar formats with: its week options, full date pattern and names. */
export interface LocaleTable {
	readonly ws: number;
	readonly fwcd: number;
	/** formatLong.date({ width: 'full' }), what "PPPP" expands to. */
	readonly full: string;
	/** localize.month by `${width}:${context}`, twelve each. */
	readonly months: Readonly<Record<string, readonly string[]>>;
	/** localize.day by `${width}:${context}`, seven each from Sunday. */
	readonly days: Readonly<Record<string, readonly string[]>>;
	/** localize.ordinalNumber(n, { unit: 'date' }) for 1 to 31. */
	readonly ord: readonly string[];
	readonly mord?: readonly string[];
}

export interface DayPickerConfig {
	readonly cal?: 'jalali';
	readonly loc: LocaleTable;
	/** The numerals DateLib writes digits in, 0 to 9 (absent: latn). */
	readonly digits?: readonly string[];
	/** The locale code shadcn's day button formats `data-day` with (toLocaleDateString). */
	readonly code?: string;
	readonly mode?: 'single' | 'multiple' | 'range';
	readonly interactive: boolean;
	readonly required?: boolean;
	readonly min?: number;
	readonly max?: number;
	readonly n: number;
	readonly caption: 'label' | 'dropdown' | 'dropdown-months' | 'dropdown-years';
	readonly outside?: boolean;
	readonly fixed?: boolean;
	readonly weekNumbers?: boolean;
	readonly iso?: boolean;
	readonly noNav?: boolean;
	readonly reverse?: boolean;
	readonly paged?: boolean;
	readonly rtl?: boolean;
	readonly excludeDisabled?: boolean;
	readonly start?: When;
	readonly end?: When;
	/** props.endMonth as given, which ends the dates DayPicker lists. */
	readonly endProp?: When;
	readonly month?: When;
	readonly today?: When;
	readonly selected?: readonly (When | null)[];
	readonly disabled?: readonly Matcher[];
	readonly hidden?: readonly Matcher[];
	readonly modifiers?: readonly (readonly [string, readonly Matcher[]])[];
	/** classNames as DayPicker merges them, for the keys a day's class reads. */
	readonly cls: Readonly<Record<string, string>>;
	readonly modCls?: Readonly<Record<string, string>>;
	/** Custom formatters as tables: the month dropdown's twelve labels. */
	readonly monthLabels?: readonly string[];
	/** Shadcn's day button attributes, when its markup carries them. */
	readonly shadcn?: boolean;
	/** The day button focuses itself when it becomes the focused day (DayPicker's own DayButton, shadcn's on Radix). */
	readonly focusDays?: boolean;
	/**
	 * The page passes the selection or the month back as props from its own state, and its wrapper gives DayPicker new
	 * components on each render: the calendar's markup is mounted again when it changes (focus leaves it).
	 */
	readonly remountSelect?: boolean;
	readonly remountMonth?: boolean;
	/** Extra content a custom DayButton renders after the day, by weekday * 2 + outside: an index in extraTexts, or -1. */
	readonly extras?: readonly number[];
	readonly extraTexts?: readonly string[];
}

/** What the page keeps on state(): today, the first month shown, the selection, the focused day and the one before. */
export interface DayPickerView {
	readonly t: number;
	readonly m: number;
	/** The first month the page was rendered with: a dropdown's `selected` attribute stays on it, as React's does. */
	readonly i?: number;
	readonly s: readonly (number | null)[];
	/** Range mode: whether a range is selected at all (`s` holds from and to). */
	readonly r?: boolean;
	readonly f: readonly [number, number] | null;
	readonly lf: readonly [number, number] | null;
	/**
	 * The day whose button has the browser's focus: a blur from a day React no longer renders never reached DayPicker.
	 */
	readonly d?: readonly [number, number] | null;
	/** Whether a person changed the view since the server rendered it. */
	readonly u?: boolean;
	/** Whether the page has mounted the calendar again since (React's own render writes no `selected` attribute). */
	readonly rm?: boolean;
	/** How many times the view changed, which tells a written view from one Markless has not applied yet. */
	readonly n?: number;
	/** What a date picker's field shows: the text typed into it, or null once a day is picked (the day in its pattern). */
	readonly x?: string | null;
}

export interface DayModel {
	readonly key: string;
	/** The day and the month it is shown in, as the day's handlers pass them back. */
	readonly n: number;
	readonly m: number;
	readonly cls: string;
	readonly ariaSelected?: string;
	readonly cellLabel?: string;
	readonly iso: string;
	readonly dataMonth?: string;
	readonly selected?: string;
	readonly disabled?: string;
	readonly hidden?: string;
	readonly outside?: string;
	readonly focused?: string;
	readonly today?: string;
	/** Whether the cell holds the day button; otherwise its text, or nothing when hidden. */
	readonly button: boolean;
	readonly text: string;
	/** The day as text in the cell itself (no button), or empty. */
	readonly plain: string;
	readonly btnDisabled?: string;
	readonly tabindex?: string;
	readonly label?: string;
	readonly localeDay?: string;
	readonly single?: string;
	readonly rangeStart?: string;
	readonly rangeEnd?: string;
	readonly rangeMiddle?: string;
	/** The button is always in the cell; it is hidden where DayPicker renders none (a hidden day). */
	readonly btnHidden?: string;
	/** A custom DayButton's extra element: its text, hidden on days it does not render. */
	readonly extraText: string;
	readonly extraHidden?: string;
}
export interface WeekModel {
	readonly key: string;
	readonly number: string;
	readonly numberLabel: string;
	readonly days: readonly DayModel[];
}
export interface OptionModel {
	readonly key: string;
	readonly value: string;
	readonly label: string;
	readonly disabled?: string;
	readonly selected?: string;
}
export interface MonthModel {
	readonly key: string;
	/** A month DayPicker does not show (navigation ends before it): its markup stays, hidden. */
	readonly absent?: string;
	/** Its place among the months shown, as its dropdowns pass it back. */
	readonly index: number;
	readonly caption: string;
	readonly grid?: string;
	readonly monthOptions: readonly OptionModel[];
	readonly yearOptions: readonly OptionModel[];
	readonly monthLabel: string;
	readonly yearLabel: string;
	readonly yearText: string;
	/** The dropdowns' values, which React sets as each select's value whatever its options' selected attributes say. */
	readonly monthValue: string;
	readonly yearValue: string;
	readonly weeks: readonly WeekModel[];
}
export interface DayPickerModel {
	readonly prevTabindex?: string;
	readonly prevDisabled?: string;
	readonly prevSvgDisabled?: string;
	readonly nextTabindex?: string;
	readonly nextDisabled?: string;
	readonly nextSvgDisabled?: string;
	readonly months: readonly MonthModel[];
}

// --- Day numbers and the two calendars ---------------------------------------------------------------------------

const DAY = 86_400_000;
function gregorian(y: number, m: number, d: number): number {
	const date = new Date(Date.UTC(2000, 0, 1));
	date.setUTCFullYear(y, m, d);
	return Math.round(date.getTime() / DAY);
}
function gregorianParts(n: number): [number, number, number] {
	const date = new Date(n * DAY);
	return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
}
/** The day number of a local Date (its calendar day where it is). */
export const dayOfDate = (date: Date): number => gregorian(date.getFullYear(), date.getMonth(), date.getDate());
export const weekday = (n: number): number => (((n + 4) % 7) + 7) % 7;

// date-fns-jalali's conversion (33-year arithmetic) on Julian day numbers; day number 0 is Julian day 2440588.
const JD = 2440588;
const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;
const PERSIAN_EPOCH = 1948320;
const PERSIAN_NUM_DAYS = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];
function normalizeMonth(year: number, month: number): [number, number] {
	month -= 1;
	if (month < 0) {
		const old = month;
		month = mod(mod(month, 12) + 12, 12);
		year -= div(month - old, 12);
	}
	if (month > 11) {
		year += div(month, 12);
		month = mod(month, 12);
	}
	return [year, month + 1];
}
function j2d(jy: number, jm: number, jd: number): number {
	[jy, jm] = normalizeMonth(jy, jm);
	let julianDay = PERSIAN_EPOCH - 1 + 365 * (jy - 1) + div(8 * jy + 21, 33);
	if (jm - 1 !== 0) julianDay += PERSIAN_NUM_DAYS[jm - 1]!;
	return julianDay + jd;
}
function d2j(julianDay: number): [number, number, number] {
	const since = julianDay - PERSIAN_EPOCH;
	let year = 1 + div(33 * since + 3, 12053);
	let dayOfYear = since - (365 * (year - 1) + div(8 * year + 21, 33));
	if (dayOfYear < 0) {
		year--;
		dayOfYear = since - (365 * (year - 1) + div(8 * year + 21, 33));
	}
	const month = dayOfYear < 216 ? div(dayOfYear, 31) : div(dayOfYear - 6, 30);
	return [year, month, dayOfYear - PERSIAN_NUM_DAYS[month]! + 1];
}

interface Calendar {
	/** Year, month (0-based) and day of a day number. */
	parts(n: number): [number, number, number];
	/** The day number of a year, month (0-based, may overflow) and day (may overflow). */
	make(y: number, m: number, d: number): number;
}
const GREGORY: Calendar = { parts: gregorianParts, make: gregorian };
const JALALI: Calendar = {
	parts: (n) => d2j(n + JD),
	make: (y, m, d) => j2d(y, m + 1, 1) - JD + d - 1,
};

/** DateLib's arithmetic for one calendar and week options, on day numbers. */
class Lib {
	readonly c: Calendar;
	readonly config: DayPickerConfig;
	constructor(config: DayPickerConfig) {
		this.config = config;
		this.c = config.cal === 'jalali' ? JALALI : GREGORY;
	}
	year = (n: number) => this.c.parts(n)[0];
	month = (n: number) => this.c.parts(n)[1];
	date = (n: number) => this.c.parts(n)[2];
	startOfMonth = (n: number) => {
		const [y, m] = this.c.parts(n);
		return this.c.make(y, m, 1);
	};
	endOfMonth = (n: number) => {
		const [y, m] = this.c.parts(n);
		return this.c.make(y, m + 1, 1) - 1;
	};
	startOfYear = (n: number) => this.c.make(this.year(n), 0, 1);
	endOfYear = (n: number) => this.c.make(this.year(n) + 1, 0, 1) - 1;
	addMonths = (n: number, k: number) => {
		const [y, m, d] = this.c.parts(n);
		const first = this.c.make(y, m + k, 1);
		const length = this.c.make(y, m + k + 1, 1) - first;
		return first + Math.min(d, length) - 1;
	};
	addYears = (n: number, k: number) => this.addMonths(n, 12 * k);
	diffMonths = (a: number, b: number) => {
		const [ya, ma] = this.c.parts(a);
		const [yb, mb] = this.c.parts(b);
		return (ya - yb) * 12 + ma - mb;
	};
	sameMonth = (a: number, b: number) => this.diffMonths(a, b) === 0;
	setMonth = (n: number, month: number) => this.c.make(this.year(n), month, 1);
	setYear = (n: number, year: number) => this.c.make(year, this.month(n), 1);
	startOfWeek = (n: number, ws = this.config.iso ? 1 : this.config.loc.ws) => n - ((weekday(n) - ws + 7) % 7);
	endOfWeek = (n: number, ws?: number) => this.startOfWeek(n, ws) + 6;
	week(n: number, iso = Boolean(this.config.iso)): number {
		const ws = iso ? 1 : this.config.loc.ws;
		const fwcd = iso ? 4 : this.config.loc.fwcd;
		const y = this.year(n);
		const next = this.startOfWeek(this.c.make(y + 1, 0, fwcd), ws);
		const own = this.startOfWeek(this.c.make(y, 0, fwcd), ws);
		const weekYear = n >= next ? y + 1 : n >= own ? y : y - 1;
		const start = this.startOfWeek(this.c.make(weekYear, 0, fwcd), ws);
		return Math.round((this.startOfWeek(n, ws) - start) / 7) + 1;
	}
}

// --- date-fns format, for the tokens DayPicker's formatters and labels use ---------------------------------------

const TOKENS = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
const pad = (n: number, length: number) => String(Math.abs(n)).padStart(length, '0');

function format(lib: Lib, n: number, pattern: string): string {
	const loc = lib.config.loc;
	// date-fns's P to PPPP: the full date pattern the locale gives, and the long and medium ones made from it.
	const long = loc.full.replace(/^E+,?\s*/, '');
	const medium = long.replace('MMMM', 'MMM').replace('do', 'd');
	const expanded = pattern.replace(/P+/g, (p) => (p.length === 4 ? loc.full : p.length === 3 ? long : p.length === 2 ? medium : p));
	const [y, m, d] = lib.c.parts(n);
	const wd = weekday(n);
	const name = (table: Readonly<Record<string, readonly string[]>>, width: string, context: string, i: number) => table[`${width}:${context}`]?.[i] ?? '';
	const out = expanded.replace(TOKENS, (token) => {
		if (token === "''") return "'";
		const first = token[0]!;
		if (first === "'") return token.slice(1, token.endsWith("'") && token.length > 1 ? -1 : undefined).replace(/''/g, "'");
		switch (first) {
			case 'y':
				return token === 'yy' ? pad(y % 100, 2) : pad(y > 0 ? y : 1 - y, token.length);
			case 'M':
			case 'L': {
				const context = first === 'M' ? 'formatting' : 'standalone';
				if (token.length === 1) return String(m + 1);
				if (token === 'MM' || token === 'LL') return pad(m + 1, 2);
				if (token.endsWith('o')) return loc.mord?.[m] ?? String(m + 1);
				if (token.length === 3) return name(loc.months, 'abbreviated', context, m);
				if (token.length === 5) return name(loc.months, 'narrow', context, m);
				return name(loc.months, 'wide', context, m);
			}
			case 'd':
				return token === 'do' ? (loc.ord[d - 1] ?? String(d)) : pad(d, token.length);
			case 'E': {
				if (token.length <= 3) return name(loc.days, 'abbreviated', 'formatting', wd);
				if (token.length === 5) return name(loc.days, 'narrow', 'formatting', wd);
				if (token.length === 6) return name(loc.days, 'short', 'formatting', wd);
				return name(loc.days, 'wide', 'formatting', wd);
			}
			case 'c': {
				const local = ((wd - loc.ws + 7) % 7) + 1;
				if (token === 'c') return String(local);
				if (token === 'cc') return pad(local, 2);
				if (token.length === 3) return name(loc.days, 'abbreviated', 'standalone', wd);
				if (token.length === 5) return name(loc.days, 'narrow', 'standalone', wd);
				if (token.length === 6) return name(loc.days, 'short', 'standalone', wd);
				return name(loc.days, 'wide', 'standalone', wd);
			}
		}
		return token;
	});
	return digits(lib.config, out);
}

function digits(config: DayPickerConfig, text: string): string {
	const map = config.digits;
	return map ? text.replace(/\d/g, (digit) => map[Number(digit)] ?? digit) : text;
}

/**
 * What a date picker's trigger shows for the calendar's selection, as its page formats it (date-fns `pattern`, a range's
 * ends joined by `join`); undefined while nothing is picked.
 */
export function dayPickerLabel(config: DayPickerConfig, view: DayPickerView, pattern: string, join = ' - '): string | undefined {
	const lib = new Lib(config);
	const days = view.s.filter((d): d is number => d !== null);
	if (!days.length || (config.mode === 'range' && view.r === false)) return undefined;
	return days.slice(0, 2).map((d) => format(lib, d, pattern)).join(join);
}

/** The view after `text` was typed into a date picker's field: the day `new Date(text)` reads selected and shown, if any. */
export function dayPickerTyped(config: DayPickerConfig, read: DayPickerView, text: string, key: string): DayPickerView {
	return dayPickerRead(config, read, text, key, new Date(text));
}

/** The view after `text` was typed into a date picker's field and read as `date` (none, or an invalid one, keeps the day). */
export function dayPickerRead(config: DayPickerConfig, read: DayPickerView, text: string, key: string, date: Date | null): DayPickerView {
	const view = latest(key, read);
	const at = date ? date.getTime() : Number.NaN;
	const typed = { ...view, x: text, u: true };
	return write(key, view, Number.isNaN(at) ? typed : dayPickerSet(config, typed, { s: [{ at }], m: 'selected' }));
}

/** What a date picker's field shows: `initial` until it is used, then what was typed, or the picked day in `pattern`. */
export function dayPickerField(config: DayPickerConfig, view: DayPickerView, pattern: string, initial: string): string {
	if (view.x === undefined) return initial;
	return view.x ?? dayPickerLabel(config, view, pattern) ?? '';
}

/** ArrowDown in a date picker's field opens its popover (the trigger marked `opener`), as the page's own handler does. */
export function dayPickerFieldKey(event: KeyboardEvent, opener: string): void {
	if (event.key !== 'ArrowDown') return;
	event.preventDefault();
	const trigger = document.querySelector<HTMLElement>(`[data-mm-field-opener="${opener}"]`);
	if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
}

/** Closes the layer a calendar was picked in, as a date picker that sets its popover's open state on select does. */
export function dayPickerClose(): void {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// --- Dates the old page gave relative to the day it ran -----------------------------------------------------------

export function resolve(when: When, today: number): number {
	if ('t' in when) return today + when.t;
	if ('at' in when) return dayOfDate(new Date(when.at));
	const [ty, tm, td] = gregorianParts(today);
	return gregorian(when.ry ? ty + when.y : when.y, when.rm ? tm + when.m : when.m, when.rd ? td + when.d : when.d);
}

/** Today's day number where this runs. */
export const todayNumber = (): number => dayOfDate(new Date());

function matches(n: number, matchers: readonly Matcher[] | undefined, today: number): boolean {
	if (!matchers) return false;
	return matchers.some((m) => {
		if (m === true) return true;
		if ('dow' in m) return m.dow.includes(weekday(n));
		const from = m.from ? resolve(m.from, today) : -Infinity;
		const to = m.to ? resolve(m.to, today) : Infinity;
		return n >= from && n <= to;
	});
}

// --- The view DayPicker starts from -----------------------------------------------------------------------------

interface Nav {
	readonly start?: number;
	readonly end?: number;
}
function navOf(lib: Lib, today: number): Nav {
	const c = lib.config;
	const years = c.caption === 'dropdown' || c.caption === 'dropdown-years';
	const start = c.start ? lib.startOfMonth(resolve(c.start, today)) : years ? lib.startOfYear(lib.addYears(today, -100)) : undefined;
	const end = c.end ? lib.endOfMonth(resolve(c.end, today)) : years ? lib.endOfYear(today) : undefined;
	return { ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) };
}
const todayOf = (c: DayPickerConfig, now: number) => (c.today ? resolve(c.today, now) : now);

/** The view DayPicker renders first, on the day `now` (getInitialMonth and the selection the page passed). */
export function dayPickerView(config: DayPickerConfig, now: number = todayNumber()): DayPickerView {
	const lib = new Lib(config);
	const today = todayOf(config, now);
	const nav = navOf(lib, today);
	let initial = config.month ? resolve(config.month, now) : today;
	if (nav.end !== undefined && lib.diffMonths(nav.end, initial) < config.n - 1) initial = lib.addMonths(nav.end, -(config.n - 1));
	if (nav.start !== undefined && lib.diffMonths(initial, nav.start) < 0) initial = nav.start;
	const s = (config.selected ?? []).map((w) => (w ? resolve(w, now) : null));
	return { t: now, m: lib.startOfMonth(initial), i: lib.startOfMonth(initial), s, ...(config.mode === 'range' && config.selected ? { r: true } : {}), f: null, lf: null };
}

// Markless applies a write when it next draws; a handler of another event in the same frame still reads the view before.
// Each calendar's last written view (by a key unique to it) is what the next change starts from until Markless has it.
const written = new Map<string, DayPickerView>();
function latest(key: string, read: DayPickerView): DayPickerView {
	const last = written.get(key);
	if (last && (last.n ?? 0) > (read.n ?? 0)) return last;
	written.delete(key);
	return read;
}
function write(key: string, base: DayPickerView, next: DayPickerView): DayPickerView {
	const out = { ...next, n: (base.n ?? 0) + 1 };
	written.set(key, out);
	return out;
}

/**
 * The view on the day the browser shows the page, when no one has used the calendar since the server rendered it; a
 * copy of the same view otherwise, so writing it costs Markless a draw that changes nothing.
 */
export function dayPickerWake(config: DayPickerConfig, view: DayPickerView, key: string): DayPickerView {
	const base = latest(key, view);
	const now = todayNumber();
	return write(key, base, base.u || base.t === now ? base : dayPickerView(config, now));
}

/** What a control beside the calendar did to it on the old page: the selection and the month it set. */
export interface DayPickerEffect {
	readonly s?: readonly (When | null)[];
	/** The month it showed: a date, or the selected day's own month. */
	readonly m?: When | 'selected';
}

/** The view after a control beside the calendar set its selection or month (the page's own state, passed as props). */
export function dayPickerSet(config: DayPickerConfig, read: DayPickerView, effect: DayPickerEffect, key?: string): DayPickerView {
	const view = key ? latest(key, read) : read;
	const lib = new Lib(config);
	const now = view.t;
	let next: DayPickerView = { ...view, u: true, ...(config.remountSelect || config.remountMonth ? { rm: true } : {}) };
	if (effect.s) next = { ...next, s: effect.s.map((w) => (w ? resolve(w, now) : null)), ...(config.mode === 'range' ? { r: effect.s.length > 0 } : {}) };
	const first = next.s.find((n): n is number => n !== null);
	if (effect.m && (effect.m !== 'selected' || first !== undefined)) {
		const nav = navOf(lib, todayOf(config, now));
		let month = effect.m === 'selected' ? first! : resolve(effect.m, now);
		if (nav.end !== undefined && lib.diffMonths(nav.end, month) < config.n - 1) month = lib.addMonths(nav.end, -(config.n - 1));
		if (nav.start !== undefined && lib.diffMonths(month, nav.start) < 0) month = nav.start;
		next = { ...next, m: lib.startOfMonth(month) };
	}
	return key ? write(key, view, next) : next;
}

// --- What DayPicker renders --------------------------------------------------------------------------------------

interface Day {
	readonly n: number;
	readonly month: number;
}

function displayMonths(lib: Lib, view: DayPickerView, nav: Nav): number[] {
	const months: number[] = [];
	for (let i = 0; i < lib.config.n; i++) {
		const month = lib.addMonths(view.m, i);
		if (nav.end !== undefined && month > nav.end) break;
		months.push(month);
	}
	return months;
}

function grid(lib: Lib, months: readonly number[], today: number): { month: number; weeks: { number: number; days: Day[] }[] }[] {
	const c = lib.config;
	if (!months.length) return [];
	const first = months[0]!;
	const last = months[months.length - 1]!;
	const start = lib.startOfWeek(first);
	const end = lib.endOfWeek(lib.endOfMonth(last));
	const maxDate = c.endProp ? lib.endOfMonth(resolve(c.endProp, today)) : undefined;
	const dates: number[] = [];
	for (let n = start; n <= end; n++) {
		if (maxDate !== undefined && n > maxDate) break;
		dates.push(n);
	}
	const fixedCount = 42 * (lib.diffMonths(last, first) + 1);
	if (c.fixed) while (dates.length < fixedCount) dates.push(dates[dates.length - 1]! + 1);
	const out = months.map((month) => {
		const firstOfWeek = lib.startOfWeek(month);
		const lastOfWeek = lib.endOfWeek(lib.endOfMonth(month));
		const own = dates.filter((n) => n >= firstOfWeek && n <= lastOfWeek);
		if (c.fixed && own.length < 42) {
			const add = 42 - own.length;
			own.push(...dates.filter((n) => n > lastOfWeek && n <= lastOfWeek + add));
		}
		const weeks: { number: number; days: Day[] }[] = [];
		for (const n of own) {
			const number = lib.week(n);
			const week = weeks.find((w) => w.number === number);
			if (week) week.days.push({ n, month });
			else weeks.push({ number, days: [{ n, month }] });
		}
		return { month, weeks };
	});
	return c.reverse ? out.reverse() : out;
}

interface Selection {
	isSelected(n: number): boolean;
	readonly range?: { readonly from: number | null; readonly to: number | null };
}
function selectionOf(config: DayPickerConfig, view: DayPickerView): Selection | undefined {
	if (!config.mode) return undefined;
	if (config.mode === 'range') {
		if (!view.r) return { isSelected: () => false };
		const from = view.s[0] ?? null;
		const to = view.s[1] ?? null;
		return { isSelected: (n) => inRange(from, to, n, false), range: { from, to } };
	}
	const set = view.s.filter((n): n is number => n !== null);
	return { isSelected: (n) => set.includes(n) };
}
function inRange(from: number | null, to: number | null, n: number, excludeEnds: boolean): boolean {
	if (from !== null && to !== null) {
		const [a, b] = to < from ? [to, from] : [from, to];
		return n - a >= (excludeEnds ? 1 : 0) && b - n >= (excludeEnds ? 1 : 0);
	}
	if (!excludeEnds && to !== null) return n === to;
	if (!excludeEnds && from !== null) return n === from;
	return false;
}

type Modifiers = Record<string, boolean | undefined>;

function modifiersOf(lib: Lib, day: Day, nav: Nav, today: number, custom: readonly string[], view: DayPickerView, selection: Selection | undefined): Modifiers {
	const c = lib.config;
	const outside = !lib.sameMonth(day.n, day.month);
	const beforeNav = nav.start !== undefined && day.n < lib.startOfMonth(nav.start);
	const afterNav = nav.end !== undefined && day.n > lib.endOfMonth(nav.end);
	const flags: Modifiers = {
		focused: false,
		disabled: matches(day.n, c.disabled, view.t),
		hidden: matches(day.n, c.hidden, view.t) || beforeNav || afterNav || (!c.outside && outside),
		outside,
		today: day.n === today,
	};
	const own: Modifiers = {};
	for (const name of custom) own[name] = matches(day.n, c.modifiers!.find(([n]) => n === name)![1], view.t);
	const modifiers: Modifiers = { ...flags, ...own };
	modifiers.focused = !modifiers.hidden && view.f !== null && view.f[0] === day.n && lib.sameMonth(view.f[1], day.month);
	modifiers.selected = selection?.isSelected(day.n) || modifiers.selected;
	if (selection?.range) {
		const { from, to } = selection.range;
		modifiers.range_start = from !== null && to !== null && day.n === from;
		modifiers.range_end = from !== null && to !== null && day.n === to;
		modifiers.range_middle = inRange(from, to, day.n, true);
	}
	return modifiers;
}

// createGetModifiers: a custom modifier exists only once a shown day matches it, in the order days first match.
function customNames(lib: Lib, days: readonly Day[], today: number): string[] {
	const names: string[] = [];
	for (const day of days) for (const [name, m] of lib.config.modifiers ?? []) if (!names.includes(name) && matches(day.n, m, today)) names.push(name);
	return names;
}

function focusTarget(lib: Lib, days: readonly Day[], mods: (d: Day) => Modifiers, selection: Selection | undefined, view: DayPickerView): Day | undefined {
	let target: Day | undefined;
	let priority = -1;
	const focusable = (m: Modifiers) => !m.disabled && !m.hidden && !m.outside;
	for (const day of days) {
		const m = mods(day);
		if (!focusable(m)) continue;
		if (view.lf && view.lf[0] === day.n && lib.sameMonth(view.lf[1], day.month) && priority < 2) {
			target = day;
			priority = 2;
		} else if (selection?.isSelected(day.n) && priority < 1) {
			target = day;
			priority = 1;
		} else if (m.today && priority < 0) {
			target = day;
			priority = 0;
		}
	}
	return target ?? days.find((d) => focusable(mods(d)));
}

const attr = (v: boolean | undefined): string | undefined => (v === undefined ? undefined : String(v));
const on = (v: boolean | undefined): string | undefined => (v ? 'true' : undefined);

function previousMonth(lib: Lib, first: number, nav: Nav): number | undefined {
	const c = lib.config;
	if (c.noNav) return undefined;
	const offset = c.paged ? c.n : 1;
	const month = lib.startOfMonth(first);
	if (nav.start === undefined) return lib.addMonths(month, -offset);
	return lib.diffMonths(month, nav.start) <= 0 ? undefined : lib.addMonths(month, -offset);
}
function nextMonth(lib: Lib, first: number, nav: Nav): number | undefined {
	const c = lib.config;
	if (c.noNav) return undefined;
	const offset = c.paged ? c.n : 1;
	const month = lib.startOfMonth(first);
	if (nav.end === undefined) return lib.addMonths(month, offset);
	return lib.diffMonths(nav.end, first) < c.n ? undefined : lib.addMonths(month, offset);
}

function labelDay(lib: Lib, n: number, m: Modifiers, button: boolean): string {
	let label = format(lib, n, 'PPPP');
	if (m.today) label = `Today, ${label}`;
	if (button && m.selected) label = `${label}, selected`;
	return label;
}

/** Everything DayPicker renders for `view` that changes with it. */
export function dayPickerModel(config: DayPickerConfig, view: DayPickerView): DayPickerModel {
	const lib = new Lib(config);
	const today = todayOf(config, view.t);
	const nav = navOf(lib, today);
	const months = displayMonths(lib, view, nav);
	const calendar = grid(lib, months, view.t);
	const days = calendar.flatMap((m) => m.weeks.flatMap((w) => w.days));
	const custom = customNames(lib, days, view.t);
	const selection = selectionOf(config, view);
	const cache = new Map<Day, Modifiers>();
	const mods = (d: Day) => cache.get(d) ?? cache.set(d, modifiersOf(lib, d, nav, today, custom, view, selection)).get(d)!;
	const target = focusTarget(lib, days, mods, selection, view);
	const prev = previousMonth(lib, view.m, nav);
	const next = nextMonth(lib, view.m, nav);
	const classFor = (m: Modifiers) => {
		const out = [config.cls.day ?? 'rdp-day'];
		for (const [key, active] of Object.entries(m)) {
			if (active !== true) continue;
			const name = config.modCls?.[key] ?? config.cls[key];
			if (name) out.push(name);
		}
		return out.join(' ');
	};
	const dayModel = (d: Day): DayModel => {
		const m = mods(d);
		const button = !m.hidden && config.interactive;
		const iso = format(lib, d.n, 'yyyy-MM-dd');
		const text = m.hidden ? '' : format(lib, d.n, 'd');
		const extra = config.extras && !m.hidden ? (config.extras[weekday(d.n) * 2 + (m.outside ? 1 : 0)] ?? -1) : -1;
		const extraText = extra >= 0 ? (config.extraTexts?.[extra] ?? '') : '';
		const [gy, gm, gd] = gregorianParts(d.n);
		return {
			key: `${d.n}_${d.month}`,
			n: d.n,
			m: d.month,
			cls: classFor(m),
			ariaSelected: on(m.selected),
			...(!config.interactive && !m.hidden ? { cellLabel: labelDay(lib, d.n, m, false) } : {}),
			iso,
			dataMonth: m.outside ? format(lib, d.n, 'yyyy-MM') : undefined,
			selected: on(m.selected),
			disabled: on(m.disabled),
			hidden: on(m.hidden),
			outside: on(m.outside),
			focused: on(m.focused),
			today: on(m.today),
			button,
			text,
			plain: button ? '' : text,
			btnDisabled: m.disabled ? '' : undefined,
			tabindex: target && target.n === d.n && target.month === d.month ? '0' : '-1',
			label: labelDay(lib, d.n, m, true),
			...(config.shadcn
				? {
						localeDay: new Date(gy, gm, gd).toLocaleDateString(config.code),
						single: attr(m.selected === undefined ? undefined : m.selected && !m.range_start && !m.range_end && !m.range_middle),
						rangeStart: attr(m.range_start),
						rangeEnd: attr(m.range_end),
						rangeMiddle: attr(m.range_middle),
					}
				: {}),
			btnHidden: button ? undefined : '',
			extraText,
			extraHidden: extra >= 0 ? undefined : '',
		};
	};
	const monthLabel = (n: number) => config.monthLabels?.[lib.month(n)] ?? format(lib, n, 'LLLL');
	return {
		prevTabindex: prev === undefined ? '-1' : undefined,
		prevDisabled: prev === undefined ? 'true' : undefined,
		prevSvgDisabled: prev === undefined ? '' : undefined,
		nextTabindex: next === undefined ? '-1' : undefined,
		nextDisabled: next === undefined ? 'true' : undefined,
		nextSvgDisabled: next === undefined ? '' : undefined,
		months: [...calendar, ...Array.from({ length: Math.max(0, config.n - calendar.length) }, () => undefined)].map((shown, index) => {
			const cm = shown ?? { month: lib.addMonths(view.m, index), weeks: [] };
			// The server's render wrote the `selected` attribute; React leaves it, and a remount's client render writes none.
			const marked = view.rm ? undefined : view.i === undefined ? cm.month : lib.addMonths(view.i, config.reverse ? config.n - 1 - index : index);
			const yearStart = lib.startOfYear(cm.month);
			const monthOptions: OptionModel[] = [];
			for (let i = 0; i < 12; i++) {
				const month = lib.addMonths(yearStart, i);
				const value = lib.month(month);
				const off = (nav.start !== undefined && month < lib.startOfMonth(nav.start)) || (nav.end !== undefined && month > lib.startOfMonth(nav.end));
				monthOptions.push({ key: String(value), value: String(value), label: monthLabel(month), disabled: off ? '' : undefined, selected: marked !== undefined && value === lib.month(marked) ? '' : undefined });
			}
			const yearOptions: OptionModel[] = [];
			if (nav.start !== undefined && nav.end !== undefined) {
				const last = lib.endOfYear(nav.end);
				for (let year = lib.startOfYear(nav.start); year <= last; year = lib.addYears(year, 1)) {
					const value = lib.year(year);
					yearOptions.push({ key: String(value), value: String(value), label: format(lib, year, 'yyyy'), selected: marked !== undefined && value === lib.year(marked) ? '' : undefined });
				}
			}
			return {
				// Keyed by the month shown, so a month that changes is a new row (Markless rebuilds it).
				key: `${index}_${cm.month}`,
				...(shown ? {} : { absent: '' }),
				index,
				caption: format(lib, cm.month, 'LLLL y'),
				grid: format(lib, cm.month, 'LLLL y') || undefined,
				monthOptions,
				yearOptions,
				monthLabel: monthLabel(cm.month),
				yearLabel: yearOptions.length ? format(lib, cm.month, 'yyyy') : '',
				yearText: format(lib, cm.month, 'yyyy'),
				monthValue: String(lib.month(cm.month)),
				yearValue: String(lib.year(cm.month)),
				// DayPicker's keys: a week by its number, a day by its date and month (another month's cells are new ones).
				weeks: cm.weeks.map((w) => ({
					key: `w${w.number}`,
					number: w.number < 10 ? digits(config, `0${w.number.toLocaleString()}`) : digits(config, w.number.toLocaleString()),
					numberLabel: `Week ${w.number}`,
					days: w.days.map((d) => dayModel(d)),
				})),
			};
		}),
	};
}

// --- What DayPicker's handlers do ---------------------------------------------------------------------------------

/** A use of the calendar, as the part reads it from the event: a day by its place in the grid, the nav, a dropdown, a key. */
export type DayPickerAction =
	| { readonly t: 'day'; readonly n: number; readonly m: number }
	| { readonly t: 'focus'; readonly n: number; readonly m: number }
	| { readonly t: 'blur' }
	| { readonly t: 'nav'; readonly dir: -1 | 1 }
	| { readonly t: 'select'; readonly m: number; readonly k: number; readonly v: number }
	| { readonly t: 'key'; readonly key: string; readonly shift: boolean };

function goToMonth(lib: Lib, view: DayPickerView, n: number, nav: Nav): DayPickerView {
	if (lib.config.noNav) return view;
	let month = lib.startOfMonth(n);
	if (nav.start !== undefined && month < lib.startOfMonth(nav.start)) month = lib.startOfMonth(nav.start);
	if (nav.end !== undefined && month > lib.startOfMonth(nav.end)) month = lib.startOfMonth(nav.end);
	return { ...view, m: month };
}

function select(config: DayPickerConfig, view: DayPickerView, n: number): DayPickerView {
	const set = view.s.filter((x): x is number => x !== null);
	if (config.mode === 'single') {
		const same = set.length > 0 && set[0] === n;
		return { ...view, s: !config.required && same ? [] : [n] };
	}
	if (config.mode === 'multiple') {
		if (set.includes(n)) {
			if (set.length === config.min) return view;
			if (config.required && set.length === 1) return view;
			return { ...view, s: set.filter((x) => x !== n) };
		}
		return { ...view, s: set.length === config.max ? [n] : [...set, n] };
	}
	if (config.mode === 'range') {
		const range = addToRange(n, view.r ? { from: view.s[0] ?? null, to: view.s[1] ?? null } : undefined, config.min ?? 0, config.max ?? 0, Boolean(config.required));
		if (range && config.excludeDisabled && config.disabled && range.from !== null && range.to !== null) {
			for (let x = Math.min(range.from, range.to); x <= Math.max(range.from, range.to); x++)
				if (matches(x, config.disabled, view.t)) {
					return { ...view, r: true, s: [n, null] };
				}
		}
		return range ? { ...view, r: true, s: [range.from, range.to] } : { ...view, r: false, s: [] };
	}
	return view;
}

function addToRange(date: number, range: { from: number | null; to: number | null } | undefined, min: number, max: number, required: boolean): { from: number | null; to: number | null } | undefined {
	const from = range?.from ?? null;
	const to = range?.to ?? null;
	let out: { from: number | null; to: number | null } | undefined;
	if (from === null && to === null) out = { from: date, to: min > 0 ? null : date };
	else if (from !== null && to === null) {
		if (from === date) out = required ? { from, to: null } : undefined;
		else if (date < from) out = { from: date, to: from };
		else out = { from, to: date };
	} else if (from !== null && to !== null) {
		if (from === date && to === date) out = required ? { from, to } : undefined;
		else if (from === date) out = { from, to: min > 0 ? null : date };
		else if (to === date) out = { from: date, to: min > 0 ? null : date };
		else if (date < from) out = { from: date, to };
		else out = { from, to: date };
	} else out = { from: date, to: min > 0 ? null : date };
	if (out?.from != null && out.to != null) {
		const diff = out.to - out.from;
		if (max > 0 && diff > max) out = { from: date, to: null };
		else if (min > 1 && diff < min) out = { from: date, to: null };
	}
	return out;
}

const KEYS: Readonly<Record<string, (shift: boolean, rtl: boolean) => readonly [string, 'before' | 'after']>> = {
	ArrowLeft: (shift, rtl) => [shift ? 'month' : 'day', rtl ? 'after' : 'before'],
	ArrowRight: (shift, rtl) => [shift ? 'month' : 'day', rtl ? 'before' : 'after'],
	ArrowDown: (shift) => [shift ? 'year' : 'week', 'after'],
	ArrowUp: (shift) => [shift ? 'year' : 'week', 'before'],
	PageUp: (shift) => [shift ? 'year' : 'month', 'before'],
	PageDown: (shift) => [shift ? 'year' : 'month', 'after'],
	Home: () => ['startOfWeek', 'before'],
	End: () => ['endOfWeek', 'after'],
};
/** Whether DayPicker handles a key pressed on a day (and so prevents its default). */
export const dayPickerKey = (key: string): boolean => key in KEYS;

function focusable(lib: Lib, by: string, dir: 'before' | 'after', ref: number, nav: Nav): number {
	const step = dir === 'after' ? 1 : -1;
	let n: number;
	if (by === 'day') n = ref + step;
	else if (by === 'week') n = ref + 7 * step;
	else if (by === 'month') n = lib.addMonths(ref, step);
	else if (by === 'year') n = lib.addYears(ref, step);
	else if (by === 'startOfWeek') n = lib.startOfWeek(ref);
	else n = lib.endOfWeek(ref);
	if (dir === 'before' && nav.start !== undefined) n = Math.max(nav.start, n);
	else if (dir === 'after' && nav.end !== undefined) n = Math.min(nav.end, n);
	return n;
}

function moveFocus(config: DayPickerConfig, view: DayPickerView, by: string, dir: 'before' | 'after'): DayPickerView {
	if (!view.f) return view;
	const lib = new Lib(config);
	const nav = navOf(lib, todayOf(config, view.t));
	let ref = view.f[0];
	let found: number | undefined;
	for (let attempt = 0; attempt <= 365; attempt++) {
		const n = focusable(lib, by, dir, ref, nav);
		if (!matches(n, config.disabled, view.t) && !matches(n, config.hidden, view.t)) {
			found = n;
			break;
		}
		ref = n;
	}
	if (found === undefined) return view;
	const month = lib.startOfMonth(found);
	const calendar = grid(lib, displayMonths(lib, view, nav), view.t);
	const shown = calendar.some((m) => m.weeks.some((w) => w.days.some((d) => d.n === found && lib.sameMonth(d.month, month))));
	const moved = shown ? view : goToMonth(lib, view, found, nav);
	return { ...moved, f: [found, month] };
}

/** Whether going from `before` to `after` mounts the calendar again (the page's state changed with it). */
const remounts = (config: DayPickerConfig, before: DayPickerView, after: DayPickerView) => Boolean((config.remountSelect && (before.r !== after.r || before.s.join() !== after.s.join())) || (config.remountMonth && before.m !== after.m));

/** The view after `action`, as DayPicker's handlers leave it. */
export function dayPickerNext(config: DayPickerConfig, view: DayPickerView, action: DayPickerAction): DayPickerView {
	const after = step(config, view, action);
	return after !== view && !after.rm && remounts(config, view, after) ? { ...after, rm: true } : after;
}

function step(config: DayPickerConfig, view: DayPickerView, action: DayPickerAction): DayPickerView {
	const lib = new Lib(config);
	const nav = navOf(lib, todayOf(config, view.t));
	const used = { ...view, u: true };
	switch (action.t) {
		// A click also focuses the button (its focusin's write may not have landed yet: Markless applies writes per frame).
		case 'day':
			return select(config, { ...used, f: [action.n, action.m], d: [action.n, action.m], x: null }, action.n);
		case 'focus':
			return { ...used, f: [action.n, action.m], d: [action.n, action.m] };
		case 'blur': {
			const had = view.d;
			const kept = had && grid(lib, displayMonths(lib, view, nav), view.t).some((m) => m.weeks.some((w) => w.days.some((d) => d.n === had[0] && lib.sameMonth(d.month, had[1]))));
			return kept ? { ...used, lf: view.f, f: null, d: null } : { ...view, d: null };
		}
		case 'nav': {
			const target = action.dir < 0 ? previousMonth(lib, view.m, nav) : nextMonth(lib, view.m, nav);
			return target === undefined ? view : goToMonth(lib, used, target, nav);
		}
		case 'select': {
			const months = displayMonths(lib, view, nav);
			const shown = config.reverse ? [...months].reverse() : months;
			const month = shown[action.m];
			if (month === undefined) return view;
			const years = config.caption === 'dropdown-years' || (config.caption === 'dropdown' && action.k === 1);
			return goToMonth(lib, used, years ? lib.setYear(lib.startOfMonth(month), action.v) : lib.setMonth(lib.startOfMonth(month), action.v), nav);
		}
		case 'key': {
			const keys = KEYS[action.key];
			if (!keys) return view;
			const [by, dir] = keys(action.shift, Boolean(config.rtl));
			return { ...moveFocus(config, view, by, dir), u: true };
		}
	}
}

// --- The browser's events on a calendar ----------------------------------------------------------------------

const ROOT = '[data-mm-day-picker]';

/** The day shown at a place in the grid of `view`: the month's position, the week's row and the day's cell. */
function dayAt(config: DayPickerConfig, view: DayPickerView, m: number, w: number, i: number): Day | undefined {
	const lib = new Lib(config);
	const nav = navOf(lib, todayOf(config, view.t));
	return grid(lib, displayMonths(lib, view, nav), view.t)[m]?.weeks[w]?.days[i];
}

/** The day button an event is on, with its place in the grid: the month's table, the week's row and its cell. */
function placeOf(target: EventTarget | null): { root: Element; m: number; w: number; i: number } | undefined {
	const button = target instanceof Element ? target.closest('button') : null;
	const cell = button?.parentElement;
	const root = cell?.closest(ROOT);
	const row = cell?.parentElement;
	const table = row?.closest('table');
	if (!button || !cell || cell.getAttribute('role') !== 'gridcell' || !root || !row || !table) return undefined;
	const cells = [...row.children].filter((c) => c.getAttribute('role') === 'gridcell');
	return { root, m: [...root.querySelectorAll('table')].indexOf(table), w: [...(row.parentElement?.children ?? [])].indexOf(row), i: cells.indexOf(cell) };
}

/** What DayPicker does on an event inside the calendar: the action its handler takes, or undefined. */
// The element the last focusout left: Markless may run the handler once the element is gone from the page.
let lastOut: EventTarget | null = null;

function actionOf(config: DayPickerConfig, view: DayPickerView, event: Event): DayPickerAction | undefined {
	const target = event.target;
	if (event.type === 'focusout') lastOut = target;
	const place = placeOf(target);
	if (place) {
		const day = () => dayAt(config, view, place.m, place.w, place.i);
		const marks = place.root as Element & { __mmRebuilt?: number };
		if (event.type === 'focusin') {
			// Markless moving the focus onto the new node of a cell it rebuilt for another month: React had removed the
			// focused button instead, and DayPicker saw no focus.
			const out = lastOut;
			lastOut = null;
			if (out instanceof Element && !out.isConnected && out !== target && marks.__mmRebuilt !== undefined && event.timeStamp - marks.__mmRebuilt < 1000) return undefined;
			const d = day();
			return d && { t: 'focus', n: d.n, m: d.month };
		}
		if (event.type === 'focusout') {
			// The focus a remount took (dayPickerSettle) left a removed element in React: DayPicker saw no blur.
			const quiet = place.root as Element & { __mmQuiet?: boolean };
			if (quiet.__mmQuiet) {
				quiet.__mmQuiet = false;
				return undefined;
			}
			return { t: 'blur' };
		}
		if (event.type === 'click') {
			const d = day();
			return d && { t: 'day', n: d.n, m: d.month };
		}
		if (event.type === 'keydown') return KEYS[(event as KeyboardEvent).key] ? { t: 'key', key: (event as KeyboardEvent).key, shift: (event as KeyboardEvent).shiftKey } : undefined;
		return undefined;
	}
	if (!(target instanceof Element)) return undefined;
	const root = target.closest(ROOT);
	if (!root) return undefined;
	if (event.type === 'click') {
		const button = target.closest('button');
		const nav = button?.parentElement;
		if (!button || nav?.tagName !== 'NAV' || !root.contains(nav) || button.getAttribute('aria-disabled') === 'true') return undefined;
		return { t: 'nav', dir: button === nav.firstElementChild ? -1 : 1 };
	}
	if (event.type === 'change' && target instanceof HTMLSelectElement) {
		const tables = [...root.querySelectorAll('table')];
		const m = tables.findIndex((t) => t.parentElement?.contains(target));
		const selects = [...(tables[m]?.parentElement ?? root).querySelectorAll('select')];
		return { t: 'select', m: Math.max(0, m), k: Math.max(0, selects.indexOf(target)), v: Number(target.value) };
	}
	return undefined;
}

/** The view after a browser event on the calendar (its root's click, focusin, focusout, keydown and change). */
export function dayPickerEvent(config: DayPickerConfig, read: DayPickerView, event: Event, key: string): DayPickerView | undefined {
	const view = latest(key, read);
	const action = actionOf(config, view, event);
	// DayPicker prevents a key it handles before acting: the render that follows may remove the day the key was pressed on.
	if (action?.t === 'key') event.preventDefault();
	const next = action ? dayPickerNext(config, view, action) : view;
	if (next === view) return undefined;
	const out = write(key, view, next);
	const root = event.target instanceof Element ? (event.target.closest(ROOT) as (Element & { __mmRebuilt?: number }) | null) : null;
	if (root && next.m !== view.m) root.__mmRebuilt = performance.now();
	dayPickerSettle(config, view, out, event.target, event.type === 'keydown');
	return out;
}

/**
 * The part: DayPicker prevents a key it handles on a day at once, so the page does not scroll; Markless runs the
 * calendar's own handler after the event, and the part answers in it (behave's listeners, once the page is idle).
 */
export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (placeOf(target) && dayPickerKey(event.key)) event.preventDefault();
	return false;
}

// --- After the page applied an action -------------------------------------------------------------------------

/**
 * Focus leaves `active` as when React removes it: to the page, with the browser's next Tab starting at `from` (focused
 * and blurred at once). Its blur was never DayPicker's, so the day's handler ignores it.
 */
function lose(root: Element, active: HTMLElement, from: Element): void {
	if (active.parentElement?.getAttribute('role') === 'gridcell') (root as Element & { __mmQuiet?: boolean }).__mmQuiet = true;
	const start = from as HTMLElement;
	const had = start.getAttribute('tabindex');
	start.setAttribute('tabindex', '-1');
	start.focus({ preventScroll: true });
	start.blur();
	if (had === null) start.removeAttribute('tabindex');
	else start.setAttribute('tabindex', had);
}

/**
 * Once Markless has drawn the new view (its next frame, after the handler's write), what React leaves behind besides
 * the markup: each dropdown's value is the month shown; a key leaves the focused day's button focused where the day
 * buttons focus themselves; and where the page mounts the calendar again on a change, the focus that was in it is lost,
 * unless the focused day's button takes it back.
 */
function dayPickerSettle(config: DayPickerConfig, before: DayPickerView, after: DayPickerView, target: EventTarget | null, key = false): void {
	const root = target instanceof Element ? target.closest('[data-mm-day-picker]') : null;
	if (!root || typeof requestAnimationFrame !== 'function') return;
	const remount = remounts(config, before, after);
	// The day the new view focuses, as its cell's data-day: the focus waits until Markless has drawn it.
	const focusedIso = after.f ? dayPickerModel(config, after).months.flatMap((m) => m.weeks.flatMap((w) => w.days)).find((d) => d.focused)?.iso : undefined;
	const drawn = () => (focusedIso === undefined ? null : root.querySelector(`td[data-focused="true"][data-day="${focusedIso}"] > button`)) as HTMLElement | null;
	const apply = () => {
		const lib = new Lib(config);
		const months = displayMonths(lib, after, navOf(lib, todayOf(config, after.t)));
		const shown = config.reverse ? [...months].reverse() : months;
		[...root.querySelectorAll('table')].forEach((table, k) => {
			const month = shown[k];
			if (month === undefined) return;
			[...(table.parentElement ?? root).querySelectorAll('select')].forEach((select, j) => {
				const years = config.caption === 'dropdown-years' || (config.caption === 'dropdown' && j === 1);
				const value = String(years ? lib.year(month) : lib.month(month));
				if (select.value !== value) select.value = value;
			});
		});
		const focused = drawn();
		// The day whose button had the browser's focus is gone from the grid: React unmounted that button.
		const active = document.activeElement as HTMLElement | null;
		const had = before.d;
		const gone = had && before.m !== after.m && !dayPickerModel(config, after).months.some((m) => m.weeks.some((w) => w.days.some((d) => d.n === had[0] && d.m === had[1])));
		if (gone && active?.parentElement?.getAttribute('role') === 'gridcell' && root.contains(active) && !(key && config.focusDays)) {
			if (config.focusDays && focused) focused.focus();
			// The removed button's row is where the browser's next Tab starts from.
			else lose(root, active, active.closest('tr') ?? root);
			return;
		}
		if (remount) {
			if (config.focusDays && focused) focused.focus();
			// The calendar's markup was replaced: the next Tab starts where it begins.
			else if (active && root.contains(active)) lose(root, active, root);
		} else if (key && config.focusDays && focused && document.activeElement !== focused) focused.focus();
	};
	requestAnimationFrame(() => {
		if (focusedIso === undefined || drawn()) return apply();
		const watch = new MutationObserver(() => {
			if (!drawn()) return;
			watch.disconnect();
			apply();
		});
		watch.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-focused', 'data-day'] });
		setTimeout(() => watch.disconnect(), 1000);
	});
}

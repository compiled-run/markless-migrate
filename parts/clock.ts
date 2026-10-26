// Dates the old page computed in the visitor's browser, which the capture's frozen clock and time zone would otherwise
// fix in the page: the converter marks the element holding each (data-mm-clock, written from captures at a second time
// and time zone) with what it follows, and this writes it again for the visitor's own clock and time zone. A chart's
// region (`*`) holds dates recharts formats from fixed instants: every date in it, its tooltips' too, is one.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NAME = `(${[...MONTHS, ...MONTHS.map((m) => m.slice(0, 3)), 'Sept'].join('|')})`;
const DAY_NAME = `(${[...WEEKDAYS, ...WEEKDAYS.map((d) => d.slice(0, 3))].join('|')})`;

/** A date written in English with a month name: "Jan 20, 2026", "June 01, 2025", "Saturday, January 17th", "Apr 2". */
export const DATE_TEXT = new RegExp(`\\b(?:${DAY_NAME}(,?) )?${NAME}(\\.?) (\\d{1,2})(st|nd|rd|th)?\\b(?:(,?) (\\d{4})\\b)?`, 'g');

/** How a date is written, to write another the same way. */
export interface DateShape {
	readonly w?: 'long' | 'short';
	readonly wc?: string;
	readonly m: 'long' | 'short' | 'sept';
	readonly dot?: string;
	readonly pad: 1 | 2;
	readonly ord?: true;
	readonly yc?: string;
	readonly y?: true;
}

export interface DateText {
	readonly shape: DateShape;
	readonly month: number;
	readonly day: number;
	readonly year?: number;
}

export function parseDate(match: RegExpExecArray | string[]): DateText | undefined {
	const [, w, wc, m, dot, d, ord, yc, y] = match as string[];
	const long = MONTHS.indexOf(m!);
	const month = long >= 0 ? long : m === 'Sept' ? 8 : MONTHS.findIndex((n) => n.slice(0, 3) === m);
	const day = Number(d);
	if (month < 0 || day < 1 || day > 31) return undefined;
	const shape: DateShape = {
		...(w ? { w: WEEKDAYS.includes(w) ? 'long' : 'short', wc: wc ?? '' } : {}),
		m: long >= 0 ? 'long' : m === 'Sept' ? 'sept' : 'short',
		...(dot ? { dot } : {}),
		pad: d!.length === 2 && d!.startsWith('0') ? 2 : 1,
		...(ord ? { ord: true } : {}),
		...(y ? { y: true, yc: yc ?? '' } : {}),
	};
	return { shape, month, day, ...(y ? { year: Number(y) } : {}) };
}

const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));

/** A local date written in `shape`. */
export function writeDate(shape: DateShape, date: Date): string {
	const day = date.getDate();
	const month = MONTHS[date.getMonth()]!;
	const weekday = WEEKDAYS[date.getDay()]!;
	const name = shape.m === 'long' ? month : shape.m === 'sept' && date.getMonth() === 8 ? 'Sept' : month.slice(0, 3);
	return `${shape.w ? `${shape.w === 'long' ? weekday : weekday.slice(0, 3)}${shape.wc} ` : ''}${name}${shape.dot ?? ''} ${shape.pad === 2 ? String(day).padStart(2, '0') : day}${shape.ord ? ordinal(day) : ''}${shape.y ? `${shape.yc} ${date.getFullYear()}` : ''}`;
}

/**
 * What a date the converter found follows: `at` a fixed instant (ms), `in` days from today, or `year` this year's
 * month and day (`o` years on). `x` is the date as the page was captured; `*` marks a chart's region.
 */
export type ClockRule = { readonly x: string; readonly at: number } | { readonly x: string; readonly in: number } | { readonly x: string; readonly year: readonly [number, number, number] } | { readonly '*': number };

const DAY = 86_400_000;

function dateFor(rule: ClockRule, found: DateText, now: number): Date | undefined {
	if ('*' in rule) return new Date(Date.UTC(found.year ?? rule['*'], found.month, found.day));
	if ('at' in rule) return new Date(rule.at);
	if ('in' in rule) return new Date(now + rule.in * DAY);
	const today = new Date(now);
	return new Date(today.getFullYear() + rule.year[0], rule.year[1], rule.year[2]);
}

/** How the dates in `text` other than May's name their month, when they agree: "May" is both forms. */
export function monthNamesIn(text: string): 'long' | 'short' | undefined {
	const forms = new Set([...text.matchAll(DATE_TEXT)].flatMap((m) => (m[3] === 'May' ? [] : [parseDate(m)?.shape.m === 'long' ? 'long' : 'short'] as const)));
	return forms.size === 1 ? [...forms][0] : undefined;
}

/** The text with every date a rule names written for this browser's clock and time zone; `may`: the form a "May" in it is. */
export function rewrite(text: string, rules: readonly ClockRule[], now = Date.now(), may?: 'long' | 'short'): string {
	const region = rules.find((r) => '*' in r);
	return text.replace(DATE_TEXT, (...m) => {
		const whole = m[0] as string;
		const found = parseDate(m as unknown as string[]);
		const rule = rules.find((r) => !('*' in r) && r.x === whole) ?? region;
		const date = found && rule && dateFor(rule, found, now);
		const shape = found && may && m[3] === 'May' ? { ...found.shape, m: may } : found?.shape;
		return date && shape && !Number.isNaN(date.getTime()) ? writeDate(shape, date) : whole;
	});
}

const RULES = 'data-mm-clock';
const written = new WeakMap<Node, string>();
const observed = new WeakSet<Element>();

function apply(el: Element, rules: readonly ClockRule[]): void {
	const texts: Text[] = [];
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) texts.push(node);
	// A chart's axis says how its tooltip's "May" is written; its tick labels touch, so each text is read on its own.
	const may = rules.some((r) => '*' in r) ? monthNamesIn(texts.map((t) => t.data).join('\n')) : undefined;
	for (const node of texts) {
		if (written.get(node) === node.data) continue;
		const next = rewrite(node.data, rules, Date.now(), may);
		if (next !== node.data) node.data = next;
		written.set(node, next);
	}
	for (const field of el instanceof HTMLInputElement ? [el] : el.querySelectorAll('input')) {
		const next = rewrite(field.value, rules);
		if (next === field.value) continue;
		field.value = next;
		field.setAttribute('value', next);
	}
}

export function mount(el: Element): void {
	if (!el.hasAttribute(RULES) || observed.has(el)) return;
	let rules: ClockRule[];
	try {
		rules = JSON.parse(el.getAttribute(RULES)!) as ClockRule[];
	} catch {
		return;
	}
	observed.add(el);
	apply(el, rules);
	// What Markless renders there later (a tooltip's state, a chart's other width) is written again too.
	new MutationObserver(() => apply(el, rules)).observe(el, { subtree: true, childList: true, characterData: true });
}

// Every marked date, not only those scrolled into view, as the old page's hydration wrote them all.
export function idle(): void {
	for (const el of document.querySelectorAll(`[${RULES}]`)) mount(el);
}

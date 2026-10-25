import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { DATE_TEXT, parseDate, type ClockRule, type DateText } from '../../parts/clock.ts';
import { BEHIND, LATER } from './day-picker.ts';
import { defaultEnv, openPage } from '../check/browser.ts';
import { settle } from '../check/capture.ts';
import { DEFAULT_FREEZE } from '../check/freeze.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';

// The dates a page computes in the visitor's browser, told from the ones its server wrote: the route is loaded again at
// day-picker.ts's second clock (LATER) and time zone (BEHIND), and a date that moves with either follows that clock or
// zone. What it follows is written on the element holding it (parts/clock.ts).


/** A settled page whose text (or an input's value) may hold a date written with a month's name. */
export const DATED = /(?:>|value=")[^<"]*\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b/;

/** A text (or an input's value) holding a date, by its element (signature and place) and its place among the element's text nodes. */
export interface ClockText {
	/** The element's place from the body, which the other settings' texts are matched by. */
	readonly path: string;
	readonly sig: string;
	readonly nth: number;
	/** The text node's place among its element's text nodes; -1 for an input's value. */
	readonly t: number;
	readonly text: string;
	/** The element is inside a recharts chart: its wrapper's place among the page's (its style element is not in the converted page, so neither is its signature). */
	readonly chart?: number;
}

export interface ClockMark {
	readonly sig: string;
	readonly nth: number;
	/** A chart's region: the chart whose wrapper is this one among the page's, marked on its `[data-slot="chart"]` (else the wrapper's parent). */
	readonly chart?: number;
	readonly rules: readonly ClockRule[];
}

/** Reads every text and input value in the page that holds a date. Runs in the page. */
function readClockTexts(): ClockText[] {
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const place = new Map<Element, { sig: string; nth: number }>();
	const pathOf = (el: Element) => {
		const out: number[] = [];
		for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) out.unshift([...node.parentElement!.children].indexOf(node));
		return out.join('.');
	};
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		const n = counts.get(sig) ?? 0;
		counts.set(sig, n + 1);
		place.set(el, { sig, nth: n });
	}
	const dated = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b/;
	const out: ClockText[] = [];
	const wrappers = [...document.querySelectorAll('.recharts-wrapper')].filter((w) => !w.closest('template'));
	const chartOf = (el: Element) => {
		const at = wrappers.indexOf(el.closest('.recharts-wrapper')!);
		return at < 0 ? undefined : at;
	};
	for (const el of place.keys()) {
		if (el.closest('script, style, noscript')) continue;
		const texts = [...el.childNodes].filter((n): n is Text => n.nodeType === Node.TEXT_NODE);
		const at = { ...place.get(el)!, path: pathOf(el) };
		const chart = chartOf(el);
		texts.forEach((node, t) => {
			if (dated.test(node.data)) out.push({ ...at, t, text: node.data, ...(chart !== undefined ? { chart } : {}) });
		});
		if (el instanceof HTMLInputElement && dated.test(el.value)) out.push({ ...at, t: -1, text: el.value, ...(chart !== undefined ? { chart } : {}) });
	}
	return out;
}

const dates = (text: string): { whole: string; date: DateText }[] => [...text.matchAll(DATE_TEXT)].flatMap((m) => {
	const date = parseDate(m);
	return date ? [{ whole: m[0], date }] : [];
});

const dayOf = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 86_400_000;
const utcDay = (ms: number) => Math.floor(ms / 86_400_000);
const yearOf = (ms: number) => new Date(ms).getUTCFullYear();

/**
 * What each date in the page follows, from the same texts at the capture clock (UTC), behind UTC, and at LATER: one that
 * moves a day back behind UTC is a fixed instant (date-only, UTC midnight); one that moves with the clock is days from
 * today, or this year's month and day. A chart's fixed instants mark its whole region, which shows more of them.
 */
export function clockMarks(at: readonly ClockText[], behind: readonly ClockText[], later: readonly ClockText[], times: { readonly t0: number; readonly t1: number } = { t0: DEFAULT_FREEZE.time, t1: LATER }): ClockMark[] {
	const keyOf = (c: ClockText) => `${c.path}#${c.t}`;
	const byKey = (list: readonly ClockText[]) => new Map(list.map((c) => [keyOf(c), c]));
	const b = byKey(behind);
	const l = byKey(later);
	const marks = new Map<string, { sig: string; nth: number; chart?: number; rules: ClockRule[] }>();
	const add = (sig: string, nth: number, rule: ClockRule, chart?: number) => {
		const k = chart !== undefined ? `chart#${chart}` : `${sig}#${nth}`;
		const mark = marks.get(k) ?? marks.set(k, { sig, nth, ...(chart !== undefined ? { chart } : {}), rules: [] }).get(k)!;
		if (!mark.rules.some((r) => JSON.stringify(r) === JSON.stringify(rule))) mark.rules.push(rule);
	};
	const y0 = yearOf(times.t0);
	for (const a of at) {
		const other = b.get(keyOf(a));
		const moved = l.get(keyOf(a));
		if (!other || !moved) continue;
		const [da, db, dl] = [dates(a.text), dates(other.text), dates(moved.text)];
		// The same text around its dates, and as many dates: the same text at each setting.
		const frame = (text: string) => text.replace(DATE_TEXT, '\u0000');
		if (da.length !== db.length || da.length !== dl.length || frame(a.text) !== frame(other.text) || frame(a.text) !== frame(moved.text)) continue;
		da.forEach(({ whole, date }, i) => {
			const zone = db[i]!.date;
			const clock = dl[i]!.date;
			const year = date.year ?? y0;
			const day = dayOf(year, date.month, date.day);
			// A date without its year a day back across New Year is the year before.
			const zoneDay = dayOf(zone.year ?? (zone.month === 11 && date.month === 0 ? year - 1 : year), zone.month, zone.day);
			const clockDay = dayOf(clock.year ?? year, clock.month, clock.day);
			if (zoneDay === day - 1 && clockDay === day && (clock.year === undefined || clock.year === year)) {
				if (a.chart !== undefined) add('', 0, { '*': year }, a.chart);
				else add(a.sig, a.nth, { x: whole, at: Date.UTC(year, date.month, date.day) });
				return;
			}
			if (zoneDay !== day || date.year === undefined || clock.year === undefined) return;
			if (clock.month === date.month && clock.day === date.day && clock.year - date.year === yearOf(times.t1) - y0) add(a.sig, a.nth, { x: whole, year: [date.year - y0, date.month, date.day] });
			else if (clockDay - day === utcDay(times.t1) - utcDay(times.t0)) add(a.sig, a.nth, { x: whole, in: day - utcDay(times.t0) });
		});
	}
	return [...marks.values()];
}

const READ_VERSION = 2;
const fileFor = (dir: string, route: string) => join(dir, `${createHash('sha256').update(`clock:${READ_VERSION}:${route}`).digest('hex').slice(0, 16)}.json`);

/** The dates on a route that follow the visitor's clock or time zone, read from the old page at three settings. */
export async function captureClock(browser: Browser, origin: string, route: string, dir: string): Promise<{ readonly route: string; readonly marks: readonly ClockMark[] }> {
	const file = fileFor(dir, route);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; marks: ClockMark[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const read = async (freeze: typeof DEFAULT_FREEZE): Promise<ClockText[]> => {
		const { context, page } = await openPage(browser, defaultEnv(origin, { freeze }), VIEWPORTS[0]!);
		try {
			await loadPage(page, new URL(route, origin).href);
			await settle(page);
			return await page.evaluate(readClockTexts);
		} finally {
			await context.close().catch(() => {});
		}
	};
	const at = await read(DEFAULT_FREEZE);
	const marks = at.length ? clockMarks(at, await read({ ...DEFAULT_FREEZE, timezone: BEHIND }), await read({ ...DEFAULT_FREEZE, time: LATER })) : [];
	const captured = { route, marks };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(captured));
	return captured;
}

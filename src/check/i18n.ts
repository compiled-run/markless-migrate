import { HINTS } from './hints.ts';
import { fieldTemplates } from './noise.ts';
import type { Failure, PageCapture } from './types.ts';

const NAMED = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'ar', 'he', 'ja', 'zh', 'ru', 'pl', 'sv', 'tr'];
const DIGIT = '[0-9\\u0660-\\u0669\\u06f0-\\u06f9]';

const monthCache = new Map<string, string[]>();
function months(lang: string): string[] {
	const cached = monthCache.get(lang);
	if (cached) return cached;
	const names = new Set<string>();
	for (const month of ['long', 'short'] as const) {
		try {
			const format = new Intl.DateTimeFormat(lang, { month, timeZone: 'UTC' });
			for (let m = 0; m < 12; m++) names.add(format.format(new Date(Date.UTC(2026, m, 15))).replace(/\.$/, ''));
		} catch {}
	}
	const out = [...names].filter((n) => /\p{L}{3,}/u.test(n));
	monthCache.set(lang, out);
	return out;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The shape of a date or number as written: digit runs become # (٠ for Arabic-Indic digits), month names MMMM, separators stay.
function shape(text: string, monthPattern: RegExp): string {
	return text
		.replace(/[\u00a0\u202f]/g, ' ')
		.replace(monthPattern, 'MMMM')
		.replace(/[0-9]+/g, '#')
		.replace(/[٠-٩۰-۹]+/g, '٠');
}

/** Dates and numbers written in the text, each with the shape that locale formatting gives it. */
export function formats(lines: readonly string[], langs: readonly string[]): { shape: string; example: string }[] {
	const names = [...new Set([...langs, ...NAMED].flatMap(months))].sort((a, b) => b.length - a.length);
	const month = `(?:${names.map(escape).join('|')})\\.?`;
	const monthPattern = new RegExp(month, 'giu');
	const d = DIGIT;
	const patterns = [
		`${d}{4}-${d}{2}-${d}{2}(?:T${d}{2}:${d}{2}(?::${d}{2}(?:\\.${d}+)?)?Z?)?`,
		`${d}{1,2}[./]${d}{1,2}[./]${d}{2,4}`,
		`${d}{1,2}\\.?\\s${month}\\s${d}{4}`,
		`${month}\\s${d}{1,2},?\\s${d}{4}`,
		`[£€$¥₹]?\\s?${d}{1,3}(?:[,. \\u00a0\\u202f\\u066c]${d}{3})+(?:[.,\\u066b]${d}+)?(?:\\s?[£€$¥₹])?`,
		`[£€$¥₹]?\\s?${d}+[.,\\u066b]${d}+(?:\\s?[£€$¥₹])?`,
	];
	const any = new RegExp(patterns.join('|'), 'giu');
	const out: { shape: string; example: string }[] = [];
	for (const line of lines) for (const m of line.matchAll(any)) out.push({ shape: shape(m[0].trim(), monthPattern), example: m[0].trim() });
	return out;
}

function counts(items: readonly { shape: string }[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const item of items) out.set(item.shape, (out.get(item.shape) ?? 0) + 1);
	return out;
}

export function compareI18n(route: string, viewport: string, oldA: PageCapture, others: readonly PageCapture[], next: PageCapture): Failure[] {
	const failures: Failure[] = [];
	const lang = (p: PageCapture) => p.seo['html:lang'] ?? '';
	const attrs = (p: PageCapture): Record<string, string> => ({ ...(p.seo['html:lang'] !== undefined ? { lang: p.seo['html:lang'] } : {}), ...(p.seo['html:dir'] !== undefined ? { dir: p.seo['html:dir'] } : {}), direction: p.elements.find((el) => el.tag === 'html')?.style.direction ?? '' });
	const expected = fieldTemplates(attrs(oldA), ...others.map(attrs));
	const actual = attrs(next);
	for (const [key, matcher] of expected) {
		const value = actual[key];
		if (value === undefined ? matcher.optional : matcher.test(value)) continue;
		const check = key === 'direction' ? 'text direction of the page' : `<html ${key}>`;
		failures.push({ route, dimension: 'i18n', check, viewport, expected: matcher.source, actual: value ?? '(absent)', hint: key === 'lang' ? HINTS.lang : HINTS.dir });
	}
	for (const key of Object.keys(actual)) if (!expected.has(key)) failures.push({ route, dimension: 'i18n', check: `<html ${key}>`, viewport, expected: '(absent)', actual: actual[key]!, hint: HINTS.dir });

	const langs = [lang(oldA), lang(next)].filter(Boolean);
	const oldFormats = formats(oldA.text, langs);
	const stable = counts(oldFormats);
	for (const other of others) {
		const seen = counts(formats(other.text, langs));
		for (const [s, n] of stable) stable.set(s, Math.min(n, seen.get(s) ?? 0));
	}
	const newFormats = formats(next.text, langs);
	const got = counts(newFormats);
	for (const [s, n] of stable) {
		if ((got.get(s) ?? 0) >= n) continue;
		const example = oldFormats.find((f) => f.shape === s)!.example;
		const instead = newFormats.filter((f) => !stable.has(f.shape)).map((f) => `${f.shape} (${f.example})`);
		failures.push({ route, dimension: 'i18n', check: `date or number format for ${lang(oldA) || 'the page language'}`, viewport, expected: `${s} (${example})`, actual: instead.join(', ') || '(not written)', hint: HINTS.formats });
	}
	return failures;
}

/** Where a browser lands per Accept-Language; compared only where the OLD app lands differently by language, as status codes are the http check's. */
export function negotiationFailures(route: string, locales: readonly string[], olds: readonly Readonly<Record<string, string>>[], next: Readonly<Record<string, string>>): Failure[] {
	const failures: Failure[] = [];
	if (new Set(locales.map((locale) => olds[0]![locale])).size < 2) return failures;
	for (const locale of locales) {
		const expected = olds[0]![locale];
		if (expected === undefined || olds.some((o) => o[locale] !== expected) || next[locale] === expected) continue;
		failures.push({ route, dimension: 'i18n', check: `page a browser sending Accept-Language: ${locale} lands on`, expected, actual: next[locale] ?? '(no response)', hint: HINTS.negotiation });
	}
	return failures;
}

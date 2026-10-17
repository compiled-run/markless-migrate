import { matchElements } from './match.ts';
import { findText, indexMarkup, locate, withImports, type MarkupIndex } from './markup.ts';
import { loadSourceFacts, type SourceFacts } from './source-facts.ts';
import { inDependencies, originalPosition, sourceFile } from './sourcemap.ts';
import type { CssRule } from './stylesheet.ts';
import type { ElementSnapshot, Failure, PageCapture, RouteCapture, RouteResult, SourceLink } from './types.ts';
import { matchRoute, specificity } from '../source/pattern.ts';

/** The OLD and NEW page elements behind a failure, registered where the failure is made. */
export const failureElements = new WeakMap<Failure, { readonly old?: ElementSnapshot; readonly new?: ElementSnapshot }>();
/** For a failure about one of several identical lines, how many identical lines come before it on each side. */
export const failureOccurrence = new WeakMap<Failure, { readonly old?: number; readonly new?: number }>();
/** The OLD stylesheet rule behind a computed-style failure. */
export const failureRules = new WeakMap<Failure, CssRule>();

export function carry(from: Failure, to: Failure): Failure {
	const elements = failureElements.get(from);
	if (elements) failureElements.set(to, elements);
	const rule = failureRules.get(from);
	if (rule) failureRules.set(to, rule);
	return to;
}

export interface Side {
	readonly origin: string;
	/** The app's source checkout. */
	readonly dir?: string;
}

const quoted = (value: string) => value.replace(/\\(.)/g, '$1');
export const NOT_EXERCISED = 'not exercised: ';

// Role and name from an ARIA snapshot line or a journey step: the last `role "name"` it mentions.
function roleAndName(text: string): { role: string; name: string } | undefined {
	const all = [...text.matchAll(/(?:^|[\s,-])([a-z]+) "((?:[^"\\]|\\.)*)"/g)];
	const m = all.at(-1);
	return m ? { role: m[1]!, name: quoted(m[2]!) } : undefined;
}

const squash = (value: string) => value.replace(/\s+/g, '');

function byText(page: PageCapture | undefined, line: string, nth = 0): ElementSnapshot | undefined {
	if (!page || !line || line === '(absent)') return undefined;
	const pick = (all: ElementSnapshot[]) => all[Math.min(nth, all.length - 1)];
	const named = roleAndName(line);
	if (named) {
		const hit = pick(page.elements.filter((e) => e.role === named.role && e.name === named.name)) ?? page.elements.find((e) => e.name === named.name);
		if (hit) return hit;
	}
	const content = /^\s*-\s*([a-z]+):\s*"?(.*?)"?\s*$/.exec(line);
	const role = content?.[1];
	const text = squash(content ? content[2]! : line);
	const exact = pick(page.elements.filter((e) => (!role || e.role === role) && (squash(e.text) === text || squash(e.name) === text)));
	if (exact) return exact;
	// The element whose own words make up most of the line: text split across child elements still names its owner.
	return page.elements.filter((e) => (!role || e.role === role) && e.text.length > 3 && text.includes(squash(e.text))).sort((a, b) => text.indexOf(squash(a.text)) - text.indexOf(squash(b.text)) || b.text.length - a.text.length)[0];
}

function targets(f: Failure, oldPage: PageCapture | undefined, newPage: PageCapture | undefined): { old?: ElementSnapshot; new?: ElementSnapshot } {
	const known = failureElements.get(f);
	let old = known?.old;
	let next = known?.new;
	if (!old && !next && f.check.startsWith(NOT_EXERCISED)) {
		const named = /^([a-z]+) "((?:[^"\\]|\\.)*)"(?: #(\d+))?$/.exec(f.check.slice(NOT_EXERCISED.length));
		if (named) old = oldPage?.elements.filter((e) => e.role === named[1] && e.name === quoted(named[2]!))[Number(named[3] ?? 1) - 1];
	} else if (!old && !next && !f.check.startsWith('browser storage')) {
		if (f.dimension === 'rendered' || f.dimension === 'behaviour' || f.dimension === 'responsiveness' || (f.dimension === 'a11y' && /\(step \d+\)|^(click|press|type|fill|choose)\b/.test(f.check))) {
			const nth = failureOccurrence.get(f);
			old = byText(oldPage, f.dimension === 'rendered' ? f.expected : f.check, nth?.old);
			next = byText(newPage, f.dimension === 'rendered' ? f.actual : f.check, nth?.new);
		} else if (f.dimension === 'assets' && /^image #(\d+)/.test(f.check)) {
			const img = oldPage?.images[Number(/^image #(\d+)/.exec(f.check)![1]) - 1];
			old = img ? oldPage!.elements.find((e) => e.tag === 'img' && e.name === (img.alt ?? '')) : undefined;
		}
	}
	const rebind = (el: ElementSnapshot | undefined, page: PageCapture | undefined) => {
		if (!el || el.sources || !page || page.elements.includes(el)) return el;
		const j = matchElements([el], page.elements).get(0);
		return j === undefined ? el : page.elements[j];
	};
	old = rebind(old, oldPage);
	next = rebind(next, newPage);
	// Only a confident pair: the same element with the same words, or the same named control; a merely similar one would point at the wrong line.
	const twin = (el: ElementSnapshot, page: PageCapture) => {
		const alike = page.elements.filter((e) => e.tag === el.tag && e.role === el.role && (el.text ? e.text === el.text : el.name ? e.name === el.name : false));
		return alike.find((e) => e.chain && e.chain === el.chain) ?? alike[0];
	};
	if (old && !next && newPage) next = twin(old, newPage);
	else if (next && !old && oldPage) old = twin(next, oldPage);
	return { ...(old ? { old } : {}), ...(next ? { new: next } : {}) };
}

async function fromHints(el: ElementSnapshot, side: Side, index: MarkupIndex | undefined): Promise<Found | undefined> {
	for (const h of el.sources ?? []) {
		let link: SourceLink | undefined;
		if (h.url && h.line) {
			const mapped = await originalPosition(new URL(h.url, side.origin).href, h.line, h.column ?? 1, side.dir);
			link = mapped && { ...mapped, how: `${h.how} + source map` };
		} else if (h.file) {
			const { file, path } = sourceFile(h.file, side.dir);
			link = { file, ...(h.line ? { line: h.line } : {}), ...(h.column ? { column: h.column } : {}), ...(path ? { path } : {}), how: h.how };
		}
		if (!link || inDependencies(link.file)) continue;
		if (h.how === 'react component' || (!link.line && index)) {
			// The component's file (a React component function, Vue's __file): find the element itself in it.
			if (!index) return { link };
			const hit = locate(index, el, [link.file], new Set([link.file]));
			if (!hit && h.how === 'react component') continue;
			if (!hit) return { link };
			return { link: { ...link, line: hit.element.line, column: hit.element.column }, ...(hit.textFrom ? { textFrom: hit.textFrom } : {}) };
		}
		return { link };
	}
	return undefined;
}

function absolute(index: MarkupIndex | undefined, file: string): { path?: string } {
	return index ? { path: `${index.root}/${file}` } : {};
}

interface Found {
	readonly link: SourceLink;
	readonly textFrom?: { readonly file: string; readonly line: number };
}

async function find(el: ElementSnapshot, side: Side, index: MarkupIndex | undefined, prefer: readonly string[]): Promise<Found | undefined> {
	const hinted = await fromHints(el, side, index);
	if (hinted) return hinted;
	if (!index) return undefined;
	const hit = locate(index, el, prefer);
	if (hit) return { link: { file: hit.element.file, line: hit.element.line, column: hit.element.column, ...absolute(index, hit.element.file), how: 'source markup' }, ...(hit.textFrom ? { textFrom: hit.textFrom } : {}) };
	const text = el.text || el.name;
	const string = text ? findText(index, text) : undefined;
	return string ? { link: { file: string.file, line: string.line, ...absolute(index, string.file), how: 'source text' } } : undefined;
}

async function ruleLink(rule: CssRule, side: Side, index: MarkupIndex | undefined): Promise<SourceLink | undefined> {
	if (rule.original) return rule.original;
	if (!index) return undefined;
	const props = new Set(rule.declarations.map((d) => d.property));
	const same = index.css.find((r) => r.selector === rule.selector && r.declarations.some((d) => props.has(d.property)) && JSON.stringify(r.conditions) === JSON.stringify(rule.conditions)) ?? index.css.find((r) => r.selector === rule.selector);
	return same ? { file: same.file, line: same.line, column: same.column, ...absolute(index, same.file), how: 'source stylesheet' } : undefined;
}

const short = (el: ElementSnapshot) => {
	const label = (el.name || el.text).replace(/\s+([:;,.!?])/g, '$1');
	return `${el.role && el.role !== 'generic' ? el.role : el.tag}${label ? ` "${label.length > 40 ? `${label.slice(0, 40)}...` : label}"` : ''}`;
};

export const at = (link: SourceLink) => `${link.file}${link.line ? `:${link.line}` : ''}`;

/** Files a route is rendered from, best first: OLD from the source scan's routes and layouts, NEW from the page file the app names. */
function oldFiles(route: string, facts: SourceFacts | undefined, index: MarkupIndex | undefined): string[] {
	const routes = (facts?.routes ?? []).filter((r) => r.kind !== 'endpoint' && matchRoute(r.path, route)).sort((a, b) => specificity(b.path) - specificity(a.path)).slice(0, 1);
	const files = routes.map((r) => r.file);
	const layouts = (facts?.components ?? []).filter((c) => c.kind === 'layout' && files.some((f) => f.startsWith(c.file.replace(/[^/]*$/, '')))).map((c) => c.file);
	return index ? withImports(index, [...files, ...layouts]) : [...files, ...layouts];
}

const scans = new Map<string, Promise<SourceFacts | undefined>>();

// The source scan's routes and layouts, when check was given a checkout but not the scan.
function routeFacts(dir: string): Promise<SourceFacts | undefined> {
	if (!scans.has(dir)) scans.set(dir, loadSourceFacts(dir).then((r) => r.facts, () => undefined));
	return scans.get(dir)!;
}

export interface LocateInput {
	readonly route: string;
	readonly old: RouteCapture;
	readonly next: RouteCapture;
	readonly sides: { readonly old: Side; readonly new: Side };
	readonly facts?: SourceFacts;
}

/** Names the old and new source location behind each failure that concerns an element. */
export async function locateFailures(result: RouteResult, input: LocateInput): Promise<RouteResult> {
	const [oldIndex, newIndex] = await Promise.all([input.sides.old.dir ? indexMarkup(input.sides.old.dir) : undefined, input.sides.new.dir ? indexMarkup(input.sides.new.dir) : undefined]);
	const first = Object.keys(input.old.pages)[0]!;
	const routeFile = input.next.pages[first]?.routeFile;
	const facts = input.facts?.routes ? input.facts : input.sides.old.dir ? await routeFacts(input.sides.old.dir) : undefined;
	const preferOld = oldFiles(input.route, facts, oldIndex);
	// Without a page file the app names, the new checkout's files at the old route's paths (a port that kept its layout).
	const mirrored = newIndex ? preferOld.filter((f) => newIndex.imports.has(f)) : [];
	const preferNew = newIndex ? withImports(newIndex, routeFile ? [routeFile, 'document.tsrx'] : mirrored) : routeFile ? [routeFile] : [];
	const newRouteLink = (): SourceLink | undefined => {
		if (!routeFile) return mirrored[0] ? { file: mirrored[0], ...absolute(newIndex, mirrored[0]), how: 'source route' } : undefined;
		const root = newIndex?.elements.filter((e) => e.file === routeFile).sort((a, b) => a.line - b.line || a.column - b.column)[0];
		return { file: routeFile, ...(root ? { line: root.line, column: root.column } : {}), ...absolute(newIndex, routeFile), how: 'markless route' };
	};
	const oldRouteLink = (): SourceLink | undefined => (preferOld[0] ? { file: preferOld[0], ...absolute(oldIndex, preferOld[0]), how: 'source route' } : undefined);
	const failures = await Promise.all(
		result.failures.map(async (f) => {
			const viewport = f.viewport && input.old.pages[f.viewport] ? f.viewport : first;
			const els = targets(f, input.old.pages[viewport], input.next.pages[viewport]);
			const rule = failureRules.get(f);
			if (!els.old && !els.new && !rule) return f;
			const oldFound = els.old ? await find(els.old, input.sides.old, oldIndex, preferOld) : undefined;
			const newFound = els.new ? await find(els.new, input.sides.new, newIndex, preferNew) : undefined;
			const ruleAt = rule ? await ruleLink(rule, input.sides.old, oldIndex) : undefined;
			const absent = f.dimension === 'rendered' || f.dimension === 'a11y' ? (f.actual === '(absent)' ? 'new' : f.expected === '(absent)' ? 'old' : undefined) : undefined;
			const oldLink = ruleAt ?? oldFound?.link ?? (absent === 'old' ? oldRouteLink() : undefined);
			const newLink = newFound?.link ?? (absent === 'new' ? newRouteLink() : undefined);
			if (!oldLink && !newLink) return f;
			const text = (found: Found | undefined) => (found?.textFrom ? ` (text from ${found.textFrom.file}:${found.textFrom.line})` : '');
			const oldPart = ruleAt && rule ? `old ${at(ruleAt)} \`${rule.selector}\` sets ${rule.declarations.map((d) => d.property).filter((p) => f.expected.includes(`${p}:`) || f.expected.includes(p)).slice(0, 3).join(', ') || 'it'}` : oldLink && els.old ? `old ${at(oldLink)} renders ${short(els.old)}${text(oldFound)}` : oldLink ? `old ${at(oldLink)} doesn't` : els.old ? `old renders ${short(els.old)} (source not found)` : '';
			const newPart = newLink && els.new ? `new ${at(newLink)} renders ${els.old && short(els.new) === short(els.old) ? 'it' : short(els.new)}${text(newFound)}` : newLink ? `new ${at(newLink)} doesn't` : els.new ? `new renders ${short(els.new)} (source not found)` : '';
			const where = [oldPart, newPart].filter(Boolean).join('; ');
			return { ...f, ...(oldLink ? { old: oldLink } : {}), ...(newLink ? { new: newLink } : {}), where };
		}),
	);
	return { ...result, failures, ...(newIndex && preferNew.length ? { newFiles: preferNew } : {}) };
}


import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yuku-css';
import { longhands } from './css-longhands.ts';
import type { Together } from './class-facts.ts';
import { type Cut, keptText, type Leaf, unescape } from './used-css.ts';

// biome-ignore lint/suspicious/noExplicitAny: yuku-css's AST, walked generically
type Node = any;

interface Tag {
	readonly tag: string;
	readonly attrs: Readonly<Record<string, string>>;
	readonly self?: unknown;
}

const GROUPING = new Set(['media', 'supports', 'container', 'layer', 'scope', 'starting-style', 'document']);
const isStylesheet = (t: Tag) => t.tag === 'link' && /\bstylesheet\b/.test(t.attrs.rel ?? '');
const movable = (t: Tag) => t.attrs.rel === 'stylesheet' && t.self === undefined && Object.keys(t.attrs).every((k) => k === 'rel' || k === 'href') && /^\/(?!\/)[^?#]*\.css$/.test(t.attrs.href ?? '');
const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/** What the cascade compares a leaf's declarations by, short of order: its layer, importance, property group and specificity. */
interface Leafed {
	readonly leaf: Leaf;
	readonly keys: readonly Key[];
	/** Holds rules of its own: always the page's. */
	readonly bound: boolean;
}

/**
 * One declaration as the cascade compares it: `layer\0important`, a longhand it sets, the specificity and pseudo-element it
 * applies with (`*` matches any), and the classes the element it styles must have (undefined: any element).
 */
type Key = readonly [bucket: string, group: string, spec: string, subject: readonly string[] | undefined];

/** The classes a complex selector's subject must carry, outside :is(), :not() and the like. */
function subjectClasses(selector: Node): string[] {
	let classes: string[] = [];
	for (const part of selector.children ?? []) {
		if (part.type === 'Combinator') classes = [];
		else if (part.type === 'ClassSelector') classes.push(unescape(part.name));
	}
	return classes;
}

interface Sheet {
	readonly css: string;
	readonly ast: Node;
	/** Every leaf (keptText's unit) in source order. */
	readonly leaves: readonly Leafed[];
}

const LEGACY_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const ARGUMENTED = new Set(['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any']);

/**
 * A complex selector's specificity as `a,b,c`, followed by the pseudo-element it styles (declarations on another box never
 * compete), or undefined where this does not know it (nesting, ::slotted(), :nth-child(of)).
 */
export function specificity(selector: Node): string | undefined {
	let a = 0;
	let b = 0;
	let c = 0;
	let target = '';
	for (const part of selector.children ?? []) {
		switch (part.type) {
			case 'Combinator':
				target = '';
				break;
			case 'IdSelector':
				a++;
				break;
			case 'ClassSelector':
			case 'AttributeSelector':
				b++;
				break;
			case 'TypeSelector':
				if (part.name !== '*' && !String(part.name).endsWith('|*')) c++;
				break;
			case 'PseudoElementSelector':
				if (part.children) return undefined;
				c++;
				target += `::${String(part.name).toLowerCase()}`;
				break;
			case 'PseudoClassSelector': {
				const name = String(part.name).toLowerCase();
				if (LEGACY_ELEMENTS.has(name)) {
					c++;
					target += `::${name}`;
				} else if (name === 'where') break;
				else if (ARGUMENTED.has(name)) {
					const list = part.children?.[0];
					if (list?.type !== 'SelectorList') return undefined;
					const all = (list.children as Node[]).map((s) => specificity(s));
					if (all.some((s) => s === undefined || s.includes(':'))) return undefined;
					const max = all.map((s) => s!.split(',').map(Number)).reduce((x, y) => (y[0]! > x[0]! || (y[0] === x[0] && (y[1]! > x[1]! || (y[1] === x[1] && y[2]! > x[2]!))) ? y : x), [0, 0, 0]);
					a += max[0]!;
					b += max[1]!;
					c += max[2]!;
				} else if (part.children && /^nth-(?:last-)?child$/.test(name)) return undefined;
				else if (/^(?:host|host-context)$/.test(name)) return undefined;
				else b++;
				break;
			}
			default:
				return undefined;
		}
	}
	return `${a},${b},${c}${target}`;
}

/** Each leaf with the keys its declarations compete under; a layer statement declares none. */
function leavesOf(css: string, ast: Node): Leafed[] {
	const out: Leafed[] = [];
	const visit = (nodes: readonly Node[], layer: string, scoped: boolean, bound: boolean) => {
		for (const node of nodes) {
			if (node.type === 'Rule') {
				const inner = (node.block?.children ?? []) as Node[];
				const nests = inner.some((n) => n.type !== 'Declaration');
				const selectors = node.prelude?.type === 'SelectorList' && !scoped ? (node.prelude.children as Node[]).map((sel) => ({ spec: specificity(sel) ?? '*', subject: subjectClasses(sel) })) : [{ spec: '*', subject: undefined }];
				const keys: Key[] = [];
				for (const d of inner) {
					if (d.type !== 'Declaration') continue;
					for (const group of longhands(d.property)) for (const { spec, subject } of selectors) keys.push([`${layer}\0${d.important ? 1 : 0}`, group, spec, subject]);
				}
				out.push({ leaf: node, keys, bound: bound || nests });
				if (nests) visit(inner, layer, scoped, true);
			} else if (node.type === 'Atrule' && node.block && GROUPING.has(node.name.toLowerCase())) {
				const name = node.name.toLowerCase();
				const named = name === 'layer' ? (node.prelude ? css.slice(node.prelude.start, node.prelude.end).trim() : '') : undefined;
				const inner = named === undefined ? layer : `${layer}.${named || `#${node.start}`}`;
				visit(node.block.children, inner, scoped || name === 'scope', bound);
			} else if (node.type === 'Atrule') {
				const name = node.name.toLowerCase();
				if (name === 'layer') out.push({ leaf: node, keys: [], bound });
				else {
					const prelude = node.prelude ? css.slice(node.prelude.start, node.prelude.end).trim() : '';
					const group = /^(?:keyframes|-webkit-keyframes|property|counter-style|font-palette-values|position-try|font-feature-values|page|view-transition)$/.test(name) ? `@${name.replace(/^-webkit-/, '')} ${prelude}` : name === 'font-face' ? '@font-face' : '*';
					out.push({ leaf: node, keys: [[`${layer}\0${0}`, group, '0', undefined]], bound });
				}
			} else out.push({ leaf: node, keys: [[`${layer}\0${0}`, '*', '*', undefined]], bound: true });
		}
	};
	visit(ast.children, '', false, false);
	return out;
}

/** The declarations already placed after the shared sheet, as the cascade compares them. */
class Placed {
	readonly #buckets = new Map<string, Map<string, Key[]>>();
	readonly #together: Together | undefined;

	constructor(together: Together | undefined) {
		this.#together = together;
	}

	conflicts(keys: readonly Key[]): boolean {
		for (const key of keys) {
			const [bucket, group, spec, subject] = key;
			const b = this.#buckets.get(bucket);
			if (!b) continue;
			const candidates = group === '*' ? [...b.values()].flat() : [...(b.get(group) ?? []), ...(b.get('*') ?? [])];
			for (const [, , other, theirs] of candidates) {
				if (spec !== '*' && other !== '*' && spec !== other) continue;
				if (!subject || !theirs || !this.#together || this.#together(subject, theirs)) return true;
			}
		}
		return false;
	}

	add(keys: readonly Key[]): void {
		for (const key of keys) {
			const [bucket, group] = key;
			let b = this.#buckets.get(bucket);
			if (!b) this.#buckets.set(bucket, (b = new Map()));
			const list = b.get(group);
			if (list) list.push(key);
			else b.set(group, [key]);
		}
	}
}

/** The layer names in the order the cascade ranks them: each at its first mention, anonymous ones by place. */
function layerOrder(css: string, ast: Node, into: string[]): void {
	const seen = new Set(into);
	const mention = (name: string) => {
		if (!seen.has(name)) {
			seen.add(name);
			into.push(name);
		}
	};
	const visit = (nodes: readonly Node[], layer: string) => {
		for (const node of nodes) {
			if (node.type === 'Rule') {
				visit((node.block?.children ?? []).filter((n: Node) => n.type !== 'Declaration'), layer);
				continue;
			}
			if (node.type !== 'Atrule') continue;
			const name = node.name.toLowerCase();
			if (name === 'layer') {
				const prelude = node.prelude ? css.slice(node.prelude.start, node.prelude.end).trim() : '';
				if (!node.block) {
					for (const each of prelude.split(',')) for (const [i] of each.trim().split('.').entries()) mention(`${layer}.${each.trim().split('.').slice(0, i + 1).join('.')}`);
					continue;
				}
				const parts = prelude ? prelude.split('.') : [`#${node.start}`];
				for (const [i] of parts.entries()) mention(`${layer}.${parts.slice(0, i + 1).join('.')}`);
				visit(node.block.children, `${layer}.${prelude || `#${node.start}`}`);
			} else if (node.block && GROUPING.has(name)) visit(node.block.children, layer);
		}
	};
	visit(ast.children, '');
}

/** How many leading characters the texts share, ending after a whole top-level rule: none when one is empty. */
export function commonRules(texts: readonly string[]): number {
	if (texts.length < 2 || texts.some((t) => !t)) return 0;
	const ends = texts.map((t) => new Set<number>(parse(t).ast.children.map((n: Node) => n.end as number)));
	let common = 0;
	for (const end of [...ends[0]!].sort((a, b) => a - b)) {
		const head = texts[0]!.slice(0, end);
		if (!texts.every((t, i) => ends[i]!.has(end) && t.startsWith(head))) break;
		common = end;
	}
	return common;
}

/** The leaf set a sheet's text keeps, from the shared choice, as recorded for a later partial convert. */
export interface SharedRecord {
	readonly sheets: readonly { readonly href: string; readonly sha: string; readonly keep: readonly number[] }[];
}

export interface SharedResult<T> {
	/** The shared sheets' public paths, in cascade order: the document imports them, ahead of every page's. */
	readonly shared: string[];
	readonly heads: Map<string, T[]>;
	readonly written: string[];
	readonly record: SharedRecord;
	/** Whether `previous` chose the shared rules. */
	readonly reused: boolean;
	readonly bytes: { readonly shared: number; readonly pages: number; readonly before: number };
}

/**
 * Splits the stylesheets every page links into one shared sheet each, which the document imports ahead of the pages',
 * and per page the rest. A leaf more than half the pages keep is shared: a page that keeps no element it styles is
 * unchanged by it (usedCss), and a page's HTML then carries about what its own cut held.
 *
 * The cascade is the cut sheets', exactly: a page's own leaves now follow every shared one, so a shared leaf that came
 * after one of them in the source and could compete with it (same layer and importance, a property group in common,
 * specificities that can tie) is written again in the page's sheet, in its place; a later copy of a rule wins wherever
 * the first did. A layer the move would rank otherwise, or a sheet that will not move, leaves every page as it was.
 *
 * `previous` (a partial convert's) keeps the document's shared sheets as they are, so the pages not converted again
 * stay right; it is used when its sheets still read as they did and every page links them.
 */
export async function shareStylesheets<T extends Tag>(input: {
	readonly publicDir: string;
	readonly pages: ReadonlyMap<string, readonly string[]>;
	readonly heads: ReadonlyMap<string, readonly T[]>;
	readonly cuts: ReadonlyMap<string, Cut>;
	readonly appended: ReadonlyMap<string, { readonly from: string; readonly extra: string }>;
	readonly previous?: SharedRecord;
	/** A route's answer to whether one element can carry two selectors' subject classes; without it any two can. Asked once per route, in page order. */
	readonly together?: (route: string) => Together | Promise<Together>;
}): Promise<SharedResult<T> | { readonly skipped: string }> {
	const { publicDir, heads, cuts, appended } = input;
	const routes = [...input.pages.values()].flat().filter((r) => heads.has(r));
	if (routes.length < 2) return { skipped: 'fewer than two pages' };
	const read = (href: string) => readFile(join(publicDir, href), 'utf8').catch(() => undefined);
	// The sheets cut from (a few, each read whole once); a page's own files are read when its turn comes and not kept.
	const sources = new Map<string, Promise<Sheet | undefined>>();
	const source = (href: string) => {
		if (!sources.has(href))
			sources.set(
				href,
				read(href).then((css) => {
					if (css === undefined) return undefined;
					// A rule whose selector does not parse is one a browser drops, wherever it is written.
					const { ast } = parse(css);
					return { css, ast, leaves: leavesOf(css, ast) };
				}),
			);
		return sources.get(href)!;
	};
	const keysOf = (css: string) => leavesOf(css, parse(css).ast).map((l) => l.keys);
	// Each link as the sheet it was cut from, the leaves it keeps (all when uncut), the file before the page's own text was
	// appended to it, and that text.
	const links = new Map<string, { href: string; kept: ReadonlySet<number> | undefined; base: string; extra: string }>();
	const lists = new Map<string, string[]>();
	for (const [page, pageRoutes] of input.pages)
		for (const r of pageRoutes) {
			const tags = heads.get(r)?.filter(isStylesheet);
			if (!tags) continue;
			if (!tags.every(movable)) return { skipped: `${page} links a stylesheet that is not a plain same-origin file` };
			lists.set(r, tags.map((t) => t.attrs.href!).filter((h, i, all) => all.lastIndexOf(h) === i));
		}
	for (const hrefs of lists.values())
		for (const href of hrefs) {
			if (links.has(href)) continue;
			const add = appended.get(href);
			const base = add ? add.from : href;
			const cut = cuts.get(base);
			links.set(href, { href: cut ? cut.href : base, kept: cut?.kept, base, extra: add?.extra ?? '' });
		}
	for (const s of new Set([...links.values()].map((s) => s.href))) {
		const parsed = await source(s);
		if (!parsed) return { skipped: `${s} does not read` };
		if (parsed.ast.children.some((n: Node) => n.type === 'Atrule' && /^(?:import|namespace)$/i.test(n.name))) return { skipped: `${s} has an @import or @namespace` };
	}
	// The sheets every page links, in one order; the shared sheet of each holds the leaves the choice keeps.
	const linked = (r: string) => lists.get(r)!.map((h) => links.get(h)!.href);
	const common = linked(routes[0]!).filter((h) => routes.every((r) => linked(r).includes(h)));
	if (routes.some((r) => linked(r).filter((h) => common.includes(h)).join('\n') !== common.join('\n'))) return { skipped: 'pages link the common stylesheets in different orders' };
	if (!common.length) return { skipped: 'no stylesheet is linked by every page' };
	const keptBy = (route: string, href: string) => links.get(lists.get(route)!.find((h) => links.get(h)!.href === href)!)!.kept;
	const choice = new Map<string, Set<number>>();
	const previous = input.previous?.sheets;
	const fits = async (p: SharedRecord['sheets'][number]) => {
		const s = await source(p.href);
		if (!s || sha(s.css) !== p.sha) return false;
		// A shared leaf other than a style rule (a withheld @font-face) must be one every page keeps.
		const others = s.leaves.filter(({ leaf }) => leaf.type !== 'Rule' && p.keep.includes(leaf.start));
		return routes.every((r) => {
			const kept = keptBy(r, p.href);
			return !kept || others.every(({ leaf }) => kept.has(leaf.start));
		});
	};
	const reuse = previous?.length && previous.every((p) => common.includes(p.href)) && (await Promise.all(previous.map(fits))).every(Boolean);
	if (reuse) for (const p of previous) choice.set(p.href, new Set(p.keep));
	else
		for (const href of common) {
			const { leaves } = (await source(href))!;
			const votes = new Map<number, number>();
			for (const r of routes) {
				const kept = keptBy(r, href);
				for (const { leaf } of leaves) if (!kept || kept.has(leaf.start)) votes.set(leaf.start, (votes.get(leaf.start) ?? 0) + 1);
			}
			// A style rule a page cannot match changes nothing there; any other leaf (a withheld @font-face) only when all keep it.
			const shared = leaves.filter(({ leaf, bound }) => !bound && (votes.get(leaf.start) ?? 0) * 2 > routes.length && (leaf.type === 'Rule' || votes.get(leaf.start) === routes.length));
			if (shared.length) choice.set(href, new Set(shared.map(({ leaf }) => leaf.start)));
		}
	const sharedHrefs = common.filter((h) => choice.get(h)?.size);
	if (!sharedHrefs.length) return { skipped: 'no rule is kept by more than half the pages' };
	const written = new Set<string>();
	const write = async (path: string, text: string) => {
		if (!written.has(path)) {
			written.add(path);
			await writeFile(join(publicDir, path), text);
		}
		return path;
	};
	const sharedTexts: string[] = [];
	const shared: string[] = [];
	for (const href of sharedHrefs) {
		const { css, ast } = (await source(href))!;
		const keep = choice.get(href)!;
		const text = keptText(css, ast, (leaf) => keep.has(leaf.start));
		sharedTexts.push(text);
		shared.push(await write(href.replace(/\.css$/, `.shared-${sha(text)}.css`), text));
	}
	const orderOf = (text: string) => {
		const into: string[] = [];
		layerOrder(text, parse(text).ast, into);
		return into;
	};
	const sharedOrder = sharedTexts.flatMap(orderOf);
	// What a page links unchanged (a sheet not every page links): its layers, its size and its keys, by href.
	const unchanged = new Map<string, Promise<{ order: string[]; size: number; keys: (readonly Key[])[] } | undefined>>();
	const facts = (href: string) => {
		if (!unchanged.has(href)) unchanged.set(href, read(href).then((css) => (css === undefined ? undefined : { order: orderOf(css), size: css.length, keys: keysOf(css) })));
		return unchanged.get(href)!;
	};
	// A page's routes' own <style> texts after one sheet: the leading rules all of them have, imported by the page, and each one's rest.
	const extraParts = new Map<string, readonly string[]>();
	for (const pageRoutes of input.pages.values()) {
		const bySheet = new Map<string, Map<string, string>>();
		for (const r of pageRoutes)
			for (const href of lists.get(r) ?? []) {
				const link = links.get(href)!;
				if (!bySheet.has(link.href)) bySheet.set(link.href, new Map());
				bySheet.get(link.href)!.set(r, link.extra);
			}
		for (const extras of bySheet.values()) {
			const texts = pageRoutes.map((r) => extras.get(r) ?? '');
			const common = commonRules(texts);
			for (const [r, extra] of extras) if (extra) extraParts.set(`${r}\0${extra}`, [extra.slice(0, common), extra.slice(common)].filter((t) => t.trim()));
		}
	}
	const out = new Map<string, T[]>();
	const bytes = { shared: sharedTexts.reduce((n, t) => n + t.length, 0), pages: 0, before: 0 };
	for (const route of routes) {
		const placed = new Placed(await input.together?.(route));
		const own: string[] = [];
		const was: string[][] = [];
		const now: string[][] = [sharedOrder];
		for (const href of lists.get(route)!) {
			const link = links.get(href)!;
			const keep = choice.get(link.href);
			if (!keep) {
				const base = await facts(link.base);
				if (!base) return { skipped: `${link.base} does not read` };
				for (const k of base.keys) placed.add(k);
				was.push(base.order);
				now.push(base.order);
				bytes.before += base.size;
				bytes.pages += base.size;
				own.push(link.base);
			} else {
				const { css, ast, leaves } = (await source(link.href))!;
				const mine = new Set<number>();
				for (const l of leaves) {
					if (link.kept && !link.kept.has(l.leaf.start)) continue;
					// A shared leaf stays shared unless a leaf of this page's that came before it could lose to it now.
					if (keep.has(l.leaf.start) && !placed.conflicts(l.keys)) continue;
					mine.add(l.leaf.start);
					placed.add(l.keys);
				}
				const cutBefore = link.kept ? keptText(css, ast, (leaf) => link.kept!.has(leaf.start)) : css;
				was.push(orderOf(cutBefore));
				bytes.before += cutBefore.length;
				if (mine.size) {
					const cut = keptText(css, ast, (leaf) => mine.has(leaf.start));
					now.push(orderOf(cut));
					bytes.pages += cut.length;
					own.push(await write(link.href.replace(/\.css$/, `.used-${sha(cut)}.css`), cut));
				}
			}
			// The page's own <style> text, after the sheet it was appended to: one file of its own, so the cut is the same on every page that keeps it.
			if (link.extra) {
				for (const k of keysOf(link.extra)) placed.add(k);
				const order = orderOf(link.extra);
				was.push(order);
				now.push(order);
				bytes.before += link.extra.length + 1;
				bytes.pages += link.extra.length;
				for (const part of extraParts.get(`${route}\0${link.extra}`) ?? [link.extra]) own.push(await write(link.href.replace(/\.css$/, `.used-${sha(part)}.css`), part));
			}
		}
		const before = [...new Set(was.flat())];
		const after = [...new Set(now.flat())];
		if (after.filter((l) => before.includes(l)).join('\n') !== before.join('\n')) return { skipped: `${route} would rank its cascade layers otherwise` };
		const tags = heads.get(route)!;
		const first = tags.findIndex(isStylesheet);
		const template = tags[first]!;
		const rest = tags.filter((t) => !isStylesheet(t));
		const at = tags.slice(0, first).filter((t) => !isStylesheet(t)).length;
		out.set(route, [...rest.slice(0, at), ...own.map((href) => ({ ...template, attrs: { ...template.attrs, href } })), ...rest.slice(at)]);
	}
	return {
		shared,
		heads: out,
		written: [...written],
		record: { sheets: await Promise.all(sharedHrefs.map(async (href) => ({ href, sha: sha((await source(href))!.css), keep: [...choice.get(href)!].sort((a, b) => a - b) }))) },
		reused: Boolean(reuse),
		bytes,
	};
}

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yuku-css';

// biome-ignore lint/suspicious/noExplicitAny: css-tree's AST, walked generically
type Node = any;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };

const DELIMITER = /["'`<>={}(),;]/g;
const WINDOW = 24;
const LONGEST = 256;

/**
 * Every word the given markup and code could put in a class or id attribute. Each whitespace-separated piece counts, and
 * so does each part of it between quotes and the punctuation around words, since a class itself may hold them
 * (`[&_svg:not([class*='size-'])]:size-4`). A class built by joining strings is not seen.
 */
export function classTokens(texts: Iterable<string>): Set<string> {
	const tokens = new Set<string>();
	for (const raw of texts) {
		const text = raw.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/g, (_, e: string) => ENTITIES[e]!);
		for (const piece of text.split(/\s+/)) {
			if (!piece) continue;
			tokens.add(piece);
			const cuts = [...piece.matchAll(DELIMITER)].map((m) => m.index!);
			if (!cuts.length) continue;
			// Markup with no space in it is one long piece: a slice spans at most WINDOW delimiters and LONGEST characters.
			const starts = [0, ...cuts.map((i) => i + 1)];
			const ends = [...cuts, piece.length];
			for (let a = 0; a < starts.length; a++) {
				for (let b = a; b < ends.length && b <= a + WINDOW && ends[b]! - starts[a]! <= LONGEST; b++) if (ends[b]! > starts[a]!) tokens.add(piece.slice(starts[a], ends[b]));
			}
		}
	}
	return tokens;
}

const unescape = (name: string) => name.replace(/\\([0-9a-fA-F]{1,6})[ \t\n]?|\\(.)/g, (_, hex: string | undefined, ch: string | undefined) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch!));

const ANY_OF = new Set(['is', 'where', 'matches', '-webkit-any', '-moz-any', 'has']);
// Rules in these at-rules are style rules; any other at-rule (@keyframes, @font-face, @property) is kept whole.
const GROUPING = new Set(['media', 'supports', 'container', 'layer', 'scope', 'starting-style', 'document']);

function possible(selector: Node, tokens: { has(token: string): boolean }): boolean {
	for (const part of selector.children ?? []) {
		if ((part.type === 'ClassSelector' || part.type === 'IdSelector') && !tokens.has(unescape(part.name))) return false;
		if (part.type === 'PseudoClassSelector' && ANY_OF.has(part.name.toLowerCase())) {
			const list = part.children?.[0];
			if (list?.type === 'SelectorList' && !list.children.some((s: Node) => possible(s, tokens))) return false;
		}
	}
	return true;
}

/**
 * The stylesheet without the style rules no element of the page can match: a rule goes when each of its selectors needs a
 * class or id (outside `:not()`) that `tokens` does not hold, and a grouping at-rule goes with its last rule, except
 * `@layer`, whose order it declares. What stays is the source text, byte for byte and in its order, so the cascade among
 * the kept rules is the original's. With `late`, an @font-face any of whose files is `withheld` (paths, its url()s
 * resolved from the stylesheet's path `sheet`) goes too: the page adds that face from script (late-fonts.ts).
 */
export function usedCss(css: string, tokens: { has(token: string): boolean }, late?: { readonly sheet: string; readonly withheld: ReadonlySet<string> }): string {
	let ast: Node;
	try {
		ast = parse(css).ast;
	} catch {
		return css;
	}
	const cuts: [number, number][] = [];
	// Returns whether anything in `nodes` stays.
	const walk = (nodes: readonly Node[]): boolean => {
		let kept = false;
		for (const node of nodes) {
			if (node.type === 'Rule') {
				if (node.prelude?.type === 'SelectorList' && !node.prelude.children.some((s: Node) => possible(s, tokens))) cuts.push([node.start, node.end]);
				else {
					walk(node.block.children);
					kept = true;
				}
			} else if (late && node.type === 'Atrule' && node.block && node.name.toLowerCase() === 'font-face' && withheldFace(css, node, late)) {
				cuts.push([node.start, node.end]);
			} else if (node.type === 'Atrule' && node.block && GROUPING.has(node.name.toLowerCase())) {
				if (walk(node.block.children) || node.name.toLowerCase() === 'layer') kept = true;
				else cuts.push([node.start, node.end]);
			} else kept = true;
		}
		return kept;
	};
	walk(ast.children);
	if (!cuts.length) return css;
	// An at-rule cut whole holds cuts of its own rules: only the outermost count.
	cuts.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
	let out = '';
	let at = 0;
	for (const [start, end] of cuts) {
		if (start < at) continue;
		out += css.slice(at, start);
		at = end;
	}
	return out + css.slice(at);
}

/** Every cascade layer `css` names, in the order of first mention (a nested one as `outer.inner`): the order the cascade ranks them in. */
export function layerNames(css: string): string[] {
	let ast: Node;
	try {
		ast = parse(css).ast;
	} catch {
		return [];
	}
	const names: string[] = [];
	const walk = (nodes: readonly Node[], within: string) => {
		for (const node of nodes) {
			if (node.type !== 'Atrule') continue;
			const listed = node.name.toLowerCase() === 'layer' ? ((node.prelude?.children?.[0]?.children ?? []) as Node[]).map((l) => `${within}${l.name}`) : [];
			for (const name of listed) if (!names.includes(name)) names.push(name);
			// An anonymous layer's own layers can never be named again, so their order is its own.
			if (node.block) {
				if (node.name.toLowerCase() === 'layer' && !listed.length) continue;
				walk(node.block.children, listed.length === 1 ? `${listed[0]}.` : within);
			}
		}
	};
	walk(ast.children, '');
	return names;
}

const isLocalSheet = (t: Tag) => t.tag === 'link' && /\bstylesheet\b/.test(t.attrs.rel ?? '') && t.attrs.integrity === undefined && /^\/(?!\/)[^?#]*\.css$/.test(t.attrs.href ?? '');

/**
 * Links, before each page's first stylesheet, a sheet holding one `@layer` statement: the layers its stylesheets name, in
 * their order. The cascade ranks layers by first mention, and the build carries the sheets pages share ahead of a page's own,
 * so a shared sheet's layer (Qwik UI's `qwik-ui`) would otherwise rank below a later one (Tailwind's `base`) it outranked.
 */
export async function declareLayerOrder<T extends Tag>(publicDir: string, heads: Iterable<T[]>, link: (href: string) => T): Promise<number> {
	const names = new Map<string, Promise<string[]>>();
	const of = (href: string) => names.get(href) ?? names.set(href, readFile(join(publicDir, href), 'utf8').then(layerNames, () => [])).get(href)!;
	const written = new Set<string>();
	let count = 0;
	for (const head of heads) {
		const sheets = head.filter(isLocalSheet);
		const order: string[] = [];
		for (const sheet of sheets) for (const name of await of(sheet.attrs.href!)) if (!order.includes(name)) order.push(name);
		if (order.length < 2) continue;
		const css = `@layer ${order.join(', ')};\n`;
		const path = `/_converted/styles/layers-${createHash('sha256').update(css).digest('hex').slice(0, 12)}.css`;
		if (!written.has(path)) await writeFile(join(publicDir, path), css);
		written.add(path);
		head.splice(head.indexOf(sheets[0]!), 0, link(path));
		count++;
	}
	return count;
}

function withheldFace(css: string, node: Node, late: { readonly sheet: string; readonly withheld: ReadonlySet<string> }): boolean {
	const src = (node.block.children as Node[]).find((d) => d.type === 'Declaration' && d.property.toLowerCase() === 'src');
	if (!src) return false;
	const base = new URL(late.sheet, 'http://sheet.invalid');
	return [...css.slice(src.value.start, src.value.end).matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)].some((m) => {
		const at = new URL(m[2]!, base);
		return late.withheld.has(at.origin === base.origin ? at.pathname + at.search : at.href);
	});
}

interface Tag {
	readonly tag: string;
	readonly attrs: Readonly<Record<string, string>>;
}

async function filesUnder(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
	return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/**
 * Each page's same-origin stylesheets, cut to the rules its markup can match (usedCss): the page module and what it
 * imports, the Document and what it imports, the served layers they name, and every module under lib/ (the parts and
 * the site's own code, which set classes from script). The cut sheet is written beside the original, so its relative
 * url()s still resolve, and the page's link names it. `texts` is what else the page's markup holds (its <html> and <body>
 * attributes, its head). Returns the pages' head tags with the new hrefs.
 */
export async function usedStylesheets<T extends Tag>(app: string, heads: ReadonlyMap<string, { readonly page: string; readonly head: readonly T[]; readonly texts: readonly string[]; readonly withheld?: readonly string[] }>): Promise<{ heads: Map<string, T[]>; sheets: number; bytes: [number, number] }> {
	const publicDir = join(app, 'public');
	const texts = new Map<string, Promise<string>>();
	const read = (file: string) => {
		if (!texts.has(file)) texts.set(file, readFile(file, 'utf8').catch(() => ''));
		return texts.get(file)!;
	};
	const closure = async (entry: string, into: Set<string>) => {
		const queue = [resolve(app, entry)];
		while (queue.length) {
			const file = queue.pop()!;
			if (into.has(file)) continue;
			into.add(file);
			const text = await read(file);
			for (const m of text.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
				const next = resolve(dirname(file), m[1]!);
				if (next.startsWith(`${app}/`)) queue.push(next);
			}
			for (const m of text.matchAll(/["'](\/_converted\/layers\/[^"']+\.html)["']/g)) into.add(join(publicDir, m[1]!));
		}
	};
	const shared = new Set<string>(await filesUnder(join(app, 'lib')));
	await closure('document.tsrx', shared);
	const sharedTokens = classTokens(await Promise.all([...shared].map(read)));
	const sheets = new Map<string, string>();
	const written = new Map<string, string>();
	const bytes: [number, number] = [0, 0];
	const out = new Map<string, T[]>();
	const ownTexts = async (route: string) => {
		const { page, texts: extra } = heads.get(route)!;
		const own = new Set<string>();
		await closure(page, own);
		return [...extra, ...(await Promise.all([...own].filter((f) => !shared.has(f)).map(read)))];
	};
	// A page and the pages it frames are one group with one cut, which the frames then fetch once.
	const groupOf = new Map<string, string>();
	const find = (route: string): string => {
		const up = groupOf.get(route) ?? route;
		return up === route ? route : find(up);
	};
	const canonical = new Map([...heads.keys()].map((route) => [route.replace(/(.)\/$/, '$1'), route]));
	const grouped = new Set<string>();
	for (const route of heads.keys()) {
		for (const text of await ownTexts(route)) {
			for (const m of text.matchAll(/<iframe\b[^>]*?\ssrc="(\/(?!\/)[^"?#]*)/g)) {
				const framed = canonical.get(m[1]!.replace(/(.)\/$/, '$1'));
				if (!framed) continue;
				grouped.add(route).add(framed);
				if (find(framed) !== find(route)) groupOf.set(find(framed), find(route));
			}
		}
	}
	const members = new Map<string, string[]>();
	for (const route of grouped) members.set(find(route), [...(members.get(find(route)) ?? []), route]);
	const groupTokens = new Map<string, Promise<Set<string>>>();
	for (const [route, { head, withheld }] of heads) {
		const withheldPaths = new Set(withheld ?? []);
		const group = members.has(find(route)) ? find(route) : undefined;
		if (group && !groupTokens.has(group)) groupTokens.set(group, Promise.all(members.get(group)!.map(ownTexts)).then((texts) => classTokens(texts.flat())));
		const ownTokens = group ? await groupTokens.get(group)! : classTokens(await ownTexts(route));
		const tokens = { has: (t: string) => sharedTokens.has(t) || ownTokens.has(t) };
		const tags: T[] = [];
		for (const tag of head) {
			const href = tag.attrs.href;
			if (tag.tag !== 'link' || !/\bstylesheet\b/.test(tag.attrs.rel ?? '') || tag.attrs.integrity !== undefined || !href || !/^\/(?!\/)[^?#]*\.css$/.test(href)) {
				tags.push(tag);
				continue;
			}
			if (!sheets.has(href)) sheets.set(href, await readFile(join(publicDir, href), 'utf8').catch(() => ''));
			const css = sheets.get(href)!;
			const used = css && usedCss(css, tokens, withheldPaths.size ? { sheet: href, withheld: withheldPaths } : undefined);
			if (!used || used === css) {
				tags.push(tag);
				continue;
			}
			const path = href.replace(/\.css$/, `.used-${createHash('sha256').update(used).digest('hex').slice(0, 12)}.css`);
			if (!written.has(path)) {
				written.set(path, used);
				await writeFile(join(publicDir, path), used);
			}
			bytes[0] += css.length;
			bytes[1] += used.length;
			tags.push({ ...tag, attrs: { ...tag.attrs, href: path } });
		}
		out.set(route, tags);
	}
	return { heads: out, sheets: written.size, bytes };
}

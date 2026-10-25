import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yuku-css';

// biome-ignore lint/suspicious/noExplicitAny: css-tree's AST, walked generically
type Node = any;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };

const DELIMITER = /["'`<>={}(),;]/g;

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
			if (cuts.length > 24) {
				for (const t of piece.split(DELIMITER)) if (t) tokens.add(t);
				continue;
			}
			const starts = [0, ...cuts.map((i) => i + 1)];
			const ends = [...cuts, piece.length];
			for (const a of starts) for (const b of ends) if (b > a) tokens.add(piece.slice(a, b));
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
 * the kept rules is the original's.
 */
export function usedCss(css: string, tokens: { has(token: string): boolean }): string {
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
export async function usedStylesheets<T extends Tag>(app: string, heads: ReadonlyMap<string, { readonly page: string; readonly head: readonly T[]; readonly texts: readonly string[] }>): Promise<{ heads: Map<string, T[]>; sheets: number; bytes: [number, number] }> {
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
	for (const [route, { page, head, texts: extra }] of heads) {
		const own = new Set<string>();
		await closure(page, own);
		const ownTokens = classTokens([...extra, ...(await Promise.all([...own].filter((f) => !shared.has(f)).map(read)))]);
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
			const used = css && usedCss(css, tokens);
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

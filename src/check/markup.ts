import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { parseSync } from 'oxc-parser';
import { parse as parseTsrx } from 'yuku-tsrx';
import { lineIndex, splitComponent } from '../source/js.ts';
import { parseRules, type CssRule } from './stylesheet.ts';
import type { ElementSnapshot } from './types.ts';

/** One element as written in source markup (HTML, JSX, TSRX, Vue, Svelte, Astro). */
export interface MarkupElement {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly tag: string;
	/** Static text written directly inside the element, in pieces split where an expression sits. */
	readonly parts: readonly string[];
	/** Whether an expression also writes text into it. */
	readonly dynamic: boolean;
	readonly attrs: Readonly<Record<string, string>>;
}

export interface MarkupIndex {
	readonly root: string;
	readonly elements: readonly MarkupElement[];
	/** String literals in scripts, where text shown on the page is often written (dictionaries, constants). */
	readonly strings: readonly { readonly file: string; readonly line: number; readonly value: string }[];
	readonly css: readonly CssRule[];
	/** Relative imports of each file, resolved to project files. */
	readonly imports: ReadonlyMap<string, readonly string[]>;
}

const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'tmp', 'target']);
const MARKUP = /\.(tsrx|[cm]?[jt]sx?|vue|svelte|astro|html?|css)$/;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Framework components that render one host element of a known tag.
const ALIASES: Record<string, string> = { Link: 'a', NavLink: 'a', RouterLink: 'a', NuxtLink: 'a', Image: 'img', NuxtImg: 'img', Html: 'html' };

async function walk(root: string, dir: string, out: string[]): Promise<void> {
	for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
		if (entry.isDirectory()) {
			if (!entry.name.startsWith('.') && !SKIP.has(entry.name)) await walk(root, join(dir, entry.name), out);
		} else if (MARKUP.test(entry.name) && !entry.name.endsWith('.d.ts') && !/\.config\.[cm]?[jt]s$/.test(entry.name)) out.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
	}
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const decode = (value: string) => value.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' })[e] ?? _);

// biome-ignore lint/suspicious/noExplicitAny: ESTree from oxc and yuku-tsrx, walked generically
type Node = any;

function jsxName(name: Node): string | undefined {
	if (!name) return undefined;
	if (name.type === 'JSXIdentifier') return name.name;
	if (name.type === 'JSXMemberExpression') return `${jsxName(name.object)}.${jsxName(name.property)}`;
	if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
	return undefined;
}

function literal(node: Node): string | undefined {
	if (!node) return undefined;
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node.type === 'StringLiteral') return node.value;
	if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value?.cooked ?? undefined;
	if (node.type === 'JSXExpressionContainer') return literal(node.expression);
	return undefined;
}

function visit(node: Node, fn: (n: Node) => void): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) visit(child, fn);
		return;
	}
	if (typeof node.type === 'string') fn(node);
	for (const key of Object.keys(node)) if (key !== 'parent' && typeof node[key] === 'object') visit(node[key], fn);
}

function fromJsx(file: string, text: string, program: Node, elements: MarkupElement[], strings: MarkupIndex['strings'][number][]): void {
	const line = lineIndex(text);
	const starts = [0];
	for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
	const column = (offset: number) => offset - starts[line(offset) - 1]! + 1;
	visit(program, (n) => {
		if (n.type === 'JSXElement') {
			const name = jsxName(n.openingElement.name);
			const tag = name && (ALIASES[name] ?? (/^[a-z]/.test(name) ? name : undefined));
			if (!tag) return;
			const attrs: Record<string, string> = {};
			for (const a of n.openingElement.attributes ?? []) {
				if (a.type !== 'JSXAttribute') continue;
				const key = jsxName(a.name);
				const value = a.value ? literal(a.value) : '';
				if (key && value !== undefined) attrs[key === 'className' ? 'class' : key] = value;
			}
			const parts: string[] = [];
			let dynamic = false;
			for (const child of n.children ?? []) {
				if (child.type === 'JSXText') {
					if (clean(child.value)) parts.push(clean(child.value));
				} else if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
					const value = literal(child.expression);
					if (value !== undefined) parts.push(clean(value));
					else if (child.expression?.type !== 'JSXEmptyExpression') dynamic = true;
				}
			}
			elements.push({ file, line: line(n.start), column: column(n.start), tag: tag.toLowerCase(), parts, dynamic, attrs });
		} else if ((n.type === 'Literal' || n.type === 'StringLiteral') && typeof n.value === 'string' && clean(n.value).length >= 2) {
			strings.push({ file, line: line(n.start), value: clean(n.value) });
		} else if (n.type === 'TemplateElement' && clean(n.value?.cooked ?? '').length >= 2) {
			strings.push({ file, line: line(n.start), value: clean(n.value.cooked) });
		}
	});
}

function fromHtml(file: string, text: string, template: string, elements: MarkupElement[]): void {
	const line = lineIndex(text);
	const starts = [0];
	for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
	type Open = { tag: string; at: number; parts: string[]; dynamic: boolean; attrs: Record<string, string> };
	const stack: Open[] = [];
	const close = (open: Open) => elements.push({ file, line: line(open.at), column: open.at - starts[line(open.at) - 1]! + 1, tag: open.tag, parts: open.parts, dynamic: open.dynamic, attrs: open.attrs });
	const token = /<!--[\s\S]*?-->|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
	const markup = template.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => m.replace(/>[\s\S]*(?=<\/)/, (inner) => `>${' '.repeat(inner.length - 1)}`));
	for (const m of markup.matchAll(token)) {
		if (m[1]) {
			const at = stack.map((o) => o.tag).lastIndexOf(m[1].toLowerCase());
			if (at >= 0) for (const open of stack.splice(at).reverse()) close(open);
		} else if (m[2]) {
			const attrs: Record<string, string> = {};
			for (const a of (m[3] ?? '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]!.replace(/^:/, '')] = decode(a[2] ?? a[3] ?? a[4] ?? '');
			const tag = m[2].toLowerCase();
			if (!/^[a-z][a-z0-9-]*$/.test(tag) || /^(script|style|template)$/.test(tag)) continue;
			const open: Open = { tag, at: m.index!, parts: [], dynamic: false, attrs };
			if (VOID.has(tag) || m[4]) close(open);
			else stack.push(open);
		} else if (m[5] && stack.length) {
			const top = stack.at(-1)!;
			const raw = decode(m[5]);
			const pieces = raw.split(/\{\{[\s\S]*?\}\}|\{[^{}]*\}/);
			if (pieces.length > 1) top.dynamic = true;
			for (const piece of pieces) if (clean(piece)) top.parts.push(clean(piece));
		}
	}
	for (const open of stack.reverse()) close(open);
}

const indexes = new Map<string, Promise<MarkupIndex>>();

/** Every element written in an app's source, read once per checkout. */
export function indexMarkup(root: string): Promise<MarkupIndex> {
	if (!indexes.has(root)) indexes.set(root, build(root));
	return indexes.get(root)!;
}

async function build(root: string): Promise<MarkupIndex> {
	const files: string[] = [];
	await walk(root, root, files);
	const elements: MarkupElement[] = [];
	const strings: MarkupIndex['strings'][number][] = [];
	const css: CssRule[] = [];
	const imports = new Map<string, string[]>();
	for (const file of files.sort()) {
		const text = await readFile(join(root, file), 'utf8').catch(() => '');
		if (!text || text.length > 1_000_000) continue;
		const imported = [...text.matchAll(/\b(?:import|from)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => posix.normalize(posix.join(posix.dirname(file), m[1]!)));
		imports.set(file, imported.flatMap((spec) => files.filter((f) => f === spec || f.replace(/\.\w+$/, '') === spec || f.replace(/\/index\.\w+$/, '') === spec)));
		try {
			if (file.endsWith('.css')) css.push(...parseRules([{ url: file, text }]));
			else if (file.endsWith('.tsrx')) fromJsx(file, text, parseTsrx(text, { lang: 'tsx' }).program, elements, strings);
			else if (/\.[cm]?[jt]sx?$/.test(file)) fromJsx(file, text, parseSync(file, text, { sourceType: 'module' }).program, elements, strings);
			else {
				const { template } = /\.html?$/.test(file) ? { template: text } : splitComponent(file, text);
				fromHtml(file, text, template, elements);
			}
		} catch {}
	}
	return { root, elements, strings, css, imports };
}

export interface Located {
	readonly element: MarkupElement;
	readonly score: number;
	/** Where the element's text is written, when the element writes it through an expression. */
	readonly textFrom?: { readonly file: string; readonly line: number };
}

const NAME_ATTRS = ['aria-label', 'alt', 'title', 'placeholder', 'value', 'label'];

function score(m: MarkupElement, el: Pick<ElementSnapshot, 'tag' | 'text' | 'name'>): number {
	if (m.tag !== el.tag) return 0;
	let s = 1;
	const written = clean(m.parts.join(' '));
	if (el.text) {
		if (!m.dynamic && written === el.text) s += 10;
		else if (m.parts.length && m.parts.every((p) => el.text.includes(p))) s += 6;
		else if (m.parts.length) return 0;
		else if (m.dynamic) s += 1;
		else return 0;
	} else if (written && !m.dynamic) return 0;
	if (el.name && NAME_ATTRS.some((a) => m.attrs[a] === el.name)) s += 8;
	return s;
}

/** The source element most likely to have rendered a page element, preferring the files named first; `only` limits the search to some files. */
export function locate(index: MarkupIndex, el: Pick<ElementSnapshot, 'tag' | 'text' | 'name'>, prefer: readonly string[] = [], only?: ReadonlySet<string>): Located | undefined {
	let best: (Located & { raw: number }) | undefined;
	for (const m of index.elements) {
		if (only && !only.has(m.file)) continue;
		const raw = score(m, el);
		if (!raw) continue;
		const rank = prefer.indexOf(m.file);
		const s = raw + (rank >= 0 ? Math.max(1, 4 - rank) : 0);
		if (!best || s > best.score) best = { element: m, score: s, raw };
	}
	// A bare tag match is a guess: keep it only inside the files the page is known to come from.
	if (!best || (best.raw < 6 && !only && !prefer.includes(best.element.file))) return undefined;
	const { raw: _, ...found } = best;
	const pinned = found.element.parts.length > 0 && !found.element.dynamic;
	const string = !pinned && el.text ? findText(index, el.text) : undefined;
	return string ? { ...found, textFrom: string } : found;
}

/** Where a script writes this text as a string literal: the exact text, else the longest literal it is built from. */
export function findText(index: MarkupIndex, text: string): { file: string; line: number } | undefined {
	const hit = index.strings.find((x) => x.value === text) ?? index.strings.filter((x) => x.value.length >= 6 && text.includes(x.value)).sort((a, b) => b.value.length - a.value.length)[0];
	return hit && { file: hit.file, line: hit.line };
}

/** A file and everything it imports from the same app, nearest first. */
export function withImports(index: MarkupIndex, files: readonly string[]): string[] {
	const out: string[] = [];
	const queue = [...files];
	while (queue.length && out.length < 50) {
		const file = queue.shift()!;
		if (out.includes(file)) continue;
		out.push(file);
		queue.push(...(index.imports.get(file) ?? []));
	}
	return out;
}

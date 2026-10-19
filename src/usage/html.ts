import { lineIndex } from '../source/js.ts';

/** An element of a served or built page, as HTML's tokenizer reads it, with where its start tag is. */
export interface HtmlElement {
	readonly tag: string;
	readonly attrs: ReadonlyMap<string, string>;
	readonly line: number;
	readonly offset: number;
	readonly parent?: HtmlElement;
	/** Text of a raw-text element (`script`, `style`, `textarea`, `title`). */
	text?: string;
	/** The first text inside the element, trimmed, for naming it in a report. */
	label?: string;
	readonly index: number;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', 'keygen']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
// Start tags that close an open element of these names first (HTML's "implied end tags", the common cases).
const CLOSES: Readonly<Record<string, readonly string[]>> = {
	p: ['p'],
	li: ['li'],
	dt: ['dt', 'dd'],
	dd: ['dt', 'dd'],
	tr: ['tr', 'td', 'th'],
	td: ['td', 'th'],
	th: ['td', 'th'],
	option: ['option'],
	thead: ['tbody', 'tfoot'],
	tbody: ['thead', 'tbody'],
	tfoot: ['thead', 'tbody'],
};
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'menu', 'nav', 'ol', 'pre', 'section', 'table', 'ul']);

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (s: string): string =>
	s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)));

/**
 * Tokenizes a page as HTML does (start and end tags, attributes quoted, unquoted or bare, comments, raw-text elements)
 * and keeps the open-element stack, so each element knows its parent. Implied end tags cover the common cases;
 * the tree is for naming elements, the tokens are exact.
 */
export function parseHtml(html: string): HtmlElement[] {
	const line = lineIndex(html);
	const elements: HtmlElement[] = [];
	const stack: HtmlElement[] = [];
	let i = 0;
	const closeTo = (name: string) => {
		const at = stack.map((e) => e.tag).lastIndexOf(name);
		if (at >= 0) stack.length = at;
	};
	while (i < html.length) {
		const lt = html.indexOf('<', i);
		if (lt < 0) break;
		const top = stack.at(-1);
		if (top && top.label === undefined && lt > i) {
			const text = decodeEntities(html.slice(i, lt)).replace(/\s+/g, ' ').trim();
			if (text) top.label = text.slice(0, 60);
		}
		if (html.startsWith('<!--', lt)) {
			const end = html.indexOf('-->', lt + 4);
			i = end < 0 ? html.length : end + 3;
			continue;
		}
		if (html[lt + 1] === '!' || html[lt + 1] === '?') {
			const end = html.indexOf('>', lt);
			i = end < 0 ? html.length : end + 1;
			continue;
		}
		if (html[lt + 1] === '/') {
			const m = /^<\/([a-zA-Z][\w:-]*)[^>]*>/.exec(html.slice(lt, lt + 200));
			if (m) {
				closeTo(m[1]!.toLowerCase());
				i = lt + m[0].length;
			} else i = lt + 1;
			continue;
		}
		const name = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 100));
		if (!name) {
			i = lt + 1;
			continue;
		}
		const tag = name[1]!.toLowerCase();
		let j = lt + name[0].length;
		const attrs = new Map<string, string>();
		let selfClosing = false;
		while (j < html.length) {
			while (j < html.length && /[\s/]/.test(html[j]!)) {
				if (html[j] === '/' && html[j + 1] === '>') selfClosing = true;
				j++;
			}
			if (html[j] === '>' || j >= html.length) break;
			const an = /^[^\s/>=][^\s/>=]*/.exec(html.slice(j, j + 500));
			if (!an) {
				j++;
				continue;
			}
			const attr = an[0].toLowerCase();
			j += an[0].length;
			while (/\s/.test(html[j] ?? '')) j++;
			let value = '';
			if (html[j] === '=') {
				j++;
				while (/\s/.test(html[j] ?? '')) j++;
				const q = html[j];
				if (q === '"' || q === "'") {
					const end = html.indexOf(q, j + 1);
					value = html.slice(j + 1, end < 0 ? html.length : end);
					j = end < 0 ? html.length : end + 1;
				} else {
					const m = /^[^\s>]*/.exec(html.slice(j, j + 2000))!;
					value = m[0];
					j += m[0].length;
				}
			}
			if (!attrs.has(attr)) attrs.set(attr, decodeEntities(value));
		}
		i = j + 1;
		for (const closes of CLOSES[tag] ?? []) if (stack.at(-1)?.tag === closes) stack.pop();
		if (BLOCK.has(tag) && stack.at(-1)?.tag === 'p') stack.pop();
		const element: HtmlElement = { tag, attrs, line: line(lt), offset: lt, index: elements.length, ...(stack.length ? { parent: stack.at(-1)! } : {}) };
		elements.push(element);
		if (RAW.has(tag)) {
			const end = html.toLowerCase().indexOf(`</${tag}`, i);
			const stop = end < 0 ? html.length : end;
			element.text = html.slice(i, stop);
			const close = html.indexOf('>', stop);
			i = close < 0 ? html.length : close + 1;
			continue;
		}
		if (!VOID.has(tag) && !selfClosing) stack.push(element);
	}
	return elements;
}

export const classesOf = (el: HtmlElement): string[] => (el.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);

/** A short CSS-like name for an element: `button.navbar__toggle`, `div#nav`, `svg.hamburger in div.logo-wrapper`. */
export function describe(el: HtmlElement): string {
	const self = (e: HtmlElement) => `${e.tag}${e.attrs.get('id') ? `#${e.attrs.get('id')}` : ''}${classesOf(e).slice(0, 2).map((c) => `.${c}`).join('')}`;
	let out = self(el);
	if (!el.attrs.get('id')) {
		let p = el.parent;
		while (p && !p.attrs.get('id') && !classesOf(p).length) p = p.parent;
		if (p && p.tag !== 'body' && p.tag !== 'html') out += ` in ${self(p)}`;
	}
	const label = el.attrs.get('aria-label') ?? el.attrs.get('title') ?? el.label;
	return label ? `${out} "${label.slice(0, 40)}"` : out;
}

/** Whether an element is inside one matching the test (itself included). */
export function within(el: HtmlElement, test: (e: HtmlElement) => boolean): HtmlElement | undefined {
	for (let e: HtmlElement | undefined = el; e; e = e.parent) if (test(e)) return e;
	return undefined;
}

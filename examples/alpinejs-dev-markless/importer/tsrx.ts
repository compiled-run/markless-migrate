import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'multiple', 'selected', 'readonly', 'required', 'open', 'async', 'defer', 'allowfullscreen', 'autofocus']);
// Whitespace between two of these (or at the edge of one) never renders, so it is not written.
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dd', 'dt', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'ul', 'template', 'script', 'style', 'iframe', 'select', 'option', 'textarea']);

export const lit = (text: string) => JSON.stringify(text);
export const entities = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');

export function attribute(name: string, value: string): string {
	if (value === '' && BOOLEAN.has(name)) return ` ${name}`;
	if (/["{}\\\n]/.test(value)) return ` ${name}={${lit(value)}}`;
	return ` ${name}="${value.replace(/&/g, '&amp;')}"`;
}

export interface Emit {
	// Returns markup that replaces an element (a component tag), or undefined to write the element as it is.
	readonly element?: (el: Element, depth: number) => string | undefined;
}

const tag = (el: Element) => el.tagName;
const isElement = (node: Node | undefined): node is Element => !!node && 'tagName' in node;
const isBlock = (node: Node | undefined) => !node || (isElement(node) && BLOCK.has(tag(node)));

// Text keeps its words as written; a whitespace run that could render (between inline content) is kept as one space.
function textOut(text: string, previous: Node | undefined, next: Node | undefined, parent: Element | undefined): string {
	const collapsed = text.replace(/[ \t\n\r\f]+/g, ' ');
	if (collapsed === ' ') {
		if (isBlock(previous) && isBlock(next)) return '';
		if (parent && BLOCK.has(tag(parent)) && (!previous || !next)) return '';
		return '{" "}';
	}
	const lead = collapsed.startsWith(' ') && !(parent && BLOCK.has(tag(parent)) && !previous) && !isBlock(previous) ? '{" "}' : '';
	const trail = collapsed.endsWith(' ') && !(parent && BLOCK.has(tag(parent)) && !next) && !isBlock(next) ? '{" "}' : '';
	const core = collapsed.trim();
	return `${lead}${/[ ]/.test(core) ? `{${lit(core)}}` : entities(core)}${trail}`;
}

// Alpine directives outside a demo's x-data do nothing on the old page; a port carries no Alpine markers.
const ALPINE = /^(x-|@|:)/;

function attrs(el: Element): string {
	return el.attrs.filter((a) => !ALPINE.test(a.name)).map((a) => attribute(a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value)).join('');
}

function children(el: Element | DefaultTreeAdapterMap['documentFragment']): Node[] {
	const node = el as Element;
	if (node.tagName === 'template') return ((node as unknown as { content: { childNodes: Node[] } }).content?.childNodes ?? []) as Node[];
	return node.childNodes as Node[];
}

function pre(node: Node): string {
	if (node.nodeName === '#text') {
		const value = (node as DefaultTreeAdapterMap['textNode']).value;
		return value ? `{${lit(value)}}` : '';
	}
	if (!isElement(node)) return '';
	if (VOID.has(tag(node))) return `<${tag(node)}${attrs(node)} />`;
	return `<${tag(node)}${attrs(node)}>${children(node).map(pre).join('')}</${tag(node)}>`;
}

export function emitNodes(nodes: readonly Node[], depth: number, options: Emit, parent?: Element): string {
	const pad = '\t'.repeat(depth);
	const kept = nodes.filter((n) => n.nodeName !== '#comment');
	const inlineRun = kept.some((n) => n.nodeName === '#text' && (n as DefaultTreeAdapterMap['textNode']).value.trim());
	if (inlineRun) {
		// Mixed text and inline elements stay on one line, so no whitespace is invented between them.
		return pad + kept.map((n, i) => inline(n, kept[i - 1], kept[i + 1], parent, options, depth)).join('') + '\n';
	}
	let out = '';
	kept.forEach((node, i) => {
		if (node.nodeName === '#text') {
			const t = textOut((node as DefaultTreeAdapterMap['textNode']).value, kept[i - 1], kept[i + 1], parent);
			if (t) out += pad + t + '\n';
			return;
		}
		if (isElement(node)) out += emitElement(node, depth, options);
	});
	return out;
}

function inline(node: Node, previous: Node | undefined, next: Node | undefined, parent: Element | undefined, options: Emit, depth: number): string {
	if (node.nodeName === '#text') return textOut((node as DefaultTreeAdapterMap['textNode']).value, previous, next, parent);
	if (!isElement(node)) return '';
	const replaced = options.element?.(node, depth);
	if (replaced !== undefined) return replaced.trim();
	if (VOID.has(tag(node))) return `<${tag(node)}${attrs(node)} />`;
	if (tag(node) === 'pre' || tag(node) === 'textarea') return pre(node);
	const kids = children(node).filter((n) => n.nodeName !== '#comment');
	return `<${tag(node)}${attrs(node)}>${kids.map((k, i) => inline(k, kids[i - 1], kids[i + 1], node, options, depth)).join('')}</${tag(node)}>`;
}

export function emitElement(el: Element, depth: number, options: Emit): string {
	const pad = '\t'.repeat(depth);
	const replaced = options.element?.(el, depth);
	if (replaced !== undefined) return replaced;
	const name = tag(el);
	if (VOID.has(name)) return `${pad}<${name}${attrs(el)} />\n`;
	if (name === 'pre' || name === 'textarea') return `${pad}${pre(el)}\n`;
	const kids = children(el).filter((n) => n.nodeName !== '#comment');
	if (!kids.length) return `${pad}<${name}${attrs(el)}></${name}>\n`;
	const body = emitNodes(kids, depth + 1, options, el);
	if (!body.trim()) return `${pad}<${name}${attrs(el)}></${name}>\n`;
	if (body.split('\n').length === 2 && body.length < 160) return `${pad}<${name}${attrs(el)}>${body.trim()}</${name}>\n`;
	return `${pad}<${name}${attrs(el)}>\n${body}${pad}</${name}>\n`;
}

export function htmlToTsrx(html: string, depth: number, options: Emit = {}): string {
	return emitNodes(parseFragment(html).childNodes as Node[], depth, options);
}

export { parseFragment };
export type { Element, Node };

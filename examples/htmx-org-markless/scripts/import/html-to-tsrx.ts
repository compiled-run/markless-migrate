import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'multiple', 'selected', 'readonly', 'required', 'open', 'async', 'defer', 'autofocus', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'allowfullscreen', 'novalidate', 'reversed', 'nomodule']);
const ATTRIBUTE_NAME = /^[A-Za-z_][\w.-]*(:[A-Za-z_][\w-]*)?$/;

export interface Libraries {
	htmx: boolean;
	classTools: boolean;
	preload: boolean;
	hyperscript: boolean;
}

export interface Converted {
	readonly tsrx: string;
	readonly styles: string[];
	// Attributes HTML's parser keeps from malformed markup (`<td">`) that no element can be given from script or JSX.
	readonly dropped: string[];
	readonly libraries: Libraries;
}

type Out = { styles: string[]; dropped: string[]; libraries: Libraries };

const lit = (text: string) => JSON.stringify(text);
const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;');
// HTML whitespace only: JavaScript's \s also matches the no-break spaces code samples indent with.
const collapse = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ');
// TSRX reads `//` and `/*` in markup text as comments, so such text is written as a string.
const textOut = (t: string) => (/[\n\t\r\f\u00a0]| {2}|^ | $|\/\/|\/\*/.test(t) || !t.replace(/[ \t\n\r\f]/g, '') ? `{${lit(t)}}` : escapeText(t));

function attributes(el: Element, libraries: Libraries, dropped: string[]): string {
	return el.attrs
		.filter((a) => {
			const ok = ATTRIBUTE_NAME.test(a.prefix ? a.name : a.name);
			if (!ok) dropped.push(`${a.name} on <${el.tagName}>`);
			return ok;
		})
		.map((a) => {
			const name = a.prefix === 'xlink' && a.name === 'href' ? 'href' : a.prefix ? `${a.prefix}:${a.name}` : a.name;
			if (/^(data-)?hx-/.test(name)) libraries.htmx = true;
			if (name === 'classes') libraries.classTools = libraries.htmx = true;
			if (name === 'preload') libraries.preload = libraries.htmx = true;
			if (name === '_' || name === 'data-script') libraries.hyperscript = true;
			if (a.value === '' && BOOLEAN.has(name)) return ` ${name}`;
			if (/["{}\\&@\n]/.test(a.value)) return ` ${name}={${lit(a.value)}}`;
			return ` ${name}="${a.value}"`;
		})
		.join('');
}

function rawText(el: Element): string {
	return el.childNodes.map((n) => (n.nodeName === '#text' ? (n as DefaultTreeAdapterMap['textNode']).value : '')).join('');
}

function children(parent: ParentNode, pre: boolean, out: Out): string {
	return parent.childNodes.map((n) => node(n, pre, out)).join('');
}

function node(n: Node, pre: boolean, out: Out): string {
	if (n.nodeName === '#text') {
		const t = (n as DefaultTreeAdapterMap['textNode']).value;
		return pre ? textOut(t) : textOut(collapse(t));
	}
	if (n.nodeName === '#comment' || n.nodeName === '#documentType') return '';
	const el = n as Element;
	const name = el.tagName;
	if (name === 'style') {
		out.styles.push(rawText(el));
		return '';
	}
	if (name === 'script') {
		const text = rawText(el);
		const type = el.attrs.find((a) => a.name === 'type')?.value;
		if (type === 'text/hyperscript') out.libraries.hyperscript = true;
		else if (/\bhtmx\b/.test(text)) out.libraries.htmx = true;
		return `<script${attributes(el, out.libraries, out.dropped)}>${text ? `{${lit(text)}}` : ''}</script>`;
	}
	if (VOID.has(name)) return `<${name}${attributes(el, out.libraries, out.dropped)} />`;
	const inPre = pre || name === 'pre' || name === 'textarea';
	const content = name === 'template' ? children((el as DefaultTreeAdapterMap['template']).content, inPre, out) : children(el, inPre, out);
	return `<${name}${attributes(el, out.libraries, out.dropped)}>${content}</${name}>`;
}

export function convert(html: string, libraries: Libraries): Converted {
	const out: Out = { styles: [], dropped: [], libraries };
	const fragment = parseFragment(html);
	// One top-level node per line keeps the generated pages readable without changing their DOM.
	const lines = fragment.childNodes.map((n) => node(n, false, out)).filter(Boolean);
	return { tsrx: lines.join('\n'), styles: out.styles, dropped: out.dropped, libraries };
}

export function textOf(html: string): string {
	const fragment = parseFragment(html);
	const walk = (p: ParentNode): string => p.childNodes.map((n) => (n.nodeName === '#text' ? (n as DefaultTreeAdapterMap['textNode']).value : 'childNodes' in n ? walk(n as ParentNode) : '')).join('');
	return walk(fragment);
}

// Tags, attributes and text with whitespace runs collapsed: what two renderings of one page must share.
export function canonical(html: string): string {
	const walk = (p: ParentNode): string =>
		p.childNodes
			.map((n) => {
				if (n.nodeName === '#text') return (n as DefaultTreeAdapterMap['textNode']).value;
				if (!('tagName' in n)) return '';
				const el = n as Element;
				const attrs = el.attrs.map((a) => ` ${a.name}=${JSON.stringify(a.value)}`).sort().join('');
				const inner = el.tagName === 'template' ? walk((el as DefaultTreeAdapterMap['template']).content) : walk(el);
				return `<${el.tagName}${attrs}>${inner}</${el.tagName}>`;
			})
			.join('');
	return walk(parseFragment(html)).replace(/\s+/g, ' ').replace(/ ?(<\/?[a-z][^>]*>) ?/g, '$1').trim();
}

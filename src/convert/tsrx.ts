import { childrenOf, isElement, type Element, type Node, type ParentNode, type Text } from './dom.ts';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'multiple', 'selected', 'readonly', 'required', 'open', 'async', 'defer', 'autofocus', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'allowfullscreen', 'novalidate', 'reversed', 'nomodule', 'inert', 'itemscope']);
const ATTRIBUTE_NAME = /^[A-Za-z_][\w.-]*$/;

export const lit = (text: string): string => JSON.stringify(text);
const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;');
// HTML whitespace only: JavaScript's \s also matches the no-break spaces code samples indent with.
const collapse = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ');
const textOut = (t: string) => (/[\n\t\r\f\u00a0]| {2}|^ | $/.test(t) || !t.replace(/[ \t\n\r\f]/g, '') ? `{${lit(t)}}` : escapeText(t));

/** What the emitter does with one element beyond copying it. */
export interface Binding {
	/** Attribute values given as expressions instead of the copied text, by attribute name. */
	readonly expressions?: Readonly<Record<string, string>>;
	/** Attributes added after the copied ones, as tsrx source (`onClick={...}`). */
	readonly extra?: readonly string[];
	/** The element's whole output, in place of the copy (a component call). */
	readonly replace?: string;
	/** Markup added after the element's own children. */
	readonly append?: string;
	/** The element's children, in place of the copied ones. */
	readonly children?: string;
	/** Statements the component rendering the element needs in its body (a state() declaration). */
	readonly declare?: readonly string[];
	/** Wraps the element's children markup (an @if arm). */
	readonly wrap?: (children: string) => string;
	/** Copied attributes left out, because `extra` binds them. */
	readonly omit?: readonly string[];
}

export interface EmitOptions {
	/** Called for every element, in document order. */
	readonly bind?: (el: Element) => Binding | undefined;
	/** Called for every attribute name the emitter cannot write (it came from malformed markup). */
	readonly dropped?: (what: string) => void;
	/** Called with the text of every `<style>` element, which is left out of the markup (a `<style>` in tsrx is scoped). */
	readonly style?: (css: string) => void;
	/** Collects the statements bindings declare, for the component's body. */
	readonly declarations?: string[];
}

function attributes(el: Element, binding: Binding | undefined, options: EmitOptions): string {
	const out: string[] = [];
	for (const a of el.attrs) {
		const name = a.prefix === 'xlink' && a.name === 'href' ? 'href' : a.prefix ? `${a.prefix}:${a.name}` : a.name;
		if (binding?.omit?.includes(name)) continue;
		if (!ATTRIBUTE_NAME.test(a.prefix ? a.name : name)) {
			options.dropped?.(`${name} on <${el.tagName}>`);
			continue;
		}
		const expression = binding?.expressions?.[name];
		if (expression !== undefined) out.push(` ${name}={${expression}}`);
		else if (a.value === '' && BOOLEAN.has(name)) out.push(` ${name}`);
		else if (/["{}\\&@\n<>]/.test(a.value)) out.push(` ${name}={${lit(a.value)}}`);
		else out.push(` ${name}="${a.value}"`);
	}
	for (const extra of binding?.extra ?? []) out.push(` ${extra}`);
	return out.join('');
}

function rawText(el: Element): string {
	return childrenOf(el)
		.map((n) => (n.nodeName === '#text' ? (n as Text).value : ''))
		.join('');
}

function children(parent: ParentNode, pre: boolean, options: EmitOptions): string {
	return childrenOf(parent)
		.map((n) => node(n, pre, options))
		.join('');
}

export function node(n: Node, pre: boolean, options: EmitOptions): string {
	if (n.nodeName === '#text') {
		const t = (n as Text).value;
		return pre ? textOut(t) : textOut(collapse(t));
	}
	if (!isElement(n)) return '';
	const el = n;
	const name = el.tagName;
	if (name === 'style') {
		options.style?.(rawText(el));
		return '';
	}
	const binding = options.bind?.(el);
	for (const line of binding?.declare ?? []) if (options.declarations && !options.declarations.includes(line)) options.declarations.push(line);
	if (binding?.replace !== undefined) return binding.replace;
	if (name === 'script') {
		const text = rawText(el);
		return `<script${attributes(el, binding, options)}>${text ? `{${lit(text)}}` : ''}</script>`;
	}
	if (VOID.has(name)) return `<${name}${attributes(el, binding, options)} />`;
	const inPre = pre || name === 'pre' || name === 'textarea';
	const inner = binding?.children ?? children(el, inPre, options);
	return `<${name}${attributes(el, binding, options)}>${binding?.wrap ? binding.wrap(inner) : inner}${binding?.append ?? ''}</${name}>`;
}

/** The children of `parent` as tsrx markup, one top-level node per line. */
export function emitChildren(parent: ParentNode, options: EmitOptions = {}): string {
	return childrenOf(parent)
		.map((n) => node(n, false, options))
		.filter(Boolean)
		.join('\n');
}

/** Combines two bindings of one element: attributes and appended markup add up, a replacement wins. */
export function mergeBindings(a: Binding | undefined, b: Binding | undefined): Binding | undefined {
	if (!a) return b;
	if (!b) return a;
	if (a.replace !== undefined || b.replace !== undefined) return a.replace !== undefined ? a : b;
	return {
		expressions: { ...a.expressions, ...b.expressions },
		extra: [...(a.extra ?? []), ...(b.extra ?? [])],
		...(a.append || b.append ? { append: `${a.append ?? ''}${b.append ?? ''}` } : {}),
		...(a.children !== undefined || b.children !== undefined ? { children: b.children ?? a.children } : {}),
		...(a.declare || b.declare ? { declare: [...(a.declare ?? []), ...(b.declare ?? [])] } : {}),
		...(a.wrap || b.wrap ? { wrap: b.wrap ?? a.wrap } : {}),
		...(a.omit || b.omit ? { omit: [...(a.omit ?? []), ...(b.omit ?? [])] } : {}),
	};
}

export function emitElement(el: Element, options: EmitOptions = {}): string {
	return node(el, false, options);
}

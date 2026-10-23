import { childrenOf, isElement, type Element, type Node, type ParentNode, type Text } from './dom.ts';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'multiple', 'selected', 'readonly', 'required', 'open', 'async', 'defer', 'autofocus', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'allowfullscreen', 'novalidate', 'reversed', 'nomodule', 'inert', 'itemscope']);
const ATTRIBUTE_NAME = /^[A-Za-z_][\w.-]*$/;

export const lit = (text: string): string => JSON.stringify(text);

// The old site's origin, which its pages print where they name themselves (NEXT_PUBLIC_APP_URL in a v0 link): written as
// APP_URL, the new app's own origin given at build time (relative when unset).
let origin: string | undefined;
export function useOrigin(next: string | undefined): void {
	origin = next?.replace(/\/$/, '');
}
export const APP_URL = 'APP_URL';
const withOrigin = (text: string): string | undefined => (origin && text.includes(origin) ? text.split(origin).map(lit).join(` + ${APP_URL} + `) : undefined);
/**
 * The module with every string literal that names the old origin (a per-page value table's too) written around
 * APP_URL, and the APP_URL constant declared when it is used.
 */
export function appUrlDeclaration(source: string): string {
	const named = origin ? source.replace(/"(?:[^"\\\n]|\\.)*"/g, (literal) => (literal.includes(origin!) ? `(${(JSON.parse(literal) as string).split(origin!).map(lit).join(` + ${APP_URL} + `)})` : literal)) : source;
	return /\+ APP_URL \+/.test(named) ? named.replace('\n', `\nconst ${APP_URL}: string = import.meta.env.VITE_APP_URL ?? '';\n`) : named;
}
const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;');
// HTML whitespace only: JavaScript's \s also matches the no-break spaces code samples indent with.
const collapse = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ');
// Text holding a comment opener is a string expression: TSRX reads `//` and `/*` in template text as comments.
const textOut = (t: string) => {
	const named = withOrigin(t);
	if (named) return `{${named}}`;
	return /[\n\t\r\f\u00a0]| {2}|^ | $|\/\/|\/\*/.test(t) || !t.replace(/[ \t\n\r\f]/g, '') ? `{${lit(t)}}` : escapeText(t);
};

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
	/** Markup placed among the element's children, before the child given (at the end for null or a child that is gone). */
	readonly inserts?: readonly { readonly before: Node | null; readonly markup: string }[];
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
		const expression = binding?.expressions?.[name] ?? withOrigin(a.value);
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

function childrenWith(parent: ParentNode, pre: boolean, options: EmitOptions, inserts: NonNullable<Binding['inserts']>): string {
	const kids = childrenOf(parent);
	const at = (child: Node | null) => inserts.filter((i) => i.before === child).map((i) => i.markup).join('');
	return kids.map((n) => at(n) + node(n, pre, options)).join('') + inserts.filter((i) => i.before === null || !kids.includes(i.before as Node)).map((i) => i.markup).join('');
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
	const inner = binding?.children ?? (binding?.inserts?.length ? childrenWith(el, inPre, options, binding.inserts) : children(el, inPre, options));
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
		...(a.inserts || b.inserts ? { inserts: [...(a.inserts ?? []), ...(b.inserts ?? [])] } : {}),
	};
}

export function emitElement(el: Element, options: EmitOptions = {}): string {
	return node(el, false, options);
}

/** Stands for the new app's own origin in markup served as a file, where no APP_URL expression can run. */
export const APP_URL_TOKEN = '@@MM_APP_URL@@';

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
/** Markup emitted with the old origin as APP_URL_TOKEN text rather than an APP_URL expression (for <template> content). */
export function withOriginToken(emit: () => string): string {
	const was = origin;
	origin = undefined;
	try {
		const out = emit();
		return was ? out.split(was).join(APP_URL_TOKEN) : out;
	} finally {
		origin = was;
	}
}

const named = (t: string) => (origin ? t.split(origin).join(APP_URL_TOKEN) : t);

/**
 * `el` as HTML, written as emitElement writes it as tsrx: the same attributes (with `extra`, given as `name="value"`, on
 * the element itself), the same collapsed text, no `<style>`, and the old origin as APP_URL_TOKEN.
 */
export function emitHtml(el: Element, options: { readonly extra?: readonly string[]; readonly dropped?: (what: string) => void } = {}): string {
	return htmlOf(el, options.extra ?? [], options.dropped);
}

/** The children of `el` as HTML, as emitHtml writes them. */
export function emitHtmlChildren(el: Element, options: { readonly dropped?: (what: string) => void } = {}): string {
	const pre = el.tagName === 'pre' || el.tagName === 'textarea';
	return childrenOf(el)
		.map((child) => htmlOf(child, [], options.dropped, pre))
		.join('');
}

function htmlOf(start: Node, startExtra: readonly string[], dropped: ((what: string) => void) | undefined, startPre = false): string {
	const options = { dropped };
	const visit = (n: Node, pre: boolean, extra: readonly string[]): string => {
		if (n.nodeName === '#text') {
			const t = (n as Text).value;
			return escapeHtml(named(pre ? t : collapse(t)));
		}
		if (!isElement(n)) return '';
		const name = n.tagName;
		if (name === 'style') return '';
		let attrs = '';
		for (const a of n.attrs) {
			const attribute = a.prefix === 'xlink' && a.name === 'href' ? 'href' : a.prefix ? `${a.prefix}:${a.name}` : a.name;
			if (!ATTRIBUTE_NAME.test(a.prefix ? a.name : attribute)) {
				options.dropped?.(`${attribute} on <${name}>`);
				continue;
			}
			attrs += a.value === '' && BOOLEAN.has(attribute) ? ` ${attribute}` : ` ${attribute}="${escapeAttribute(named(a.value))}"`;
		}
		for (const added of extra) attrs += ` ${added}`;
		if (name === 'script') return `<script${attrs}>${rawText(n)}</script>`;
		if (VOID.has(name)) return `<${name}${attrs}>`;
		const inPre = pre || name === 'pre' || name === 'textarea';
		return `<${name}${attrs}>${childrenOf(n).map((c) => visit(c, inPre, [])).join('')}</${name}>`;
	};
	return visit(start, startPre, startExtra);
}

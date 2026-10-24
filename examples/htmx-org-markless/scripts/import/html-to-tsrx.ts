import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'multiple', 'selected', 'readonly', 'required', 'open', 'async', 'defer', 'autofocus', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'allowfullscreen', 'novalidate', 'reversed', 'nomodule']);
const SELF = /^https:\/\/htmx\.org(?=\/|$)/;

// htmx.org answers a page's address without its slash with a redirect to the slashed one; an in-place navigation never
// asks the server, so a link is written with the address the visitor ends up at.
let pages: ReadonlySet<string> = new Set();
export function usePages(paths: Iterable<string>): void {
	pages = new Set(paths);
}
function landing(href: string): string {
	const m = /^(\/[^?#]*?)([?#].*)?$/.exec(href);
	if (!m || m[1]!.endsWith('/') || /\.[a-z0-9]+$/i.test(m[1]!) || !pages.has(`${m[1]}/`)) return href;
	return `${m[1]}/${m[2] ?? ''}`;
}
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
	// Element handles the page declares, one per element class-tools runs on when the port runs it (`portClassTools`).
	readonly handles: string[];
	// Whether a Copy button's hyperscript became a call to lib/copy-text.ts's copyPrevious.
	readonly copiesText: boolean;
	// Whether the Extensions page's search field's hyperscript became calls to lib/extension-filter.ts.
	readonly filtersExtensions: boolean;
}

type Out = { styles: string[]; dropped: string[]; libraries: Libraries; handles: string[] | undefined; copiesText: boolean; filtersExtensions: boolean };

// The REST copypasta page's Copy buttons' hyperscript (with HN's code-block indent or without), which lib/copy-text.ts
// runs in its place.
const COPY_HYPERSCRIPT =
	/^on click\s+get the innerText of the previous <div\/>\s+(get result\.split\('\\n'\)\.map\( \\ l -> '  ' \+ l \)\.join\('\\n'\)\s+)?then writeText\(the result\) with the navigator's clipboard\s+put '([^'<&]*)' into the next <output\/>\s+wait 2s\s+put '' into the next <output\/>\s*$/;

// The Extensions page's search field's hyperscript, whitespace collapsed, which lib/extension-filter.ts runs in its place.
const FILTER_HYPERSCRIPT =
	"init set :table to the next <table/> set :initialHeight to *computed-height of :table on keyup if the event's key is 'Escape' then set my value to '' then trigger input end on input repeat in closest <tr/> to <td:first-of-type/> in :table if its textContent.toLowerCase() contains my value.toLowerCase() remove @hidden from it else add @hidden='' to it end end -- hide section header when its section is empty show closest <tr/> to <tbody th/> in :table when (the next <tr:not([hidden])/> from it within the closest <tbody/> to it) exists -- avoid shift by keeping page size constant set *margin-bottom of :table to `calc(${:initialHeight} - ${*computed-height of :table})`";

const lit = (text: string) => JSON.stringify(text);
const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;');
// HTML whitespace only: JavaScript's \s also matches the no-break spaces code samples indent with.
const collapse = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ');
// TSRX reads `//` and `/*` in markup text as comments, so such text is written as a string.
const textOut = (t: string) => (/[\n\t\r\f\u00a0]| {2}|^ | $|\/\/|\/\*/.test(t) || !t.replace(/[ \t\n\r\f]/g, '') ? `{${lit(t)}}` : escapeText(t));

function attributes(el: Element, out: Out, handles?: string[]): string {
	const { libraries, dropped } = out;
	const copy = el.attrs.map((a) => (a.name === '_' ? COPY_HYPERSCRIPT.exec(a.value) : null)).find(Boolean);
	if (copy) out.copiesText = true;
	const filters = el.attrs.some((a) => a.name === '_' && collapse(a.value).trim() === FILTER_HYPERSCRIPT);
	if (filters) out.filtersExtensions = true;
	const classed = handles && el.attrs.some((a) => a.name === 'classes' || a.name === 'data-classes');
	const handle = classed ? `classTools${handles.length}` : '';
	if (handle) handles!.push(handle);
	const markless =
		(handle ? ` el={${handle}} onIdle={() => runClassTools(${handle})}` : '') +
		(copy ? ` onClick={(event) => copyPrevious(event, ${!!copy[1]}, ${lit(copy[2]!)})}` : '') +
		(filters ? ` onInput={(event) => filterExtensions(event)} onKeyUp={(event) => clearExtensionFilter(event)}` : '');
	return el.attrs
		.filter((a) => {
			const ok = ATTRIBUTE_NAME.test(a.prefix ? a.name : a.name);
			if (!ok) dropped.push(`${a.name} on <${el.tagName}>`);
			return ok;
		})
		.map((a) => {
			const name = a.prefix === 'xlink' && a.name === 'href' ? 'href' : a.prefix ? `${a.prefix}:${a.name}` : a.name;
			if (/^(data-)?hx-/.test(name)) libraries.htmx = true;
			if (name === 'classes' || name === 'data-classes') libraries.classTools = true;
			if (name === 'preload') libraries.preload = libraries.htmx = true;
			if ((name === '_' && !copy && !filters) || name === 'data-script') libraries.hyperscript = true;
			if (a.value === '' && BOOLEAN.has(name)) return ` ${name}`;
			// A link to htmx.org itself (Zola writes the base_url into some) goes to the same page on the origin serving the port.
			const value = name === 'href' ? landing(SELF.test(a.value) ? a.value.replace(SELF, '') || '/' : a.value) : a.value;
			if (/["{}\\&@\n]/.test(value)) return ` ${name}={${lit(value)}}`;
			return ` ${name}="${value}"`;
		})
		.join('') + markless;
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
		return `<script${attributes(el, out)}>${text ? `{${lit(text)}}` : ''}</script>`;
	}
	if (VOID.has(name)) return `<${name}${attributes(el, out, out.handles)} />`;
	const inPre = pre || name === 'pre' || name === 'textarea';
	const content = name === 'template' ? children((el as DefaultTreeAdapterMap['template']).content, inPre, out) : children(el, inPre, out);
	return `<${name}${attributes(el, out, out.handles)}>${content}</${name}>`;
}

// `portClassTools`: each element with `classes` gets an element handle and runs lib/class-tools.ts when idle, in place
// of htmx's class-tools extension.
export function convert(html: string, libraries: Libraries, { portClassTools = false } = {}): Converted {
	const out: Out = { styles: [], dropped: [], libraries, handles: portClassTools ? [] : undefined, copiesText: false, filtersExtensions: false };
	const fragment = parseFragment(html);
	// One top-level node per line keeps the generated pages readable without changing their DOM.
	const lines = fragment.childNodes.map((n) => node(n, false, out)).filter(Boolean);
	return { tsrx: lines.join('\n'), styles: out.styles, dropped: out.dropped, libraries, handles: out.handles ?? [], copiesText: out.copiesText, filtersExtensions: out.filtersExtensions };
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

import { RUNTIME_MARKERS } from '../check/residue.ts';
export { frameworkBuilds } from '../client/builds.ts';
import { attr, childrenOf, isElement, remove, removeAttr, walk, type Document, type Element, type Node, type ParentNode } from './dom.ts';

/** Why the converter left a piece of the old page out, per rule, with how often it applied. */
export type Dropped = Map<string, number>;

// React's streaming runtime: the inline functions that swap a streamed Suspense boundary into place.
const FIZZ = /(?:^|[;\s(])\$R[BCSVTX]\s*=|\$RC\(|\$RS\(|\$RT=performance\.now/;
const GLOBALS = RUNTIME_MARKERS.scriptGlobals.map(([name]) => new RegExp(`(?<![\\w$.])${name.replace(/[.$]/g, '\\$&')}(?![\\w$])`));
const ATTRIBUTES: ReadonlySet<string> = new Set(RUNTIME_MARKERS.attributes.map(([name]) => name));
const ELEMENTS = new Set<string>([...RUNTIME_MARKERS.elements.map(([name]) => name), 'next-route-announcer']);

export interface CleanContext {
	/** The build paths of the frameworks whose transport global the page carries. */
	readonly builds: readonly RegExp[];
	/** Every script URL of the old site already classified as framework code by its own text. */
	readonly frameworkScripts: ReadonlySet<string>;
	readonly origin: string;
}

function localPath(url: string, origin: string): string | undefined {
	const parsed = URL.parse(url, origin);
	return parsed && parsed.origin === new URL(origin).origin ? parsed.pathname : undefined;
}

function isFrameworkCode(url: string, ctx: CleanContext): boolean {
	if (ctx.frameworkScripts.has(url)) return true;
	const path = localPath(url, ctx.origin);
	return path !== undefined && ctx.builds.some((re) => re.test(path));
}

function count(dropped: Dropped, rule: string): void {
	dropped.set(rule, (dropped.get(rule) ?? 0) + 1);
}

/**
 * Removes the old framework's runtime from a document: its scripts and their preloads, the inline scripts that hand its
 * server state to the client or swap streamed boundaries in, its marker attributes and elements, and comments. Every
 * other script, stylesheet, attribute and element is left exactly as the old page had it.
 */
export function cleanDocument(doc: Document, ctx: CleanContext, dropped: Dropped): void {
	const doomed: Node[] = [];
	for (const el of walk(doc)) {
		const tag = el.tagName;
		if (ELEMENTS.has(tag)) {
			doomed.push(el);
			count(dropped, `<${tag}>: the old framework's own element`);
			continue;
		}
		if (tag === 'script') {
			const src = attr(el, 'src');
			const text = childrenOf(el)
				.map((n) => ('value' in n ? (n as { value: string }).value : ''))
				.join('');
			if (src ? isFrameworkCode(src, ctx) : GLOBALS.some((re) => re.test(text)) || FIZZ.test(text)) {
				doomed.push(el);
				count(dropped, src ? 'script: the old framework build' : "inline script: the old framework's server state or streaming runtime");
			}
			continue;
		}
		if (tag === 'link') {
			const rel = attr(el, 'rel') ?? '';
			const href = attr(el, 'href') ?? '';
			if ((/\bmodulepreload\b/.test(rel) || (/\bpreload\b/.test(rel) && attr(el, 'as') === 'script')) && isFrameworkCode(href, ctx)) {
				doomed.push(el);
				count(dropped, 'script preload: the old framework build');
				continue;
			}
			if (rel === 'expect' && attr(el, 'blocking') === 'render') {
				doomed.push(el);
				count(dropped, "<link rel=expect>: the old framework's render-blocking hint for its own boundary");
				continue;
			}
		}
		if (tag === 'template' && /^[BPS]:/.test(attr(el, 'id') ?? '')) {
			doomed.push(el);
			count(dropped, "<template>: the old framework's streaming placeholder");
			continue;
		}
		for (const name of [...el.attrs.map((a) => a.name)]) {
			if (ATTRIBUTES.has(name)) {
				removeAttr(el, name);
				count(dropped, `${name}: the old framework's marker attribute`);
			}
		}
	}
	for (const node of doomed) remove(node);
	stripComments(doc);
	for (const el of [...walk(doc)]) if (isEmptyBoundary(el)) remove(el);
}

function stripComments(parent: ParentNode): void {
	const list = childrenOf(parent);
	for (let i = list.length - 1; i >= 0; i--) {
		const node = list[i]!;
		if (node.nodeName === '#comment') list.splice(i, 1);
		else if (isElement(node)) stripComments(node);
	}
}

// What a streamed Suspense boundary leaves behind once resolved: a hidden div with nothing in it.
function isEmptyBoundary(el: Element): boolean {
	return el.tagName === 'div' && attr(el, 'hidden') !== undefined && el.attrs.length === 1 && childrenOf(el).every((n) => n.nodeName === '#text' && !(n as { value: string }).value.trim());
}

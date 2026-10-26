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
const SCRIPT_TYPES: ReadonlySet<string> = new Set(RUNTIME_MARKERS.scriptTypes.map(([name]) => name));
// Qwik's container and node attributes, and its handlers: QRLs it resumes from (`on:click`, `on-window:scroll`).
const QWIK_ATTRIBUTE = /^(?:q:|on(?:-window|-document)?:)/;
// Qwik Insights' listener for the symbols Qwik's runtime loads, which only that runtime dispatches.
const QWIK_SYMBOLS = /addEventListener\(\s*["']qsymbol["']/;
const IMPORTED = /\bimport\s*\(\s*["']([^"']+)["']|\bfrom\s*["']([^"']+)["']/g;

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
		if (tag === 'q:template') {
			doomed.push(el);
			count(dropped, "<q:template>: content Qwik keeps for a slot the page does not project");
			continue;
		}
		if (tag === 'script') {
			const src = attr(el, 'src');
			const text = childrenOf(el)
				.map((n) => ('value' in n ? (n as { value: string }).value : ''))
				.join('');
			const qwik = qwikScript(el, text, ctx);
			if (qwik) {
				doomed.push(el);
				count(dropped, qwik);
			} else if (src ? isFrameworkCode(src, ctx) : GLOBALS.some((re) => re.test(text)) || FIZZ.test(text)) {
				doomed.push(el);
				count(dropped, src ? 'script: the old framework build' : "inline script: the old framework's server state or streaming runtime");
			} else removeQwikAttributes(el, dropped);
			continue;
		}
		if (tag === 'link') {
			const rel = attr(el, 'rel') ?? '';
			const href = attr(el, 'href') ?? '';
			if ((/\bmodulepreload\b/.test(rel) || (/\bpreload\b/.test(rel) && (attr(el, 'as') === 'script' || attr(el, 'as') === 'fetch'))) && isFrameworkCode(href, ctx)) {
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
		removeQwikAttributes(el, dropped);
	}
	for (const node of doomed) remove(node);
	stripComments(doc);
}

function removeQwikAttributes(el: Element, dropped: Dropped): void {
	for (const name of [...el.attrs.map((a) => a.name)]) {
		if (!QWIK_ATTRIBUTE.test(name)) continue;
		removeAttr(el, name);
		count(dropped, name.startsWith('q:') ? "q:* attributes: Qwik's container and node markers" : "on:* attributes: Qwik's handlers, as QRLs it resumes from");
	}
}

/** Why a script is Qwik's own (its loader, its paused state, its preloader, an element it hangs handlers on), if it is. */
function qwikScript(el: Element, text: string, ctx: CleanContext): string | undefined {
	const type = attr(el, 'type') ?? attr(el, 'q:func');
	if (type && SCRIPT_TYPES.has(type)) return `<script type=${type}>: Qwik's paused state`;
	if (attr(el, 'id') === 'qwikloader') return "<script id=qwikloader>: Qwik's event loader";
	if (QWIK_SYMBOLS.test(text)) return "inline script: Qwik Insights' listener for the symbols Qwik loads";
	if (!attr(el, 'src') && !text.trim() && el.attrs.some((a) => QWIK_ATTRIBUTE.test(a.name))) return "empty <script>: an element Qwik hangs window and document handlers on";
	for (const m of text.matchAll(IMPORTED)) if (isFrameworkCode(m[1] ?? m[2]!, ctx)) return 'inline script: loads the old framework build';
	return undefined;
}

function stripComments(parent: ParentNode): void {
	const list = childrenOf(parent);
	for (let i = list.length - 1; i >= 0; i--) {
		const node = list[i]!;
		if (node.nodeName === '#comment') list.splice(i, 1);
		else if (isElement(node)) stripComments(node);
	}
}


const HINT = /\b(?:preload|modulepreload|prefetch|preconnect|dns-prefetch)\b/;
const lateKey = (el: Element): string | undefined => {
	if (el.tagName === 'style') return `style ${childrenOf(el).map((n) => ('value' in n ? (n as { value: string }).value : '')).join('')}`;
	if (el.tagName !== 'link') return undefined;
	return `link ${attr(el, 'rel') ?? ''} ${attr(el, 'href') ?? attr(el, 'imagesrcset') ?? ''}`;
};

/**
 * What the old page's scripts added to <head> after its server answered (React's hints from the router's prefetches, a
 * library's injected <style>): the hints are dropped, as the old page only fetched them after it was running, and the
 * injected styles are taken out of the head and returned, to load after the page rather than hold back its first paint.
 * A stylesheet link the old client added stays: it may style what the port renders on the server.
 */
export function lateHead(doc: Document, served: Document, dropped: Dropped): Element[] {
	const sent = new Set<string>();
	for (const el of walk(served)) {
		const key = lateKey(el);
		if (key) sent.add(key);
	}
	const late: Element[] = [];
	for (const el of [...walk(doc)].filter((e) => e.parentNode && isElement(e.parentNode) && e.parentNode.tagName === 'head')) {
		const key = lateKey(el);
		if (!key || sent.has(key)) continue;
		const rel = attr(el, 'rel') ?? '';
		if (el.tagName === 'link' && HINT.test(rel)) {
			remove(el);
			count(dropped, `<link rel=${rel}>: a hint the old page's script added after load`);
		} else if (el.tagName === 'style') {
			remove(el);
			late.push(el);
		}
	}
	return late;
}

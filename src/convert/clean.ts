import { RUNTIME_MARKERS } from '../check/residue.ts';
export { frameworkBuilds } from '../client/builds.ts';
import { frameworkInlineScript } from '../client/builds.ts';
import { attr, childrenOf, isElement, remove, removeAttr, setAttr, walk, type Document, type Element, type Node, type ParentNode } from './dom.ts';

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


export interface CleanContext {
	/** The build paths of the frameworks whose transport global the page carries. */
	readonly builds: readonly RegExp[];
	/** Every script of the old site already classified as framework code by its own text, by URL or same-origin path. */
	readonly frameworkScripts: ReadonlySet<string>;
	readonly origin: string;
	/** A Qwik build's handler symbols (q-manifest.json), with the library handlers ports find their elements by. */
	readonly qwik?: QwikHandlers;
}

export interface QwikHandlers {
	readonly symbols: ReadonlyMap<string, { readonly origin: string; readonly name: string }>;
	readonly marks: readonly { readonly origin: RegExp; readonly mark: string }[];
	readonly contexts?: readonly { readonly element: (localId: string) => string; readonly props: Readonly<Record<string, string>> }[];
}

function localPath(url: string, origin: string): string | undefined {
	const parsed = URL.parse(url, origin);
	return parsed && parsed.origin === new URL(origin).origin ? parsed.pathname : undefined;
}

function isFrameworkCode(url: string, ctx: CleanContext): boolean {
	const path = localPath(url, ctx.origin);
	if (ctx.frameworkScripts.has(url) || (path !== undefined && ctx.frameworkScripts.has(path))) return true;
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
	const paused = ctx.qwik ? pausedState(doc) : undefined;
	const contextAttrs = paused && ctx.qwik?.contexts ? contextProps(paused, ctx.qwik.contexts) : undefined;
	for (const el of walk(doc)) {
		const tag = el.tagName;
		if (ELEMENTS.has(tag)) {
			doomed.push(el);
			count(dropped, `<${tag}>: the old framework's own element`);
			continue;
		}
		if (tag === 'q:template') {
			doomed.push(el);
			if (projectIntoHost(el)) count(dropped, '<q:template>: its content moved into the slot host Qwik projects it into, hidden until a part shows it');
			else count(dropped, "<q:template>: content Qwik keeps for a slot the page does not project");
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
			} else {
				if (ctx.qwik) nameQwikHandlers(el, ctx.qwik, paused);
				removeQwikAttributes(el, dropped);
			}
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
		// Named before the markers go: a handler's captures are found by the element's q:id.
		if (ctx.qwik) nameQwikHandlers(el, ctx.qwik, paused);
		for (const [name, value] of contextAttrs?.get(attr(el, 'id') ?? '') ?? []) setAttr(el, name, value);
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

/**
 * Qwik keeps a slot's content it has not projected yet in a <q:template> right after the slot's host (a select item's
 * check icon beside its empty indicator span). The content goes into the empty host, each element hidden, so the
 * part that shows it (on selection) only switches an attribute; Markless renders every node.
 */
function projectIntoHost(template: Element): boolean {
	const parent = template.parentNode as ParentNode | null;
	if (!parent) return false;
	const siblings = childrenOf(parent);
	const at = siblings.indexOf(template);
	const host = siblings.slice(0, at).reverse().find((n) => isElement(n) || ('value' in n && String((n as { value: string }).value).trim() !== '')) as Element | undefined;
	if (!host || !isElement(host) || childrenOf(host).some((n) => isElement(n) || ('value' in n && String((n as { value: string }).value).trim() !== ''))) return false;
	const content = childrenOf(template).filter((n) => isElement(n));
	if (!content.length) return false;
	for (const node of content) {
		const el = node as Element;
		el.attrs = [...el.attrs.filter((a) => a.name !== 'hidden'), { name: 'hidden', value: '' }];
		(el as unknown as { parentNode: ParentNode }).parentNode = host;
		childrenOf(host).push(el);
	}
	childrenOf(template).length = 0;
	return true;
}

// A Qwik handler attribute holds QRLs, `<chunk>#<symbol>[<captures>]`, one per handler, separated by whitespace.
const SYMBOL = /#(\w+)/;

/**
 * What the handlers an element runs on the old page say about it, by their source (q-manifest.json): a library handler
 * a port finds its elements by marks it; the app's own handlers are named, `<event>:<handler>`, for the site's parts.
 */
interface PausedState {
	readonly refs: Readonly<Record<string, string>>;
	readonly objs: readonly unknown[];
}

/** A paused Qwik container's state (`<script type="qwik/json">`): each element's captured objects by its q:id. */
function pausedState(doc: Document): PausedState | undefined {
	for (const el of walk(doc)) {
		if (el.tagName !== 'script' || attr(el, 'type') !== 'qwik/json') continue;
		try {
			const state = JSON.parse(childrenOf(el).map((n) => ('value' in n ? (n as { value: string }).value : '')).join('')) as Partial<PausedState>;
			return state.refs && state.objs ? { refs: state.refs, objs: state.objs } : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

// Qwik writes a value of another kind (a signal, a QRL, a store) as a string led by a control character.
const plainString = (v: unknown): v is string => typeof v === 'string' && v !== '' && v.charCodeAt(0) >= 0x20;

function capturedStrings(el: Element, paused: PausedState): string[] {
	const ref = paused.refs[attr(el, 'q:id') ?? ''];
	if (!ref) return [];
	return ref.split(/\s+/).map((id) => paused.objs[parseInt(id.replace(/!$/, ''), 36)]).filter(plainString);
}

// Qwik's mark for a prop left undefined.
const UNDEFINED = '\u0001';

/** The attributes each element gets from a component context in the paused state, by the element's id. */
function contextProps(paused: PausedState, specs: NonNullable<QwikHandlers['contexts']>): Map<string, [string, string][]> {
	const out = new Map<string, [string, string][]>();
	const value = (id: unknown) => (typeof id === 'string' ? paused.objs[parseInt(id.replace(/!$/, ''), 36)] : undefined);
	for (const obj of paused.objs) {
		if (!obj || typeof obj !== 'object' || !('localId' in obj)) continue;
		const localId = value((obj as Record<string, unknown>).localId);
		if (!plainString(localId)) continue;
		for (const spec of specs) {
			for (const [prop, name] of Object.entries(spec.props)) {
				if (!(prop in obj)) continue;
				const v = value((obj as Record<string, unknown>)[prop]);
				if (v === UNDEFINED || !['boolean', 'number', 'string'].includes(typeof v)) continue;
				const id = spec.element(localId);
				out.set(id, [...(out.get(id) ?? []), [name, String(v)]]);
			}
		}
	}
	return out;
}

function nameQwikHandlers(el: Element, qwik: QwikHandlers, paused?: PausedState): void {
	const own: string[] = [];
	for (const a of el.attrs) {
		const event = /^on(?:-window|-document)?:([\w-]+)$/.exec(a.name)?.[1];
		if (!event) continue;
		for (const qrl of a.value.split(/\s+/)) {
			const symbol = qwik.symbols.get(SYMBOL.exec(qrl)?.[1] ?? '');
			if (!symbol) continue;
			const mark = qwik.marks.find((m) => m.origin.test(symbol.origin));
			if (mark) setAttr(el, mark.mark, '');
			else if (!symbol.origin.startsWith('../') && !symbol.origin.includes('node_modules')) own.push(`${a.name.startsWith('on:') ? '' : `${a.name.slice(3, a.name.indexOf(':'))}-`}${event}:${symbol.name}`);
		}
	}
	if (!own.length) return;
	setAttr(el, 'data-mm-qwik', [...new Set(own)].join(' '));
	const captured = paused ? capturedStrings(el, paused) : [];
	if (captured.length) setAttr(el, 'data-mm-qwik-captures', JSON.stringify(captured));
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
	if (!attr(el, 'src') && !text.trim() && el.attrs.some((a) => QWIK_ATTRIBUTE.test(a.name))) return "empty <script>: an element Qwik hangs window and document handlers on";
	if (!attr(el, 'src') && frameworkInlineScript(text, ctx.builds.map((path) => ({ framework: '', path })), ctx.origin) !== undefined) return "inline script: the old framework's own (it loads its build, or listens for what only it dispatches)";
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

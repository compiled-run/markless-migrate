import { createHash } from 'node:crypto';
import type { Browser, Page } from 'playwright';
import { openPage, tagHeaders, type SideEnv, type StorageState } from './browser.ts';
import { bodyText, request } from './http.ts';
import { pool, quiet } from './journeys.ts';
import { withFailures } from './compare.ts';
import { RUNTIME_MARKERS } from './residue.ts';
import { maskedShot } from './embeds.ts';
import { armThemeFrames, flashFailures, layoutFailures, readThemeFrames, recordSwapShots, themeFrameRecorder, type SwapShot, type ThemeRecording } from './swap-frames.ts';
import type { Failure, RouteNavigation, RouteResult, Shot, Viewport } from './types.ts';
import { compareScreenshots, visualNoise, visuallyDifferent, type VisualNoise } from './visual.ts';
import { VIEWPORTS } from './types.ts';

// Runs on the new app alone: a page reached by an in-place navigation (a link click the router or a library such as
// htmx swaps in) must be the page a fresh load of its URL shows. Old-vs-new parity cannot see this: both sides are fresh loads.

export interface NavigationOptions {
	/** Entry pages per destination, each from another layout where the site has several (default 2). */
	readonly entries?: number;
	/** Destinations checked: one per page shape (layout and external scripts), round-robin across layouts (default 40). */
	readonly destinations?: number;
	/** Also use a control on the entry page that keeps its state in the browser (a theme switch) before navigating (default true). */
	readonly toggle?: boolean;
	readonly concurrency?: number;
	readonly viewport?: Viewport;
	/** Every page of the site, to find entry pages and links in; the checked routes are destinations. Default: the checked routes. */
	readonly routes?: readonly string[];
	/** Check these routes as destinations, each on its own (a run of chosen routes), instead of one per page shape. */
	readonly only?: readonly string[];
	/** The old app: a difference it shows too when reached the same way is its own, and <html> class and data-* attributes are compared with it. */
	readonly old?: SideEnv;
}

export interface NavigationPair {
	readonly from: string;
	readonly to: string;
	/** `toggled`: the entry page's persisted control (named) was used first. */
	readonly variant: 'plain' | 'toggled';
	readonly control?: string;
	/** The router swapped the page in place; a full page load is a fresh load already, so nothing is compared. */
	readonly inPlace: boolean;
	/** No page links to the destination, so the checker added a link to the entry page and clicked it. */
	readonly injected?: boolean;
	/** The page's own code (a library such as htmx) swapped part of the entry page and pushed the URL, so the router never rendered the destination: that is the old site's behaviour, kept, and not compared. */
	readonly swappedByPage?: boolean;
	readonly failures: number;
	/** Differences the old app shows too when reached the same way: the old app's own, not reported. */
	readonly sameOnOld?: number;
	/** Why the pair could not be compared, when it could not. */
	readonly error?: string;
}

export interface NavigationResult {
	readonly failures: Failure[];
	/** Each checked destination, and the routes of the same shape it stands for. */
	readonly destinations: readonly { readonly route: string; readonly represents: readonly string[] }[];
	readonly pairs: readonly NavigationPair[];
	/** Screenshots behind each screenshot failure: the fresh load as `old`, the page reached in place as `new`. */
	readonly shots: readonly { readonly route: string; readonly shot: Shot }[];
	/** Browser page loads the check made, and how long it took. */
	readonly loads: number;
	readonly ms: number;
}

export const NAVIGATION_HINTS = {
	html: 'After an in-place navigation <html> carries different attributes than a fresh load of this page. An attribute the server renders for one page only (a data-theme the homepage sets) must go when the router leaves that page, and one a script owns (a theme class) must stay. Render page-specific attributes on <Html> per page; if the page code is right on a fresh load, this is the router\'s <html> sync (Markless 8d7669f8 fixed one case).',
	body: 'After an in-place navigation <body> carries different attributes than a fresh load. Render them per page from the page, not from a script that ran on the previous page.',
	head: 'After an in-place navigation the head differs from a fresh load: a title, meta or link of the previous page stayed or this page\'s is missing. Set it in this page\'s head so the router swaps it.',
	stylesheets: 'After an in-place navigation another set of stylesheets applies than on a fresh load: the previous page\'s stayed or this page\'s did not load. Link page-specific CSS from the page\'s head (the router swaps head links), not from a script.',
	dom: 'After an in-place navigation the page\'s markup differs from a fresh load: a script that builds part of this page on load did not run again, or something the previous page added stayed. Run that code on every page the router shows (or from the page\'s own script tags, which the router runs as a fresh load would).',
	styles: 'After an in-place navigation a key element is styled differently than on a fresh load: an attribute or stylesheet of the previous page stayed, or this page\'s did not apply.',
	scripts: 'A script file this page runs on a fresh load never ran after an in-place navigation to it. The router must run a swapped-in page\'s scripts as a fresh load would: head additions first, external files one at a time in document order, then inline scripts (Markless 25196c52 fixed this for htmx.org). If the file is the port\'s own, load it from the page\'s markup rather than from code that runs once at the first load.',
	globals: 'A global this page\'s scripts define on a fresh load is missing after an in-place navigation: the library that defines it did not run (htmx is not defined).',
	errors: 'The page logs this error only after an in-place navigation: usually a script ran before the library it calls, ran twice, or expected DOMContentLoaded to fire again.',
	scroll: 'An in-place navigation leaves the page at another scroll position than a fresh load (top, or the URL\'s #fragment).',
	url: 'Following the link did not end on the page it points to.',
	screenshot: 'The page looks different reached in place than on a fresh load (the red boxes in report.html): compare the other navigation failures of this pair first, then the stylesheets and <html> attributes behind the region.',
	interaction: 'This control behaves differently after an in-place navigation than on a fresh load: its listener was attached once at the first load, not to the page the router swapped in, or the library it needs did not run.',
	back: 'Going back after an in-place navigation does not restore the page a fresh load of it shows.',
	forward: 'Going forward again after going back does not show the page a fresh load of it shows.',
} as const;

const STYLE_TARGETS = ['html', 'body', 'header', 'nav', 'main', 'footer', 'aside', 'h1', 'main a', 'button'];
const STYLE_PROPS = ['color', 'background-color', 'background-image', 'color-scheme', 'font-family', 'font-size', 'font-weight', 'line-height', 'display', 'visibility', 'opacity', 'position'];
const TOGGLE_LABEL = /theme|dark|light|appearance|colou?r[\s_-]?(mode|scheme)|\bmode\b/i;
const STEP_MS = 10_000;

interface Served {
	readonly route: string;
	readonly layout: string;
	readonly shape: string;
	readonly links: readonly string[];
}

interface Snap {
	readonly url: string;
	readonly html: readonly string[];
	readonly body: readonly string[];
	readonly head: readonly string[];
	readonly sheets: readonly string[];
	readonly dom: readonly string[];
	readonly styles: Readonly<Record<string, string>>;
	readonly globals: readonly string[];
	readonly scroll: string;
	/** The page file Markless's router names as the one that rendered it. */
	readonly route: string;
}

interface Control {
	readonly path: string;
	readonly label: string;
}

/** One click on the destination after it loaded, and what the page showed then. */
interface Step {
	readonly control: Control;
	readonly snap: Snap;
	readonly shot: Buffer;
	readonly errors: readonly string[];
}

interface Fresh {
	readonly snap: Snap;
	readonly shot: Buffer;
	/** Pixels that changed on their own within a second of the fresh load. */
	readonly noise: VisualNoise;
	readonly scripts: readonly ScriptRun[];
	readonly errors: readonly string[];
	/** The page's own controls clicked in turn after the fresh load: its persisted-state control twice (on, then back), then one control in the content. */
	readonly steps: readonly Step[];
	/** DOM lines, styles and globals that changed on their own within a second of the fresh load. */
	readonly volatile: ReadonlySet<string>;
}

interface ScriptRun {
	readonly hash: string;
	readonly url: string;
	/** A file, or a script inline in the document. */
	readonly where: 'file' | 'inline';
}

const attrRe = /([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
function attributes(tag: string): [string, string][] {
	const out: [string, string][] = [];
	for (const m of tag.matchAll(attrRe)) out.push([m[1]!.toLowerCase(), (m[2] ?? '').replace(/^["']|["']$/g, '')]);
	return out;
}

const jsType = (type: string | undefined) => !type || /^(module|(text|application)\/(x-)?(java|ecma)script)$/i.test(type.trim());

/** What the served HTML says about a page: its layout (the shell every page of a kind shares), its shape (layout and external scripts) and the routes it links to. */
export function readServed(route: string, html: string, origin: string, known: ReadonlySet<string>): Served {
	const htmlTag = /<html\b([^>]*)>/i.exec(html)?.[1] ?? '';
	const bodyTag = /<body\b([^>]*)>/i.exec(html)?.[1] ?? '';
	const headEnd = html.search(/<\/head>/i);
	const head = headEnd >= 0 ? html.slice(0, headEnd) : '';
	const sheets = [...head.matchAll(/<link\b([^>]*)>/gi)].map((m) => Object.fromEntries(attributes(m[1]!))).filter((a) => /\bstylesheet\b/i.test(a.rel ?? '')).map((a) => a.href ?? '');
	const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => Object.fromEntries(attributes(m[1]!)) as Record<string, string>).filter((a) => jsType(a.type));
	const headScripts = [...head.matchAll(/<script\b([^>]*)>/gi)].map((m) => Object.fromEntries(attributes(m[1]!)) as Record<string, string>).filter((a) => jsType(a.type) && a.src).map((a) => a.src!);
	// The router's own bookkeeping attributes differ on every page; they say nothing about the layout.
	const own = (attrs: [string, string][]) => attrs.filter(([name]) => !name.startsWith('data-markless')).sort();
	const layout = JSON.stringify([own(attributes(htmlTag)), own(attributes(bodyTag)), sheets.sort(), headScripts.sort()]);
	const external = [...new Set(scripts.filter((a) => a.src).map((a) => a.src!))].sort();
	const shape = JSON.stringify([layout, external, scripts.filter((a) => !a.src).length]);
	const base = new URL(route, origin);
	const links = new Set<string>();
	for (const m of html.matchAll(/<a\b([^>]*)>/gi)) {
		const href = Object.fromEntries(attributes(m[1]!)).href;
		if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
		let url: URL;
		try {
			url = new URL(href, base);
		} catch {
			continue;
		}
		if (url.origin !== base.origin) continue;
		const path = knownRoute(`${url.pathname}${url.search}`, known);
		if (path && path !== route) links.add(path);
	}
	return { route, layout, shape, links: [...links] };
}

function knownRoute(path: string, known: ReadonlySet<string>): string | undefined {
	if (known.has(path)) return path;
	const other = path.endsWith('/') ? path.slice(0, -1) : `${path}/`;
	return known.has(other) ? other : undefined;
}

function compareRank(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
	return 0;
}

export interface Plan {
	readonly destinations: readonly { readonly route: string; readonly represents: readonly string[]; readonly entries: readonly { readonly from: string; readonly injected: boolean }[] }[];
}

/** Which destinations to check and from where: one destination per page shape, layouts taken in turn, each reached from entry pages of other layouts first, then its own. */
export function planNavigation(served: readonly Served[], options: Pick<NavigationOptions, 'entries' | 'destinations' | 'only'> = {}): Plan {
	const entries = options.entries ?? 2;
	const limit = options.destinations ?? 40;
	const byShape = new Map<string, Served[]>();
	const only = options.only && new Set(options.only);
	for (const s of served) {
		if (only && !only.has(s.route)) continue;
		const key = only ? s.route : s.shape;
		byShape.set(key, [...(byShape.get(key) ?? []), s]);
	}
	const layouts = [...new Set(served.map((s) => s.layout))];
	const queues = layouts.map((layout) => [...byShape.values()].filter((group) => group[0]!.layout === layout));
	const picked: Served[][] = [];
	for (let round = 0; picked.length < limit && queues.some((q) => q.length); round++) {
		for (const q of queues) if (q.length && picked.length < limit) picked.push(q.shift()!);
	}
	const linkers = new Map<string, Served[]>();
	for (const s of served) for (const to of s.links) linkers.set(to, [...(linkers.get(to) ?? []), s]);
	const firstOf = new Map(layouts.map((layout) => [layout, served.find((s) => s.layout === layout)!]));
	// The page of a shape that most other layouts link to: a visitor's likeliest way in, and the likeliest to carry state across.
	// Links in the first page's order (its header first): a page linked early is one a visitor sees a link to.
	const seenAt = new Map<string, number>();
	for (const s of served) for (const to of s.links) if (!seenAt.has(to)) seenAt.set(to, seenAt.size);
	const reach = (s: Served) => new Set((linkers.get(s.route) ?? []).map((l) => l.layout)).size * 2 + ((linkers.get(s.route) ?? []).some((l) => l.layout === s.layout) ? 1 : 0);
	return {
		destinations: picked.map((members) => {
			const rank = (m: Served) => [reach(m), linkers.get(m.route)?.length ?? 0, -(seenAt.get(m.route) ?? Infinity)];
			const best = members.reduce((a, b) => (compareRank(rank(b), rank(a)) > 0 ? b : a));
			const group = [best, ...members.filter((m) => m !== best)];
			const to = best;
			const from = linkers.get(to.route) ?? [];
			const chosen: { from: string; injected: boolean }[] = [];
			const order = [...layouts.filter((l) => l !== to.layout), to.layout];
			for (const layout of order) {
				if (chosen.length >= entries) break;
				const e = from.find((s) => s.layout === layout);
				if (e) chosen.push({ from: e.route, injected: false });
			}
			if (!chosen.length) {
				const fallback = order.map((l) => firstOf.get(l)!).find((s) => s.route !== to.route);
				if (fallback) chosen.push({ from: fallback.route, injected: true });
			}
			return { route: to.route, represents: group.slice(1).map((s) => s.route), entries: chosen };
		}),
	};
}

// Runs in the page: what a visitor and the page's own code can see of it, normalised so two loads of one page compare alike.
function snapshotPage(args: { targets: string[]; props: string[] }): Snap {
	const origin = location.origin;
	const clean = (v: string) => v.split(origin).join('');
	const attrs = (el: Element) => [...el.attributes].filter((a) => a.name !== 'class' || el.classList.length).map((a) => `${a.name}=${a.name === 'class' ? [...el.classList].sort().join(' ') : clean(a.value)}`).sort();
	const js = (s: HTMLScriptElement) => !s.type || /^(module|(text|application)\/(x-)?(java|ecma)script)$/i.test(s.type.trim());
	const hash = (text: string) => {
		let h = 2166136261;
		for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
		return (h >>> 0).toString(16);
	};
	const label = (el: Element) => `${el.localName}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
	const dom: string[] = [];
	const walk = (el: Element, chain: string) => {
		for (const node of el.childNodes) {
			if (node.nodeType === Node.TEXT_NODE) {
				const text = node.textContent!.replace(/\s+/g, ' ').trim();
				if (text && el.localName !== 'script' && el.localName !== 'style') dom.push(`${chain}\t"${text.slice(0, 120)}"`);
				continue;
			}
			if (node.nodeType !== Node.ELEMENT_NODE) continue;
			const child = node as Element;
			if (child.localName === 'script' && !js(child as HTMLScriptElement)) continue;
			const at = `${chain}>${label(child)}`;
			// How a script was scheduled (async, defer) is the router's to choose when it runs a swapped-in page's scripts; whether a file ran is compared apart.
			const shown = child.localName === 'script' ? attrs(child).filter((a) => !/^(async|defer)=/.test(a)) : attrs(child);
			const extra = child.localName === 'style' ? ` {${hash(child.textContent ?? '')}}` : '';
			dom.push(`${at}\t[${shown.join(' ')}]${extra}`);
			if (child.localName !== 'svg') walk(child, at);
		}
	};
	scrollTo(0, 0);
	walk(document.body, 'body');
	const head: string[] = [`title: ${document.title}`];
	for (const el of document.head.querySelectorAll('meta[name], meta[property], meta[http-equiv], link[rel]:not([rel~="preload"]):not([rel~="modulepreload"]):not([rel~="prefetch"]):not([rel~="stylesheet"]), base')) head.push(`${el.localName} ${attrs(el).join(' ')}`);
	const sheets = [...document.styleSheets].filter((s) => !s.disabled && s.ownerNode).map((s) => (s.href ? clean(s.href) : `inline {${hash(s.ownerNode!.textContent ?? '')}}`));
	const styles: Record<string, string> = {};
	for (const selector of args.targets) {
		const el = document.querySelector(selector);
		if (!el) continue;
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		styles[selector] = `${args.props.map((p) => `${p}: ${cs.getPropertyValue(p)}`).join('; ')}; box: ${Math.round(r.x)},${Math.round(r.y + scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}`;
	}
	return {
		url: clean(location.href),
		html: attrs(document.documentElement),
		body: attrs(document.body),
		head: head.sort(),
		sheets: sheets.sort(),
		dom,
		styles,
		globals: Object.getOwnPropertyNames(window).filter((n) => !n.startsWith('__mm') && !/^\d+$/.test(n)),
		scroll: `${Math.round(scrollX)},${Math.round(scrollY)}`,
		route: document.querySelector('script[type="@markless/core/route"]')?.textContent ?? '',
	};
}

// Runs in the page: the first control in the content (not the header, nav or footer shared by every page) that a click can use without leaving the page.
function pickControl(): { path: string; label: string } | undefined {
	const path = (el: Element): string => {
		const parts: string[] = [];
		for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
			const parent: Element | null = e.parentElement;
			const same = parent ? [...parent.children].filter((c) => c.localName === e!.localName) : [];
			parts.unshift(same.length > 1 ? `${e.localName}:nth-of-type(${same.indexOf(e) + 1})` : e.localName);
		}
		return parts.join(' > ');
	};
	const shown = (el: Element) => {
		const r = el.getBoundingClientRect();
		const cs = getComputedStyle(el);
		return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
	};
	for (const el of document.querySelectorAll('button:not([disabled]), [role="button"], [role="tab"], summary, input[type="checkbox"], [aria-expanded]')) {
		if (el.closest('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"], a[href], form[action]') || !shown(el)) continue;
		if ((el as HTMLButtonElement).type === 'submit' && el.closest('form')) continue;
		const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
		return { path: path(el), label: `${el.localName}${name ? ` "${name}"` : ''}` };
	}
	return undefined;
}

// Runs in the page: candidates for a control whose state the page keeps in the browser.
function toggleCandidates(pattern: string): { path: string; label: string }[] {
	const re = new RegExp(pattern, 'i');
	const out: { path: string; label: string }[] = [];
	const path = (el: Element): string => {
		const parts: string[] = [];
		for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
			const parent: Element | null = e.parentElement;
			const same = parent ? [...parent.children].filter((c) => c.localName === e!.localName) : [];
			parts.unshift(same.length > 1 ? `${e.localName}:nth-of-type(${same.indexOf(e) + 1})` : e.localName);
		}
		return parts.join(' > ');
	};
	for (const el of document.querySelectorAll('button, [role="switch"], [role="button"], input[type="checkbox"]')) {
		const r = el.getBoundingClientRect();
		if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
		const said = [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent, el.id, el.getAttribute('class')].join(' ');
		if (el.getAttribute('role') !== 'switch' && !re.test(said)) continue;
		const name = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
		out.push({ path: path(el), label: `${el.localName}${name ? ` "${name}"` : ''}` });
		if (out.length >= 3) break;
	}
	return out;
}

function kept(): string {
	const local = Object.keys(localStorage).sort().map((k) => `${k}=${localStorage.getItem(k)}`);
	return JSON.stringify([local, document.cookie.split('; ').sort()]);
}

interface Tab {
	readonly page: Page;
	readonly scripts: { phase: number; run: ScriptRun }[];
	readonly errors: { phase: number; text: string }[];
	/** Documents the main frame loaded. */
	documents: number;
	phase: number;
	pending: () => number;
	storage(): Promise<StorageState>;
	close(): Promise<void>;
}

async function openTab(browser: Browser, env: SideEnv, viewport: Viewport, route: string): Promise<Tab> {
	const { context, page } = await openPage(browser, env, viewport, { shareThirdParty: true });
	const host = new URL(env.origin).origin;
	const inflight = new Set<unknown>();
	page.on('request', (r) => inflight.add(r));
	page.on('requestfinished', (r) => inflight.delete(r));
	page.on('requestfailed', (r) => inflight.delete(r));
	const tab: Tab = {
		page,
		scripts: [],
		errors: [],
		documents: 0,
		phase: 0,
		pending: () => inflight.size,
		storage: () => context.storageState(),
		close: () => context.close(),
	};
	page.on('request', (r) => {
		if (r.isNavigationRequest() && r.frame() === page.mainFrame()) tab.documents++;
	});
	const strip = (text: string) => text.split(host).join('');
	page.on('console', (m) => {
		if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) tab.errors.push({ phase: tab.phase, text: strip(m.text()) });
	});
	page.on('pageerror', (e) => tab.errors.push({ phase: tab.phase, text: strip(e.message) }));
	const cdp = await context.newCDPSession(page);
	const documents = new Set<string>();
	page.on('framenavigated', (f) => {
		if (f === page.mainFrame()) documents.add(f.url().split('#')[0]!);
	});
	const main = ((await cdp.send('Page.getFrameTree')) as { frameTree: { frame: { id: string } } }).frameTree.frame.id;
	cdp.on('Debugger.scriptParsed', (e) => {
		const aux = e.executionContextAuxData as { isDefault?: boolean; frameId?: string } | undefined;
		if (!e.url || !/^https?:/.test(e.url) || e.scriptLanguage === 'WebAssembly' || aux?.isDefault === false || (aux?.frameId && aux.frameId !== main)) return;
		const url = e.url.split('#')[0]!;
		tab.scripts.push({ phase: tab.phase, run: { hash: e.hash, url: strip(url), where: documents.has(url) ? 'inline' : 'file' } });
	});
	await cdp.send('Debugger.enable');
	await context.addInitScript(themeFrameRecorder);
	await page.goto(new URL(route, env.origin).href, { waitUntil: 'load', timeout: 30_000 });
	await settled(tab);
	return tab;
}

const settled = (tab: Tab) => quiet(tab.page, tab.pending, () => tab.documents);

const snap = (page: Page) => page.evaluate(snapshotPage, { targets: STYLE_TARGETS, props: STYLE_PROPS });

async function click(tab: Tab, path: string): Promise<void> {
	await tab.page.locator(`css=${path}`).first().click({ timeout: STEP_MS });
	await settled(tab);
}

const VOLATILE_MS = 1_000;
const SHOT_SHARE = 0.0005;

const shoot = async (page: Page) => {
	// The pointer stays where the last click was: a fresh load has nothing hovered.
	await page.mouse.move(0, 0);
	// A canvas or a video draws frames of its own (a Rive animation): what it shows depends on when, not on how the page was reached.
	return (await maskedShot(page, (mask) => page.screenshot({ mask: [...mask, page.locator('canvas, video')], animations: 'disabled', caret: 'hide' }))).shot;
};

// Runs in the page: each element with text of its own, and where it is.
function ownTexts(): { text: string; box: { x: number; y: number; width: number; height: number } }[] {
	return [...document.body.querySelectorAll('*')].flatMap((el) => {
		const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
		if (!text) return [];
		const r = el.getBoundingClientRect();
		return [{ text, box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }];
	});
}

/** Clicks each control in turn, recording what the page shows after each; a control that cannot be used ends the steps. */
async function runSteps(tab: Tab, controls: readonly Control[], first: number): Promise<Step[]> {
	const steps: Step[] = [];
	for (const [i, control] of controls.entries()) {
		tab.phase = first + i;
		const used = await click(tab, control.path).then(() => true, () => false);
		if (!used) break;
		steps.push({ control, snap: await snap(tab.page), shot: await shoot(tab.page), errors: tab.errors.filter((e) => e.phase === first + i).map((e) => e.text) });
	}
	return steps;
}

async function freshLoad(browser: Browser, env: SideEnv, viewport: Viewport, route: string, toggle: Control | undefined | false, opened: () => void): Promise<Fresh> {
	opened();
	const tab = await openTab(browser, env, viewport, route);
	try {
		const snapshot = await snap(tab.page);
		const shot = await shoot(tab.page);
		const texts = await tab.page.evaluate(ownTexts);
		// What a clock or a carousel keeps changing differs by when it is read, not by how the page was reached.
		await tab.page.waitForTimeout(VOLATILE_MS);
		const later = await snap(tab.page);
		const changed = (await tab.page.evaluate(ownTexts)).flatMap((t, i) => (texts[i] && texts[i]!.text !== t.text ? [t.box] : []));
		const noise = visualNoise(shot, [await shoot(tab.page)], changed);
		const base = { snap: snapshot, shot, noise, scripts: tab.scripts.map((s) => s.run), errors: tab.errors.map((e) => e.text), volatile: volatileKeys(snapshot, later), steps: [] };
		if (toggle === false) return base;
		const content = await tab.page.evaluate(pickControl);
		const controls = [...(toggle ? [toggle, { ...toggle, label: `${toggle.label} again` }] : []), ...(content ? [content] : [])];
		return { ...base, steps: await runSteps(tab, controls, 1) };
	} finally {
		await tab.close();
	}
}

const lineKey = (line: string) => line.split('\t')[0]!;

function volatileKeys(a: Snap, b: Snap): ReadonlySet<string> {
	const out = new Set<string>();
	const { missing, extra } = listDiff(a.dom, b.dom);
	for (const line of [...missing, ...extra]) out.add(lineKey(line));
	for (const [selector, style] of Object.entries(a.styles)) if (b.styles[selector] !== style) out.add(`style:${selector}`);
	for (const g of a.globals) if (!b.globals.includes(g)) out.add(`global:${g}`);
	return out;
}

/** Finds the entry page's control that keeps state in the browser (localStorage or a cookie) without leaving the page. */
async function findToggle(browser: Browser, env: SideEnv, viewport: Viewport, route: string): Promise<Control | undefined> {
	const tab = await openTab(browser, env, viewport, route);
	try {
		const url = tab.page.url();
		for (const candidate of await tab.page.evaluate(toggleCandidates, TOGGLE_LABEL.source)) {
			const before = await tab.page.evaluate(kept);
			await click(tab, candidate.path).catch(() => {});
			if (tab.page.url() !== url) return undefined;
			if ((await tab.page.evaluate(kept)) !== before) return candidate;
		}
		return undefined;
	} finally {
		await tab.close();
	}
}

// Markless's router asks for the next page at a router-owned path (0.6) or with this header (0.5).
const routerFetch = (url: URL, headers: Record<string, string>) => url.pathname.startsWith('/_markless/fragment/') || 'x-markless-fragment' in headers;

/** Clicks a link to `to` on the page (one the visitor can see, else one the checker adds) and reports whether the document stayed, and whether the page's own code (not the router) fetched and swapped it. It ends on `to` or where a fresh load of `to` ends (a login guard's redirect). */
async function follow(tab: Tab, to: string, origin: string, landing: string, painted = false): Promise<{ inPlace: boolean; injected: boolean; byPage: boolean; frames?: ThemeRecording; shots: SwapShot[] }> {
	const target = new URL(to, origin).href;
	const page = tab.page;
	const lands = new URL(landing, origin).href;
	const ends = samePage(lands, page.url()) ? [target] : [target, lands];
	await page.evaluate(() => ((window as unknown as { __mmNavToken?: number }).__mmNavToken = 1));
	const found = await page.evaluate((target) => {
		const t = new URL(target);
		const other = t.pathname.endsWith('/') ? `${t.origin}${t.pathname.slice(0, -1)}${t.search}` : `${t.origin}${t.pathname}/${t.search}`;
		const same = (a: HTMLAnchorElement) => {
			const u = new URL(a.href, location.href);
			u.hash = '';
			return u.href === t.href || u.href === other;
		};
		const links = [...document.querySelectorAll('a[href]')] as HTMLAnchorElement[];
		const at = links.findIndex((a) => {
			if (!same(a) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return false;
			const r = a.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden';
		});
		if (at >= 0) return at;
		const link = Object.assign(document.createElement('a'), { href: target, textContent: 'markless-migrate navigation check' });
		link.setAttribute('style', 'position:fixed;left:0;top:0;z-index:2147483647;background:#fff;padding:4px');
		document.body.append(link);
		return document.querySelectorAll('a[href]').length - 1;
	}, target);
	const injected = await page.evaluate((i) => document.querySelectorAll('a[href]')[i]?.textContent === 'markless-migrate navigation check', found);
	const before = tab.documents;
	let byPage = false;
	const watch = (r: import('playwright').Request) => {
		const url = new URL(r.url());
		if (['fetch', 'xhr'].includes(r.resourceType()) && samePage(url.href, target) && !routerFetch(url, r.headers())) byPage = true;
	};
	page.on('request', watch);
	// Scrolled to before recording starts: the click's own scroll is not a frame of the swap.
	await page.locator('a[href]').nth(found).scrollIntoViewIfNeeded({ timeout: STEP_MS }).catch(() => {});
	let armedAt = Date.now();
	const stopShots = painted ? await recordSwapShots(page, () => armedAt) : async () => [];
	armedAt = Date.now();
	await armThemeFrames(page);
	let shots: SwapShot[] = [];
	try {
		await page.locator('a[href]').nth(found).click({ timeout: STEP_MS });
		await page.waitForURL((u) => ends.some((end) => samePage(u.href, end)), { timeout: STEP_MS, waitUntil: 'commit' });
		await settled(tab);
	} finally {
		page.off('request', watch);
		shots = await stopShots();
	}
	const inPlace = tab.documents === before && (await page.evaluate(() => (window as unknown as { __mmNavToken?: number }).__mmNavToken === 1));
	const frames = inPlace ? await readThemeFrames(page) : undefined;
	return { inPlace, injected, byPage, ...(frames ? { frames } : {}), shots: inPlace ? shots : [] };
}

function samePage(a: string, b: string): boolean {
	const x = new URL(a);
	const y = new URL(b);
	const trim = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
	return x.origin === y.origin && trim(x.pathname) === trim(y.pathname) && x.search === y.search;
}

function listDiff(expected: readonly string[], actual: readonly string[]): { missing: string[]; extra: string[] } {
	const count = new Map<string, number>();
	for (const line of actual) count.set(line, (count.get(line) ?? 0) + 1);
	const missing: string[] = [];
	for (const line of expected) {
		const n = count.get(line) ?? 0;
		if (n) count.set(line, n - 1);
		else missing.push(line);
	}
	const extra = [...count].flatMap(([line, n]) => Array.from({ length: n }, () => line));
	return { missing, extra };
}

const MAX_LINES = 4;
const say = (lines: readonly string[]) => (lines.length ? `${lines.slice(0, MAX_LINES).join('\n')}${lines.length > MAX_LINES ? `\n... ${lines.length - MAX_LINES} more` : ''}` : '(nothing)');

/** The differences between a fresh load of a page and the same page reached another way; `how` names the way, `volatile` what changed on its own within a second of the fresh load. */
export function compareSnaps(route: string, how: string, fresh: Snap, reached: Snap, volatile: ReadonlySet<string> = new Set(), hint: (key: keyof typeof NAVIGATION_HINTS) => string = (k) => NAVIGATION_HINTS[k]): Failure[] {
	const failures: Failure[] = [];
	const add = (aspect: string, key: keyof typeof NAVIGATION_HINTS, expected: string, actual: string) => failures.push({ route, dimension: 'navigation', check: `${how}: ${aspect}`, expected, actual, hint: hint(key) });
	if (!samePage(`http://x${fresh.url}`, `http://x${reached.url}`)) add('URL', 'url', fresh.url, reached.url);
	const show = (lines: readonly string[]) => say(lines.map((l) => l.replace('\t', ' ')));
	for (const [aspect, key, a, b] of [
		['<html> attributes', 'html', fresh.html, reached.html],
		['<body> attributes', 'body', fresh.body, reached.body],
		['head', 'head', fresh.head, reached.head],
		['stylesheets', 'stylesheets', fresh.sheets, reached.sheets],
		['DOM', 'dom', fresh.dom, reached.dom],
	] as const) {
		const steady = (lines: readonly string[]) => (key === 'dom' ? lines.filter((l) => !volatile.has(lineKey(l))) : lines);
		const { missing, extra } = listDiff(steady(a), steady(b));
		if (missing.length || extra.length) add(aspect, key, `as on a fresh load; only on the fresh load:\n${show(missing)}`, `only here:\n${show(extra)}`);
	}
	const styled = Object.entries(fresh.styles).flatMap(([selector, style]) => {
		const other = reached.styles[selector];
		if (other === undefined || other === style || volatile.has(`style:${selector}`)) return [];
		const a = style.split('; ');
		const b = other.split('; ');
		const changed = a.flatMap((part, i) => (part !== b[i] ? [i] : []));
		return [{ selector, expected: changed.map((i) => a[i]).join('; '), actual: changed.map((i) => b[i] ?? '').join('; ') }];
	});
	if (styled.length) add(`computed styles of ${styled.map((s) => s.selector).join(', ')}`, 'styles', say(styled.map((s) => `${s.selector}: ${s.expected}`)), say(styled.map((s) => `${s.selector}: ${s.actual}`)));
	const globals = new Set(reached.globals);
	const lost = fresh.globals.filter((g) => !globals.has(g) && !volatile.has(`global:${g}`));
	if (lost.length) add("globals the page's scripts define", 'globals', lost.slice(0, 8).join(', '), '(not defined)');
	if (fresh.scroll !== reached.scroll) add('scroll position', 'scroll', fresh.scroll, reached.scroll);
	return failures;
}

/** Script files a fresh load runs that never ran in the navigated document. Inline scripts are judged by what they do (the DOM, <html>, globals, errors, the interaction): a router may run its own differently, on purpose. */
export function scriptFailures(route: string, how: string, fresh: readonly ScriptRun[], ran: readonly string[]): Failure[] {
	const seen = new Set(ran);
	const missing = [...new Set(fresh.filter((s) => s.where === 'file' && !seen.has(s.hash)).map((s) => s.url))];
	if (!missing.length) return [];
	return [{ route, dimension: 'navigation', check: `${how}: script files run`, expected: missing.slice(0, 6).join('\n'), actual: '(never ran in this document)', hint: NAVIGATION_HINTS.scripts }];
}

export function errorFailures(route: string, how: string, freshErrors: readonly string[], errors: readonly string[]): Failure[] {
	const own = new Set(freshErrors);
	const added = [...new Set(errors.filter((e) => !own.has(e)))];
	return added.length ? [{ route, dimension: 'navigation', check: `${how}: console errors`, expected: freshErrors.length ? freshErrors.slice(0, 3).join('\n') : '(none)', actual: added.slice(0, 3).join('\n'), hint: NAVIGATION_HINTS.errors }] : [];
}

interface PairOutcome {
	readonly pair: NavigationPair;
	readonly failures: Failure[];
	readonly shots: { readonly route: string; readonly shot: Shot }[];
	/** What the destination's <html> showed once reached, for the old app's to be compared with. */
	readonly reached?: Snap;
}

interface Job {
	readonly from: string;
	readonly to: string;
	readonly injected: boolean;
	readonly variant: 'plain' | 'toggled';
}

/** One app's side of the check: its fresh loads and persisted-state controls, cached, and the navigations compared with them. */
function side(browser: Browser, env: SideEnv, viewport: Viewport, opened: () => void) {
	const freshCache = new Map<string, Promise<Fresh>>();
	const toggles = new Map<string, Promise<Control | undefined>>();
	const toggleOf = (route: string) => {
		let hit = toggles.get(route);
		if (!hit) toggles.set(route, (hit = (opened(), findToggle(browser, env, viewport, route).catch(() => undefined))));
		return hit;
	};
	const fresh = async (route: string, kept: StorageState | undefined, interact: boolean) => {
		const state = kept && (kept.cookies.length || kept.origins.some((o) => o.localStorage.length)) ? kept : undefined;
		const key = `${route}|${interact}|${state ? JSON.stringify(state) : ''}`;
		let hit = freshCache.get(key);
		if (!hit) freshCache.set(key, (hit = (async () => freshLoad(browser, state ? { ...env, storageState: state } : env, viewport, route, interact ? await toggleOf(route) : false, opened))()));
		return hit;
	};
	const shotFailure = (route: string, how: string, expected: Fresh, actual: Buffer, at: Buffer = expected.shot, hint: string = NAVIGATION_HINTS.screenshot): { failure: Failure; shot: Shot } | undefined => {
		const diff = compareScreenshots(at, actual, expected.noise);
		// A shimmer or a gradient whose phase a script set from the time it started is not the navigation's doing; DOM and styles are compared exactly.
		if (!visuallyDifferent(diff) || (!diff.sizeMismatch && diff.differing < SHOT_SHARE * diff.area)) return undefined;
		const box = diff.region ? `${diff.region.width}x${diff.region.height} at (${diff.region.x}, ${diff.region.y})` : 'its size';
		return {
			failure: { route, dimension: 'navigation', check: `${how}: screenshot`, viewport: viewport.name, expected: 'the screenshot of a fresh load', actual: `${diff.differing} pixels differ${diff.sizeMismatch ? `, ${diff.sizeMismatch.actual} against ${diff.sizeMismatch.expected}` : ''}, within ${box}`, hint },
			shot: { label: `navigation: ${how}`, viewport: viewport.name, old: at, new: actual, ...(diff.png ? { diff: diff.png } : {}), regions: diff.regions, ok: false },
		};
	};
	async function pair(job: Job): Promise<PairOutcome | undefined> {
		const base = { from: job.from, to: job.to, variant: job.variant };
		try {
			const control = job.variant === 'toggled' ? await toggleOf(job.from) : undefined;
			if (job.variant === 'toggled' && !control) return undefined;
			const destination = job.variant === 'plain' ? await fresh(job.to, undefined, true) : undefined;
			opened();
			const tab = await openTab(browser, env, viewport, job.from);
			try {
				let state: StorageState | undefined;
				if (control) {
					await click(tab, control.path);
					state = await tab.storage();
				}
				const how = `in place from ${job.from}${control ? ` after ${control.label}` : ''}`;
				const entryRoute = (await snap(tab.page)).route;
				tab.phase = 1;
				const atTo = destination ?? (await fresh(job.to, state, false));
				const { inPlace, injected, byPage, frames, shots: painted } = await follow(tab, job.to, env.origin, atTo.snap.url, true);
				const pair = { ...base, ...(control ? { control: control.label } : {}), inPlace, ...(injected || job.injected ? { injected: true } : {}) };
				if (!inPlace) return { pair: { ...pair, failures: 0 }, failures: [], shots: [] };
				const reached = await snap(tab.page);
				if (byPage || (entryRoute && reached.route === entryRoute && atTo.snap.route !== entryRoute)) return { pair: { ...pair, swappedByPage: true, failures: 0 }, failures: [], shots: [] };
				const errorsAt = (n: number) => tab.errors.filter((e) => e.phase === n).map((e) => e.text);
				const failures: Failure[] = [];
				const shots: { route: string; shot: Shot }[] = [];
				const shotAt = (found: { failure: Failure; shot: Shot } | undefined, route: string) => {
					if (!found) return;
					failures.push(found.failure);
					shots.push({ route, shot: found.shot });
				};
				const way = injected ? `${how} (through a link the checker added: no page links here)` : how;
				failures.push(...compareSnaps(job.to, way, atTo.snap, reached, atTo.volatile));
				shotAt(shotFailure(job.to, way, atTo, await shoot(tab.page)), job.to);
				failures.push(...scriptFailures(job.to, way, atTo.scripts, tab.scripts.map((s) => s.run.hash)));
				failures.push(...errorFailures(job.to, way, atTo.errors, errorsAt(1)));
				failures.push(...flashFailures(job.to, way, frames));
				const layout = layoutFailures(job.to, way, viewport.name, frames, painted);
				failures.push(...layout.failures);
				shots.push(...layout.shots.map((shot) => ({ route: job.to, shot })));
				// The destination's own controls again, as a visitor goes on using the page: a theme switch twice (on, then back), then one in the content.
				const steps = destination ? await runSteps(tab, destination.steps.map((s) => s.control), 2) : [];
				for (const [i, step] of steps.entries()) {
					const expected = destination!.steps[i]!;
					const where = `${way}, then clicking ${step.control.label}`;
					const hint = (k: keyof typeof NAVIGATION_HINTS) => `${NAVIGATION_HINTS.interaction} ${NAVIGATION_HINTS[k]}`;
					failures.push(...compareSnaps(job.to, where, expected.snap, step.snap, destination!.volatile, hint).filter((f) => !/: (scroll position|computed styles)/.test(f.check)));
					shotAt(shotFailure(job.to, where, destination!, step.shot, expected.shot, hint('screenshot')), job.to);
					failures.push(...errorFailures(job.to, where, expected.errors, step.errors));
				}
				tab.phase = 10;
				// What the steps kept (a theme, a dismissed banner) holds for the entry page's fresh load too.
				const now = steps.length ? await tab.storage() : state;
				await tab.page.goBack({ timeout: STEP_MS, waitUntil: 'commit' });
				await settled(tab);
				const atFrom = await fresh(job.from, now, false);
				const back = `back to ${job.from} after going ${way} to ${job.to}`;
				const backHint = (k: keyof typeof NAVIGATION_HINTS) => `${NAVIGATION_HINTS.back} ${NAVIGATION_HINTS[k]}`;
				failures.push(...compareSnaps(job.from, back, atFrom.snap, await snap(tab.page), atFrom.volatile, backHint));
				shotAt(shotFailure(job.from, back, atFrom, await shoot(tab.page), atFrom.shot, backHint('screenshot')), job.from);
				failures.push(...errorFailures(job.from, back, atFrom.errors, errorsAt(10)));
				if (!steps.length) {
					tab.phase = 11;
					await tab.page.goForward({ timeout: STEP_MS, waitUntil: 'commit' });
					await settled(tab);
					const forward = `forward to ${job.to} after going back to ${job.from}`;
					const forwardHint = (k: keyof typeof NAVIGATION_HINTS) => `${NAVIGATION_HINTS.forward} ${NAVIGATION_HINTS[k]}`;
					failures.push(...compareSnaps(job.to, forward, atTo.snap, await snap(tab.page), atTo.volatile, forwardHint));
					shotAt(shotFailure(job.to, forward, atTo, await shoot(tab.page), atTo.shot, forwardHint('screenshot')), job.to);
					failures.push(...errorFailures(job.to, forward, atTo.errors, errorsAt(11)));
				}
				return { pair: { ...pair, failures: failures.length }, failures, shots, reached };
			} finally {
				await tab.close();
			}
		} catch (error) {
			const message = (error as Error).message.split('\n')[0]!.split(env.origin).join('');
			const failed = /waitForURL|locator\.click/.test(message);
			const failures: Failure[] = failed ? [{ route: job.to, dimension: 'navigation', check: `in place from ${job.from}: following the link`, expected: `the link from ${job.from} shows ${job.to}`, actual: message, hint: NAVIGATION_HINTS.url }] : [];
			return { pair: { ...base, inPlace: false, failures: failures.length, error: message }, failures, shots: [] };
		}
	}
	/** The plain navigation again under a dark system theme, for what its frames show: a lost theme class flashes most there. */
	async function darkSwap(job: Job): Promise<Failure[]> {
		const landing = (await fresh(job.to, undefined, true).catch(() => undefined))?.snap.url ?? job.to;
		opened();
		const tab = await openTab(browser, { ...env, colorScheme: 'dark' }, viewport, job.from);
		try {
			const { inPlace, injected, frames } = await follow(tab, job.to, env.origin, landing);
			const how = `in place from ${job.from} with a dark system theme`;
			return inPlace ? flashFailures(job.to, injected ? `${how} (through a link the checker added: no page links here)` : how, frames) : [];
		} catch {
			return [];
		} finally {
			await tab.close();
		}
	}
	return { fresh, pair, darkSwap };
}

// The screenshot a navigation failure carries: the page reached for a screenshot check, the frame for a layout check.
const shotLabel = (check: string) => (check.endsWith(': screenshot') ? `navigation: ${check.slice(0, -': screenshot'.length)}` : check.endsWith(': layout during the swap') ? `navigation: ${check.slice(0, -': layout during the swap'.length)}, a frame during the swap` : undefined);

/** What a failure says once the way it was reached is set aside: the same difference on the old app reached the same way is the old app's own. */
const sameKey = (f: Failure) => `${f.route} ${f.check.replace(' (through a link the checker added: no page links here)', '').replace(/clicking [^:]*?(?= again:|:)/, 'clicking')}`;

// An old framework's own runtime markers (data-has-hydrated, data-rh) are never a difference: a port leaves them out (residue.ts).
const RUNTIME_ATTRIBUTES: ReadonlySet<string> = new Set(RUNTIME_MARKERS.attributes.map(([name]) => name));
export const markedAttributes = (snap: Pick<Snap, 'html'>) => snap.html.filter((a) => /^(class|data-[^=]*)=/.test(a) && !RUNTIME_ATTRIBUTES.has(a.slice(0, a.indexOf('='))));

/** Compares a fresh load of each sampled page with the same page reached by an in-place navigation from other pages, plain and after using a control that keeps state in the browser, then going on to use the page's own controls, back and forward. With the old app, a difference the old app shows reached the same way is its own and not reported, and <html> class and data-* attributes are compared with the old app's, fresh and reached. */
export async function checkNavigation(browser: Browser, env: SideEnv, routes: readonly string[], options: NavigationOptions = {}): Promise<NavigationResult> {
	const started = Date.now();
	const viewport = options.viewport ?? VIEWPORTS[0]!;
	const concurrency = options.concurrency ?? 4;
	const all = [...new Set([...routes, ...(options.routes ?? [])])];
	const known = new Set(all);
	const served = (
		await pool(all, 8, async (route) => {
			const url = new URL(route, env.origin);
			const response = await request(url, { headers: tagHeaders(env) }).catch(() => undefined);
			if (!response || !response.ok || !(response.headers.get('content-type') ?? '').includes('html')) return undefined;
			return readServed(route, await bodyText(response, url).catch(() => ''), env.origin, known);
		})
	).filter((s): s is Served => s !== undefined);
	const plan = planNavigation(served, { ...options, ...(options.routes ? { only: options.only ?? routes } : {}) });
	let loads = 0;
	const opened = () => void loads++;
	const next = side(browser, env, viewport, opened);
	const jobs: Job[] = plan.destinations.flatMap((d) => d.entries.flatMap((e, i) => [{ to: d.route, ...e, variant: 'plain' as const }, ...(options.toggle !== false && i === 0 ? [{ to: d.route, ...e, variant: 'toggled' as const }] : [])]));
	const outcomes = (await pool(jobs, concurrency, (job) => next.pair(job))).map((o, i) => (o ? { job: jobs[i]!, ...o } : undefined));
	const done = outcomes.filter((o) => o !== undefined);
	const failures: Failure[] = done.flatMap((o) => o.failures);
	const pairs: NavigationPair[] = done.map((o) => o.pair);
	const darkJobs = env.colorScheme === 'dark' ? [] : plan.destinations.flatMap((d) => done.find((o) => o.job.to === d.route && o.job.variant === 'plain' && o.pair.inPlace && !o.pair.swappedByPage)?.job ?? []);
	const dark = await pool(darkJobs, concurrency, async (job) => ({ job, failures: await next.darkSwap(job) }));
	if (options.old) {
		const old = side(browser, options.old, viewport, opened);
		const sameOnOld = new Set<string>();
		// Every pair that differs, to tell the old app's own behaviour apart, and the first plain pair to each destination, for <html> against the old app reached the same way.
		const first = new Set(plan.destinations.map((d) => done.find((o) => o.job.to === d.route && o.job.variant === 'plain' && o.reached)).filter((o) => o !== undefined));
		const checked = await pool(done.filter((o) => o.failures.length || first.has(o)), concurrency, async (o) => ({ o, theirs: await old.pair(o.job) }));
		for (const { o, theirs } of checked) {
			if (!theirs?.pair.inPlace || theirs.pair.swappedByPage) continue;
			const own = new Set(theirs.failures.map(sameKey));
			for (const f of o.failures) if (own.has(sameKey(f))) sameOnOld.add(`${o.job.from}|${o.job.to}|${o.job.variant}|${sameKey(f)}`);
			const mine = o.reached && markedAttributes(o.reached);
			const theirsShown = theirs.reached && markedAttributes(theirs.reached);
			if (mine && theirsShown && JSON.stringify(mine) !== JSON.stringify(theirsShown)) {
				const { missing, extra } = listDiff(theirsShown, mine);
				failures.push({ route: o.job.to, dimension: 'navigation', check: `in place from ${o.job.from}${o.pair.control ? ` after ${o.pair.control}` : ''}: <html> class and data-* attributes, against the old app reached the same way`, expected: `as on the old app; only there:\n${say(missing)}`, actual: `only here:\n${say(extra)}`, hint: NAVIGATION_HINTS.html });
			}
		}
		const kept = failures.filter((f) => {
			const o = done.find((d) => d.failures.includes(f));
			return !o || !sameOnOld.has(`${o.job.from}|${o.job.to}|${o.job.variant}|${sameKey(f)}`);
		});
		failures.splice(0, failures.length, ...kept);
		for (const [i, o] of done.entries()) {
			const dropped = o.failures.filter((f) => !kept.includes(f)).length;
			if (dropped) pairs[i] = { ...pairs[i]!, failures: pairs[i]!.failures - dropped, sameOnOld: dropped };
		}
		// A fresh load's <html> classes and data-* attributes (a theme, a variant) are compared with the old app's here: the other dimensions compare lang and dir.
		for (const d of plan.destinations) {
			const [a, b] = await Promise.all([old.fresh(d.route, undefined, false), next.fresh(d.route, undefined, false)]).catch(() => [undefined, undefined]);
			if (!a || !b) continue;
			const { missing, extra } = listDiff(markedAttributes(a.snap), markedAttributes(b.snap));
			if (missing.length || extra.length) failures.push({ route: d.route, dimension: 'rendered', check: 'fresh load: <html> class and data-* attributes', expected: `as on the old app; only there:\n${say(missing)}`, actual: `only here:\n${say(extra)}`, hint: 'Render the same class and data-* attributes on <Html> (a theme, a variant, a platform class a head script sets); the page\'s CSS selects on them.' });
		}
	}
	const oldDark = options.old && side(browser, options.old, viewport, opened);
	for (const { job, failures: flashed } of dark) {
		if (!flashed.length) continue;
		// The old app flashing the same way reached the same way is its own.
		const own = new Set(oldDark ? (await oldDark.darkSwap(job)).map(sameKey) : []);
		failures.push(...flashed.filter((f) => !own.has(sameKey(f))));
	}
	const kept = new Set(failures);
	return {
		failures: dedupe(failures),
		shots: done.flatMap((o) => o.shots.filter((s) => [...kept].some((f) => f.route === s.route && shotLabel(f.check) === s.shot.label))),
		destinations: plan.destinations.map((d) => ({ route: d.route, represents: d.represents })),
		pairs,
		loads,
		ms: Date.now() - started,
	};
}

function dedupe(failures: readonly Failure[]): Failure[] {
	const seen = new Set<string>();
	return failures.filter((f) => {
		const key = createHash('sha1').update(JSON.stringify([f.route, f.check, f.expected, f.actual])).digest('hex');
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Adds the navigation check's failures and what it compared to each route's result: destinations name their entry pages, routes of the same shape the page that stood for them. */
export function applyNavigation(results: readonly RouteResult[], nav: NavigationResult): RouteResult[] {
	const by = new Map<string, Failure[]>();
	for (const f of nav.failures) by.set(f.route, [...(by.get(f.route) ?? []), f]);
	const covered = new Map<string, RouteNavigation>();
	for (const d of nav.destinations) {
		const pairs = nav.pairs.filter((p) => p.to === d.route && p.inPlace && !p.swappedByPage);
		if (!pairs.length) continue;
		covered.set(d.route, { from: pairs.map((p) => `${p.from}${p.control ? ` after ${p.control}` : ''}`) });
		for (const r of d.represents) covered.set(r, { from: [], representedBy: d.route });
	}
	return results.map((r) => {
		const navigation = covered.get(r.route);
		const added = by.get(r.route) ?? [];
		if (!navigation && !added.length) return r;
		const shots = nav.shots.filter((s) => s.route === r.route).map((s) => s.shot);
		return withFailures(r, [...r.failures, ...added], { navigation: navigation ?? { from: [] }, ...(shots.length ? { shots: [...r.shots, ...shots] } : {}) });
	});
}

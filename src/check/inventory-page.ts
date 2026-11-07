// What a page does in the browser, read live: the elements it animates, what it does on scroll, the :hover and :focus rules its stylesheets hold and its media, on the old page twice and the new page once.
import type { Browser } from 'playwright';
import { parse } from 'yuku-css';
import { generate } from 'yuku-css/codegen';
import type { SideEnv } from './browser.ts';
import type { LiveBehaviour, LiveRow } from './inventory-compare.ts';
import { openSession } from './journeys.ts';
import { motionEnv } from './motion.ts';
import type { Viewport } from './types.ts';

type Seen = { animated: Set<Element>; written: Map<Element, number>; scrolled: Set<EventTarget>; observed: Set<Element> };

/** Runs in every document before the page's own scripts: notes what the page animates and what it listens to scrolling with. Must stay self-contained. */
export function watchBehaviours(): void {
	const w = window as unknown as { __mmBehaviours?: Seen };
	if (w.__mmBehaviours) return;
	const seen: Seen = { animated: new Set(), written: new Map(), scrolled: new Set(), observed: new Set() };
	w.__mmBehaviours = seen;
	const animate = Element.prototype.animate;
	Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
		seen.animated.add(this);
		return animate.apply(this, args);
	};
	for (const type of ['animationstart', 'transitionrun']) addEventListener(type, (e) => void (e.target instanceof Element && seen.animated.add(e.target)), true);
	const add = EventTarget.prototype.addEventListener;
	EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
		if (type === 'scroll' || type === 'wheel') seen.scrolled.add(this);
		return (add as (...a: unknown[]) => void).call(this, type, ...rest);
	};
	if (typeof IntersectionObserver !== 'undefined') {
		const observe = IntersectionObserver.prototype.observe;
		IntersectionObserver.prototype.observe = function (this: IntersectionObserver, target: Element) {
			seen.observed.add(target);
			return observe.call(this, target);
		};
	}
	// A script's tween writes an element's style frame after frame.
	const watch = () => new MutationObserver((records) => {
		for (const r of records) if (r.target instanceof Element) seen.written.set(r.target, (seen.written.get(r.target) ?? 0) + 1);
	}).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style'] });
	if (document.documentElement) watch();
	else addEventListener('DOMContentLoaded', watch, { once: true });
}

/** Runs in the page once it has loaded and been scrolled through: each behaviour it showed, keyed the way the source scan keys them. */
export async function readBehaviours(): Promise<LiveBehaviour[]> {
	const seen = (window as unknown as { __mmBehaviours?: Seen }).__mmBehaviours;
	const frame = () => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 50)));
	for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
		scrollTo(0, y);
		await frame();
	}
	scrollTo(0, 0);
	await frame();
	const text = (el: Element) => (el.getAttribute('aria-label') || (el.textContent ?? '')).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
	const named = (el: Element) => text(el) || `<${el.localName}>`;
	const out: LiveBehaviour[] = [];
	const add = (b: LiveBehaviour) => void (out.length < 2000 && out.push(b));
	const animated = new Set([...(seen?.animated ?? []), ...[...(seen?.written ?? [])].filter(([, n]) => n >= 3).map(([el]) => el)]);
	for (const el of animated) if (el.isConnected) add({ kind: 'animation', key: `animation|${el.localName}|${named(el)}`, what: `<${el.localName}> ${named(el).slice(0, 40)}` });
	const scrolled = [...(seen?.scrolled ?? [])];
	if (scrolled.some((t) => t === window || t === document)) add({ kind: 'scroll', key: 'scroll|window', what: 'a listener on the page scrolling' });
	for (const t of scrolled) if (t instanceof Element && t.isConnected) add({ kind: 'scroll', key: `scroll|${named(t)}`, what: `a scroll listener on <${t.localName}> ${named(t).slice(0, 40)}` });
	if (seen?.observed.size) add({ kind: 'scroll', key: 'scroll|observer', what: `an IntersectionObserver watching ${seen.observed.size} element${seen.observed.size === 1 ? '' : 's'}` });
	const rules = (list: CSSRuleList): CSSStyleRule[] => [...list].flatMap((r) => (r instanceof CSSStyleRule ? [r, ...rules(r.cssRules)] : 'cssRules' in r ? rules((r as CSSGroupingRule).cssRules) : []));
	for (const sheet of document.styleSheets) {
		let list: CSSRuleList;
		try {
			list = sheet.cssRules;
		} catch {
			continue;
		}
		for (const rule of rules(list)) {
			for (const selector of splitSelectors(rule.selectorText)) {
				const kind = /:hover\b/.test(selector) ? 'hover-rule' : /:focus(-visible|-within)?\b/.test(selector) ? 'focus-rule' : undefined;
				if (kind) add({ kind, key: `css|${normalSelector(selector)}`, what: selector.slice(0, 120) });
			}
		}
	}
	const path = (raw: string) => {
		const u = URL.parse(raw, location.href);
		if (!u) return raw;
		// An image optimizer's address names the file it serves in its query.
		const inner = u.searchParams.get('url');
		const at = inner?.startsWith('/') ? new URL(inner, location.origin) : u;
		return at.origin === location.origin ? at.pathname : `${at.origin}${at.pathname}`;
	};
	for (const el of document.querySelectorAll('img, video, audio, source')) {
		const src = el.getAttribute('src') ?? (el.getAttribute('srcset') ?? '').trim().split(/\s+/)[0] ?? '';
		if (src) add({ kind: 'media', key: `media|${el.localName === 'source' ? (el.parentElement?.localName ?? 'source') : el.localName}|${path(src)}`, what: `<${el.localName}> ${path(src)}` });
	}
	return out;

	function splitSelectors(list: string): string[] {
		const parts: string[] = [];
		let depth = 0;
		let start = 0;
		for (let i = 0; i < list.length; i++) {
			const c = list[i];
			if (c === '(' || c === '[') depth++;
			else if (c === ')' || c === ']') depth--;
			else if (c === ',' && depth === 0) {
				parts.push(list.slice(start, i).trim());
				start = i + 1;
			}
		}
		parts.push(list.slice(start).trim());
		return parts.filter(Boolean);
	}
	function normalSelector(s: string): string {
		return s.replace(/\s*([>+~])\s*/g, '$1').replace(/\s+/g, ' ').trim();
	}
}

const STATES = new Set(['hover', 'focus', 'focus-visible', 'focus-within']);
type CssNode = { type: string; name?: string; children?: CssNode[]; prelude?: CssNode };

/** The selector without its :hover and :focus states and pseudo-elements, from its syntax tree: what the rule styles when the state holds. */
export function stateless(selector: string): string | undefined {
	const { ast } = parse(`${selector}{}`);
	const rule = (ast.children as CssNode[])[0];
	const first = rule?.type === 'Rule' && rule.prelude?.type === 'SelectorList' ? rule.prelude.children?.[0] : undefined;
	if (!first?.children) return undefined;
	const kept = first.children.filter((part) => !(part.type === 'PseudoClassSelector' && STATES.has(part.name ?? '')) && part.type !== 'PseudoElementSelector');
	const text = kept.length ? generate({ ...first, children: kept } as Parameters<typeof generate>[0]) : '*';
	return /(^|[\s>+~])$/.test(text) ? `${text}*` : text;
}

async function read(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<LiveBehaviour[]> {
	const session = await openSession(browser, motionEnv(env, false), route, viewport, { initScripts: [watchBehaviours] });
	try {
		const found = await session.page.evaluate(readBehaviours);
		// A rule counts where it styles an element of this page: a site-wide stylesheet's rule for another page's element is that page's.
		const rules = found.filter((b) => b.kind === 'hover-rule' || b.kind === 'focus-rule');
		const bases = rules.map((b) => stateless(b.what) ?? '*');
		const applies = await session.page.evaluate((list) => list.map((b) => { try { return document.querySelector(b) !== null; } catch { return true; } }), bases);
		const off = new Set(rules.filter((_, i) => !applies[i]));
		return found.filter((b) => !off.has(b));
	} finally {
		await session.close();
	}
}

/** The old page twice (what only one load shows is its own variation) and the new page once, at the first width. */
export async function observeBehaviours(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport): Promise<LiveRow> {
	const [a, b, next] = await Promise.all([read(browser, sides.old, route, viewport), read(browser, sides.old, route, viewport), read(browser, sides.new, route, viewport)]);
	return { viewport: viewport.name, olds: [a, b], next };
}

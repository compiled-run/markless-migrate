// Presses each control of an original page no recorder takes and keeps what each press visibly or audibly changed.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page, Request } from 'playwright';
import { isLoopback, openPage, type OpenPage } from '../check/browser.ts';
import { finishAnimations, settle as settleLoad } from '../check/capture.ts';
import { DESTRUCTIVE } from '../check/destructive.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { captureEnv } from '../convert/capture-env.ts';
import { SCRIPTS_STILL_CAP_MS } from '../convert/capture.ts';
import { LATE_MARKS_MS, REVEAL_CLICKS } from '../convert/reveal.ts';
import { scriptsStill, settle, STILL_MS, trackSettling } from '../convert/settle.ts';
import { SELECTOR as TOGGLE_CONTROLS } from '../convert/toggles.ts';

/** How a press changed the page: back by itself, back on the next press, unchanged by the next press, or more states. */
export type Shape = 'inert' | 'transient' | 'toggle' | 'one-way' | 'cycle' | 'sequence';
/** A press whose effect was not read: what stopped it. */
export type Stopped = 'blocked' | 'navigates' | 'window' | 'download' | 'dialog' | 'unpressable';

export interface Change {
	/** The element, as tag, role, data-slot and a few words of its text or label. */
	readonly at: string;
	readonly what: 'text' | 'attribute' | 'added' | 'removed' | 'shown' | 'hidden' | 'look' | 'focus' | 'scroll' | 'announced' | 'address';
	readonly name?: string;
	readonly before?: string;
	readonly after?: string;
}

export interface PressedControl {
	/** tag|data-slot|text and its occurrence among the body's elements: the signature every recorder keys controls by. */
	readonly sig: string;
	readonly nth: number;
	/** tag|data-slot|aria-label (or text): the signature a scene keys its controls by. */
	readonly labelSig: string;
	/** Its occurrence among the elements with both its signatures: how the written port is searched for it. */
	readonly pair?: number;
	readonly name: string;
	/** `role`: a button, a role=button, a summary or a tree item; `cursor`: an element the page's CSS gives a pointer or text cursor. */
	readonly found: 'role' | 'cursor';
	/** Each ancestor's sig#nth, nearest first: what holds the control (a recorded demo, carousel or table). */
	readonly ancestors: readonly string[];
	readonly shape: Shape | Stopped;
	/**
	 * Where what the press changed sits: the nearest element holding the control and every element it changed, as its path
	 * from the body (`body>div2>main1`: tag and occurrence among its siblings of that tag) and its sig#nth.
	 */
	readonly holder?: { readonly path: string; readonly at: string };
	/** The states one control showed before it came back or the presses ran out, the first included. */
	readonly states?: number;
	readonly changes?: readonly Change[];
	/** What a stopped press tried: the request blocked, the address it went to, the dialog's text. */
	readonly why?: string;
}

export interface DiscoverFacts {
	readonly route: string;
	readonly browser: string;
	readonly candidates: number;
	/** Pressables left alone, by why: inside a form, a submit, a link, a destructive name, hidden, disabled, a reveal's. */
	readonly excluded: Readonly<Record<string, number>>;
	readonly controls: readonly PressedControl[];
	/** Controls not pressed because one like them was, by the sig#nth of the one pressed in their place: how many more there were. */
	readonly repeats?: Readonly<Record<string, number>>;
	/** Pressables left to the reveals or the toggles by their own selectors: checked against what those recorded. */
	readonly left?: readonly LeftControl[];
	/** The press budget ended the presses before every control: the same page is cut at the same control every time. */
	readonly cut?: boolean;
	/** Elements that changed with no press (a clock, an autoplaying carousel): never counted as a press's change. */
	readonly drift: number;
	readonly reloads: number;
	readonly ms: number;
	readonly error?: string;
}

export interface DiscoverOptions {
	/** The old page's key (key.ts): a recording made from another page is recorded again. */
	readonly page?: string;
	/** The press budget per page, when not MAX_PAGE_PRESSES. */
	readonly maxPresses?: number;
	/** The hang guard per page, when not HANG_MS. */
	readonly hangMs?: number;
}

const VIEWPORT = VIEWPORTS[0] ?? { name: 'desktop', width: 1280, height: 800, isMobile: false };
/** Three presses tell a three-state cycle (Start Listening) from a sequence; the fourth tells a sequence from a longer cycle. */
const MAX_PRESSES = 4;
/** Four times the most pressables on any page of the 18-route shadcn sample (49). */
const MAX_CONTROLS = 200;
/** A clock that ticks once a second, the commonest thing a page changes by itself, changes at least once in this watch; what it misses is learned between controls. */
const DRIFT_WATCH_MS = 1100;
/** Four times the most presses any page of the 18-route shadcn sample took (41): a bound that cuts a page at the same control every run. */
const MAX_PAGE_PRESSES = 160;
/** Seven times the slowest page of the sample (134 s): only a page that stopped answering reaches it, and it is an error, not a cut. */
const HANG_MS = 900_000;
/** Two presses of a repeat agreed on every repeat in the sample (19 Copy, 16 View Code, 10 Drag to reorder): the rest are counted like them. */
const REPEATS = 2;
/** What a reader reads per control: the 47-node suggestion reply is named by its first few. */
const KEPT_CHANGES = 12;

/** Each control is pressed up to MAX_PRESSES times: only ever against a copy of the original served on this machine. */
export function assertLocal(origin: string): void {
	if (isLoopback(origin)) return;
	throw new Error(`discovery presses each control of the original up to ${MAX_PRESSES} times, so it runs only against a local copy, not ${origin}`);
}

// The page's first guard against writes; openPage's route, with sendWrites off, holds back any that get past it.
function holdWrites(): void {
	const g = globalThis as typeof globalThis & { __mmWrites__?: string[] };
	if (g.__mmWrites__) return;
	// A frame of the page (an about:blank one a script fills) writes into the page's list, the one read after a press.
	const top = (() => {
		try {
			return window.top === window ? undefined : (window.top as typeof g | null)?.__mmWrites__;
		} catch {
			return undefined;
		}
	})();
	const writes: string[] = top ?? [];
	g.__mmWrites__ = writes;
	const write = (method: string | undefined) => !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());
	const path = (url: string | URL) => {
		try {
			return new URL(url, location.href).pathname;
		} catch {
			return String(url);
		}
	};
	const realFetch = g.fetch;
	g.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
		const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
		if (!write(method)) return realFetch.call(this, input, init);
		writes.push(`${method.toUpperCase()} ${path(input instanceof Request ? input.url : input)}`);
		return Promise.reject(new TypeError('Failed to fetch'));
	} as typeof fetch;
	const open = XMLHttpRequest.prototype.open;
	const held = new WeakMap<XMLHttpRequest, string>();
	XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
		if (write(method)) held.set(this, `${method.toUpperCase()} ${path(url)}`);
		return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
	} as typeof XMLHttpRequest.prototype.open;
	const send = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
		const what = held.get(this);
		if (what === undefined) return send.call(this, body);
		writes.push(what);
		queueMicrotask(() => this.dispatchEvent(new ProgressEvent('error')));
	};
	if (navigator.sendBeacon) navigator.sendBeacon = (url) => (writes.push(`POST ${path(url)}`), true);
	for (const name of ['submit', 'requestSubmit'] as const) {
		const real = HTMLFormElement.prototype[name] as (this: HTMLFormElement, ...a: unknown[]) => void;
		HTMLFormElement.prototype[name] = function (this: HTMLFormElement, ...a: unknown[]) {
			if (!write(this.method)) return real.apply(this, a);
			writes.push(`${this.method.toUpperCase()} ${path(this.action)}`);
		} as never;
	}
	// A form a script sends by clicking its own submit button, or a submit a visitor presses.
	addEventListener(
		'submit',
		(event) => {
			const form = event.target instanceof HTMLFormElement ? event.target : undefined;
			if (!form || !write(form.method)) return;
			event.preventDefault();
			writes.push(`${form.method.toUpperCase()} ${path(form.action)}`);
		},
		true,
	);
	const socketSend = WebSocket.prototype.send;
	WebSocket.prototype.send = function (this: WebSocket) {
		writes.push(`WebSocket ${path(this.url)}`);
	} as typeof socketSend;
}

/** In every document of the context: reads the page for comparison, and keeps what live regions announce between reads. */
function installReader(): void {
	type Entry = { d: string; a: string; t: string; s: 0 | 1; l: string; c: string };
	const g = globalThis as typeof globalThis & { __mmDiscover__?: unknown };
	if (g.__mmDiscover__) return;
	const readings: Record<string, Entry>[] = [];
	let announced: string[] = [];
	// Attributes a hover, focus or press sets by itself, and an open tooltip's reference.
	const TRANSIENT = /^(tabindex|aria-describedby|data-(hovered|pressed|focused|focus-visible|focus-visible-within|focus-within|highlighted|active))$/;
	const ARIA = /^(aria-|role$|hidden$|open$|disabled$|checked$|selected$|value$|inert$|title$|alt$|href$|src$)/;
	const describe = (el: Element) => {
		const role = el.getAttribute('role');
		const slot = el.getAttribute('data-slot');
		const words = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
		return `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}${slot ? `[data-slot=${slot}]` : ''}${words ? ` "${words}"` : ''}`;
	};
	const ownStyle = (el: Element) => {
		const s = el instanceof HTMLElement || el instanceof SVGElement ? el.style : undefined;
		if (!s) return '';
		const kept: string[] = [];
		for (const name of Array.from(s)) if (!/^(animation|transition)/.test(name)) kept.push(`${name}:${s.getPropertyValue(name)}`);
		return kept.sort().join(';');
	};
	// What an id reference points at, by the element's path: a regenerated id naming the same element is no change.
	const paths = new Map<Element, string>();
	const ref = (value: string) =>
		value
			.split(/\s+/)
			.map((id) => {
				const to = id && document.getElementById(id);
				return to ? (paths.get(to) ?? '#?') : id;
			})
			.join(' ');
	const live = new MutationObserver((records) => {
		for (const r of records) {
			const el = r.target instanceof Element ? r.target : r.target.parentElement;
			const region = el?.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]');
			const text = region?.textContent?.trim().replace(/\s+/g, ' ');
			if (region && text) announced.push(`${describe(region)}: ${text.slice(0, 120)}`);
		}
	});
	const start = () => live.observe(document, { subtree: true, childList: true, characterData: true });
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
	else start();
	const read = (): number => {
		const out: Record<string, Entry> = {};
		paths.clear();
		const name = (el: Element, path: string) => {
			paths.set(el, path);
			const counts = new Map<string, number>();
			for (const c of el.children) {
				const tag = c.tagName.toLowerCase();
				const n = (counts.get(tag) ?? 0) + 1;
				counts.set(tag, n);
				name(c, `${path}>${tag}${n}`);
			}
		};
		name(document.body, 'body');
		// An element a running endless animation moves (a spinner) and all inside it: their look is never the same twice.
		const endless = new Set(document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).map((a) => (a.effect instanceof KeyframeEffect ? a.effect.target : null)).filter((t): t is Element => t instanceof Element));
		const walk = (el: Element, shownAbove: boolean, movingAbove: boolean) => {
			if (el.matches('script, style, template, noscript, [role="tooltip"]')) return;
			const css = getComputedStyle(el);
			const shown = shownAbove && css.display !== 'none' && css.visibility !== 'hidden' && el.getClientRects().length > 0;
			const moving = movingAbove || endless.has(el);
			const attrs = [...el.attributes]
				.filter((a) => !TRANSIENT.test(a.name))
				.map((a) => `${a.name}=${a.name === 'style' ? ownStyle(el) : /^(id|for|aria-(labelledby|controls|owns|activedescendant|flowto|details|errormessage))$/.test(a.name) ? ref(a.value) : a.value}`)
				.sort()
				.join(' ');
			const text = [...el.childNodes]
				.filter((n) => n.nodeType === Node.TEXT_NODE)
				.map((n) => n.textContent)
				.join('')
				.trim();
			const look = !shown ? '' : moving ? 'moving' : `${css.display} ${css.visibility} ${css.opacity} ${css.color} ${css.backgroundColor} ${css.borderColor} ${css.transform} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`;
			const scrolled = el.scrollTop || el.scrollLeft ? `${Math.round(el.scrollTop)},${Math.round(el.scrollLeft)}` : '';
			out[paths.get(el)!] = { d: describe(el), a: attrs, t: text, s: shown ? 1 : 0, l: look, c: scrolled };
			for (const c of el.children) walk(c, shown || css.display === 'contents', moving);
		};
		walk(document.body, true, false);
		const focused = document.activeElement && document.activeElement !== document.body ? (paths.get(document.activeElement) ?? '') : '';
		out['@focus'] = { d: focused, a: '', t: '', s: 1, l: '', c: '' };
		out['@scroll'] = { d: 'the window', a: '', t: '', s: 1, l: '', c: `${Math.round(scrollY)},${Math.round(scrollX)}` };
		readings.push(out);
		return readings.length - 1;
	};
	type Change = { at: string; what: string; name?: string; before?: string; after?: string };
	const diff = (a: number, b: number, ignore: readonly string[], pressed: string): { changed: string[]; changes: Change[] } => {
		const A = readings[a] ?? {};
		const B = readings[b] ?? {};
		const skip = new Set(ignore);
		const changed: string[] = [];
		const changes: Change[] = [];
		for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
			if (skip.has(key)) continue;
			const x = A[key];
			const y = B[key];
			if (key === '@focus') {
				// Focus landing on the pressed control (or in it), or leaving to nothing, is the press itself.
				const to = y?.d ?? '';
				if (x?.d !== to && to && to !== pressed && !to.startsWith(`${pressed}>`)) (changed.push(to), changes.push({ at: B[to]?.d ?? to, what: 'focus' }));
				continue;
			}
			// The window's own scroll moves under a press for reasons of its own (a late layout above, scroll anchoring): never a change.
			if (key === '@scroll') continue;
			if (!x || !y) {
				const it = x ?? y;
				if (it?.s) (changed.push(key), changes.push({ at: it.d, what: x ? 'removed' : 'added' }));
				continue;
			}
			if (!x.s && !y.s) continue;
			// The pressed control's own look follows the press itself (focus, active, a ring): its text and ARIA still count.
			const own = pressed !== '' && (key === pressed || key.startsWith(`${pressed}>`));
			if (x.s !== y.s) (changed.push(key), changes.push({ at: y.d, what: y.s ? 'shown' : 'hidden' }));
			else if (x.t !== y.t) (changed.push(key), changes.push({ at: y.d, what: 'text', before: x.t.slice(0, 80), after: y.t.slice(0, 80) }));
			else if (x.c !== y.c) (changed.push(key), changes.push({ at: y.d, what: 'scroll', before: x.c, after: y.c }));
			else if (x.a !== y.a) {
				const attrs = (s: string) => new Map(s.split(/ (?=[\w:.-]+=)/).map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)] as const));
				const ax = attrs(x.a);
				const ay = attrs(y.a);
				// An ARIA state, name or a meaningful attribute counts; a class, style or data- attribute only when the element looks different.
				const named = [...new Set([...ax.keys(), ...ay.keys()])].filter((n) => ax.get(n) !== ay.get(n) && ARIA.test(n));
				const [first] = named;
				if (first !== undefined) (changed.push(key), changes.push({ at: y.d, what: 'attribute', name: first, before: ax.get(first)?.slice(0, 80), after: ay.get(first)?.slice(0, 80) }));
				else if (x.l !== y.l && !own) (changed.push(key), changes.push({ at: y.d, what: 'look', before: x.l, after: y.l }));
			} else if (x.l !== y.l && !own) (changed.push(key), changes.push({ at: y.d, what: 'look', before: x.l, after: y.l }));
		}
		// A box that only grew or shrank around another change (a body taller by a reply) is that change, not one of its own.
		const sizeOnly = (x: string | undefined, y: string | undefined) => x !== undefined && y !== undefined && x.slice(0, x.lastIndexOf(' ')) === y.slice(0, y.lastIndexOf(' '));
		const keep = changed.map((key, i) => !(changes[i]?.what === 'look' && sizeOnly(changes[i]?.before, changes[i]?.after) && changed.some((other) => other.startsWith(`${key}>`))));
		const kept = changed.filter((_, i) => keep[i]);
		const told = changes.filter((_, i) => keep[i]);
		// What a person reads first: text, ARIA and elements coming and going before a box that grew around them.
		const rank = ['text', 'attribute', 'added', 'removed', 'shown', 'hidden', 'focus', 'announced', 'scroll', 'look'];
		return { changed: kept, changes: told.sort((p, q) => rank.indexOf(p.what) - rank.indexOf(q.what)) };
	};
	g.__mmDiscover__ = {
		read,
		diff,
		path: (el: Element) => (read(), paths.get(el) ?? ''),
		announced: () => {
			const out = announced;
			announced = [];
			return out;
		},
		forget: () => void readings.splice(0),
	};
}

interface Reader {
	/** Set once per document: the same id after a press means the address changed in the same document. */
	read(): number;
	diff(a: number, b: number, ignore: readonly string[], pressed: string): { changed: string[]; changes: Change[] };
	path(el: Element): string;
	announced(): string[];
	forget(): void;
}

interface Candidate {
	readonly sig: string;
	readonly nth: number;
	readonly labelSig: string;
	readonly pair: number;
	readonly name: string;
	readonly found: 'role' | 'cursor';
	readonly ancestors: readonly string[];
}

/** A pressable left to another recorder by that recorder's own selector: checked against what it recorded. */
export interface LeftControl {
	readonly to: 'reveals' | 'toggles' | 'grids';
	readonly sig: string;
	readonly nth: number;
	readonly name: string;
	/** For a grid: its cells, none pressed, and the grid's ancestors' sig#nth, to find the recording that holds it. */
	readonly cells?: number;
	readonly ancestors?: readonly string[];
}

interface Found {
	readonly candidates: Candidate[];
	readonly excluded: Record<string, number>;
	readonly repeats: Record<string, number>;
	readonly left: LeftControl[];
}

/** In the page: every pressable, the ones left alone counted by why, the rest marked `data-mm-discover="<n>"` in document order. */
function findCandidates(o: { readonly destructive: string; readonly reveals: string; readonly toggles: string; readonly repeats: number }): Found {
	const DESTRUCTIVE = new RegExp(o.destructive, 'i');
	const words = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${words(el.textContent).slice(0, 60)}`;
	const labelSigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${words(el.getAttribute('aria-label') ?? el.textContent).slice(0, 60)}`;
	// The accessible name as the browser builds it, near enough: labelledby, label, the text, an image's alt or an svg's title, the title.
	const nameOf = (el: Element) => {
		const by = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => (id ? document.getElementById(id)?.textContent : '')).join(' ');
		const pictured = [...el.querySelectorAll('img[alt], svg title')].map((x) => x.getAttribute('alt') ?? x.textContent).join(' ');
		return words(by) || words(el.getAttribute('aria-label')) || words(el.textContent) || words(pictured) || words(el.getAttribute('title'));
	};
	const counts = new Map<string, number>();
	const order = new Map<Element, number>();
	const pairs = new Map<Element, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		const n = counts.get(sig) ?? 0;
		counts.set(sig, n + 1);
		order.set(el, n);
		const pair = `${sig}\u0000${labelSigOf(el)}`;
		pairs.set(el, counts.get(pair) ?? 0);
		counts.set(pair, (counts.get(pair) ?? 0) + 1);
	}
	const at = (el: Element) => `${sigOf(el)}#${order.get(el) ?? 0}`;
	const ROLE = 'button, [role="button"], summary, [role="treeitem"]';
	const FIELD = 'input, textarea, select, option, [contenteditable]:not([contenteditable="false"]), label';
	const cursorOf = (el: Element | null) => (el ? getComputedStyle(el).cursor : '');
	const excluded: Record<string, number> = {};
	const out: Candidate[] = [];
	const left: LeftControl[] = [];
	const leave = (why: string) => void (excluded[why] = (excluded[why] ?? 0) + 1);
	const seen = new Map<string, { n: number; first: string }>();
	const repeats: Record<string, number> = {};
	const grids = new Map<string, LeftControl>();
	// A repeat is the same control in the same place: its signature, name and the nearest element around it with a slot,
	// a role or an id. A grid's cells repeat by their grid alone (a calendar's days); a treegrid's rows each expand their own.
	const repeat = (el: Element, name: string) => {
		const around = el.parentElement?.closest('[data-slot], [role], [id]');
		const key = `${sigOf(el)}\u0000${name}\u0000${around ? at(around) : ''}`;
		const got = seen.get(key) ?? { n: 0, first: at(el) };
		seen.set(key, { ...got, n: got.n + 1 });
		if (got.n + 1 <= o.repeats) return false;
		repeats[got.first] = (repeats[got.first] ?? 0) + 1;
		return true;
	};
	// The one control inside an element a reveal uses (a trigger rendered around a button).
	const wrappedBy = (el: Element) => {
		const wrapper = el.parentElement?.closest(o.reveals);
		return wrapper ? [...wrapper.querySelectorAll(ROLE)].every((x) => x === el) : false;
	};
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const byRole = el.matches(ROLE);
		const cursor = cursorOf(el);
		const byCursor = !byRole && (cursor === 'pointer' || cursor === 'text') && cursorOf(el.parentElement) !== cursor && !el.matches(FIELD) && !el.closest(ROLE) && !el.querySelector(ROLE);
		if (!byRole && !byCursor) continue;
		const css = getComputedStyle(el);
		const name = nameOf(el).slice(0, 60);
		if (el.closest('a[href], area[href]')) leave('link');
		else if (el.closest('form') || (el instanceof HTMLButtonElement && el.form)) leave('in a form');
		else if (el.matches('[type="submit"]')) leave('submit');
		else if (DESTRUCTIVE.test(`${name} ${el.getAttribute('title') ?? ''}`)) leave('destructive name');
		// With no name there is nothing to tell a destructive control from a harmless one by.
		else if (!name) leave('no accessible name');
		else if (el.matches(':disabled, [aria-disabled="true"]') || el.closest('[inert]')) leave('disabled');
		else if (css.display === 'none' || css.visibility === 'hidden' || !el.getClientRects().length || el.closest('[aria-hidden="true"]')) leave('hidden');
		else if (el.matches(o.reveals) || wrappedBy(el)) (leave('left to the reveals'), left.push({ to: 'reveals', sig: sigOf(el), nth: order.get(el) ?? 0, name }));
		else if (el.matches(o.toggles)) (leave('left to the toggles'), left.push({ to: 'toggles', sig: sigOf(el), nth: order.get(el) ?? 0, name }));
		else if (el.closest('[role="grid"]')) {
			// A grid's cells (a calendar's days) are its recorder's: checked at convert against the recording that holds the grid.
			const grid = el.closest('[role="grid"]');
			leave('in a grid');
			const key = grid ? at(grid) : '';
			const got = grids.get(key);
			if (got) grids.set(key, { ...got, cells: (got.cells ?? 0) + 1 });
			else if (grid) {
				const ancestors: string[] = [];
				for (let up = grid.parentElement; up && up !== document.body; up = up.parentElement) ancestors.push(at(up));
				grids.set(key, { to: 'grids', sig: sigOf(grid), nth: order.get(grid) ?? 0, name: words(grid.getAttribute('aria-label') ?? '') || name, cells: 1, ancestors });
			}
		} else if (repeat(el, name)) leave('same as a control pressed');
		else {
			const ancestors: string[] = [];
			for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) ancestors.push(at(up));
			el.setAttribute('data-mm-discover', String(out.length));
			out.push({ sig: sigOf(el), nth: order.get(el) ?? 0, labelSig: labelSigOf(el), pair: pairs.get(el) ?? 0, name, found: byRole ? 'role' : 'cursor', ancestors });
		}
	}
	return { candidates: out, excluded, repeats, left: [...left, ...grids.values()] };
}

/** The nearest element holding the pressed control and every element its press changed, as a path from the body. */
export function holderPath(pressed: string, changed: readonly string[]): string | undefined {
	if (!pressed) return undefined;
	const [own, ...others] = [pressed, ...changed.filter((p) => p.startsWith('body'))].map((p) => p.split('>'));
	if (!own) return undefined;
	const common: string[] = [];
	for (const [i, step] of own.entries()) {
		if (!others.every((p) => p[i] === step)) break;
		common.push(step);
	}
	// A press that changed only its own element is held by its parent: the control is not its own demo.
	if (common.length === own.length) common.pop();
	return common.join('>');
}

/** In the page as loaded: the sig#nth of the element at each path, the signature scenes and the emit find it by. */
function sigsAt(paths: readonly string[]): string[] {
	const sigOf = (e: Element) => `${e.tagName.toLowerCase()}|${e.getAttribute('data-slot') ?? ''}|${(e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const order = new Map<Element, number>();
	const counts = new Map<string, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	return paths.map((path) => {
		let el: Element | null = document.body;
		for (const step of path.split('>').slice(1)) {
			const [, tag, n] = /^([a-z0-9-]+?)(\d+)$/.exec(step) ?? [];
			el = el ? ([...el.children].filter((c) => c.tagName.toLowerCase() === tag)[Number(n) - 1] ?? null) : null;
		}
		return el ? `${sigOf(el)}#${order.get(el) ?? 0}` : '';
	});
}

const fileOf = (dir: string, route: string) => join(dir, `${createHash('sha256').update(route).digest('hex').slice(0, 16)}.json`);

const isFacts = (x: unknown): x is DiscoverFacts & { page?: string } => typeof x === 'object' && x !== null && typeof (x as DiscoverFacts).route === 'string' && Array.isArray((x as DiscoverFacts).controls) && typeof (x as DiscoverFacts).ms === 'number';

/** Presses each pressable of the page at desktop width up to MAX_PRESSES times; a press that writes, leaves or opens something is stopped and named. */
export async function recordDiscovery(browser: Browser, origin: string, route: string, dir: string, options: DiscoverOptions = {}): Promise<DiscoverFacts> {
	assertLocal(origin);
	const file = fileOf(dir, route);
	const kept: unknown = await readFile(file, 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);
	if (isFacts(kept) && kept.route === route && kept.page === options.page) {
		const { page: _, ...facts } = kept;
		return facts;
	}
	const started = Date.now();
	const url = new URL(route, origin).href;
	// openPage's route holds back every write the page's own guard misses (a worker's, a native form's).
	const env = captureEnv(origin, { sendWrites: false });
	let session: OpenPage | undefined;
	let page: Page | undefined;
	let stopped: { shape: Stopped; why: string } | undefined;
	const stop = (shape: Stopped, why: string) => void (stopped ??= { shape, why });
	let movedTo: string | undefined;
	let docId = '';
	let writesSeen = 0;
	// The page's open requests by when each started: a press waits only on those it started, never on one the page holds open.
	const requests = new Map<Request, number>();
	let lastEnded = 0;
	const pressedRequestsDone = async (since: number) => {
		const t0 = Date.now();
		const open = () => [...requests.values()].some((t) => t >= since);
		while (Date.now() - t0 < SCRIPTS_STILL_CAP_MS && (open() || (lastEnded >= since && Date.now() - lastEnded < STILL_MS))) await at().waitForTimeout(20);
	};
	const at = (): Page => {
		if (!page) throw new Error('discovery: no page open');
		return page;
	};
	const open = async () => {
		await session?.context.close().catch(() => {});
		session = await openPage(browser, env, VIEWPORT);
		const opened = session;
		page = opened.page;
		writesSeen = 0;
		requests.clear();
		await trackSettling(opened.context);
		await opened.context.addInitScript(installReader);
		await opened.context.addInitScript(holdWrites);
		opened.context.on('page', (other) => {
			if (other === opened.page) return;
			stop('window', other.url());
			other.close().catch(() => {});
		});
		opened.page.on('request', (r) => void requests.set(r, Date.now()));
		const ended = (r: Request) => void (requests.delete(r) && (lastEnded = Date.now()));
		opened.page.on('requestfinished', ended);
		opened.page.on('requestfailed', ended);
		opened.page.on('download', (d) => (stop('download', d.suggestedFilename()), d.cancel().catch(() => {})));
		opened.page.on('dialog', (d) => (stop('dialog', d.message().slice(0, 80)), d.dismiss().catch(() => {})));
		opened.page.on('framenavigated', (frame) => {
			if (frame === opened.page.mainFrame() && frame.url() !== url) movedTo = frame.url();
		});
	};
	const read = () => at().evaluate(() => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.read());
	const forget = () => at().evaluate(() => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.forget());
	const announcedSince = () => at().evaluate(() => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.announced());
	const diff = (a: number, b: number, ignore: readonly string[], pressed: string) => at().evaluate(([a, b, ignore, pressed]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.diff(a, b, ignore, pressed), [a, b, ignore, pressed] as const);
	// What a press tried that would leave the page or write: the press is stopped, the page after it unknown. An address
	// the same document took (a filter written to the URL) is a change of the page, not a navigation.
	const looked = async (changes: Change[]) => {
		const tried = await at().evaluate(() => (globalThis as { __mmWrites__?: string[] }).__mmWrites__?.splice(0) ?? []).catch((): string[] => []);
		const held = session?.log.writes.slice(writesSeen) ?? [];
		writesSeen += held.length;
		const write = tried[0] ?? held[0]?.line;
		if (write) stop('blocked', write);
		if (movedTo !== undefined) {
			const same = (await at().evaluate(() => (globalThis as { __mmDoc__?: string }).__mmDoc__).catch(() => undefined)) === docId;
			if (same) changes.push({ at: 'the address', what: 'address', before: new URL(url).pathname + new URL(url).search, after: new URL(movedTo).pathname + new URL(movedTo).search });
			else stop('navigates', new URL(movedTo).pathname);
			movedTo = undefined;
		}
	};
	const load = async () => {
		await open();
		await loadPage(at(), url);
		// A local copy that redirects elsewhere is not a local copy any more.
		assertLocal(at().url());
		await settleLoad(at());
		await at().evaluate(() => scrollTo(0, 0));
		await finishAnimations(at());
		await scriptsStill(at(), SCRIPTS_STILL_CAP_MS).catch(() => undefined);
		// Set from here, not by the page: capture's environment fixes the page's Math.random, so a page-made id repeats.
		docId = `${Date.now()}-${reloads}`;
		await at().evaluate((id) => void ((globalThis as { __mmDoc__?: string }).__mmDoc__ = id), docId);
		stopped = undefined;
		movedTo = undefined;
		writesSeen = session?.log.writes.length ?? 0;
	};
	const frames = () => at().evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
	// scriptsStill's test on the same settle tracker, polled in the page, then what still moves finished: a transition
	// half run reads as a state of its own.
	const still = async () => {
		await at().mouse.move(0, 0);
		await at()
			.waitForFunction(
				([cap, quiet, t0]) => {
					const seen = (globalThis as { __mmSettle__?: (within: number) => { busy: number; still: number } }).__mmSettle__?.(Math.max(0, cap - (performance.now() - t0)));
					return !seen || (seen.busy === 0 && seen.still >= quiet);
				},
				[SCRIPTS_STILL_CAP_MS, STILL_MS, await at().evaluate(() => performance.now())] as const,
				{ polling: 50, timeout: SCRIPTS_STILL_CAP_MS },
			)
			.catch(() => undefined);
		await finishAnimations(at()).catch(() => {});
	};
	const find = () => at().evaluate(findCandidates, { destructive: DESTRUCTIVE.source, reveals: REVEAL_CLICKS, toggles: TOGGLE_CONTROLS, repeats: REPEATS });
	const controls: PressedControl[] = [];
	let candidates: Candidate[] = [];
	let excluded: Record<string, number> = {};
	let repeats: Record<string, number> = {};
	let left: LeftControl[] = [];
	let drift: string[] = [];
	let reloads = 0;
	let cut = false;
	const budget = options.maxPresses ?? MAX_PAGE_PRESSES;
	const hang = options.hangMs ?? HANG_MS;
	let presses = 0;
	const hung = () => {
		if (Date.now() - started > hang) throw new Error(`stopped after ${hang / 1000} s on the page: it stopped answering`);
	};
	try {
		await load();
		({ candidates, excluded, repeats, left } = await find());
		if (candidates.length > MAX_CONTROLS) excluded[`past ${MAX_CONTROLS} on the page`] = candidates.length - MAX_CONTROLS;
		const idle = await read();
		// An observation window, not a settle: what a page changes on its own (a clock's tick) shows only over time.
		await at().waitForTimeout(DRIFT_WATCH_MS);
		drift = (await diff(idle, await read(), [], '')).changed;
		let fresh = true;
		// The reading a control that left the page as it found it ended on: what changed from it before the next press is the page's own.
		let lastRead: number | undefined;
		// Per stateful control, the elements its first press changed: one that changed only what the page changes by itself is inert.
		const moved = new Map<number, string[]>();
		const pending: [number, string][] = [];
		const name = async () => {
			const sigs = await at().evaluate(sigsAt, pending.map(([, path]) => path));
			for (const [i, [index, path]] of pending.entries()) {
				const sig = sigs[i];
				const control = controls[index];
				if (sig && control) controls[index] = { ...control, holder: { path, at: sig } };
			}
			pending.splice(0);
		};
		for (const [index, c] of candidates.slice(0, MAX_CONTROLS).entries()) {
			hung();
			if (presses >= budget) {
				excluded[`past ${budget} presses on the page`] = Math.min(candidates.length, MAX_CONTROLS) - index;
				cut = true;
				break;
			}
			const base = { sig: c.sig, nth: c.nth, labelSig: c.labelSig, pair: c.pair, name: c.name, found: c.found, ancestors: c.ancestors };
			// The same control (signature and name) in another place, once REPEATS of it did the same kind of thing, is counted like the first.
			const alike = controls.filter((p) => p.sig === c.sig && p.name === c.name);
			const [like] = alike;
			const kind = (p: PressedControl) => `${p.shape}|${(p.changes ?? []).map((x) => x.what).join(',')}`;
			if (like && alike.length >= REPEATS && alike.every((p) => kind(p) === kind(like))) {
				repeats[`${like.sig}#${like.nth}`] = (repeats[`${like.sig}#${like.nth}`] ?? 0) + 1;
				excluded['same as a control pressed'] = (excluded['same as a control pressed'] ?? 0) + 1;
				continue;
			}
			if (!fresh) {
				await load();
				reloads++;
				await find();
				await name();
				lastRead = await read();
			}
			fresh = true;
			const control = at().locator(`[data-mm-discover="${index}"]`).first();
			if (!(await control.count())) {
				controls.push({ ...base, shape: 'unpressable', why: 'not on the page once loaded again' });
				continue;
			}
			await control.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
			// What covers the control's centre takes a click there: one a click cannot reach is named at once, not after the click's timeout.
			const covered = await control
				.evaluate((el) => {
					const r = el.getBoundingClientRect();
					const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
					return !r.width || !r.height ? 'it has no size' : hit && hit !== el && !el.contains(hit) && !hit.contains(el) ? `covered at its centre by ${hit.tagName.toLowerCase()}` : hit ? '' : 'its centre is off the page';
				})
				.catch(() => 'it went from the page');
			if (covered) {
				controls.push({ ...base, shape: 'unpressable', why: `the press did not reach it: ${covered}` });
				continue;
			}
			// Focus left on the last control would move with this press: its ring going is not this press's doing.
			await at().evaluate(() => (document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement.blur() : undefined));
			await frames();
			await still();
			const pressed = await control.evaluate((el) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.path(el)).catch(() => '');
			// What changed since the last control's last reading, with no press between: the page's own (a clock), never a press's.
			if (lastRead !== undefined) drift = [...new Set([...drift, ...(await diff(lastRead, await read(), [], pressed)).changed])];
			await forget();
			await announcedSince();
			const states = [await read()];
			lastRead = undefined;
			const press = async (): Promise<boolean> => {
				presses++;
				const since = Date.now();
				const ok = await control.click({ timeout: 5000 }).then(
					() => true,
					() => false,
				);
				// What a press fetched (a chunk, a GET it waits on) comes before the page is read.
				await pressedRequestsDone(since).catch(() => {});
				return ok;
			};
			const changesFrom = (a: number, b: number) => diff(a, b, drift, pressed);
			if (!(await press())) {
				controls.push({ ...base, shape: 'unpressable', why: 'the press did not reach it' });
				fresh = false;
				continue;
			}
			await at().mouse.move(0, 0);
			await frames();
			const quick = await changesFrom(states[0] ?? 0, await read());
			await still();
			let settled = await read();
			if (!stopped && (await changesFrom(states[0] ?? 0, settled)).changed.length) {
				await settle(at(), LATE_MARKS_MS);
				await still();
				settled = await read();
			}
			const announced = await announcedSince();
			const address: Change[] = [];
			await looked(address);
			if (address.length) fresh = false;
			if (stopped) {
				const s = stopped as { shape: Stopped; why: string };
				controls.push({ ...base, shape: s.shape, why: s.why });
				fresh = false;
				continue;
			}
			const first = await changesFrom(states[0] ?? 0, settled);
			const said: Change[] = [...address, ...announced.map((a): Change => ({ at: a.slice(0, a.indexOf(':')), what: 'announced', after: a.slice(a.indexOf(':') + 2) }))];
			if (!first.changed.length && !quick.changed.length && !said.length) {
				controls.push({ ...base, shape: 'inert' });
				lastRead = settled;
				continue;
			}
			if (!first.changed.length) {
				// What only showed while the pointer was on the control (a tooltip) is the hover's, not the press's.
				await control.hover({ timeout: 2000 }).catch(() => {});
				await frames();
				await scriptsStill(at(), SCRIPTS_STILL_CAP_MS).catch(() => undefined);
				const hovered = (await changesFrom(states[0] ?? 0, await read())).changed;
				await still();
				const own = quick.changed.filter((p) => !hovered.some((h) => p === h || p.startsWith(`${h}>`)));
				if (!own.length && !said.length) {
					controls.push({ ...base, shape: 'inert' });
					lastRead = await read();
				} else {
					if (!said.length) moved.set(controls.length, own);
					controls.push({ ...base, shape: 'transient', states: 2, changes: [...quick.changes, ...said].slice(0, KEPT_CHANGES) });
				}
				continue;
			}
			fresh = false;
			let back: number | undefined;
			states.push(settled);
			const holder = holderPath(pressed, first.changed);
			let shape: Shape | undefined;
			for (let n = 2; n <= MAX_PRESSES && !shape; n++) {
				hung();
				await press();
				await still();
				await settle(at(), LATE_MARKS_MS);
				await still();
				await looked([]);
				if (stopped) break;
				const now = await read();
				let same = -1;
				for (const [i, s] of states.entries()) if (!(await changesFrom(s, now)).changed.length) same = i;
				if (same === 0) {
					shape = n === 2 ? 'toggle' : 'cycle';
					// Back to the reading the page loaded with, the pressed control's own look included: no reload is needed before the next control.
					const start = states[0];
					if (start !== undefined && !(await diff(start, now, drift, '')).changed.length) back = now;
				}
				else if (same === states.length - 1) shape = 'one-way';
				else if (same > 0) shape = 'sequence';
				else states.push(now);
			}
			if (stopped) {
				const s = stopped as { shape: Stopped; why: string };
				controls.push({ ...base, shape: s.shape, why: `${s.why}, on a later press` });
				continue;
			}
			if (holder) pending.push([controls.length, holder]);
			moved.set(controls.length, said.length ? [] : first.changed);
			controls.push({ ...base, shape: shape ?? 'sequence', states: states.length, changes: [...first.changes, ...said].slice(0, KEPT_CHANGES) });
			if (back !== undefined) {
				fresh = true;
				lastRead = back;
			}
		}
		// What the page turned out to change by itself (learned between controls) is taken back from every press it fooled: by the same element only.
		for (const [index, paths] of moved) {
			const control = controls[index];
			if (control && paths.length && paths.every((p) => drift.includes(p))) controls[index] = { ...control, shape: 'inert', changes: [], states: 1 };
		}
		if (pending.length) {
			await load();
			await name();
		}
	} catch (error) {
		const message = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
		return { route, browser: `chromium ${browser.version()}`, candidates: candidates.length, excluded, ...(Object.keys(repeats).length ? { repeats } : {}), ...(left.length ? { left } : {}), controls, drift: drift.length, reloads, ms: Date.now() - started, error: message };
	} finally {
		await session?.context.close().catch(() => {});
	}
	const facts: DiscoverFacts = { route, browser: `chromium ${browser.version()}`, candidates: candidates.length, excluded, ...(Object.keys(repeats).length ? { repeats } : {}), ...(left.length ? { left } : {}), controls, drift: drift.length, reloads, ms: Date.now() - started, ...(cut ? { cut: true } : {}) };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ ...facts, ...(options.page ? { page: options.page } : {}) }));
	return facts;
}

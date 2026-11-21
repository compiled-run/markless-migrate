// Presses each control of an original page no recorder takes and keeps what each press visibly or audibly changed.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page, Request } from 'playwright';
import { isLoopback, openPage, type OpenPage } from '../check/browser.ts';
import { LAYOUT_LANDMARKS } from '../check/landmarks.ts';
import { COMPOSITE_ROLES } from '../check/patterns.ts';
import { settle as settleLoad } from '../check/capture.ts';
import { DESTRUCTIVE } from '../check/destructive.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { captureEnv } from '../convert/capture-env.ts';
import { SCRIPTS_STILL_CAP_MS } from '../convert/capture.ts';
import { LATE_MARKS_MS, REVEAL_CLICKS } from '../convert/reveal.ts';
import { POLL_MS, STILL_MS, trackSettling } from '../convert/settle.ts';
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
	/** What the same control on other routes is grouped by (Candidate.group). */
	readonly group?: string;
	/** Not pressed here: counted from the route that owns its group, whose result (by hash) it carries. */
	readonly sameAs?: { readonly route: string; readonly hash: string };
	/**
	 * Where what the press changed sits: the nearest element holding the control and every element it changed, as its path
	 * from the body (`body>div2>main1`: tag and occurrence among its siblings of that tag) and its sig#nth.
	 */
	readonly holder?: {
		readonly path: string;
		readonly at: string;
		readonly canvas?: boolean;
		/** Elements inside it. */
		readonly size?: number;
		/** Each ancestor's sig#nth, nearest first, as the page loaded. */
		readonly ancestors?: readonly string[];
		/** `shortKey` of every element inside it and itself, as the page loaded: to check it against what other recordings own. */
		readonly inside?: readonly string[];
		/** An ARIA widget a part drives on the way from it to an element the presses changed (a listbox, a menu). */
		readonly widget?: string;
		/** It is, or holds, the body, main or a layout landmark: a page region, never a demo. */
		readonly landmark?: boolean;
		/** The landmark it holds, when it is not one itself. */
		readonly holds?: string;
	};
	/** Pressed again from a fresh load, it left another page (a time, a random value): a scene would replay one of them. */
	readonly unsteady?: boolean;
	/** The control's own path from the body, as the page loaded. */
	readonly path?: string;
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
	/** Each of those repeats, by the sig#nth of the one pressed in their place: every one is asked of the written port. */
	readonly repeatsOf?: Readonly<Record<string, readonly RepeatOf[]>>;
	/** Pressables left to the reveals or the toggles by their own selectors: checked against what those recorded. */
	readonly left?: readonly LeftControl[];
	/** Controls another recording's control list uses: not pressed. */
	readonly claimedSkipped?: number;
	/** Every group the page shows, counted or pressed: what later routes are owned by. */
	readonly groups?: readonly string[];
	/** Spot checks whose press did another thing than the owner's: that group's counts are not trusted. */
	readonly spotMismatch?: readonly { readonly name: string; readonly owner: string; readonly group: string }[];
	/** The press budget ended the presses before every control: the same page is cut at the same control every time. */
	readonly cut?: boolean;
	/** Elements that changed with no press (a clock, an autoplaying carousel): never counted as a press's change. */
	readonly drift: number;
	readonly reloads: number;
	readonly ms: number;
	readonly error?: string;
}

/** What the route's other recordings use, by their control lists: theirs, so never pressed. */
export interface Claimed {
	/** sig#nth. */
	readonly controls: readonly string[];
	readonly names: readonly string[];
	/** Widgets a recording ports whole, sig#nth: a control inside one is pressed here, never counted from another route. */
	readonly holders?: readonly string[];
}

/** The same control across routes: the first route in the convert's order that shows a group presses it; later ones count from it. */
export interface Shared {
	/** This route's groups, announced; resolves, once every earlier route announced its own, to the earlier owner of each group that has one. */
	owners(groups: readonly string[]): Promise<ReadonlyMap<string, string>>;
	/** The owner's result for a group, once it pressed it (undefined when it did not). */
	result(owner: string, group: string): Promise<PressedControl | undefined>;
	publish(group: string, control: PressedControl | undefined): void;
	/** The route is recorded in this run (its result comes from it), not only kept in the store from another shard's. */
	inRun(route: string): boolean;
	/** The route comes before this one in this run's order: only such a route's result is waited for. */
	earlier(route: string): boolean;
	/** The group may be counted at all (a spot check has not found it counted wrongly). */
	counts(group: string): boolean;
	/** About one route in ten, chosen by its path, presses one counted control of each group anyway and compares it with the owner's. */
	readonly spot: boolean;
	done(): void;
}

/** A pressed result as the kind of thing it did: its shape and what changed, text and all. */
export const resultHash = (c: Pick<PressedControl, 'shape' | 'states' | 'changes'>): string => createHash('sha256').update(JSON.stringify([c.shape, c.states ?? 0, (c.changes ?? []).map((x) => [x.what, x.name ?? '', x.before ?? '', x.after ?? ''])])).digest('base64url').slice(0, 12);

// (b) a layout landmark's control on a route whose landmark has the same markup; (a) elsewhere only a transient or a focus or scroll move, never an inert or unpressable result, which says something of the owner's page only.
const countable = (c: PressedControl, layout: boolean): boolean => c.shape !== 'unpressable' && (layout || c.shape === 'transient' || (c.shape !== 'inert' && Boolean(c.changes?.length) && (c.changes ?? []).every((x) => x.what === 'focus' || x.what === 'scroll')));

export interface DiscoverOptions {
	readonly claimed?: Claimed;
	readonly shared?: Shared;
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
		const real = HTMLFormElement.prototype[name];
		Object.defineProperty(HTMLFormElement.prototype, name, {
			configurable: true,
			writable: true,
			value: function (this: HTMLFormElement, ...a: unknown[]) {
				if (!write(this.method)) return Reflect.apply(real, this, a);
				writes.push(`${this.method.toUpperCase()} ${path(this.action)}`);
			},
		});
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

/** The context's one init script: the write guard first, in its own try, so a reader that throws cannot leave the page unguarded. */
export const pageScripts = (): string => `try { (${holdWrites.toString()})(); } finally { (${installReader.toString()})(${JSON.stringify(WIDGET_ROLES)}); }`;

/** In every document of the context: reads the page for comparison, and keeps what live regions announce between reads. */
function installReader(widgets: readonly string[]): void {
	type Entry = { d: string; a: string; t: string; s: 0 | 1; l: string; c: string; r: string };
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
			const at = paths.get(el);
			if (at !== undefined) out[at] = { d: describe(el), a: attrs, t: text, s: shown ? 1 : 0, l: look, c: scrolled, r: el.getAttribute('role') ?? '' };
			for (const c of el.children) walk(c, shown || css.display === 'contents', moving);
		};
		walk(document.body, true, false);
		const focused = document.activeElement && document.activeElement !== document.body ? (paths.get(document.activeElement) ?? '') : '';
		out['@focus'] = { d: focused, a: '', t: '', s: 1, l: '', c: '', r: '' };
		out['@scroll'] = { d: 'the window', a: '', t: '', s: 1, l: '', c: `${Math.round(scrollY)},${Math.round(scrollX)}`, r: '' };
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
	// The ARIA widgets a part drives, on the way from the body to each changed element (or the element itself), with their depth.
	const WIDGETS = new Set(widgets);
	const widgetsOn = (index: number, keys: readonly string[]): [number, string][] => {
		const R = readings[index] ?? {};
		const out: [number, string][] = [];
		for (const key of keys) {
			const steps = key.split('>');
			for (let d = 1; d <= steps.length; d++) {
				const role = R[steps.slice(0, d).join('>')]?.r ?? '';
				if (WIDGETS.has(role)) out.push([d, role]);
			}
		}
		return out;
	};
	// A reading as one value, the page's own changes left out: two loads that pressed alike compare equal.
	const hash = (index: number, ignore: readonly string[]): string => {
		const skip = new Set(ignore);
		let h = 2166136261;
		for (const [k, e] of Object.entries(readings[index] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
			if (skip.has(k) || k.startsWith('@') || !e.s) continue;
			for (const c of `${k}\u0000${e.a}\u0000${e.t}\u0000${e.l}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
		}
		return (h >>> 0).toString(16);
	};
	const drain = () => {
		const out = announced;
		announced = [];
		return out;
	};
	const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
	const frames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
	type Settle = (within: number) => { busy: number; still: number; later: number };
	const tracker = (): Settle | undefined => (globalThis as { __mmSettle__?: Settle }).__mmSettle__;
	// No script busy and the document unchanged for `quiet`, polled every 50 ms for at most `cap`; then finite animations finished.
	const finish = () => {
		for (const a of document.getAnimations()) {
			const end = a.playState === 'running' ? a.effect?.getComputedTiming().endTime : undefined;
			if (typeof end === 'number' && Number.isFinite(end) && a.timeline === document.timeline) a.finish();
		}
	};
	const quietFor = async (cap: number, quiet: number) => {
		const t0 = performance.now();
		for (;;) {
			const seen = tracker()?.(Math.max(0, cap - (performance.now() - t0)));
			if (!seen || (seen.busy === 0 && seen.still >= quiet) || performance.now() - t0 >= cap) return;
			await sleep(50);
		}
	};
	const still = async (cap: number, quiet: number) => {
		await quietFor(cap, quiet);
		finish();
	};
	// settle's page side: until nothing is due within `cap` and the document is unchanged for `quiet`; a timer due later waits out `cap`.
	const settled = async (cap: number, quiet: number, poll: number): Promise<'still' | 'later' | 'cap'> => {
		finish();
		const t0 = performance.now();
		for (;;) {
			const left = cap - (performance.now() - t0);
			if (left <= 0) return 'cap';
			const seen = tracker()?.(left);
			if (!seen || seen.later) return (await sleep(left), 'later');
			if (seen.busy === 0 && Math.min(seen.still, performance.now() - t0) >= quiet) return 'still';
			await sleep(Math.min(poll, left));
		}
	};
	const marked = (index: number) => document.querySelector(`[data-mm-discover="${index}"]`);
	const writes = () => (globalThis as { __mmWrites__?: string[] }).__mmWrites__?.splice(0) ?? [];
	const doc = () => (globalThis as { __mmDoc__?: string }).__mmDoc__;
	g.__mmDiscover__ = {
		read,
		diff,
		widgetsOn,
		hash,
		path: (el: Element) => (read(), paths.get(el) ?? ''),
		announced: drain,
		forget: () => void readings.splice(0),
		// Before a press, in one call: the control in view and hit, focus off, the page still, its place, what changed by itself since `lastRead`, and the first reading.
		before: async (index: number, lastRead: number | undefined, cap: number, quiet: number) => {
			const el = marked(index);
			if (!el) return { covered: 'gone' };
			el.scrollIntoView({ block: 'center', inline: 'center' });
			const r = el.getBoundingClientRect();
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			const covered = !r.width || !r.height ? 'it has no size' : hit && hit !== el && !el.contains(hit) && !hit.contains(el) ? `covered at its centre by ${hit.tagName.toLowerCase()}` : hit ? '' : 'its centre is off the page';
			if (covered) return { covered };
			if (document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement) document.activeElement.blur();
			await frames();
			await still(cap, quiet);
			read();
			const pressed = paths.get(el) ?? '';
			const drift = lastRead === undefined ? [] : diff(lastRead, read(), [], pressed).changed;
			readings.splice(0);
			drain();
			return { covered: '', pressed, drift, start: read() };
		},
		// After the first press, in one call: what showed at once, what stayed once the page is still, and what it announced or tried to write.
		after: async (start: number, drift: readonly string[], pressed: string, cap: number, quiet: number) => {
			await frames();
			const quick = diff(start, read(), drift, pressed);
			await still(cap, quiet);
			const now = read();
			return { quick, now, first: diff(start, now, drift, pressed), announced: drain(), writes: writes(), doc: doc() };
		},
		// The page still again and read, with what it announced or tried to write since.
		look: async (start: number, drift: readonly string[], pressed: string, cap: number, quiet: number) => {
			await still(cap, quiet);
			const now = read();
			return { now, first: diff(start, now, drift, pressed), announced: drain(), writes: writes(), doc: doc() };
		},
		settled,
		// What the page changes with no press over `ms`: one reading, a wait, another.
		watch: async (ms: number) => {
			const idle = read();
			await sleep(ms);
			return diff(idle, read(), [], '').changed;
		},
		// After the pointer went to the control: what still shows once its scripts are quiet, then the page still and read.
		hovered: async (start: number, drift: readonly string[], pressed: string, cap: number, quiet: number) => {
			await frames();
			await quietFor(cap, quiet);
			const hovered = diff(start, read(), drift, pressed).changed;
			await still(cap, quiet);
			return { hovered, now: read() };
		},
		// A load's end, in one call: at the top, animations finished, the page still, and the document's id set.
		ready: async (id: string, cap: number, quiet: number) => {
			scrollTo(0, 0);
			await still(cap, quiet);
			(globalThis as { __mmDoc__?: string }).__mmDoc__ = id;
		},
		// After a later press: read once still, and the last earlier reading it matches (-1 for none), and whether it matches the page as loaded, look and all.
		again: async (states: readonly number[], previous: number, drift: readonly string[], pressed: string, cap: number, quiet: number) => {
			await still(cap, quiet);
			const now = read();
			let same = -1;
			for (const [i, at] of states.entries()) if (!diff(at, now, drift, pressed).changed.length) same = i;
			const first = states[0];
			const step = diff(previous, now, drift, pressed).changed;
			return { now, same, home: first !== undefined && !diff(first, now, drift, '').changed.length, step, widgets: widgetsOn(now, step), writes: writes(), doc: doc() };
		},
		// What a stateful first press reached: the widgets on the way to what it changed, and the reading as one value.
		marks: (at: number, changed: readonly string[], drift: readonly string[]) => ({ widgets: widgetsOn(at, changed), hash: hash(at, drift) }),
		// The page still, read as one value.
		stillHash: async (drift: readonly string[], cap: number, quiet: number) => {
			await still(cap, quiet);
			return hash(read(), drift);
		},
	};
}

interface Before {
	covered: string;
	pressed?: string;
	drift?: string[];
	start?: number;
}

interface Diff {
	changed: string[];
	changes: Change[];
}

interface Looked {
	now: number;
	first: Diff;
	announced: string[];
	writes: string[];
	doc: string | undefined;
}

interface Reader {
	read(): number;
	widgetsOn(index: number, keys: readonly string[]): [number, string][];
	hash(index: number, ignore: readonly string[]): string;
	diff(a: number, b: number, ignore: readonly string[], pressed: string): Diff;
	path(el: Element): string;
	announced(): string[];
	forget(): void;
	before(index: number, lastRead: number | undefined, cap: number, quiet: number): Promise<Before>;
	after(start: number, drift: readonly string[], pressed: string, cap: number, quiet: number): Promise<Looked & { quick: Diff }>;
	look(start: number, drift: readonly string[], pressed: string, cap: number, quiet: number): Promise<Looked>;
	settled(cap: number, quiet: number, poll: number): Promise<'still' | 'later' | 'cap'>;
	ready(id: string, cap: number, quiet: number): Promise<void>;
	watch(ms: number): Promise<string[]>;
	hovered(start: number, drift: readonly string[], pressed: string, cap: number, quiet: number): Promise<{ hovered: string[]; now: number }>;
	again(states: readonly number[], previous: number, drift: readonly string[], pressed: string, cap: number, quiet: number): Promise<{ now: number; same: number; home: boolean; step: string[]; widgets: [number, string][]; writes: string[]; doc: string | undefined }>;
	marks(at: number, changed: readonly string[], drift: readonly string[]): { widgets: [number, string][]; hash: string };
	stillHash(drift: readonly string[], cap: number, quiet: number): Promise<string>;
}

interface Candidate {
	readonly sig: string;
	readonly nth: number;
	readonly labelSig: string;
	readonly pair: number;
	readonly name: string;
	readonly found: 'role' | 'cursor';
	readonly ancestors: readonly string[];
	/** What the same control on another route is grouped with: its layout landmark and that landmark's markup, or its surrounding component's tag, slot and role. */
	readonly group: string;
	/** It sits in a layout landmark outside main. */
	readonly layout: boolean;
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
	readonly repeatsOf: Record<string, RepeatOf[]>;
	readonly left: LeftControl[];
}

/** A repeat not pressed, as the written port is searched for it. */
export interface RepeatOf {
	readonly sig: string;
	readonly nth: number;
	readonly labelSig: string;
	readonly pair: number;
	readonly name: string;
	readonly found: PressedControl['found'];
}

/** In the page: every pressable, the ones left alone counted by why, the rest marked `data-mm-discover="<n>"` in document order. */
function findCandidates(o: { readonly destructive: string; readonly reveals: string; readonly toggles: string; readonly repeats: number; readonly landmarks: string }): Found {
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
	const repeatsOf: Record<string, RepeatOf[]> = {};
	const grids = new Map<string, LeftControl>();
	// Each landmark's markup, read before this pass marks any control in it.
	const landmarkHash = new Map<Element, string>();
	for (const landmark of document.body.querySelectorAll(o.landmarks)) {
		let h = 2166136261;
		for (const ch of landmark.outerHTML) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
		landmarkHash.set(landmark, (h >>> 0).toString(16));
	}
	// A repeat: the same signature and name under the same nearest element with a slot, a role or an id.
	const repeat = (el: Element, name: string, found: RepeatOf['found']) => {
		const around = el.parentElement?.closest('[data-slot], [role], [id]');
		const key = `${sigOf(el)}\u0000${name}\u0000${around ? at(around) : ''}`;
		const got = seen.get(key) ?? { n: 0, first: at(el) };
		seen.set(key, { ...got, n: got.n + 1 });
		if (got.n + 1 <= o.repeats) return false;
		repeats[got.first] = (repeats[got.first] ?? 0) + 1;
		(repeatsOf[got.first] ??= []).push({ sig: sigOf(el), nth: order.get(el) ?? 0, labelSig: labelSigOf(el), pair: pairs.get(el) ?? 0, name, found });
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
		} else if (repeat(el, name, byRole ? 'role' : 'cursor')) leave('same as a control pressed');
		else {
			const ancestors: string[] = [];
			for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) ancestors.push(at(up));
			el.setAttribute('data-mm-discover', String(out.length));
			const landmark = el.closest('main, [role="main"]') ? null : el.closest(o.landmarks);
			const around = el.parentElement?.closest('[data-slot], [role], [id]');
			const shape = (e: Element | null | undefined) => (e ? `${e.tagName.toLowerCase()}|${e.getAttribute('data-slot') ?? ''}|${e.getAttribute('role') ?? ''}` : '');
			const group = landmark ? `layout|${shape(landmark)}|${landmarkHash.get(landmark) ?? ''}|${sigOf(el)}|${name}|${order.get(el) ?? 0}` : `component|${shape(around)}|${sigOf(el)}|${name}`;
			out.push({ sig: sigOf(el), nth: order.get(el) ?? 0, labelSig: labelSigOf(el), pair: pairs.get(el) ?? 0, name, found: byRole ? 'role' : 'cursor', ancestors, group, layout: Boolean(landmark) });
		}
	}
	return { candidates: out, excluded, repeats, repeatsOf, left: [...left, ...grids.values()] };
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

/** What holds a press, found on the page as it loads: its sig#nth (what scenes and the emit find it by), ancestors, whether it holds a canvas, and every element inside it. */
function holdersAt({ paths, landmarks }: { paths: readonly string[]; landmarks: string }): { at: string; canvas: boolean; ancestors: string[]; inside: string[]; landmark: boolean; holds?: string }[] {
	const sigOf = (e: Element) => `${e.tagName.toLowerCase()}|${e.getAttribute('data-slot') ?? ''}|${(e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const order = new Map<Element, number>();
	const counts = new Map<string, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	const at = (e: Element) => `${sigOf(e)}#${order.get(e) ?? 0}`;
	// A card's header or a pager's nav is the card's: only main and a landmark no section, article, main, aside or nav holds is the page's.
	const pageLevel = (e: Element) => e.matches('main, [role="main"]') || (e.matches(landmarks) && !e.parentElement?.closest('article, section, main, [role="main"], aside, nav, [role="complementary"], [role="navigation"]'));
	return paths.map((path) => {
		let el: Element | null = document.body;
		for (const step of path.split('>').slice(1)) {
			const [, tag, n] = /^([a-z0-9-]+?)(\d+)$/.exec(step) ?? [];
			el = el ? ([...el.children].filter((c) => c.tagName.toLowerCase() === tag)[Number(n) - 1] ?? null) : null;
		}
		if (!el) return { at: '', canvas: false, ancestors: [], inside: [], landmark: false };
		const ancestors: string[] = [];
		for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) ancestors.push(at(up));
		const inner = [...el.querySelectorAll(`main, [role="main"], ${landmarks}`)].find(pageLevel);
		const holds = inner ? (inner.getAttribute('role') ?? inner.tagName.toLowerCase()) : undefined;
		return { at: at(el), canvas: Boolean(el.querySelector('canvas')), ancestors, inside: [el, ...el.querySelectorAll('*')].filter((e) => !e.closest('template')).map(at), landmark: el === document.body || pageLevel(el) || Boolean(holds), ...(holds ? { holds } : {}) };
	});
}

/** The short key an element's sig#nth is kept under in `holder.inside`. */
export const shortKey = (at: string): string => createHash('sha256').update(at).digest('base64url').slice(0, 10);

const fileOf = (dir: string, route: string) => join(dir, `${createHash('sha256').update(route).digest('hex').slice(0, 16)}.json`);

/** A route's kept result for a group, as its recording in the store has it: a pressed control, never a count. */
async function keptResult(dir: string, route: string, group: string): Promise<PressedControl | undefined> {
	const kept: unknown = await readFile(fileOf(dir, route), 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);
	return isFacts(kept) ? kept.controls.find((c) => c.group === group && !c.sameAs) : undefined;
}

// This route's first pressed result for each group, for the routes that count from it or name it.
function publishPressed(shared: Shared, controls: readonly PressedControl[]): void {
	const seen = new Set<string>();
	for (const c of controls) {
		if (!c.group || c.sameAs || seen.has(c.group)) continue;
		seen.add(c.group);
		shared.publish(c.group, c);
	}
}

/** The widgets a part drives: the composite roles, and the single ones a part opens or moves (a combobox, a slider, a dialog). */
const WIDGET_ROLES: readonly string[] = [...COMPOSITE_ROLES, 'combobox', 'slider', 'dialog', 'alertdialog'];
/** A holder past this many elements is a page section around demos (the carousel docs area, 1,498), never a demo. */
export const MAX_DEMO_ELEMENTS = 600;
/** The most uses a discovered demo's scene records: the busiest demo on the sample (the AI Elements suggestions) recorded 119. */
export const MAX_DEMO_USES = 120;
/** Playwright's wait for a control to take a click (stable, enabled, not covered): what the hit test let through takes it at once. */
const CLICK_MS = 5000;
/** The hover that tells a tooltip's change from the press's: a control that just took a click takes the pointer at once. */
const HOVER_MS = 2000;
/** A step in the page longer than this has stopped answering: it fails the route by name instead of holding every route after it. */
const STEP_MS = 30_000;
const within = <T>(work: Promise<T>, what: string): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<never>((_, fail) => (timer = setTimeout(() => fail(new Error(`stopped: ${what} did not answer within ${STEP_MS / 1000} s`)), STEP_MS)));
	return Promise.race([work, late]).finally(() => clearTimeout(timer));
};

/** Another route's turn: it ends within its own hang guard, which publishes nothing when it fires, so this is longer. */
const OTHER_ROUTE_MS = HANG_MS + STEP_MS;
const waitFor = <T>(work: Promise<T>, what: string): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<never>((_, fail) => (timer = setTimeout(() => fail(new Error(`stopped: ${what} did not come within ${OTHER_ROUTE_MS / 1000} s`)), OTHER_ROUTE_MS)));
	return Promise.race([work, late]).finally(() => clearTimeout(timer));
};

// A page that stopped answering fails the route; any other failure of the step is the control's.
const unlessStalled = <T>(fallback: T) => (error: unknown): T => {
	if (error instanceof Error && error.message.startsWith('stopped:')) throw error;
	return fallback;
};

const isFacts = (x: unknown): x is DiscoverFacts & { page?: string; claims?: string } => typeof x === 'object' && x !== null && typeof (x as DiscoverFacts).route === 'string' && Array.isArray((x as DiscoverFacts).controls) && typeof (x as DiscoverFacts).ms === 'number';

/** Presses each pressable of the page at desktop width up to MAX_PRESSES times; a press that writes, leaves or opens something is stopped and named. */
export async function recordDiscovery(browser: Browser, origin: string, route: string, dir: string, options: DiscoverOptions = {}): Promise<DiscoverFacts> {
	assertLocal(origin);
	const file = fileOf(dir, route);
	const kept: unknown = await readFile(file, 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);
	// The claims a recording was made with are part of its key, by content.
	const claimKey = options.claimed ? createHash('sha256').update(JSON.stringify([[...options.claimed.controls].sort(), [...options.claimed.names].sort(), [...(options.claimed.holders ?? [])].sort()])).digest('hex').slice(0, 16) : '';
	const shared = options.shared;
	if (isFacts(kept) && kept.route === route && kept.page === options.page && (kept.claims ?? '') === claimKey) {
		const { page: _, claims: __, ...facts } = kept;
		if (!shared) return facts;
		// A count stands while the route it names still has that result: from this run if it is recorded here, else its kept recording (another shard's).
		await waitFor(shared.owners(facts.groups ?? []), 'the earlier routes announcing their controls');
		let current = true;
		for (const c of facts.controls) {
			if (!c.sameAs || !c.group) continue;
			const named = c.sameAs.route;
			// A route later in this run's order may itself wait on this one: its count is stale, recorded again.
			const o = !shared.counts(c.group) ? undefined : shared.inRun(named) ? (shared.earlier(named) ? await waitFor(shared.result(named, c.group), `${named}'s result for a counted control`) : undefined) : await keptResult(dir, named, c.group);
			if (!o || resultHash(o) !== c.sameAs.hash) current = false;
		}
		// A recording with a spot mismatch is made again: its group is pressed on every route now.
		if (current && !facts.spotMismatch?.length) {
			publishPressed(shared, facts.controls);
			shared.done();
			return facts;
		}
	}
	const claimedControls = new Set(options.claimed?.controls ?? []);
	const claimedNames = new Set(options.claimed?.names ?? []);
	let claimedSkipped = 0;
	const started = Date.now();
	const url = new URL(route, origin).href;
	// openPage's route holds back every write the page's own guard misses (a worker's, a native form's).
	const env = captureEnv(origin, { sendWrites: false });
	let session: OpenPage | undefined;
	let page: Page | undefined;
	let stopped: { shape: Stopped; why: string } | undefined;
	// Read through a call: a press sets it in a listener, which narrowing cannot see.
	const halted = (): { shape: Stopped; why: string } | undefined => stopped;
	const stop = (shape: Stopped, why: string) => void (stopped ??= { shape, why });
	let movedTo: string | undefined;
	let docId = '';
	let writesSeen = 0;
	// The page's open requests by when each started: a press waits only on those it started, never on one the page holds open.
	const requests = new Map<Request, number>();
	let lastEnded = 0;
	let requestMoved: (() => void) | undefined;
	// Until no request started since `since` is open and none ended for STILL_MS, at most `cap`: woken by the requests' own events.
	const requestsDone = (since: number, cap: number) =>
		new Promise<void>((done) => {
			const t0 = Date.now();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const check = () => {
				clearTimeout(timer);
				const open = [...requests.values()].some((t) => t >= since);
				const quiet = lastEnded >= since ? STILL_MS - (Date.now() - lastEnded) : 0;
				const left = cap - (Date.now() - t0);
				if (left <= 0 || (!open && quiet <= 0)) {
					requestMoved = undefined;
					return done();
				}
				requestMoved = check;
				timer = setTimeout(check, open ? left : Math.min(quiet, left));
			};
			check();
		});
	const at = (): Page => {
		if (!page) throw new Error('discovery: no page open');
		return page;
	};
	let over = false;
	const open = async () => {
		await session?.context.close().catch(() => {});
		const opened = await openPage(browser, env, VIEWPORT);
		// A load the hang guard gave up on opens nothing that outlives the route.
		if (over) {
			await opened.context.close().catch(() => {});
			throw new Error('discovery: the route ended');
		}
		session = opened;
		page = opened.page;
		writesSeen = 0;
		requests.clear();
		await trackSettling(opened.context);
		await opened.context.addInitScript({ content: pageScripts() });
		opened.context.on('page', (other) => {
			if (other === opened.page) return;
			stop('window', other.url());
			other.close().catch(() => {});
		});
		opened.page.on('request', (r) => (requests.set(r, Date.now()), requestMoved?.()));
		const ended = (r: Request) => void (requests.delete(r) && ((lastEnded = Date.now()), requestMoved?.()));
		opened.page.on('requestfinished', ended);
		opened.page.on('requestfailed', ended);
		opened.page.on('download', (d) => (stop('download', d.suggestedFilename()), d.cancel().catch(() => {})));
		opened.page.on('dialog', (d) => (stop('dialog', d.message().slice(0, 80)), d.dismiss().catch(() => {})));
		opened.page.on('framenavigated', (frame) => {
			if (frame === opened.page.mainFrame() && frame.url() !== url) movedTo = frame.url();
		});
	};
	const read = () => within(at().evaluate(() => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.read()), 'reading the page');
	// A write or another document stops the press; an address the same document took (a filter in the URL) is a change.
	const looked = (seen: { writes: readonly string[]; doc: string | undefined }, changes: Change[]) => {
		const held = session?.log.writes.slice(writesSeen) ?? [];
		writesSeen += held.length;
		const write = seen.writes[0] ?? held[0]?.line;
		if (write) stop('blocked', write);
		if (movedTo !== undefined) {
			if (seen.doc === docId) changes.push({ at: 'the address', what: 'address', before: new URL(url).pathname + new URL(url).search, after: new URL(movedTo).pathname + new URL(movedTo).search });
			else stop('navigates', new URL(movedTo).pathname);
			movedTo = undefined;
		}
	};
	// A step cut by the page's own navigation is asked once more, of the page it went to, which tells the press that it left.
	const inPage = async <T>(what: string, work: () => Promise<T>): Promise<T> => {
		try {
			return await within(work(), what);
		} catch (error) {
			if (!(error instanceof Error && error.message.includes('Execution context was destroyed'))) throw error;
			return within(work(), what);
		}
	};
	const load = () => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const late = new Promise<never>((_, fail) => (timer = setTimeout(() => fail(new Error(`stopped after ${hang / 1000} s on the page: it did not finish loading`)), Math.max(0, hang - (Date.now() - started)))));
		return Promise.race([loadOnce(), late]).finally(() => clearTimeout(timer));
	};
	const loadOnce = async () => {
		await open();
		await loadPage(at(), url);
		// A local copy that redirects elsewhere is not a local copy any more.
		assertLocal(at().url());
		await settleLoad(at());
		// Set from here, not by the page: capture's environment fixes the page's Math.random, so a page-made id repeats.
		docId = `${Date.now()}-${reloads}`;
		await inPage('the page settling', () => at().evaluate(([id, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.ready(id, cap, quiet), [docId, SCRIPTS_STILL_CAP_MS, STILL_MS] as const));
		stopped = undefined;
		movedTo = undefined;
		writesSeen = session?.log.writes.length ?? 0;
	};
	const find = () => within(at().evaluate(findCandidates, { destructive: DESTRUCTIVE.source, reveals: REVEAL_CLICKS, toggles: TOGGLE_CONTROLS, repeats: REPEATS, landmarks: LAYOUT_LANDMARKS }), 'finding the controls');
	const controls: PressedControl[] = [];
	let owners: ReadonlyMap<string, string> = new Map();
	const holders = new Set(options.claimed?.holders ?? []);
	const spotted = new Set<string>();
	const spots: { key: string; owner: string; o: PressedControl }[] = [];
	const spotMismatch: { name: string; owner: string; group: string }[] = [];
	let candidates: Candidate[] = [];
	let excluded: Record<string, number> = {};
	let repeats: Record<string, number> = {};
	let repeatsOf: Record<string, RepeatOf[]> = {};
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
		({ candidates, excluded, repeats, repeatsOf, left } = await find());
		owners = shared ? await waitFor(shared.owners(candidates.map((c) => c.group)), 'the earlier routes announcing their controls') : new Map();
		if (candidates.length > MAX_CONTROLS) excluded[`past ${MAX_CONTROLS} on the page`] = candidates.length - MAX_CONTROLS;
		// An observation window, not a settle: what a page changes on its own (a clock's tick) shows only over time.
		drift = await inPage('watching the page', () => at().evaluate((ms) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.watch(ms), DRIFT_WATCH_MS));
		let fresh = true;
		// The reading a control that left the page as it found it ended on: what changed from it before the next press is the page's own.
		let lastRead: number | undefined;
		// Per stateful control, the elements its first press changed: one that changed only what the page changes by itself is inert.
		const moved = new Map<number, string[]>();
		// Holders are named on the page as it loads, before any press changed their text.
		const pending: { at: number; path: string; widget?: string }[] = [];
		const name = async () => {
			const found = await within(at().evaluate(holdersAt, { paths: pending.map((h) => h.path), landmarks: LAYOUT_LANDMARKS }), 'naming the holders');
			for (const [i, h] of pending.entries()) {
				const got = found[i];
				const control = controls[h.at];
				if (!got?.at || !control) continue;
				controls[h.at] = { ...control, holder: { path: h.path, at: got.at, ...(got.canvas ? { canvas: true } : {}), size: got.inside.length, ancestors: got.ancestors, inside: [...new Set(got.inside.map(shortKey))], ...(h.widget ? { widget: h.widget } : {}), ...(got.landmark ? { landmark: true } : {}), ...(got.holds ? { holds: got.holds } : {}) } };
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
			if (claimedControls.has(`${c.sig}#${c.nth}`) || claimedNames.has(c.name)) {
				claimedSkipped++;
				continue;
			}
			const base = { sig: c.sig, nth: c.nth, labelSig: c.labelSig, pair: c.pair, name: c.name, found: c.found, ancestors: c.ancestors, group: c.group };
			// The same control (signature and name) in another place, once REPEATS of it did the same kind of thing, is counted like the first.
			const alike = controls.filter((p) => p.sig === c.sig && p.name === c.name);
			const [like] = alike;
			const kind = (p: PressedControl) => `${p.shape}|${(p.changes ?? []).map((x) => x.what).join(',')}`;
			if (like && alike.length >= REPEATS && alike.every((p) => kind(p) === kind(like))) {
				repeats[`${like.sig}#${like.nth}`] = (repeats[`${like.sig}#${like.nth}`] ?? 0) + 1;
				(repeatsOf[`${like.sig}#${like.nth}`] ??= []).push({ sig: c.sig, nth: c.nth, labelSig: c.labelSig, pair: c.pair, name: c.name, found: c.found });
				excluded['same as a control pressed'] = (excluded['same as a control pressed'] ?? 0) + 1;
				continue;
			}
			const owner = owners.get(c.group);
			if (shared && owner && !c.ancestors.some((a) => holders.has(a))) {
				const o = await waitFor(shared.result(owner, c.group), `${owner}'s result for a counted control`);
				if (o && countable(o, c.layout)) {
					if (!shared.spot || spotted.has(c.group)) {
						controls.push({ ...base, shape: o.shape, ...(o.states ? { states: o.states } : {}), ...(o.changes ? { changes: o.changes } : {}), sameAs: { route: owner, hash: resultHash(o) } });
						continue;
					}
					spotted.add(c.group);
					spots.push({ key: `${c.sig}#${c.nth}`, owner, o });
				}
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
			await within(at().mouse.move(0, 0), 'moving the pointer away');
			// In view at once (Playwright's own scroll waits for a visibility an unpressable control never gets), hit-tested at its centre, focus off the last control, the page still.
			const ready = await inPage('reading the page before the press', () =>
				at().evaluate(([i, last, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.before(i, last ?? undefined, cap, quiet), [index, lastRead ?? null, SCRIPTS_STILL_CAP_MS, STILL_MS] as const),
			).catch(unlessStalled<Before>({ covered: 'it went from the page' }));
			if (ready.covered === 'gone') {
				controls.push({ ...base, shape: 'unpressable', why: 'not on the page once loaded again' });
				continue;
			}
			if (ready.covered) {
				controls.push({ ...base, shape: 'unpressable', why: `the press did not reach it: ${ready.covered}` });
				continue;
			}
			const pressed = ready.pressed ?? '';
			// What changed since the last control's last reading, with no press between: the page's own (a clock), never a press's.
			if (lastRead !== undefined) drift = [...new Set([...drift, ...(ready.drift ?? [])])];
			const states = [ready.start ?? 0];
			lastRead = undefined;
			let since = 0;
			const press = async (): Promise<boolean> => {
				presses++;
				since = Date.now();
				const ok = await control.click({ timeout: CLICK_MS }).then(
					() => true,
					() => false,
				);
				// What a press fetched (a chunk, a GET it waits on) comes before the page is read.
				await requestsDone(since, SCRIPTS_STILL_CAP_MS);
				return ok;
			};
			// settle's wait for late marks: the page's side in the page, the requests this press started from their events.
			const lateMarks = async () => {
				const t0 = Date.now();
				for (;;) {
					const left = LATE_MARKS_MS - (Date.now() - t0);
					if (left <= 0) return;
					const how = await inPage('waiting for late marks', () => at().evaluate(([cap, quiet, poll]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.settled(cap, quiet, poll), [left, STILL_MS, POLL_MS] as const));
					const busy = [...requests.values()].some((t) => t >= since) || (lastEnded >= since && Date.now() - lastEnded < STILL_MS);
					if (how !== 'still' || !busy) return;
					await requestsDone(since, LATE_MARKS_MS - (Date.now() - t0));
				}
			};
			if (!(await press())) {
				controls.push({ ...base, shape: 'unpressable', why: 'the press did not reach it' });
				fresh = false;
				continue;
			}
			const start = states[0] ?? 0;
			await within(at().mouse.move(0, 0), 'moving the pointer away');
			const seen = await inPage('reading the press', () => at().evaluate(([start, drift, pressed, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.after(start, drift, pressed, cap, quiet), [start, drift, pressed, SCRIPTS_STILL_CAP_MS, STILL_MS] as const));
			const { quick } = seen;
			let { now: settled, first } = seen;
			const announced = [...seen.announced];
			const tried = [...seen.writes];
			let doc = seen.doc;
			if (!stopped && first.changed.length) {
				await lateMarks();
				const late = await inPage('reading the press once late marks are in', () => at().evaluate(([start, drift, pressed, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.look(start, drift, pressed, cap, quiet), [start, drift, pressed, SCRIPTS_STILL_CAP_MS, STILL_MS] as const));
				({ now: settled, first } = late);
				announced.push(...late.announced);
				tried.push(...late.writes);
				doc = late.doc;
			}
			const address: Change[] = [];
			looked({ writes: tried, doc }, address);
			if (address.length) fresh = false;
			const stopFirst = halted();
			if (stopFirst) {
				controls.push({ ...base, shape: stopFirst.shape, why: stopFirst.why });
				fresh = false;
				continue;
			}
			const said: Change[] = [...address, ...announced.map((a): Change => ({ at: a.slice(0, a.indexOf(':')), what: 'announced', after: a.slice(a.indexOf(':') + 2) }))];
			if (!first.changed.length && !quick.changed.length && !said.length) {
				controls.push({ ...base, shape: 'inert' });
				lastRead = settled;
				continue;
			}
			if (!first.changed.length) {
				// What only showed while the pointer was on the control (a tooltip) is the hover's, not the press's.
				await control.hover({ timeout: HOVER_MS }).catch(() => {});
				const { hovered, now } = await inPage('reading the hover', () => at().evaluate(([start, drift, pressed, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.hovered(start, drift, pressed, cap, quiet), [start, drift, pressed, SCRIPTS_STILL_CAP_MS, STILL_MS] as const));
				const own = quick.changed.filter((p) => !hovered.some((h) => p === h || p.startsWith(`${h}>`)));
				if (!own.length && !said.length) {
					controls.push({ ...base, shape: 'inert' });
					lastRead = now;
				} else {
					if (!said.length) moved.set(controls.length, own);
					controls.push({ ...base, path: pressed, shape: 'transient', states: 2, changes: [...quick.changes, ...said].slice(0, KEPT_CHANGES) });
				}
				continue;
			}
			fresh = false;
			let back: number | undefined;
			states.push(settled);
			// Everything any press changed, and the widgets on the way to it: what holds the control is sized from them all.
			const all = new Set(first.changed);
			// The page's own changes are learned as the route goes: the hash leaves out what is known by then.
			const marks = await inPage('reading what the press reached', () => at().evaluate(([at, changed, drift]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.marks(at, changed, drift), [settled, first.changed, drift] as const));
			const widgets = [...marks.widgets];
			let previous = settled;
			let shape: Shape | undefined;
			for (let n = 2; n <= MAX_PRESSES && !shape; n++) {
				hung();
				await press();
				await within(at().mouse.move(0, 0), 'moving the pointer away');
				await lateMarks();
				const after = await inPage('reading a later press', () => at().evaluate(([states, previous, drift, pressed, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.again(states, previous, drift, pressed, cap, quiet), [states, previous, drift, pressed, SCRIPTS_STILL_CAP_MS, STILL_MS] as const));
				looked(after, []);
				if (halted()) break;
				const { now, same } = after;
				for (const k of after.step) all.add(k);
				widgets.push(...after.widgets);
				previous = now;
				if (same === 0) {
					shape = n === 2 ? 'toggle' : 'cycle';
					// Back to the reading the page loaded with, the pressed control's own look included: no reload is needed before the next control.
					if (after.home) back = now;
				}
				else if (same === states.length - 1) shape = 'one-way';
				else if (same > 0) shape = 'sequence';
				else states.push(now);
			}
			const stopLater = halted();
			if (stopLater) {
				controls.push({ ...base, shape: stopLater.shape, why: `${stopLater.why}, on a later press` });
				continue;
			}
			const holder = holderPath(pressed, [...all]);
			if (holder) {
				const depth = holder.split('>').length;
				const widget = widgets.find(([d]) => d >= depth)?.[1];
				pending.push({ at: controls.length, path: holder, ...(widget ? { widget } : {}) });
			}
			moved.set(controls.length, said.length ? [] : first.changed);
			controls.push({ ...base, path: pressed, shape: shape ?? 'sequence', states: states.length, changes: [...first.changes, ...said].slice(0, KEPT_CHANGES) });
			// The first press again, from a fresh load: one that leaves another page is not one a scene can replay.
			// Only a lasting markup change outside the layout could get a scene: only that is pressed again.
			if (presses < budget && !c.layout && first.changes.some((x) => x.what !== 'focus' && x.what !== 'scroll')) {
				back = undefined;
				hung();
				await load();
				reloads++;
				await find();
				await name();
				// Named by now: a holder a scene refuses anyway (a page region, too large, a widget's) is not pressed again.
				const h = controls[controls.length - 1]?.holder;
				const refused = !h || h.landmark || (h.size ?? 0) > MAX_DEMO_ELEMENTS || h.widget;
				const ready = refused ? undefined : await inPage('reading the page before the press again', () => at().evaluate(([i, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.before(i, undefined, cap, quiet), [index, SCRIPTS_STILL_CAP_MS, STILL_MS] as const));
				if (ready && ready.covered !== 'gone') {
					presses++;
					since = Date.now();
					await at().locator(`[data-mm-discover="${index}"]`).first().click({ timeout: CLICK_MS }).catch(() => {});
					await requestsDone(since, SCRIPTS_STILL_CAP_MS);
					await within(at().mouse.move(0, 0), 'moving the pointer away');
					await lateMarks();
					const last = controls.length - 1;
					const pressedAgain = controls[last];
					const hash = await inPage('reading the page as one value', () => at().evaluate(([drift, cap, quiet]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.stillHash(drift, cap, quiet), [drift, SCRIPTS_STILL_CAP_MS, STILL_MS] as const));
					if (pressedAgain && hash !== marks.hash) controls[last] = { ...pressedAgain, unsteady: true };
				}
			}
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
		for (const { key, owner, o } of spots) {
			const got = controls.find((c) => `${c.sig}#${c.nth}` === key && !c.sameAs);
			if (got && resultHash(got) !== resultHash(o)) spotMismatch.push({ name: got.name, owner, group: got.group ?? '' });
		}
		if (shared) publishPressed(shared, controls);
	} catch (error) {
		const message = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
		return { route, browser: `chromium ${browser.version()}`, candidates: candidates.length, excluded, ...(Object.keys(repeats).length ? { repeats, repeatsOf } : {}), ...(left.length ? { left } : {}), controls, drift: drift.length, reloads, ms: Date.now() - started, error: message };
	} finally {
		over = true;
		await session?.context.close().catch(() => {});
		shared?.done();
	}
	const facts: DiscoverFacts = { route, browser: `chromium ${browser.version()}`, candidates: candidates.length, excluded, ...(Object.keys(repeats).length ? { repeats, repeatsOf } : {}), ...(left.length ? { left } : {}), controls, drift: drift.length, reloads, ms: Date.now() - started, ...(cut ? { cut: true } : {}), ...(claimedSkipped ? { claimedSkipped } : {}), ...(shared ? { groups: [...new Set(candidates.map((c) => c.group))] } : {}), ...(spotMismatch.length ? { spotMismatch } : {}) };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ ...facts, ...(options.page ? { page: options.page } : {}), ...(claimKey ? { claims: claimKey } : {}) }));
	return facts;
}

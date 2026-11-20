// Presses every control a visitor would press on one page of the original, that no recorder's ARIA contract already uses,
// and keeps what each press visibly or audibly changed: the controls the port would otherwise ship as static markup.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Route } from 'playwright';
import { openPage } from '../check/browser.ts';
import { finishAnimations, settle as settleLoad } from '../check/capture.ts';
import { DESTRUCTIVE } from '../check/destructive.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { captureEnv } from '../convert/capture-env.ts';
import { scriptsStill, settle, trackSettling } from '../convert/settle.ts';

/** How a press changed the page: back by itself, back on the next press, unchanged by the next press, or more states. */
export type Shape = 'inert' | 'transient' | 'toggle' | 'one-way' | 'cycle' | 'sequence';
/** A press whose effect was not read: what stopped it. */
export type Stopped = 'blocked' | 'navigates' | 'window' | 'download' | 'dialog' | 'unpressable';

export interface Change {
	/** The element, as tag, role, data-slot and a few words of its text or label. */
	readonly at: string;
	readonly what: 'text' | 'attribute' | 'added' | 'removed' | 'shown' | 'hidden' | 'look' | 'focus' | 'scroll' | 'announced';
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
	/** Elements that changed with no press (a clock, an autoplaying carousel): never counted as a press's change. */
	readonly drift: number;
	readonly reloads: number;
	readonly ms: number;
	readonly error?: string;
}

export interface DiscoverOptions {
	/** The old page's key (key.ts): a recording made from another page is recorded again. */
	readonly page?: string;
}

const VIEWPORT = VIEWPORTS[0]!;
const STILL_CAP_MS = 3000;
/** After a press went still, how long the page may take to come back by itself (a spinner, a "Copied" label) or go on. */
const AFTER_CAP_MS = 5000;
const MAX_PRESSES = 4;
const MAX_CONTROLS = 200;
const KEPT_CHANGES = 12;

/** Each control is pressed up to MAX_PRESSES times: only ever against a copy of the original served on this machine. */
export function assertLocal(origin: string): void {
	const host = new URL(origin).hostname.replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host)) return;
	throw new Error(`discovery presses each control of the original up to ${MAX_PRESSES} times, so it runs only against a local copy, not ${origin}`);
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
		const s = (el as HTMLElement).style;
		if (!s) return '';
		const kept: string[] = [];
		for (let i = 0; i < s.length; i++) if (!/^(animation|transition)/.test(s[i]!)) kept.push(`${s[i]}:${s.getPropertyValue(s[i]!)}`);
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
		const walk = (el: Element, shownAbove: boolean) => {
			if (el.matches('script, style, template, noscript, [role="tooltip"]')) return;
			const css = getComputedStyle(el);
			const shown = shownAbove && css.display !== 'none' && css.visibility !== 'hidden' && el.getClientRects().length > 0;
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
			const look = shown ? `${css.display} ${css.visibility} ${css.opacity} ${css.color} ${css.backgroundColor} ${css.borderColor} ${css.transform} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}` : '';
			const scrolled = el.scrollTop || el.scrollLeft ? `${Math.round(el.scrollTop)},${Math.round(el.scrollLeft)}` : '';
			out[paths.get(el)!] = { d: describe(el), a: attrs, t: text, s: shown ? 1 : 0, l: look, c: scrolled };
			for (const c of el.children) walk(c, shown || css.display === 'contents');
		};
		walk(document.body, true);
		const focused = document.activeElement && document.activeElement !== document.body ? (paths.get(document.activeElement) ?? '') : '';
		out['@focus'] = { d: focused, a: '', t: '', s: 1, l: '', c: '' };
		out['@scroll'] = { d: 'the window', a: '', t: '', s: 1, l: '', c: `${Math.round(scrollY)},${Math.round(scrollX)}` };
		readings.push(out);
		return readings.length - 1;
	};
	type Change = { at: string; what: string; name?: string; before?: string; after?: string };
	const diff = (a: number, b: number, ignore: readonly string[], pressed: string): { changed: string[]; changes: Change[] } => {
		const A = readings[a]!;
		const B = readings[b]!;
		const skip = new Set(ignore);
		const changed: string[] = [];
		const changes: Change[] = [];
		for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
			if (skip.has(key)) continue;
			const x = A[key];
			const y = B[key];
			if (key === '@focus') {
				// Focus landing on the pressed control (or in it), or leaving to nothing, is the press itself.
				if (x!.d !== y!.d && y!.d && y!.d !== pressed && !y!.d.startsWith(`${pressed}>`)) (changed.push(y!.d), changes.push({ at: B[y!.d]?.d ?? y!.d, what: 'focus' }));
				continue;
			}
			if (key === '@scroll') {
				if (x!.c !== y!.c) (changed.push(key), changes.push({ at: 'the window', what: 'scroll', before: x!.c, after: y!.c }));
				continue;
			}
			if (!x || !y) {
				const it = (x ?? y)!;
				if (it.s) (changed.push(key), changes.push({ at: it.d, what: x ? 'removed' : 'added' }));
				continue;
			}
			if (!x.s && !y.s) continue;
			if (x.s !== y.s) (changed.push(key), changes.push({ at: y.d, what: y.s ? 'shown' : 'hidden' }));
			else if (x.t !== y.t) (changed.push(key), changes.push({ at: y.d, what: 'text', before: x.t.slice(0, 80), after: y.t.slice(0, 80) }));
			else if (x.c !== y.c) (changed.push(key), changes.push({ at: y.d, what: 'scroll', before: x.c, after: y.c }));
			else if (x.a !== y.a) {
				const attrs = (s: string) => new Map(s.split(/ (?=[\w:.-]+=)/).map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)] as const));
				const ax = attrs(x.a);
				const ay = attrs(y.a);
				// An ARIA state, name or a meaningful attribute counts; a class, style or data- attribute only when the element looks different.
				const named = [...new Set([...ax.keys(), ...ay.keys()])].filter((n) => ax.get(n) !== ay.get(n) && ARIA.test(n));
				if (named.length) (changed.push(key), changes.push({ at: y.d, what: 'attribute', name: named[0], before: ax.get(named[0]!)?.slice(0, 80), after: ay.get(named[0]!)?.slice(0, 80) }));
				else if (x.l !== y.l) (changed.push(key), changes.push({ at: y.d, what: 'look', before: x.l, after: y.l }));
			} else if (x.l !== y.l) (changed.push(key), changes.push({ at: y.d, what: 'look', before: x.l, after: y.l }));
		}
		return { changed, changes };
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
	readonly name: string;
	readonly found: 'role' | 'cursor';
	readonly ancestors: readonly string[];
}

/** In the page: every pressable, the ones left alone counted by why, the rest marked `data-mm-discover="<n>"` in document order. */
function findCandidates(destructive: string): { readonly candidates: Candidate[]; readonly excluded: Record<string, number> } {
	const DESTRUCTIVE = new RegExp(destructive, 'i');
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const labelSigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const order = new Map<Element, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		const n = counts.get(sig) ?? 0;
		counts.set(sig, n + 1);
		order.set(el, n);
	}
	const ROLE = 'button, [role="button"], summary, [role="treeitem"]';
	// What a reveal uses by ARIA's own marks, the controls convert already reads for the content they hold back.
	const REVEALS = '[aria-expanded], [aria-haspopup]:not([aria-haspopup="false"]), [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="combobox"]';
	const FIELD = 'input, textarea, select, option, [contenteditable]:not([contenteditable="false"]), label';
	const cursorOf = (el: Element | null) => (el ? getComputedStyle(el).cursor : '');
	const excluded: Record<string, number> = {};
	const out: Candidate[] = [];
	const leave = (why: string) => void (excluded[why] = (excluded[why] ?? 0) + 1);
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const byRole = el.matches(ROLE);
		const cursor = cursorOf(el);
		const byCursor = !byRole && (cursor === 'pointer' || cursor === 'text') && cursorOf(el.parentElement) !== cursor && !el.matches(FIELD) && !el.closest(ROLE) && !el.querySelector(ROLE);
		if (!byRole && !byCursor) continue;
		const css = getComputedStyle(el);
		const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
		if (el.closest('a[href], area[href]')) leave('link');
		else if (el.closest('form')) leave('in a form');
		else if (el.matches('[type="submit"]')) leave('submit');
		else if (DESTRUCTIVE.test(name) || DESTRUCTIVE.test(el.getAttribute('title') ?? '')) leave('destructive name');
		else if (el.matches(':disabled, [aria-disabled="true"]') || el.closest('[inert]')) leave('disabled');
		else if (css.display === 'none' || css.visibility === 'hidden' || !el.getClientRects().length || el.closest('[aria-hidden="true"]')) leave('hidden');
		else if (el.matches(REVEALS) || el.closest('[role="menu"], [role="menubar"], [role="listbox"], [role="tablist"]')) leave('a reveal uses it');
		else {
			const ancestors: string[] = [];
			for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) ancestors.push(`${sigOf(up)}#${order.get(up) ?? 0}`);
			el.setAttribute('data-mm-discover', String(out.length));
			out.push({ sig: sigOf(el), nth: order.get(el) ?? 0, labelSig: labelSigOf(el), name, found: byRole ? 'role' : 'cursor', ancestors });
		}
	}
	return { candidates: out, excluded };
}

/** The nearest element holding the pressed control and every element its press changed, as a path from the body. */
export function holderPath(pressed: string, changed: readonly string[]): string | undefined {
	if (!pressed) return undefined;
	const paths = [pressed, ...changed.filter((p) => p.startsWith('body'))].map((p) => p.split('>'));
	const common: string[] = [];
	for (let i = 0; paths.every((p) => p[i] !== undefined && p[i] === paths[0]![i]); i++) common.push(paths[0]![i]!);
	// A press that changed only its own element is held by its parent: the control is not its own demo.
	if (common.length === paths[0]!.length) common.pop();
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

/**
 * Presses each unclaimed pressable of the page at desktop width, at most MAX_PRESSES times, and keeps what changed. A press
 * that sends anything but a GET, leaves the page, opens a window or a dialog is stopped and marked, never classified. A page
 * a press left changed is loaded again before the next control.
 */
export async function recordDiscovery(browser: Browser, origin: string, route: string, dir: string, options: DiscoverOptions = {}): Promise<DiscoverFacts> {
	assertLocal(origin);
	const file = fileOf(dir, route);
	const kept = await readFile(file, 'utf8').then((t) => JSON.parse(t) as DiscoverFacts & { page?: string }, () => undefined);
	if (kept && kept.route === route && kept.page === options.page) {
		const { page: _, ...facts } = kept;
		return facts;
	}
	const started = Date.now();
	const url = new URL(route, origin).href;
	const { context, page } = await openPage(browser, captureEnv(origin), VIEWPORT);
	await trackSettling(context);
	await context.addInitScript(installReader);
	// Set by the handlers below while a press is read: what stopped it.
	let stopped: { shape: Stopped; why: string } | undefined;
	const stop = (shape: Stopped, why: string) => void (stopped ??= { shape, why });
	await context.route('**/*', (r: Route) => {
		const request = r.request();
		if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return r.fallback();
		// A beacon (analytics) is dropped without stopping the press; anything else might write, and what follows is unknown.
		if (request.resourceType() !== 'ping') stop('blocked', `${request.method()} ${new URL(request.url()).pathname}`);
		return r.abort();
	});
	context.on('page', (other) => {
		if (other === page) return;
		stop('window', other.url());
		other.close().catch(() => {});
	});
	page.on('download', (d) => (stop('download', d.suggestedFilename()), d.cancel().catch(() => {})));
	page.on('dialog', (d) => (stop('dialog', d.message().slice(0, 80)), d.dismiss().catch(() => {})));
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame() && frame.url() !== url) stop('navigates', new URL(frame.url()).pathname);
	});
	const read = () => page.evaluate(() => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.read());
	const forget = () => page.evaluate(() => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.forget());
	const announcedSince = () => page.evaluate(() => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.announced());
	const diff = (a: number, b: number, ignore: readonly string[], pressed: string) => page.evaluate(([a, b, ignore, pressed]) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.diff(a, b, ignore, pressed), [a, b, ignore, pressed] as const);
	const load = async () => {
		await loadPage(page, url);
		await settleLoad(page);
		await page.evaluate(() => scrollTo(0, 0));
		await finishAnimations(page);
		await scriptsStill(page, STILL_CAP_MS).catch(() => undefined);
		stopped = undefined;
	};
	const still = async () => {
		await page.mouse.move(0, 0);
		await scriptsStill(page, STILL_CAP_MS).catch(() => undefined);
	};
	const controls: PressedControl[] = [];
	let candidates: Candidate[] = [];
	let excluded: Record<string, number> = {};
	let drift: string[] = [];
	let reloads = 0;
	try {
		await load();
		({ candidates, excluded } = await page.evaluate(findCandidates, DESTRUCTIVE.source));
		if (candidates.length > MAX_CONTROLS) excluded[`past ${MAX_CONTROLS} on the page`] = candidates.length - MAX_CONTROLS;
		// What changes on its own over a wait as long as a press's: never a press's doing.
		const idle0 = await read();
		await settle(page, AFTER_CAP_MS);
		const idle1 = await read();
		drift = (await diff(idle0, idle1, [], '')).changed;
		let fresh = true;
		// Holders are named on the page as it loads, before any press changed their text.
		const pending: [number, string][] = [];
		const name = async () => {
			const sigs = await page.evaluate(sigsAt, pending.map(([, path]) => path));
			for (const [i, [at, path]] of pending.entries()) if (sigs[i]) controls[at] = { ...controls[at]!, holder: { path, at: sigs[i]! } };
			pending.splice(0);
		};
		for (const [index, c] of candidates.slice(0, MAX_CONTROLS).entries()) {
			if (!fresh) {
				await load();
				reloads++;
				await page.evaluate(findCandidates, DESTRUCTIVE.source);
				await name();
			}
			fresh = true;
			const control = page.locator(`[data-mm-discover="${index}"]`).first();
			const base = { sig: c.sig, nth: c.nth, labelSig: c.labelSig, name: c.name, found: c.found, ancestors: c.ancestors };
			if (!(await control.count())) {
				controls.push({ ...base, shape: 'unpressable', why: 'not on the page once loaded again' });
				continue;
			}
			await control.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
			// Focused before the first reading, as the press will leave it: its own focus styles are no change.
			await control.focus({ timeout: 2000 }).catch(() => {});
			await still();
			const pressed = await control.evaluate((el) => (globalThis as unknown as { __mmDiscover__: Reader }).__mmDiscover__.path(el)).catch(() => '');
			await forget();
			await announcedSince();
			const states = [await read()];
			const press = async (): Promise<boolean> =>
				control.click({ timeout: 5000 }).then(
					() => true,
					() => false,
				);
			// Two frames after a press: what it showed at once, before a timer put it back (a spinner, a "Copied" label).
			const frames = () => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
			const changesFrom = (a: number, b: number) => diff(a, b, drift, pressed);
			if (!(await press())) {
				controls.push({ ...base, shape: 'unpressable', why: 'the press did not reach it' });
				fresh = false;
				continue;
			}
			await page.mouse.move(0, 0);
			await frames();
			const quick = await changesFrom(states[0]!, await read());
			await still();
			let settled = await read();
			// A page the press changed is given its later timers too: a spinner gone, a reply streamed in.
			if (!stopped && (await changesFrom(states[0]!, settled)).changed.length) {
				await settle(page, AFTER_CAP_MS);
				await still();
				settled = await read();
			}
			const announced = await announcedSince();
			if (stopped) {
				controls.push({ ...base, shape: stopped.shape, why: stopped.why });
				fresh = false;
				continue;
			}
			const first = await changesFrom(states[0]!, settled);
			const said: Change[] = announced.map((a) => ({ at: a.slice(0, a.indexOf(':')), what: 'announced', after: a.slice(a.indexOf(':') + 2) }));
			if (!first.changed.length && !quick.changed.length && !said.length) {
				controls.push({ ...base, shape: 'inert' });
				continue;
			}
			if (!first.changed.length) {
				controls.push({ ...base, shape: 'transient', states: 2, changes: [...quick.changes, ...said].slice(0, KEPT_CHANGES) });
				continue;
			}
			fresh = false;
			states.push(settled);
			const holder = holderPath(pressed, first.changed);
			let shape: Shape | undefined;
			for (let n = 2; n <= MAX_PRESSES && !shape; n++) {
				await press();
				await still();
				await settle(page, AFTER_CAP_MS);
				await still();
				if (stopped) break;
				const now = await read();
				let same = -1;
				for (const [i, s] of states.entries()) if (!(await changesFrom(s, now)).changed.length) (same = i);
				if (same === 0) shape = n === 2 ? 'toggle' : 'cycle';
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
			controls.push({ ...base, shape: shape ?? 'sequence', states: states.length, changes: [...first.changes, ...said].slice(0, KEPT_CHANGES) });
		}
		if (pending.length) {
			await load();
			await name();
		}
	} catch (error) {
		const message = (error as Error).message.split('\n')[0]!;
		return { route, browser: `chromium ${browser.version()}`, candidates: candidates.length, excluded, controls, drift: drift.length, reloads, ms: Date.now() - started, error: message };
	} finally {
		await context.close().catch(() => {});
	}
	const facts: DiscoverFacts = { route, browser: `chromium ${browser.version()}`, candidates: candidates.length, excluded, controls, drift: drift.length, reloads, ms: Date.now() - started };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ ...facts, ...(options.page ? { page: options.page } : {}) }));
	return facts;
}

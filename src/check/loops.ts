import { HINTS } from './hints.ts';
import { describe, matchElements } from './match.ts';
import type { Page } from 'playwright';
import type { Failure, PageCapture } from './types.ts';

// A loop (a live setInterval, or a setTimeout or requestAnimationFrame callback that schedules itself again) shows a
// different phase depending on when a capture happens; visual and state capture see each at its start, on both sides.

/** Init script, run in every document before its own scripts: must stay self-contained. */
export function trackLoops(): void {
	const g = globalThis as typeof globalThis & { __markless_migrate_hold_loops__?: () => number };
	const realSetTimeout = g.setTimeout;
	const realClearTimeout = g.clearTimeout;
	const realSetInterval = g.setInterval;
	const realClearInterval = g.clearInterval;
	const realRaf = g.requestAnimationFrame?.bind(g);
	const realCancelRaf = g.cancelAnimationFrame?.bind(g);
	const MAX_RECORDS = 5_000;
	type Change = { readonly at: number; readonly record: MutationRecord };
	let observer: MutationObserver | undefined;
	const held = new Set<string>();
	let seq = 0;
	const changes = new Map<string, Change[]>();
	const overflow = new Set<string>();
	const intervals = new Map<unknown, string>();
	const pending = new Map<unknown, string>();
	// One-shot timeouts of up to a second still to fire: a fade that starts after a page's own short delay (a loading bar's).
	const short = new Map<unknown, string>();
	const rearmed = new Set<string>();
	const timing = new Map<string, { kind: string; every: number }>();
	let running: string | undefined;
	let ids = 0;
	// A callback that schedules code identical to its own (often a fresh closure each time) re-arms itself.
	const keyOf = (fn: unknown) => {
		try {
			return Function.prototype.toString.call(fn);
		} catch {
			return `callback ${ids++}`;
		}
	};
	const run = (key: string, fn: (...a: unknown[]) => unknown, self: unknown, args: unknown[]) => {
		if (held.has(key)) return undefined;
		if (!observer && typeof MutationObserver === 'function' && document) {
			observer = new MutationObserver(() => {});
			observer.observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
		}
		observer?.takeRecords();
		const outer = running;
		running = key;
		try {
			return fn.apply(self, args);
		} finally {
			running = outer;
			const records = observer?.takeRecords() ?? [];
			if (records.length && !overflow.has(key)) {
				const list = changes.get(key) ?? [];
				for (const record of records) list.push({ at: seq++, record });
				if (list.length > MAX_RECORDS) {
					overflow.add(key);
					changes.delete(key);
				} else changes.set(key, list);
			}
		}
	};
	g.setTimeout = function (handler: TimerHandler, ms?: number, ...rest: unknown[]) {
		if (typeof handler !== 'function') return realSetTimeout(handler, ms, ...rest);
		const key = keyOf(handler);
		if (running === key) {
			rearmed.add(key);
			timing.set(key, { kind: 'timeout', every: Math.max(0, Number(ms) || 0) });
		}
		const id: ReturnType<typeof setTimeout> = realSetTimeout(function (this: unknown) {
			pending.delete(id);
			short.delete(id);
			return run(key, handler as (...a: unknown[]) => unknown, this, rest);
		}, ms);
		pending.set(id, key);
		if ((Number(ms) || 0) <= 1000) short.set(id, key);
		return id;
	} as typeof setTimeout;
	g.clearTimeout = function (id?: Parameters<typeof clearTimeout>[0]) {
		pending.delete(id);
		short.delete(id);
		return realClearTimeout(id);
	} as typeof clearTimeout;
	g.setInterval = function (handler: TimerHandler, ms?: number, ...rest: unknown[]) {
		if (typeof handler !== 'function') return realSetInterval(handler, ms, ...rest);
		const key = `\u0000interval ${ids++}`;
		timing.set(key, { kind: 'interval', every: Math.max(0, Number(ms) || 0) });
		const id = realSetInterval(function (this: unknown) {
			return run(key, handler as (...a: unknown[]) => unknown, this, rest);
		}, ms);
		intervals.set(id, key);
		return id;
	} as typeof setInterval;
	g.clearInterval = function (id?: Parameters<typeof clearInterval>[0]) {
		intervals.delete(id);
		return realClearInterval(id);
	} as typeof clearInterval;
	if (realRaf && realCancelRaf) {
		g.requestAnimationFrame = function (callback: FrameRequestCallback) {
			const key = keyOf(callback);
			if (running === key) {
				rearmed.add(key);
				timing.set(key, { kind: 'animation frame', every: 0 });
			}
			const id = realRaf((time: number) => {
				pending.delete(id);
				run(key, callback as (...a: unknown[]) => unknown, g, [time]);
			});
			pending.set(id, key);
			return id;
		};
		g.cancelAnimationFrame = function (id: number) {
			pending.delete(id);
			return realCancelRaf(id);
		};
	}
	const revert = ({ record: r }: Change) => {
		if (r.type === 'attributes' && r.target instanceof Element && r.attributeName) {
			if (r.oldValue === null) r.target.removeAttributeNS(r.attributeNamespace, r.attributeName);
			else r.target.setAttributeNS(r.attributeNamespace, r.attributeName, r.oldValue);
		} else if (r.type === 'characterData') (r.target as CharacterData).data = r.oldValue ?? '';
		else if (r.type === 'childList') {
			for (const node of r.addedNodes) if (node.parentNode === r.target) r.target.removeChild(node);
			const before = r.nextSibling && r.nextSibling.parentNode === r.target ? r.nextSibling : null;
			for (const node of r.removedNodes) r.target.insertBefore(node, before);
		}
	};
	// Every CSS transition and animation that has run since the document started, for the reduced-motion check.
	const ran = new Set<string>();
	addEventListener('transitionrun', (e) => ran.add((e as TransitionEvent).propertyName), true);
	addEventListener('animationstart', (e) => ran.add((e as AnimationEvent).animationName), true);
	Object.defineProperty(g, '__markless_migrate_ran__', { value: () => [...ran] });
	// What is still to settle: short one-shot timeouts (a loop's own are not) and finite animations running.
	Object.defineProperty(g, '__markless_migrate_settling__', {
		value: () => [...short.values()].filter((key) => !rearmed.has(key)).length + document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY)).length,
	});
	// Stops every loop live now (code that starts later, the checker's own included, runs as usual) and undoes what its runs changed in the document, newest first; infinite animations pause at their start.
	Object.defineProperty(g, '__markless_migrate_hold_loops__', {
		value: () => {
			const live = new Set([...intervals.values(), ...[...pending.values()].filter((key) => rearmed.has(key))]);
			for (const key of live) held.add(key);
			const undo = [...live].flatMap((key) => changes.get(key) ?? []).sort((a, b) => b.at - a.at);
			// What each held loop kept changing, for the motion check to compare: the element and what of it.
			const effects = [...live].flatMap((key) => {
				const what = new Map<Node, Set<string>>();
				for (const { record: r } of changes.get(key) ?? []) {
					const target = r.type === 'characterData' ? r.target.parentNode : r.target;
					if (!target) continue;
					const set = what.get(target) ?? new Set<string>();
					set.add(r.type === 'attributes' ? `attribute ${r.attributeName}` : r.type === 'characterData' ? 'text' : 'children');
					what.set(target, set);
				}
				return [{ ...(timing.get(key) ?? { kind: 'timeout', every: 0 }), changes: [...what].map(([node, set]) => ({ node, what: [...set].sort() })) }];
			});
			Object.defineProperty(g, '__markless_migrate_loop_effects__', { value: effects, configurable: true });
			for (const change of undo) {
				try {
					revert(change);
				} catch {}
			}
			for (const key of live) changes.delete(key);
			for (const animation of document.getAnimations()) {
				const iterations = animation.effect?.getComputedTiming().iterations;
				if (iterations === Number.POSITIVE_INFINITY) {
					animation.pause();
					animation.currentTime = 0;
				} else if (animation instanceof CSSTransition && animation.playState === 'running') animation.finish();
			}
			return live.size;
		},
	});
}

const SETTLE_LIMIT_MS = 3_000;

/** Waits (at most 3 s) until what the page load started has settled: a fade a short timeout starts, a transition running; loops do not hold it up. Returns every animation that ran since the document started or was seen running meanwhile, so the reduced-motion check does not depend on when the capture happened. */
export async function settleMotion(page: Page): Promise<string[]> {
	const deadline = Date.now() + SETTLE_LIMIT_MS;
	const seen = new Set<string>();
	let quiet = 0;
	while (Date.now() < deadline && quiet < 2) {
		const now = await page.evaluate(() => ({ left: (globalThis as { __markless_migrate_settling__?: () => number }).__markless_migrate_settling__?.() ?? 0, running: document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'script animation') })).catch(() => ({ left: 0, running: [] as string[] }));
		for (const name of now.running) seen.add(name);
		quiet = now.left ? 0 : quiet + 1;
		await new Promise((done) => setTimeout(done, 50));
	}
	for (const name of await page.evaluate(() => (globalThis as { __markless_migrate_ran__?: () => string[] }).__markless_migrate_ran__?.() ?? []).catch(() => [] as string[])) seen.add(name);
	return [...seen].sort();
}

/** Holds every live loop at the phase before its first run, in the page; the number of loops held. */
export function holdLoops(): number {
	return (globalThis as { __markless_migrate_hold_loops__?: () => number }).__markless_migrate_hold_loops__?.() ?? 0;
}

/** A loop held at capture and what it kept changing, by the ids collectPage gave the elements; none yet when it had not changed anything shown. */
export interface LoopEffect {
	readonly kind: string;
	/** Its period in ms (0 for every animation frame). */
	readonly every: number;
	readonly changes: readonly { readonly id: number; readonly what: readonly string[] }[];
}

/** Runs in the page after collectPage: the held loops' effects on elements it collected. */
export function loopEffects(): LoopEffect[] {
	const g = globalThis as { __markless_migrate_loop_effects__?: { kind: string; every: number; changes: { node: Node; what: string[] }[] }[]; __mmIds?: WeakMap<Element, number> };
	return (g.__markless_migrate_loop_effects__ ?? []).flatMap((loop) => {
		const changes = loop.changes.flatMap((c) => {
			const id = c.node instanceof Element ? g.__mmIds?.get(c.node) : undefined;
			return id === undefined ? [] : [{ id, what: c.what }];
		});
		return [{ kind: loop.kind, every: loop.every, changes }];
	});
}

const sameEvery = (a: number, b: number) => Math.abs(a - b) <= Math.max(20, 0.1 * a);

/** Each loop of the old page against the new page's: the same change (attribute, text or children) on the same element, at the same period. One the old loads disagree on is left to the noise baseline. */
export function loopFailures(route: string, viewport: string, old: PageCapture, others: readonly PageCapture[], next: PageCapture): Failure[] {
	type Line = { readonly index: number; readonly what: string; readonly kind: string; readonly every: number };
	const lines = (page: PageCapture): Line[] => {
		const at = new Map(page.elements.map((el, i) => [el.id, i]));
		return (page.loops ?? []).flatMap((loop) => loop.changes.flatMap((c) => (at.has(c.id) ? c.what.map((what) => ({ index: at.get(c.id)!, what, kind: loop.kind, every: loop.every })) : [])));
	};
	const say = (page: PageCapture, l: Line) => `${l.what} of ${describe(page.elements[l.index]!)} changes ${l.every ? `every ${l.every} ms` : 'every animation frame'} (${l.kind})`;
	const mine = lines(old);
	const theirs = lines(next);
	if (!mine.length && !theirs.length) return [];
	const toNew = matchElements(old.elements, next.elements);
	const stable = (l: Line) =>
		others.every((o) => {
			const m = matchElements(old.elements, o.elements).get(l.index);
			return lines(o).some((x) => x.index === m && x.what === l.what && sameEvery(l.every, x.every));
		});
	// A loop that has not changed anything shown yet (its first run still to come) may be the counterpart of one that has.
	const unseen = (page: PageCapture, l: Line) => (page.loops ?? []).some((loop) => !loop.changes.length && loop.kind === l.kind && sameEvery(l.every, loop.every));
	const failures: Failure[] = [];
	const used = new Set<Line>();
	for (const l of mine) {
		if (!stable(l)) continue;
		const n = theirs.find((x) => x.index === toNew.get(l.index) && x.what === l.what);
		if (!n && unseen(next, l)) continue;
		if (n) used.add(n);
		if (n && sameEvery(l.every, n.every)) continue;
		failures.push({ route, dimension: 'motion', check: `loop on ${describe(old.elements[l.index]!)}`, viewport, expected: say(old, l), actual: n ? say(next, n) : '(no loop changes it)', hint: HINTS.loop });
	}
	// New only when no old load had it, or a loop of its period that had not run yet.
	const onOld = (n: Line) =>
		[old, ...others].some((p) => {
			const to = matchElements(p.elements, next.elements);
			return unseen(p, n) || lines(p).some((l) => to.get(l.index) === n.index && l.what === n.what);
		});
	for (const n of theirs) {
		if (used.has(n) || onOld(n)) continue;
		failures.push({ route, dimension: 'motion', check: `loop on ${describe(next.elements[n.index]!)}`, viewport, expected: '(no loop changes it)', actual: say(next, n), hint: HINTS.loop });
	}
	return failures;
}

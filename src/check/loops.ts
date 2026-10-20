import { HINTS } from './hints.ts';
import { describe, matchElements } from './match.ts';
import type { Page } from 'playwright';
import type { Failure, PageCapture } from './types.ts';

// A loop (a live setInterval, or a setTimeout or requestAnimationFrame callback that schedules itself again) shows a
// different phase depending on when a capture happens; visual and state capture see each at its start, on both sides.

/** Init script, run in every document before its own scripts: must stay self-contained. */
export function trackLoops(known: readonly string[] = []): void {
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
	// One-shot timeouts still to fire, and when: a fade a loading bar starts after its own delay, a demo's fake server answering after 2 s.
	const oneShots = new Map<unknown, { key: string; due: number }>();
	const clock = performance.now.bind(performance);
	// Loops an earlier load of the same page confirmed are loops from their first schedule.
	const rearmed = new Set<string>(known);
	// Settling waits on a callback until it has scheduled itself again twice with the same delay (a helper's wrapper chains timers once); holding stops it from the first time, once settling has waited out what was due.
	const candidates = new Set<string>(known);
	const rearms = new Map<string, number>();
	const again = (key: string) => {
		const n = (rearms.get(key) ?? 0) + 1;
		rearms.set(key, n);
		candidates.add(key);
		if (n >= 2) rearmed.add(key);
	};
	const timing = new Map<string, { kind: string; every: number }>();
	let running: string | undefined;
	let ids = 0;
	// A callback that schedules code identical to its own (often a fresh closure each time), with the same delay, re-arms itself.
	const keyOf = (fn: unknown) => {
		try {
			return Function.prototype.toString.call(fn);
		} catch {
			return `callback ${ids++}`;
		}
	};
	// Which callbacks scheduled each pending timer, so a loop's own follow-up (a fake server answering its poll) is held with it.
	const lineage = new Map<unknown, readonly string[]>();
	let ancestry: readonly string[] = [];
	const heldIds = new Set<unknown>();
	// A key is held only for what was scheduled before the hold: a callback scheduled later with the same source (the
	// checker's own requestAnimationFrame(resolve) and a loop's requestAnimationFrame(this.draw.bind(this)) both read as native code) still runs.
	let epoch = 0;
	const heldAt = new Map<string, number>();
	const run = (key: string, fn: (...a: unknown[]) => unknown, self: unknown, args: unknown[], from: readonly string[], scheduled: number) => {
		if (held.has(key) && scheduled < heldAt.get(key)!) return undefined;
		if (!observer && typeof MutationObserver === 'function' && document) {
			observer = new MutationObserver(() => {});
			observer.observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
		}
		observer?.takeRecords();
		const outer = running;
		const outerAncestry = ancestry;
		running = key;
		ancestry = [...from, key].slice(-8);
		try {
			return fn.apply(self, args);
		} finally {
			running = outer;
			ancestry = outerAncestry;
			const records = observer?.takeRecords() ?? [];
			// What a callback changed is also its schedulers' doing: a poll's fake server answering it swaps the content.
			const made = records.map((record) => ({ at: seq++, record }));
			for (const owner of made.length ? new Set([key, ...from]) : []) {
				if (overflow.has(owner)) continue;
				const list = changes.get(owner) ?? [];
				list.push(...made);
				if (list.length > MAX_RECORDS) {
					overflow.add(owner);
					changes.delete(owner);
				} else changes.set(owner, list);
			}
		}
	};
	g.setTimeout = function (handler: TimerHandler, ms?: number, ...rest: unknown[]) {
		if (typeof handler !== 'function') return realSetTimeout(handler, ms, ...rest);
		const key = `${keyOf(handler)}\u0000${Math.max(0, Number(ms) || 0)}`;
		if (running === key) again(key);
		if (candidates.has(key)) timing.set(key, { kind: 'timeout', every: Math.max(0, Number(ms) || 0) });
		const from = ancestry;
		const scheduled = epoch;
		const id: ReturnType<typeof setTimeout> = realSetTimeout(function (this: unknown) {
			pending.delete(id);
			oneShots.delete(id);
			lineage.delete(id);
			if (heldIds.delete(id)) return undefined;
			return run(key, handler as (...a: unknown[]) => unknown, this, rest, from, scheduled);
		}, ms);
		pending.set(id, key);
		lineage.set(id, from);
		oneShots.set(id, { key, due: clock() + Math.max(0, Number(ms) || 0) });
		return id;
	} as typeof setTimeout;
	g.clearTimeout = function (id?: Parameters<typeof clearTimeout>[0]) {
		pending.delete(id);
		oneShots.delete(id);
		lineage.delete(id);
		return realClearTimeout(id);
	} as typeof clearTimeout;
	g.setInterval = function (handler: TimerHandler, ms?: number, ...rest: unknown[]) {
		if (typeof handler !== 'function') return realSetInterval(handler, ms, ...rest);
		const key = `\u0000interval ${ids++}`;
		timing.set(key, { kind: 'interval', every: Math.max(0, Number(ms) || 0) });
		const scheduled = epoch;
		const id = realSetInterval(function (this: unknown) {
			return run(key, handler as (...a: unknown[]) => unknown, this, rest, [], scheduled);
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
			const key = `${keyOf(callback)}\u0000frame`;
			if (running === key) again(key);
			if (candidates.has(key)) timing.set(key, { kind: 'animation frame', every: 0 });
			const from = ancestry;
			const scheduled = epoch;
			const id = realRaf((time: number) => {
				pending.delete(id);
				lineage.delete(id);
				if (heldIds.delete(id)) return;
				run(key, callback as (...a: unknown[]) => unknown, g, [time], from, scheduled);
			});
			pending.set(id, key);
			lineage.set(id, from);
			return id;
		};
		g.cancelAnimationFrame = function (id: number) {
			pending.delete(id);
			lineage.delete(id);
			return realCancelRaf(id);
		};
	}
	const revert = ({ record: r }: Change) => {
		if (r.type === 'attributes' && r.target instanceof Element && r.attributeName) {
			// Chromium writes a style set through `el.style` to the attribute lazily: reading it first makes removing it stick.
			r.target.getAttributeNS(r.attributeNamespace, r.attributeName);
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
	Object.defineProperty(g, '__markless_migrate_loop_keys__', { value: () => [...rearmed] });
	// What is still to settle: one-shot timeouts due within `within` ms (a loop's own are not) and finite animations running.
	Object.defineProperty(g, '__markless_migrate_settling__', {
		value: (within: number) => [...oneShots.values()].filter((t) => !rearmed.has(t.key) && t.due <= clock() + within).length + document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY)).length,
	});
	// Stops every loop live now (code that starts later, the checker's own included, runs as usual) and undoes what its runs changed in the document, newest first; infinite animations pause at their start.
	Object.defineProperty(g, '__markless_migrate_hold_loops__', {
		value: () => {
			const live = new Set([...intervals.values(), ...[...pending.values()].filter((key) => candidates.has(key))]);
			epoch += 1;
			for (const key of live) {
				held.add(key);
				heldAt.set(key, epoch);
			}
			for (const [id, from] of lineage) {
				if (from.some((key) => live.has(key))) {
					heldIds.add(id);
					oneShots.delete(id);
				}
			}
			const undo = [...new Set([...live].flatMap((key) => changes.get(key) ?? []))].sort((a, b) => b.at - a.at);
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

/** Waits (at most 3 s) until what the page load started has settled: a timeout due within that time (a loading bar's fade, a demo's fake server answering), a transition running; loops do not hold it up. Returns every animation that ran since the document started or was seen running meanwhile, so the reduced-motion check does not depend on when the capture happened. */
export async function settleMotion(page: Page): Promise<string[]> {
	const deadline = Date.now() + SETTLE_LIMIT_MS;
	const seen = new Set<string>();
	let quiet = 0;
	while (Date.now() < deadline && quiet < 2) {
		const now = await page.evaluate((within) => ({ left: (globalThis as { __markless_migrate_settling__?: (within: number) => number }).__markless_migrate_settling__?.(within) ?? 0, running: document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'script animation') }), Math.max(0, deadline - Date.now())).catch(() => ({ left: 0, running: [] as string[] }));
		for (const name of now.running) seen.add(name);
		quiet = now.left ? 0 : quiet + 1;
		await new Promise((done) => setTimeout(done, 50));
	}
	for (const name of await page.evaluate(() => (globalThis as { __markless_migrate_ran__?: () => string[] }).__markless_migrate_ran__?.() ?? []).catch(() => [] as string[])) seen.add(name);
	return [...seen].sort();
}

/** Waits out what the page started (settleMotion), then holds every loop live at that point, so both sides are held at the same phase before an interaction is recorded. */
export async function settleAndHoldLoops(page: Page): Promise<void> {
	await settleMotion(page);
	await page.evaluate(holdLoops).catch(() => 0);
	// Events of the transitions holding finished are dispatched on the next frames, before anything is recorded.
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))).catch(() => {});
}

/** The timeouts and animation-frame callbacks this load confirmed as loops, for later loads of the same page to hold from their first schedule. */
export function loopKeys(page: Page): Promise<string[]> {
	return page.evaluate(() => (globalThis as { __markless_migrate_loop_keys__?: () => string[] }).__markless_migrate_loop_keys__?.() ?? []).catch(() => []);
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

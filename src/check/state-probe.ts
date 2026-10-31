import type { Page } from 'playwright';
import { maskClocks } from './clock.ts';
import { armState, type PageMotion, type PagePopupPlace, type PageScriptMotion, type PageState } from './state-page.ts';
import { samePath } from './svg-path.ts';
import type { Dimension } from './types.ts';

/**
 * The state probe: after every probe step, what changed is read as data on both pages and compared exactly: the accessibility
 * tree's lines the step added and removed, each open popup's place against its trigger, every CSS and Web Animation the step
 * started (timing, easing, keyframes), and attributes a script wrote frame by frame (a chart path's d, a drawer's transform).
 */
export interface StateReading extends PageState {
	readonly ax: readonly string[];
	/** The in-page read and the accessibility snapshot, in ms. */
	readonly ms: number;
}

export type StateRun = readonly StateReading[];

export interface StateDiff {
	readonly dimension: Dimension;
	/** `accessibility tree`, `pop-up place of <role>`, `motion opening <role>`, `motion closing <role>`, `motion of <subject>` or `script motion of <subject>`. */
	readonly field: string;
	readonly old: string;
	readonly new: string;
}

/** Tolerances, each from repeated reads of one page against itself (test/state-probe.test.ts measures them). */
export const STATE_TOLERANCE = {
	/** Popup edges against the trigger, px: sub-pixel layout and a scrollbar's rounding. */
	px: 2,
	/** Popup width against the trigger's, as a share. */
	widthRatio: 0.02,
	/** Animation duration and delay: ms, or a share of the longer. */
	ms: 20,
	ratio: 0.1,
	/** Script motion is timed by the wall clock between its first and last written frame. */
	scriptMs: 80,
	scriptRatio: 0.25,
	/** A script writing on this many frames or more animates; fewer is set-up. */
	scriptFrames: 6,
	/** Keyframe numbers, as a share. */
	value: 0.02,
} as const;

const SCRIPT_QUIET_MS = 100;
const SCRIPT_WAIT_MS = 2_000;

type StateWindow = { __mmState__?: { drain(): PageState; quietFor(ms: number): boolean } };

/** Installs the recorder; call after each load, before the first step. */
export async function armStateReader(page: Page): Promise<void> {
	await page.evaluate(armState).catch(() => {});
}

/** What the last step changed. Waits, at most 2 s, for a script writing attributes frame by frame to stop; the tree is `previous`'s when the DOM did not change. */
export async function readState(page: Page, previous?: StateReading): Promise<StateReading> {
	const started = Date.now();
	await page.waitForFunction((ms) => (globalThis as StateWindow).__mmState__?.quietFor(ms) ?? true, SCRIPT_QUIET_MS, { timeout: SCRIPT_WAIT_MS, polling: 'raf' }).catch(() => {});
	const empty: PageState = { popups: [], motion: [], script: [] };
	const drained = await page.evaluate(() => (globalThis as StateWindow).__mmState__?.drain() ?? null).catch(() => empty);
	// A step that loaded another document left the recorder behind: what it started there is not known, so it reads as nothing.
	if (!drained) await armStateReader(page);
	const state = drained ?? empty;
	if (previous && drained && !drained.changed) return { ...state, ax: previous.ax, ms: Date.now() - started };
	const roots = await page.locator('[data-markless-migrate-state]').all().catch(() => []);
	const snapshots = await Promise.all(roots.map((r) => r.ariaSnapshot({ timeout: 2_000 }).catch(() => '')));
	const ax = maskClocks(snapshots.join('\n').split('\n').map(anonymous).filter((l) => l.trim()));
	return { ...state, ax, ms: Date.now() - started };
}

const anonymous = (line: string) => line.replace(/\b(react-aria|radix-|base-ui-|headlessui-|mm-|_r_|«|:r)[\w:«»-]*/gi, '#id').replace(/\/url: .*$/, '/url: #');

const without = (a: readonly string[], b: readonly string[]) => {
	const left = new Map<string, number>();
	for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
	return a.filter((x) => {
		const n = left.get(x) ?? 0;
		if (n) left.set(x, n - 1);
		return !n;
	});
};

/** The tree lines a step added and removed, in order. */
export function axDelta(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
	return { added: without(after, before), removed: without(before, after) };
}

const near = (a: number, b: number, abs: number, share: number) => Math.abs(a - b) <= Math.max(abs, Math.max(Math.abs(a), Math.abs(b)) * share);
const nearText = (a: string, b: string, share: number) => {
	if (a === b) return true;
	const na = a.match(/-?\d+(\.\d+)?/g) ?? [];
	const nb = b.match(/-?\d+(\.\d+)?/g) ?? [];
	return a.replace(/-?\d+(\.\d+)?/g, '#') === b.replace(/-?\d+(\.\d+)?/g, '#') && na.length === nb.length && na.every((n, i) => near(Number(n), Number(nb[i]), 0.01, share));
};
const EASE: Record<string, string> = { ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)', 'ease-in': 'cubic-bezier(0.42, 0, 1, 1)', 'ease-out': 'cubic-bezier(0, 0, 0.58, 1)', 'ease-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)', linear: 'linear' };
const easing = (e: string) => (EASE[e.trim()] ?? e.trim()).replace(/\s+/g, ' ').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s*,\s*/g, ', ');

export function describePlace(p: PagePopupPlace): string {
	const ratio = p.triggerWidth ? Math.round((p.width / p.triggerWidth) * 100) / 100 : 0;
	return `${p.side} its trigger, ${p.align === 'none' ? `not aligned (${p.across} px across)` : `${p.align}-aligned`}, ${p.gap} px gap, ${p.width}x${p.height} (${ratio}x the trigger's ${p.triggerWidth} px width)${p.covers ? `, covering ${Math.round(p.covers * 100)}% of its trigger` : ''}${p.hides ? ', hiding its trigger' : ''}`;
}

/** The ways two places of one popup differ, beyond measured noise. */
export function placeDiffers(a: PagePopupPlace, b: PagePopupPlace): string[] {
	const t = STATE_TOLERANCE;
	const out: string[] = [];
	if (a.side !== b.side) out.push('side');
	if (a.align !== b.align && !near(a.across, b.across, t.px, 0)) out.push('alignment');
	if (!near(a.gap, b.gap, t.px, 0)) out.push('gap');
	if (!near(a.across, b.across, t.px, 0)) out.push('offset');
	const ra = a.triggerWidth ? a.width / a.triggerWidth : 0;
	const rb = b.triggerWidth ? b.width / b.triggerWidth : 0;
	if (!near(a.width, b.width, t.px, 0) && Math.abs(ra - rb) > t.widthRatio) out.push('width');
	if (a.hides !== b.hides || Math.abs(a.covers - b.covers) >= 0.3) out.push('covers its trigger');
	return out;
}

export function describeMotion(list: readonly PageMotion[]): string {
	if (!list.length) return 'no animation';
	return list
		.map((m) => `${m.properties.join(',')} ${m.duration} ms${m.delay ? ` after ${m.delay} ms` : ''} ${m.easing}${m.iterations === 1 ? '' : ` x${m.iterations}`}${m.direction === 'normal' ? '' : ` ${m.direction}`}${m.keyframes.length ? ` [${m.keyframes.join(' / ')}]` : ''}`)
		.sort()
		.join('; ');
}

const motionKey = (m: PageMotion) => m.properties.join(',');

/** Whether two lists of animations of one subject run alike: the same properties, timing within tolerance, the same easing and keyframes. */
export function sameMotion(a: readonly PageMotion[], b: readonly PageMotion[]): boolean {
	const t = STATE_TOLERANCE;
	const by = (l: readonly PageMotion[]) => {
		const m = new Map<string, PageMotion>();
		for (const x of l) {
			const k = motionKey(x);
			const prev = m.get(k);
			if (!prev || x.duration + x.delay > prev.duration + prev.delay) m.set(k, x);
		}
		return m;
	};
	const ma = by(a);
	const mb = by(b);
	if (ma.size !== mb.size || [...ma.keys()].some((k) => !mb.has(k))) return false;
	for (const [k, x] of ma) {
		const y = mb.get(k)!;
		if (!near(x.duration, y.duration, t.ms, t.ratio) || !near(x.delay, y.delay, t.ms, t.ratio)) return false;
		if (easing(x.easing) !== easing(y.easing) || x.iterations !== y.iterations || x.direction !== y.direction) return false;
		// A transition's keyframes run from wherever the property was, which a retargeted transition reads mid-flight: only an animation's are its own.
		if (x.kind !== 'transition' && (x.keyframes.length !== y.keyframes.length || x.keyframes.some((f, i) => !nearText(f, y.keyframes[i]!, t.value)))) return false;
	}
	return true;
}

const SCRIPT_ATTR: Record<string, string> = { d: 'path', transform: 'transform', points: 'points', style: 'style' };
export function describeScript(s: PageScriptMotion | undefined): string {
	if (!s || s.frames < STATE_TOLERANCE.scriptFrames) return s ? `set on ${s.frames} frame${s.frames === 1 ? '' : 's'}, no motion` : 'jumps: no frame by frame motion';
	return `moves frame by frame: ${s.frames} frames over ${s.span} ms, ${SCRIPT_ATTR[s.attribute] ?? s.attribute} from "${s.first.slice(0, 60)}" to "${s.last.slice(0, 60)}"`;
}

export function sameScript(a: PageScriptMotion | undefined, b: PageScriptMotion | undefined): boolean {
	const t = STATE_TOLERANCE;
	const moves = (s: PageScriptMotion | undefined) => Boolean(s && s.frames >= t.scriptFrames);
	if (moves(a) !== moves(b)) return false;
	if (!moves(a)) return true;
	if (!near(a!.span, b!.span, t.scriptMs, t.scriptRatio)) return false;
	const same = (x: string, y: string) => (a!.attribute === 'd' ? samePath(x, y) || nearText(x, y, t.value) : nearText(x, y, t.value));
	return same(a!.last, b!.last);
}

// The probed widget's own motion: the control, what is inside it, and the popups. Another element's (the control Tab left) starts or not by how fast the step ran.
const OWN = /^(?!.* outside the widget$)/;

// A transition of a colour or a shadow is a hover or focus feedback that starts or not by whether the pointer crossed the control between two frames; motion is a transition of where or whether an element shows.
const MOVES = /^(opacity|transform|translate|scale|rotate|width|height|max-height|min-height|max-width|top|left|right|bottom|inset.*|margin.*|padding.*|clip-path|visibility|display|overlay|offset.*|grid-template.*|flex.*|filter|backdrop-filter|--.*)$/;
const moving = (list: readonly PageMotion[]) => list.filter((m) => m.kind !== 'transition' || m.properties.some((p) => MOVES.test(p)));

const popupRoles = (r: StateReading | undefined) => (r?.popups ?? []).map((p) => p.role);

/** The motion field a subject's animation belongs to: the popup a step opened or closed, else the subject itself. */
function motionField(subject: string, before: StateReading | undefined, after: StateReading): string {
	const role = subject.replace(/^in /, '');
	const was = popupRoles(before).includes(role);
	const is = popupRoles(after).includes(role);
	if (!was && is) return `motion opening ${role}`;
	if (was && !is) return `motion closing ${role}`;
	return `motion of ${subject}`;
}

const groupBy = <T>(list: readonly T[], key: (x: T) => string) => {
	const m = new Map<string, T[]>();
	for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
	return m;
};

/** One step's differences, old against new; a field that differs between two old runs is noise there and left out. */
export function compareStep(oldBefore: StateReading | undefined, old: StateReading, newBefore: StateReading | undefined, next: StateReading, again?: StateReading, againBefore?: StateReading): StateDiff[] {
	const out: StateDiff[] = [];
	// The accessibility tree: what the step added and removed on each side.
	const od = axDelta(oldBefore?.ax ?? old.ax, old.ax);
	const nd = axDelta(newBefore?.ax ?? next.ax, next.ax);
	const ad = again ? axDelta(againBefore?.ax ?? again.ax, again.ax) : undefined;
	const noisy = new Set(ad ? [...without(od.added, ad.added), ...without(ad.added, od.added), ...without(od.removed, ad.removed), ...without(ad.removed, od.removed)] : []);
	const clean = (l: string[]) => l.filter((x) => !noisy.has(x));
	const missing = [...without(clean(od.added), nd.added).map((l) => `+ ${l.trim()}`), ...without(clean(od.removed), nd.removed).map((l) => `- ${l.trim()}`)];
	const extra = [...without(clean(nd.added), od.added).map((l) => `+ ${l.trim()}`), ...without(clean(nd.removed), od.removed).map((l) => `- ${l.trim()}`)];
	if (missing.length || extra.length) out.push({ dimension: 'a11y', field: 'accessibility tree', old: missing.slice(0, 6).join('; ') || '(no other change)', new: extra.slice(0, 6).join('; ') || '(not this change)' });
	// Each open popup, paired by role and order.
	const nByRole = groupBy(next.popups, (p) => p.role);
	const aByRole = again ? groupBy(again.popups, (p) => p.role) : undefined;
	for (const [role, list] of groupBy(old.popups, (p) => p.role)) {
		list.forEach((p, i) => {
			const n = nByRole.get(role)?.[i];
			if (!n) return;
			const a = aByRole?.get(role)?.[i];
			if (a && placeDiffers(p, a).length) return;
			const how = placeDiffers(p, n);
			if (how.length) out.push({ dimension: 'behaviour', field: `pop-up place of ${role}`, old: `${describePlace(p)}`, new: `${describePlace(n)} (differs in ${how.join(', ')})` });
		});
	}
	// Declared motion, by whose it is.
	const om = groupBy(old.motion, (m) => m.subject);
	const nm = groupBy(next.motion, (m) => m.subject);
	const am = again ? groupBy(again.motion, (m) => m.subject) : undefined;
	for (const subject of new Set([...om.keys(), ...nm.keys()])) {
		if (!OWN.test(subject)) continue;
		const o = moving(om.get(subject) ?? []);
		const n = moving(nm.get(subject) ?? []);
		if (sameMotion(o, n)) continue;
		if (am && !sameMotion(o, moving(am.get(subject) ?? []))) continue;
		out.push({ dimension: 'motion', field: motionField(subject, o.length ? oldBefore : newBefore, o.length ? old : next), old: describeMotion(o), new: describeMotion(n) });
	}
	// Script motion, by whose and which attribute.
	const key = (s: PageScriptMotion) => `${s.subject}|${s.attribute}`;
	const os = new Map(old.script.map((s) => [key(s), s]));
	const ns = new Map(next.script.map((s) => [key(s), s]));
	const as = again ? new Map(again.script.map((s) => [key(s), s])) : undefined;
	for (const k of new Set([...os.keys(), ...ns.keys()])) {
		const o = os.get(k);
		const n = ns.get(k);
		if (sameScript(o, n)) continue;
		if (as && !sameScript(o, as.get(k))) continue;
		const [subject, attribute] = k.split('|') as [string, string];
		out.push({ dimension: 'motion', field: `script motion of ${subject} (${SCRIPT_ATTR[attribute] ?? attribute})`, old: describeScript(o), new: describeScript(n) });
	}
	return out;
}

/** Every step's differences: index k is step k + 1 (reading 0 is after load). */
export function compareStates(old: StateRun, next: StateRun, again?: StateRun): StateDiff[][] {
	const out: StateDiff[][] = [];
	for (let k = 1; k < old.length && k < next.length; k++) out.push(compareStep(old[k - 1], old[k]!, next[k - 1], next[k]!, again?.[k], again?.[k - 1]));
	return out;
}

/** The first step at which each field differs, so one difference that lasts is reported once. */
export function firstDiffs(steps: readonly StateDiff[][]): { step: number; diff: StateDiff }[] {
	const seen = new Set<string>();
	const out: { step: number; diff: StateDiff }[] = [];
	steps.forEach((diffs, i) => {
		for (const d of diffs) {
			if (seen.has(d.field)) continue;
			seen.add(d.field);
			out.push({ step: i, diff: d });
		}
	});
	return out;
}

export const STATE_HINTS: Record<string, string> = {
	'accessibility tree': 'What this step adds to and removes from the accessibility tree must match the old page: the same roles, names and states appear and go, so a screen reader hears the same change.',
	'pop-up place': "Open the pop-up where the old one opens: on the same side of its trigger, with the same alignment, gap and width (a list as wide as its trigger stays as wide), and never over the trigger it describes. Use the old library's placement (side, align, sideOffset, the anchor element it measures).",
	motion: "Animate what the old page animates on this step, and nothing it does not: the same properties, duration, delay, easing and keyframes (Tailwind's animate-in/animate-out classes and data-state selectors, or the library's own transition). An exit animation must run before the element is removed.",
	'script motion': 'The old page moves this element frame by frame (a chart series tweening its path, a drawer following a spring): run the same tween over the same time instead of jumping to the end state.',
};

export const stateHint = (field: string) => STATE_HINTS[field.startsWith('pop-up place') ? 'pop-up place' : field.startsWith('script motion') ? 'script motion' : field.startsWith('motion') ? 'motion' : 'accessibility tree']!;

/** The largest difference between two runs of one sequence in each measure the tolerances bound: for measuring noise on pages that match. */
export function stateSpread(a: StateRun, b: StateRun): Record<string, number> {
	const out: Record<string, number> = { px: 0, widthRatio: 0, ms: 0, ratio: 0, scriptMs: 0, scriptRatio: 0, value: 0 };
	const max = (k: string, v: number) => (out[k] = Math.max(out[k]!, Number.isFinite(v) ? v : 0));
	const rel = (x: number, y: number) => (Math.max(Math.abs(x), Math.abs(y)) ? Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)) : 0);
	for (let k = 0; k < a.length && k < b.length; k++) {
		const [x, y] = [a[k]!, b[k]!];
		x.popups.forEach((p, i) => {
			const q = y.popups[i];
			if (!q || q.role !== p.role) return;
			max('px', Math.max(Math.abs(p.gap - q.gap), Math.abs(p.across - q.across), Math.abs(p.width - q.width)));
			if (p.triggerWidth && q.triggerWidth) max('widthRatio', Math.abs(p.width / p.triggerWidth - q.width / q.triggerWidth));
		});
		for (const m of x.motion) {
			const n = y.motion.find((o) => o.subject === m.subject && o.properties.join() === m.properties.join());
			if (!n) continue;
			max('ms', Math.abs(m.duration - n.duration));
			max('ratio', rel(m.duration, n.duration));
		}
		for (const s of x.script) {
			const t = y.script.find((o) => o.subject === s.subject && o.attribute === s.attribute);
			if (!t) continue;
			max('scriptMs', Math.abs(s.span - t.span));
			max('scriptRatio', rel(s.span, t.span));
		}
	}
	return out;
}

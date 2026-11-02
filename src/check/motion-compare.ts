// Motion, judged from what motion.ts recorded of each interaction on both sides: nothing here opens a page.
import type { Png } from './artifacts.ts';
import { HINTS } from './hints.ts';
import { cycleLabel, describeTarget } from './journeys-compare.ts';
import type { CycleAct, RecordedJourney, Target } from './journeys.ts';
import type { CanvasComparison } from './motion-canvas.ts';
import { describe, matchElements } from './match.ts';
import { describeRule, type CssRule } from './stylesheet.ts';
import type { Box, ElementSnapshot, Failure, Viewport } from './types.ts';

export interface MotionOptions {
	/** At most this many journeys' last steps recorded per route, in the order the explorer found them; default 40. */
	readonly maxInteractions?: number;
	/** At most this many controls hovered and focused per route; default 24. */
	readonly maxHovers?: number;
	/** At most this many opened dialogs, menus and popups dismissed with Escape per route, so their exit is recorded; default 16. */
	readonly maxDismissals?: number;
	/** At most this many uses of a control after its journey (closing what it opened, opening it again) per route, so a disclosure's exit is recorded; default 24. */
	readonly maxCycles?: number;
	/** The old stylesheets' rules that declare a transition or an animation, to list those no recorded interaction ran. */
	readonly rules?: readonly { readonly selector: string; readonly label: string }[];
}

export type MotionKind = 'transition' | 'animation' | 'web animation' | 'script' | 'media';

/** One transition or animation that started during an interaction. */
export interface MotionRecord {
	readonly kind: MotionKind;
	/** The transition's property, the CSS animation's name, or the Web Animation's id. */
	readonly name: string;
	readonly properties: readonly string[];
	/** First and last keyframe value, when one property moves. */
	readonly from?: string;
	readonly to?: string;
	readonly duration: number;
	readonly delay: number;
	readonly easing: string;
	readonly iterations: number | 'infinite';
	readonly element: ElementSnapshot;
	readonly pseudo?: string;
}

export interface MotionCapture {
	readonly interaction: string;
	readonly motions: readonly MotionRecord[];
	/** The step loaded another page or changed the path: motion is compared on pages, not across them. */
	readonly navigated?: boolean;
	readonly failed?: string;
	/** Every element on the page, to find the counterpart of one that moves on the other side only. */
	readonly elements?: readonly ElementSnapshot[];
	/** Indices of the rules whose selector matches an element that moved. */
	readonly hits?: readonly number[];
	/** Every animated element at fixed moments of the interaction, every animation held there: the same moments on both sides. */
	readonly pinned?: readonly PinnedFrame[];
}

/** What one element shows at one pinned moment. */
export interface PinnedElement {
	readonly element: ElementSnapshot;
	readonly shown: boolean;
	readonly opacity: number;
	readonly box: Box;
}

/** `t` ms into the interaction; `note` names the animation whose last frame or end it is. */
export interface PinnedMoment {
	readonly t: number;
	readonly note?: string;
}

export interface PinnedFrame extends PinnedMoment {
	readonly elements: readonly PinnedElement[];
}

/** Frames of one interaction on both sides, at the same offsets into the old side's longest animation. */
export interface Filmstrip {
	readonly label: string;
	readonly offsets: readonly number[];
	readonly old: readonly Png[];
	readonly new: readonly Png[];
}

export interface MotionInteraction {
	readonly name: string;
	readonly old: readonly string[];
	readonly new: readonly string[];
	readonly ok: boolean;
	/** The same interaction with prefers-reduced-motion: reduce, recorded when either side animated without it. */
	readonly reduced?: { readonly old: readonly string[]; readonly new: readonly string[]; readonly ok: boolean };
}

export interface MotionResult {
	/** Interactions recorded on both sides: journeys' last steps, Escape after each opened dialog, menu or popup, hovers, focuses and the scroll. */
	readonly checked: number;
	readonly interactions: readonly MotionInteraction[];
	/** Interactions not recorded, with why (a navigation, a step that failed, the cap). */
	readonly skipped: readonly string[];
	/** Old rules declaring a transition or animation that no recorded interaction ran on the old page; the css dimension compares their values. */
	readonly unexercised?: readonly string[];
	/** Each canvas of the old page's first screen, its frames from load compared with the new page's. */
	readonly canvases?: readonly CanvasComparison[];
}

const DEFAULT_MAX_INTERACTIONS = 40;
const DEFAULT_MAX_HOVERS = 24;
const DEFAULT_MAX_DISMISSALS = 16;
const DEFAULT_MAX_CYCLES = 24;
export const FRAMES = 5;
const LIMIT = 20;
// Animation timing is exact; 10% or 20 ms absorbs a duration computed from a height that differs by a few pixels.
const TOLERANCE_MS = 20;
const TOLERANCE_RATIO = 0.1;
// Script-driven motion is timed by the wall clock between the first and last frame that wrote a style.
const SCRIPT_TOLERANCE_MS = 50;
const SCRIPT_TOLERANCE_RATIO = 0.25;
const HOVER_ROLES = new Set(['link', 'button', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'checkbox', 'radio', 'switch', 'summary', 'treeitem', 'textbox', 'searchbox', 'combobox', 'clickable']);

/**
 * A journey to record; `dismiss`: after all its steps, Escape is pressed where focus is, and that is the interaction
 * recorded; `act`: after all its steps and the cycle acts before this one, cycle act `act` is the interaction recorded.
 */
export type MotionJourney = RecordedJourney & { readonly dismiss?: boolean; readonly act?: number };

export interface Film {
	readonly span?: number;
	readonly clip?: Box;
	readonly moments?: readonly PinnedMoment[];
}

export interface Recorded extends MotionCapture {
	readonly film?: Film;
	readonly frames?: readonly Buffer[];
}

export const SCROLL = 'scroll down one screen';

const EASINGS: Readonly<Record<string, string>> = {
	ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
	'ease-in': 'cubic-bezier(0.42, 0, 1, 1)',
	'ease-out': 'cubic-bezier(0, 0, 0.58, 1)',
	'ease-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
	linear: 'linear',
	'cubic-bezier(0, 0, 1, 1)': 'linear',
};

export function sameEasing(a: string, b: string): boolean {
	const norm = (e: string) => {
		const s = e.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().toLowerCase();
		return EASINGS[s] ?? s.replace(/(\d)\.0+(?=[,)])/g, '$1').replace(/\b0\.(\d*?)0+(?=[,)])/g, '0.$1');
	};
	return norm(a) === norm(b);
}

function within(a: number, b: number, script: boolean): boolean {
	const [ms, ratio] = script ? [SCRIPT_TOLERANCE_MS, SCRIPT_TOLERANCE_RATIO] : [TOLERANCE_MS, TOLERANCE_RATIO];
	return Math.abs(a - b) <= Math.max(ms, ratio * Math.max(a, b));
}

const key = (r: MotionRecord) => `${r.pseudo ?? ''}|${r.properties.join(',')}`;

function timing(r: MotionRecord): string {
	if (r.kind === 'media') return `plays ${r.properties.join(', ')}${r.name ? ` ${r.name}` : ''}`;
	const values = r.properties.length === 1 && r.from !== undefined && r.to !== undefined && r.from !== r.to ? ` ${r.from}→${r.to}` : '';
	const what = r.kind === 'animation' ? `animation ${r.name} (${r.properties.join(', ')})` : r.kind === 'script' ? `${r.properties.join(', ')} from script, frame by frame,` : r.properties.join(', ');
	return `${what}${values} over ${r.duration} ms${r.delay ? ` after ${r.delay} ms` : ''}${r.easing ? ` ${r.easing}` : ''}${r.iterations === 'infinite' ? ', repeating' : r.iterations !== 1 ? `, ${r.iterations} times` : ''}${r.pseudo ? ` on ${r.pseudo}` : ''}`;
}

/** One line per motion, for the report: what moved, how and for how long. */
export function motionLines(motions: readonly MotionRecord[]): string[] {
	return motions.map((m) => `${describe(m.element)}: ${m.kind === 'transition' ? 'transition of ' : ''}${timing(m)}`);
}

// Several properties of one element that move alike (background-position-x and -y) read as one motion.
function joined(records: readonly MotionRecord[]): string {
	const groups = new Map<string, MotionRecord[]>();
	for (const r of records) {
		const g = `${r.kind}|${r.duration}|${r.delay}|${r.easing}|${r.iterations}|${r.pseudo ?? ''}`;
		groups.set(g, [...(groups.get(g) ?? []), r]);
	}
	return [...groups.values()].map((rs) => (rs.length === 1 ? timing(rs[0]!) : timing({ ...rs[0]!, properties: rs.flatMap((r) => r.properties), from: undefined, to: undefined }))).join('; ');
}

const sound = (rs: readonly MotionRecord[]) => rs.every((r) => r.kind === 'media');

interface Difference {
	readonly key: string;
	/** Differences alike but for the element and its values (every link's colour transition when the theme changes) read as one. */
	readonly group: string;
	readonly what: string;
	readonly failure: Failure;
}

const visible = (p: PinnedElement) => p.shown && p.opacity > 0.02;
const looks = (p: PinnedElement, where: boolean) => (!p.shown ? 'not shown' : `${p.opacity <= 0.02 ? 'shown but transparent' : `shown at opacity ${Math.round(p.opacity * 100) / 100}`}${where ? `, ${p.box.width}x${p.box.height} at (${p.box.x}, ${p.box.y})` : ''}`);

/** How one element differs at one held moment: shown or not, its opacity within 0.1, and how far it has moved and grown since the first moment within 2 px (where it sits on the page is the css and visual checks' business). */
function pinnedDifference(o: PinnedElement, n: PinnedElement, o0?: PinnedElement, n0?: PinnedElement): { old: string; new: string } | undefined {
	if (visible(o) !== visible(n)) return { old: looks(o, false), new: looks(n, false) };
	if (!visible(o)) return undefined;
	const moved = (p: PinnedElement, p0?: PinnedElement) => ({ x: p.box.x - (p0?.box.x ?? p.box.x), y: p.box.y - (p0?.box.y ?? p.box.y) });
	const [mo, mn] = [moved(o, o0), moved(n, n0)];
	const where = Math.abs(mo.x - mn.x) > 2 || Math.abs(mo.y - mn.y) > 2 || Math.abs(o.box.width - n.box.width) > 2 || Math.abs(o.box.height - n.box.height) > 2;
	if (!where && Math.abs(o.opacity - n.opacity) <= 0.1) return undefined;
	return { old: looks(o, where), new: looks(n, where) };
}

const valueless = (text: string) => text.replace(/ \S+→\S+/g, '').replace(/\d+(\.\d+)?/g, '#');

function differences(route: string, label: string, viewport: string, old: MotionCapture, next: MotionCapture, hint: string): Difference[] {
	const els = (c: MotionCapture) => [...new Set([...(c.elements ?? []), ...c.motions.map((m) => m.element)])];
	const oldAll = els(old);
	const newAll = els(next);
	const pairs = matchElements(oldAll, newAll);
	const back = new Map([...pairs].map(([i, j]) => [newAll[j]!, oldAll[i]!]));
	// Matched property by property, so two transitions (opacity, transform) and one keyframe animation of both are the same motion.
	const units = (rs: readonly MotionRecord[]) => rs.flatMap((r) => r.properties.map((p) => ({ r, p })));
	const only = (us: readonly { r: MotionRecord; p: string }[]) => {
		const by = new Map<MotionRecord, string[]>();
		for (const u of us) by.set(u.r, [...(by.get(u.r) ?? []), u.p]);
		return [...by].map(([r, properties]) => (properties.length === r.properties.length ? r : { ...r, properties, from: undefined, to: undefined }));
	};
	const used = new Set<string>();
	const unitKey = (r: MotionRecord, p: string) => `${next.motions.indexOf(r)}|${p}`;
	const out: Difference[] = [];
	const push = (el: ElementSnapshot, what: string, expected: string, actual: string, counterpart?: ElementSnapshot, why = hint) => {
		const failure: Failure = { route, dimension: 'motion', check: `${label}: ${what} of ${describe(el)}`, viewport, expected, actual, hint: why };
		const shape = counterpart ? actual.split(describe(counterpart)).join('it') : actual;
		out.push({ key: `${failure.check}|${expected.replace(/\d+(\.\d+)?/g, '#')}`, group: `${what}|${el.role}|${valueless(expected)}|${valueless(shape)}`, what, failure });
	};
	const nested = (a: ElementSnapshot, b: ElementSnapshot) => Boolean(a.chain && b.chain && (a.chain === b.chain || a.chain.startsWith(`${b.chain}>`) || b.chain.startsWith(`${a.chain}>`)));
	const all = units(next.motions);
	const seen: { el: ElementSnapshot; counterpart?: ElementSnapshot; missing: { r: MotionRecord; p: string }[]; changed: Map<MotionRecord, MotionRecord> }[] = [];
	const take = (m: { r: MotionRecord; p: string }, n: { r: MotionRecord; p: string }, changed: Map<MotionRecord, MotionRecord>) => {
		used.add(unitKey(n.r, n.p));
		const script = m.r.kind === 'script' || n.r.kind === 'script';
		if (!within(m.r.duration, n.r.duration, script) || !within(m.r.delay, n.r.delay, script) || (!script && !sameEasing(m.r.easing, n.r.easing)) || m.r.iterations !== n.r.iterations) changed.set(m.r, n.r);
	};
	const same = (m: { r: MotionRecord; p: string }) => (t: { r: MotionRecord; p: string }) => !used.has(unitKey(t.r, t.p)) && t.p === m.p && (t.r.pseudo ?? '') === (m.r.pseudo ?? '');
	for (const el of new Set(old.motions.map((m) => m.element))) {
		const j = pairs.get(oldAll.indexOf(el));
		const counterpart = j !== undefined ? newAll[j] : undefined;
		const entry = { el, ...(counterpart ? { counterpart } : {}), missing: [] as { r: MotionRecord; p: string }[], changed: new Map<MotionRecord, MotionRecord>() };
		for (const m of units(old.motions.filter((x) => x.element === el))) {
			const n = counterpart ? all.find((t) => t.r.element === counterpart && same(m)(t)) : undefined;
			if (n) take(m, n, entry.changed);
			else entry.missing.push(m);
		}
		seen.push(entry);
	}
	// The same motion on the counterpart's wrapper or child (a panel's transition moved to the element around it) looks the same.
	for (const entry of seen) {
		const c = entry.counterpart;
		if (!c) continue;
		entry.missing = entry.missing.filter((m) => {
			const n = all.find((t) => t.r.element !== c && nested(t.r.element, c) && same(m)(t));
			if (n) take(m, n, entry.changed);
			return !n;
		});
	}
	for (const { el, counterpart, missing, changed } of seen) {
		if (missing.length) {
			const gone = only(missing);
			const props = [...new Set(missing.map((m) => m.p))].join(', ');
			if (sound(gone)) push(el, 'sound', `old ${joined(gone)}`, `new plays nothing (${props})`);
			else push(el, 'motion', `old animates ${joined(gone)}`, counterpart ? `new jumps: ${describe(counterpart)} has no transition or animation of ${props}` : `new jumps: no matching element moves (${props})`, counterpart);
		}
		if (changed.size) push(el, 'motion timing', `old ${joined([...changed.keys()])}`, `new ${joined([...new Set(changed.values())])}`);
	}
	const extra = new Map<ElementSnapshot, { r: MotionRecord; p: string }[]>();
	for (const u of units(next.motions)) if (!used.has(unitKey(u.r, u.p))) extra.set(u.r.element, [...(extra.get(u.r.element) ?? []), u]);
	for (const [el, us] of extra) {
		const ms = only(us);
		const props = [...new Set(us.map((u) => u.p))].join(', ');
		if (sound(ms)) push(back.get(el) ?? el, 'extra sound', `old does not play ${props}`, `new ${joined(ms)}`);
		else push(back.get(el) ?? el, 'extra motion', `old does not animate ${props}`, `new animates ${joined(ms)}`);
	}
	const framed = new Set<ElementSnapshot>();
	const firstOf = (c: MotionCapture, el: ElementSnapshot) => c.pinned?.[0]?.elements.find((p) => p.element === el);
	for (const frame of old.pinned ?? []) {
		const other = next.pinned?.find((f) => f.t === frame.t);
		for (const o of other ? frame.elements : []) {
			if (framed.has(o.element)) continue;
			const j = pairs.get(oldAll.indexOf(o.element));
			const counterpart = j !== undefined ? newAll[j] : undefined;
			const n = counterpart ? other!.elements.find((p) => p.element === counterpart) : undefined;
			if (!n) continue;
			const d = pinnedDifference(o, n, firstOf(old, o.element), firstOf(next, n.element));
			if (!d) continue;
			framed.add(o.element);
			push(o.element, 'frame', `old at ${frame.t} ms${frame.note ? `, ${frame.note}` : ''}: ${d.old}`, `new: ${d.new}`, counterpart, HINTS.motionFrame);
		}
	}
	return out;
}

/** Motion differences of one interaction: what every OLD recording disagrees with NEW on, so motion that varied between OLD runs is not held against NEW. */
export function compareMotion(route: string, label: string, viewport: string, olds: readonly MotionCapture[], next: MotionCapture, hint: string = HINTS.motion): Failure[] {
	if (!olds.length || olds.some((o) => o.failed || o.navigated) || next.failed || next.navigated) return [];
	const [first, ...rest] = olds.map((o) => differences(route, label, viewport, o, next, hint));
	const stands = (d: Difference) => rest.every((r) => r.some((x) => x.key === d.key));
	const groups = new Map<string, Difference[]>();
	for (const d of first!.filter(stands)) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
	return [...groups.values()].map(([d, ...more]) => (more.length ? { ...d!.failure, check: `${d!.failure.check} and ${more.length} more element${more.length === 1 ? '' : 's'} alike` } : d!.failure));
}

/** Old rules that make an element move: a transition or animation with a duration, outside prefers-reduced-motion: reduce. */
export function motionRules(rules: readonly CssRule[]): { selector: string; label: string }[] {
	const inert = (v: string) => /^(none|0m?s|initial|unset)$/i.test(v.trim()) || v.trim().split(/\s*,\s*/).every((x) => /^(none|0m?s)\b/.test(x));
	return rules
		.filter((r) => !r.conditions.some((c) => /prefers-reduced-motion:\s*reduce/.test(c.text)))
		.filter((r) => r.declarations.some((d) => /^(transition|animation)(-name|-duration)?$/.test(d.property) && !inert(d.value) && !(d.property === 'transition' && /^(all\s+)?0m?s/.test(d.value.trim()))))
		.map((r) => ({ selector: r.selector, label: describeRule(r) }));
}

const LAYER = /^- (dialog|alertdialog|menu|listbox)\b/;
const activation = (s: RecordedJourney['steps'][number]) => (s.action === 'click' || (s.action === 'press' && (s.key === 'Enter' || s.key === 'Space')) ? 'use' : `${s.action}${s.action === 'press' ? ` ${s.key}` : ''}`);

/** Journeys whose last step opened a dialog, menu or popup, once per alike opener (the same controls by role and name, clicked or pressed), each to be followed by Escape: what closes them animates only then, and the explorer's own closing journeys may fall past the interaction cap. */
export function motionDismissals(journeys: readonly RecordedJourney[]): MotionJourney[] {
	const out: MotionJourney[] = [];
	const alike = new Set<string>();
	for (const j of journeys) {
		const last = j.expected.at(-1);
		if (j.destructive || j.pattern || !last || j.expected.length < j.steps.length || last.failed || last.navigated || last.writes?.some((w) => !w.sent) || !last.added.some((line) => LAYER.test(line))) continue;
		const key = j.steps.map((s) => `${activation(s)}|${s.target.role}|${s.target.name.replace(/\d+/g, '#')}`).join(' > ');
		if (alike.has(key)) continue;
		alike.add(key);
		out.push({ ...j, name: `${j.name}, then press Escape`, dismiss: true });
	}
	return out;
}

const inPlace = (act: CycleAct) => act === 'again' || act === 'reopen' || act === 'escape' || (typeof act === 'object' && ('use' in act || 'outside' in act));

/** Each use of a journey's control after its steps that stays on the page (the second use of a disclosure's trigger, which closes it, and the third, which opens it again), up to the first one that leaves or reloads it. */
export function motionCycles(journeys: readonly RecordedJourney[]): MotionJourney[] {
	const out: MotionJourney[] = [];
	for (const j of journeys) {
		if (j.destructive || j.expected.length < j.steps.length) continue;
		for (const [i, act] of (j.cycle ?? []).entries()) {
			const r = j.expected[j.steps.length + i];
			if (!inPlace(act) || !r || r.failed || r.navigated || r.writes?.some((w) => !w.sent)) break;
			out.push({ ...j, name: `${j.name} (${cycleLabel(j.steps.length, j.cycle!, i)})`, act: i });
		}
	}
	return out;
}

/** Journeys whose last step stays on the page: their motion is recorded. */
export function motionJourneys(journeys: readonly RecordedJourney[]): { take: RecordedJourney[]; skipped: string[] } {
	const take: RecordedJourney[] = [];
	const skipped: string[] = [];
	const names = new Set<string>();
	for (const j of journeys) {
		// A keyboard pattern journey compares where focus and the highlight go; what its steps animate is the same pop-up its pointer journeys record.
		if (j.destructive || j.pattern || names.has(j.name)) continue;
		names.add(j.name);
		const last = j.expected.at(-1);
		if (!last || j.expected.length < j.steps.length || last.failed) skipped.push(`${j.name}: it could not be used on the old page`);
		else if (last.navigated) skipped.push(`${j.name}: it leads to another page`);
		// What a page animates after a write depends on the server's answer, and a held-back write gets the checker's empty 204 instead.
		else if (last.writes?.some((w) => !w.sent)) skipped.push(`${j.name}: its write was held back (${last.writes.filter((w) => !w.sent).map((w) => w.line).join(', ')}), so what follows is each app's answer to the checker's empty reply, not to the server's; its hover and focus are still compared, and its motion is when writes are sent (--staging or this machine)`);
		else take.push(j);
	}
	return { take, skipped };
}

export interface MotionCheck {
	readonly failures: readonly Failure[];
	readonly motion: MotionResult;
	readonly filmstrips: readonly Filmstrip[];
}

/** What check records for motion, and what it leaves out with why: the journeys and hovers, both in the order recorded. */
export function motionPlan(journeys: readonly RecordedJourney[], options: MotionOptions = {}): { readonly pooled: readonly MotionJourney[]; readonly skipped: readonly string[]; readonly hovered: readonly Target[]; readonly hoverSkipped?: string } {
	const { take, skipped } = motionJourneys(journeys);
	const cap = options.maxInteractions ?? DEFAULT_MAX_INTERACTIONS;
	for (const j of take.slice(cap)) skipped.push(`${j.name}: past the ${cap} interactions recorded per route`);
	const dismissCap = options.maxDismissals ?? DEFAULT_MAX_DISMISSALS;
	const dismissals = motionDismissals(journeys).filter((d) => !take.slice(0, cap).some((t) => t.name.startsWith(d.name)));
	for (const j of dismissals.slice(dismissCap)) skipped.push(`${j.name}: past the ${dismissCap} dismissals recorded per route`);
	const cycleCap = options.maxCycles ?? DEFAULT_MAX_CYCLES;
	const cycles = motionCycles(take.slice(0, cap));
	for (const j of cycles.slice(cycleCap)) skipped.push(`${j.name}: past the ${cycleCap} repeated uses recorded per route`);
	const targets: Target[] = [];
	const seen = new Set<string>();
	for (const j of journeys) {
		const t = j.steps[0]?.target;
		if (!t || j.steps.length !== 1 || j.destructive || !HOVER_ROLES.has(t.role) || seen.has(describeTarget(t)) || j.expected[0]?.failed) continue;
		seen.add(describeTarget(t));
		targets.push(t);
	}
	const hoverCap = options.maxHovers ?? DEFAULT_MAX_HOVERS;
	return { pooled: [...take.slice(0, cap), ...dismissals.slice(0, dismissCap), ...cycles.slice(0, cycleCap)], skipped, hovered: targets.slice(0, hoverCap), ...(targets.length > hoverCap ? { hoverSkipped: `hover and focus of ${targets.length - hoverCap} more controls: past the ${hoverCap} recorded per route` } : {}) };
}

export const hoverHint = (o: MotionCapture) => (o.interaction === SCROLL ? HINTS.motionScroll : HINTS.motionHover);

/** The hovers and focuses whose first recordings differ, to record again on both sides. */
export function hoversToRedo(route: string, viewport: string, hovered: readonly Target[], olds: readonly MotionCapture[], news: readonly MotionCapture[]): { readonly redo: readonly Target[]; readonly scroll: boolean } {
	const differ = new Set(olds.filter((o, i) => compareMotion(route, o.interaction, viewport, [o], news[i]!, hoverHint(o)).length).map((o) => o.interaction));
	return { redo: hovered.filter((t) => differ.has(`hover ${describeTarget(t)}`) || differ.has(`focus ${describeTarget(t)}`)), scroll: differ.has(SCROLL) };
}

/** One recorded interaction: both sides, the second recordings taken when the first differ, and the same with reduced motion. */
export interface MotionInteractionRow {
	readonly old: Recorded;
	readonly next: Recorded;
	readonly again?: Recorded;
	readonly nextAgain?: Recorded;
	readonly reduced?: { readonly old: Recorded; readonly next: Recorded; readonly oldAgain?: Recorded; readonly nextAgain?: Recorded };
	/** When the interaction's frames were kept, its place among the route's filmstrips (they are kept as interactions finish). */
	readonly filmstrip?: number;
}

/** What motion recorded on one route: each planned interaction (in plan order), the hovers, and the canvases' frames. */
export interface MotionRow {
	readonly interactions: readonly MotionInteractionRow[];
	readonly hovers: { readonly old: readonly MotionCapture[]; readonly next: readonly MotionCapture[]; readonly again: readonly MotionCapture[]; readonly nextAgain: readonly MotionCapture[] };
	readonly canvases?: { readonly failures: readonly Failure[]; readonly canvases: readonly CanvasComparison[] };
}

/** A difference stands on NEW when both OLD recordings agree on it and NEW's second recording shows it too. */
export function confirmedMotion(route: string, label: string, viewport: string, old: MotionCapture, next: MotionCapture, again: MotionCapture | undefined, nextAgain: MotionCapture | undefined, hint?: string): { readonly found: Failure[]; readonly needs?: 'again' | 'nextAgain' } {
	let found = compareMotion(route, label, viewport, [old], next, hint);
	if (!found.length) return { found };
	if (!again) return { found, needs: 'again' };
	found = compareMotion(route, label, viewport, [old, again], next, hint);
	if (!found.length) return { found };
	if (!nextAgain) return { found, needs: 'nextAgain' };
	if (!compareMotion(route, label, viewport, [old, again], nextAgain, hint).length) found = [];
	return { found };
}

const must = (r: { readonly found: Failure[]; readonly needs?: string }, label: string): Failure[] => {
	if (r.needs) throw new Error(`the motion row has no ${r.needs} recording of ${label}, whose recordings differ`);
	return r.found;
};

/** Motion on one route, judged from what was recorded on both sides. */
export function judgeMotion(route: string, viewport: Viewport, journeys: readonly RecordedJourney[], options: MotionOptions, row: MotionRow): MotionCheck {
	const plan = motionPlan(journeys, options);
	const skipped = [...plan.skipped];
	const name = viewport.name;
	const failures: Failure[] = [];
	const filmstrips: { at: number; strip: Filmstrip }[] = [];
	const hit = new Set<number>();
	if (row.interactions.length !== plan.pooled.length) throw new Error(`the motion row has ${row.interactions.length} interactions where the judge plans ${plan.pooled.length}`);
	const interactions = plan.pooled.map((journey, k): MotionInteraction & { failures: Failure[] } => {
		const r = row.interactions[k]!;
		const { old, next } = r;
		for (const i of old.hits ?? []) hit.add(i);
		const found = [...must(confirmedMotion(route, journey.name, name, old, next, r.again, r.nextAgain), journey.name)];
		const oldFrames = old.frames ?? r.again?.frames;
		if (found.length && oldFrames && next.frames) {
			if (r.filmstrip === undefined) throw new Error(`the motion row kept no frames of ${journey.name}, whose motion differs`);
			const span = (old.film ?? next.film)?.span ?? 0;
			filmstrips.push({ at: r.filmstrip, strip: { label: journey.name, offsets: Array.from({ length: FRAMES }, (_, i) => Math.round((span * i) / (FRAMES - 1))), old: oldFrames, new: next.frames } });
		}
		let reduced: MotionInteraction['reduced'];
		if (old.motions.length || next.motions.length) {
			if (!r.reduced) throw new Error(`the motion row has no reduced-motion recording of ${journey.name}`);
			const label = `${journey.name}, with prefers-reduced-motion: reduce`;
			const { old: ro, next: rn, oldAgain, nextAgain } = r.reduced;
			const found2 = must(confirmedMotion(route, label, name, ro, rn, oldAgain, nextAgain, HINTS.motionReduced), label);
			found.push(...found2);
			reduced = { old: motionLines(ro.motions), new: motionLines(rn.motions), ok: !found2.length };
		}
		return { name: journey.name, old: motionLines(old.motions), new: motionLines(next.motions), ok: !found.length, ...(reduced ? { reduced } : {}), failures: found };
	});
	for (const i of interactions) failures.push(...i.failures);
	if (plan.hoverSkipped) skipped.push(plan.hoverSkipped);
	const hovers: MotionInteraction[] = [];
	const { old: oldHovers, next: newHovers, again, nextAgain: newAgain } = row.hovers;
	oldHovers.forEach((o, i) => {
		const n = newHovers[i]!;
		const second = again.find((a) => a.interaction === o.interaction);
		const newSecond = newAgain.find((a) => a.interaction === o.interaction);
		const first = compareMotion(route, o.interaction, name, [o], n, hoverHint(o));
		let found = first.length && second ? compareMotion(route, o.interaction, name, [o, second], n, hoverHint(o)) : first;
		if (found.length && second && newSecond && !compareMotion(route, o.interaction, name, [o, second], newSecond, hoverHint(o)).length) found = [];
		failures.push(...found);
		if (o.failed || n.failed) skipped.push(`${o.interaction}: ${o.failed ?? n.failed}`);
		else if (o.motions.length || n.motions.length) hovers.push({ name: o.interaction, old: motionLines(o.motions), new: motionLines(n.motions), ok: !found.length });
	});
	const all = [...interactions.map(({ failures: _, ...i }) => i), ...hovers];
	const shown = failures.slice(0, LIMIT);
	if (failures.length > LIMIT) shown.push({ route, dimension: 'motion', check: 'motion', viewport: name, expected: '', actual: `${failures.length - LIMIT} more motion differences`, hint: HINTS.motion });
	for (const o of oldHovers) for (const i of o.hits ?? []) hit.add(i);
	const unexercised = [...new Set((options.rules ?? []).filter((_, i) => !hit.has(i)).map((r) => r.label))];
	const drawn = row.canvases;
	if (drawn) shown.push(...drawn.failures);
	return { failures: shown, motion: { checked: interactions.length + oldHovers.filter((o) => !o.failed).length, interactions: all, skipped, ...(unexercised.length ? { unexercised } : {}), ...(drawn?.canvases.length ? { canvases: drawn.canvases } : {}) }, filmstrips: filmstrips.sort((a, b) => a.at - b.at).map((f) => f.strip) };
}

// The widget probes, judged from the readings probes.ts took on the old page and the new one: nothing here drives a page.
import type { RecordedJourney } from './journeys.ts';
import type { ProbeControl } from './probe-page.ts';
import { compareStates, firstDiffs, stateHint, stateSpread, type StateDiff, type StateReading } from './state-probe.ts';
import type { Dimension, Failure } from './types.ts';

/**
 * Widget probes: one control of each kind, in each class of widget behaviour, is driven through its class's short sequence on
 * the old and the new page side by side, and what a visitor meets is read after every step: where focus is and whether its ring
 * shows, the state attributes of the control and its widget, what is open, the toasts, tab stops and page lock.
 */
export type ProbeClass = 'modality' | 'popup' | 'hover' | 'drag' | 'repeat' | 'tab stops' | 'context menu' | 'toggle';

export type Op =
	| { readonly op: 'click' | 'right click' | 'click label' | 'tab in' | 'hover' | 'leave' | 'outside' | 'close' | 'point at toasts' | 'toasts leave' }
	/** The n-th item of the list that is open: pointed at or clicked. */
	| { readonly op: 'item'; readonly n: number; readonly how: 'hover' | 'click' }
	/** The first item of what is open that opens a menu of its own: pointed at, or focused and given ArrowRight. */
	| { readonly op: 'submenu'; readonly how: 'hover' | 'key' }
	/** The wheel turned over the first scrolling list of what is open. */
	| { readonly op: 'scroll' }
	/** The first letter of the n-th item whose first letter is new, pressed as typeahead. */
	| { readonly op: 'typeahead'; readonly n: number }
	| { readonly op: 'key'; readonly key: string }
	| { readonly op: 'type'; readonly text: string }
	| { readonly op: 'drag'; readonly dx: number; readonly dy: number };

export interface Sequence {
	readonly cls: ProbeClass;
	readonly name: string;
	readonly ops: readonly Op[];
}

/** What a visitor meets after a step, field by field; lists are compared line by line. */
export type Reading = Readonly<Record<string, string | readonly string[]>>;

/** One sequence's readings on one side: the reading after load first, then one per step; a step that could not be done carries `step`. */
export type Run = readonly Reading[];

export function describeOp(op: Op): string {
	switch (op.op) {
		case 'click':
			return 'click it';
		case 'right click':
			return 'right-click it';
		case 'click label':
			return 'click its label';
		case 'item':
			return `${op.how === 'hover' ? 'point at' : 'click'} item ${op.n + 1} of what is open`;
		case 'scroll':
			return 'turn the wheel over the list of what is open';
		case 'submenu':
			return op.how === 'hover' ? 'point at the first item of what is open that opens a submenu' : 'focus the first item of what is open that opens a submenu and press ArrowRight';
		case 'typeahead':
			return `type the first letter of item ${op.n + 1} (by distinct first letter) of what is open`;
		case 'tab in':
			return 'Tab to it from the control before it';
		case 'hover':
			return 'point at it';
		case 'leave':
			return 'move the pointer away';
		case 'outside':
			return 'click outside it and what it opened';
		case 'close':
			return "click the open dialog's close button";
		case 'point at toasts':
			return 'point at the toasts';
		case 'toasts leave':
			return 'wait for what it showed to leave';
		case 'key':
			return `press ${op.key}`;
		case 'type':
			return `type "${op.text}"`;
		case 'drag':
			return `drag it ${op.dx ? `${Math.abs(op.dx)} px ${op.dx > 0 ? 'right' : 'left'}` : `${Math.abs(op.dy)} px ${op.dy > 0 ? 'down' : 'up'}`}`;
	}
}

const DIMENSION: Record<ProbeClass, Dimension> = { modality: 'a11y', popup: 'behaviour', hover: 'behaviour', drag: 'behaviour', repeat: 'behaviour', 'tab stops': 'a11y', 'context menu': 'behaviour', toggle: 'a11y' };

export const PROBE_HINTS: Record<ProbeClass, string> = {
	modality: 'Whether the focus ring shows follows how the visitor last moved: a key press (Tab, an arrow, Escape) shows it, a pointer press hides it, and typing into a text field or moving the mouse leaves it as it was. Track the modality on the document the way the old library does (keydown before pointerdown), not per control, and set the same marker (data-focus-visible or :focus-visible) on the element that has focus.',
	'context menu': 'A right click opens this menu on the old page: open it at the pointer, highlight the item the pointer is on and drop the highlight when it leaves, open again with nothing highlighted, close it on Escape or a click outside, and move to the item a typed letter starts (no site shortcut may take that key while the menu is open).',
	toggle: 'Each key turns this control on or off exactly as on the old page: Space toggles a checkbox or switch, Enter does only what the old one does (a Radix checkbox ignores it, a toggle button presses), a click toggles it once, and focus stays on it; a click on its label toggles it and focuses the control the old page focuses, not a hidden native input.',
	popup: 'What this control opens must answer as on the old page: the item the pointer is on is highlighted and the highlight goes when the pointer leaves or the list closes, so a reopened list starts fresh; a list opened by the pointer takes focus so ArrowDown moves in it, and Tab closes it; a typed letter moves to the item it starts; a hidden form input follows the chosen value; a reopened overlay is visible and its content rendered once; Tab inside a non-modal popover moves on as the old one does, a modal one keeps focus in. Opening and closing by the pointer must leave focus where the old page leaves it: on open, in the pop-up or its first item as the old library chooses; after Escape or the close button, back on the control; after a click outside, where the old page put it (the control for a modal, the clicked spot for a non-modal). Lock scrolling and hide the rest of the page only while the old page does.',
	hover: 'The pointer resting on this control (or focus reaching it) shows something on the old page, or marks it hovered: open it after the same delay, keep it while the pointer is on it, close it when the pointer leaves, and set the same hover markers (data-hovered, data-state).',
	drag: 'A pointer drag moves this control on the old page: follow the pointer (pointerdown, pointermove, pointerup), move the value, panel or slide by the same amount, take focus as the old one does, and leave the same state attributes after release.',
	repeat: 'Each use of this control adds what the old page adds (a toast, a notification): the next use stacks on top rather than replacing it, the front one is marked as such, and pointing at the stack expands it as on the old page.',
	'tab stops': 'This widget is one tab stop on the old page with arrows moving inside it (roving tabindex): keep exactly the same tab stops, move with the arrows of its orientation only, remember the last item when Tab leaves and comes back, and leave disabled items out.',
};

export const controlKey = (c: Pick<ProbeControl, 'role' | 'name' | 'nth'>) => `${c.role}|${c.name.replace(/\s+/g, '')}|${c.nth}`;

export function describeControl(c: Pick<ProbeControl, 'role' | 'name' | 'nth'>): string {
	return `${c.role}${c.name ? ` "${c.name.slice(0, 60)}"` : ''}${c.nth ? ` #${c.nth + 1}` : ''}`;
}

export interface FieldDiff {
	readonly field: string;
	readonly old: string;
	readonly new: string;
}

export const lines = (v: string | readonly string[] | undefined): readonly string[] => (v === undefined ? [] : typeof v === 'string' ? [v] : v);
const isList = (r: Reading, field: string) => Array.isArray(r[field]);
// A swipe's momentum carries a track a pixel or two further on one load than another (offsets agree within 2 px or 2%); scroll positions within 40 px are layout noise.
const near = (a: string, b: string, tolerance: number) => {
	const na = a.match(/-?\d+(\.\d+)?/g) ?? [];
	const nb = b.match(/-?\d+(\.\d+)?/g) ?? [];
	return a.replace(/-?\d+(\.\d+)?/g, '#') === b.replace(/-?\d+(\.\d+)?/g, '#') && na.length === nb.length && na.every((n, i) => Math.abs(Number(n) - Number(nb[i])) <= Math.max(tolerance, Math.abs(Number(n)) * 0.02));
};
// Fields that read a library's own markup, which a port may write another way at load; focus, tab stops and what is open are the visitor's.
const MARKUP = new Set(['control', 'widget', 'widget text', 'around', 'hovered', 'moved', 'form']);
const skeleton = (line: string) => line.replace(/\d+/g, '#');
// How long toasts stay once the probe lets their timers go is read in real time: within half a second is the same lifetime.
const TOLERANCE: Record<string, number> = { moved: 2, scroll: 40, 'toasts left': 500 };
const same = (field: string, a: string, b: string) => a === b || (TOLERANCE[field] !== undefined && near(a, b, TOLERANCE[field]!));
const minus = (field: string, a: readonly string[], b: readonly string[]) => a.filter((x) => !b.some((y) => same(field, x, y)));

/**
 * The fields that differ at each step, old against new. A difference the two pages already had at load (markup a port writes
 * another way) is the rendered check's and left out unless the step changes it on one side only; with a second old run, what
 * differs between the two old runs at a step is noise there.
 */
export function compareRuns(old: Run, next: Run, again?: Run): FieldDiff[][] {
	const out: FieldDiff[][] = [];
	const o0 = old[0] ?? {};
	const n0 = next[0] ?? {};
	for (let k = 1; k < old.length; k++) {
		const o = old[k]!;
		const n = next[k];
		const diffs: FieldDiff[] = [];
		// A step neither page could take (pointing at an item of a dialog that has none) is no difference; one only old could not take ends the comparison.
		if (o.step && o.step !== n?.step) break;
		if (!n) {
			diffs.push({ field: 'step', old: 'done', new: 'the sequence stopped before this step' });
			out.push(diffs);
			continue;
		}
		const a = again?.[k];
		for (const field of new Set([...Object.keys(o), ...Object.keys(n)])) {
			if (field === 'step') continue;
			if (isList(o, field) || isList(n, field)) {
				// A line that varied between the two old runs may vary on new too, in the digits that varied there.
				const noise = a ? [...minus(field, lines(o[field]), lines(a[field])), ...minus(field, lines(a[field]), lines(o[field]))].map(skeleton) : [];
				const staticOld = MARKUP.has(field) ? minus(field, lines(o0[field]), lines(n0[field])) : [];
				const staticNew = MARKUP.has(field) ? minus(field, lines(n0[field]), lines(o0[field])) : [];
				const missing = minus(field, minus(field, lines(o[field]), lines(n[field])), staticOld).filter((l) => !noise.includes(skeleton(l)));
				const extra = minus(field, minus(field, lines(n[field]), lines(o[field])), staticNew).filter((l) => !noise.includes(skeleton(l)));
				if (missing.length || extra.length) diffs.push({ field, old: missing.join('; ') || '(nothing else)', new: extra.join('; ') || '(not this)' });
				continue;
			}
			const ov = String(o[field] ?? '(none)');
			const nv = String(n[field] ?? '(none)');
			if (same(field, ov, nv)) continue;
			if (a && !same(field, ov, String(a[field] ?? '(none)'))) continue;
			const ob = String(o0[field] ?? '(none)');
			const nb = String(n0[field] ?? '(none)');
			if (MARKUP.has(field) && !same(field, ob, nb) && same(field, ov, ob) === same(field, nv, nb)) continue;
			diffs.push({ field, old: ov, new: nv });
		}
		// A step only one side reports trouble with (a click Playwright found unsteady) is a difference only when what a visitor meets differs too.
		if (n.step && n.step !== o.step && diffs.length) diffs.unshift({ field: 'step', old: 'done', new: String(n.step) });
		out.push(diffs);
	}
	return out;
}

export interface ProbeResult {
	readonly failures: Failure[];
	/** Each probed control and class: `probed`, `alike` (another control of its kind stood for it), or why it was not. */
	readonly controls: readonly { readonly control: string; readonly cls: ProbeClass; readonly state: string; readonly ms?: number }[];
	readonly ms: number;
	/** Time the state probe's reads took, both sides, every step. */
	readonly stateMs: number;
	/** The largest old-against-new difference in each measure the state probe's tolerances bound, over every sequence. */
	readonly stateSpread: Readonly<Record<string, number>>;
}

export function unprobed(route: string, control: string, cls: ProbeClass, why: string): Failure {
	return { route, dimension: DIMENSION[cls], check: `not exercised: ${cls} probe of ${control}`, expected: `the ${cls} probe drives it on both pages`, actual: why, hint: 'A control check could not drive is not proven alike. Raise the probe budget, or fix what kept the probe from reaching it; the route stays red until it is probed.' };
}

export function probeFailure(route: string, control: ProbeControl, sequence: Sequence, k: number, steps: readonly FieldDiff[][], old: Run, next: Run, files: readonly string[]): Failure {
	const trail = sequence.ops.slice(0, k + 1).map(describeOp);
	const diffs = steps[k]!;
	const later = steps.flatMap((d, i) => (i > k && d.length ? [i + 1] : []));
	const context = (r: Reading | undefined) => (diffs.some((d) => d.field === 'focus') ? '' : `; focus: ${String(r?.focus ?? '?')}`);
	return {
		route,
		dimension: DIMENSION[sequence.cls],
		check: `${sequence.cls} probe of ${describeControl(control)}: ${sequence.name} (step ${k + 1} of ${sequence.ops.length}: ${trail.at(-1)})`,
		expected: `old, after ${trail.join(', then ')}: ${diffs.map((d) => `${d.field}: ${d.old}`).join('; ')}${context(old[k + 1])}`,
		actual: `new: ${diffs.map((d) => `${d.field}: ${d.new}`).join('; ')}${context(next[k + 1])}${later.length ? `; it differs again at step${later.length > 1 ? 's' : ''} ${later.join(', ')}` : ''}`,
		hint: `${PROBE_HINTS[sequence.cls]}${files.length ? ` Likely part: ${files.join(', ')} (its selectors match this control or what it opened).` : ''}`,
	};
}

export function stateFailure(route: string, control: ProbeControl, sequence: Sequence, k: number, diff: StateDiff, files: readonly string[]): Failure {
	return {
		route,
		dimension: diff.dimension,
		check: `${diff.field} after ${describeOp(sequence.ops[k]!)} on ${describeControl(control)} (state probe: ${sequence.name}, step ${k + 1} of ${sequence.ops.length})`,
		expected: `old: ${diff.old}`,
		actual: `new: ${diff.new}`,
		hint: `${stateHint(diff.field)}${files.length ? ` Likely part: ${files.join(', ')} (its selectors match this control or what it opened).` : ''}`,
	};
}

/** One sequence driven on both sides, or why it was not, in the order the probes finished them. */
export interface ProbeItem {
	/** `work` for the route's own controls, `orphans` for widgets the route that first saw them could not drive. */
	readonly phase: 'work' | 'orphans';
	/** Its place in its phase's queue: each control's line of the result is listed in that order. */
	readonly queue: number;
	readonly control: ProbeControl;
	readonly sequence: Sequence;
	readonly read:
		| { readonly leftOut: string }
		| {
				readonly old: Run;
				readonly next: Run;
				readonly oldStates: readonly StateReading[];
				readonly newStates: readonly StateReading[];
				/** The old side once more, when the first runs differ. */
				readonly again?: Run;
				readonly againStates?: readonly StateReading[];
				/** The port's parts whose selectors match what the new side drove. */
				readonly files: readonly string[];
				readonly ms: number;
		  };
}

/** A widget another route of the run drove for this one, and what it handed over. */
export interface BorrowedProbe {
	readonly control: ProbeControl;
	readonly cls: ProbeClass;
	readonly from: string;
	readonly state: string;
	readonly failures: readonly Failure[];
}

/** What the widget probes read on one route. */
export interface ProbesRow {
	/** Controls listed without being driven (another of its kind stood for it, or over the cap), in the order found. */
	readonly listed: readonly { readonly control: string; readonly cls: ProbeClass; readonly state: string }[];
	readonly items: readonly ProbeItem[];
	readonly borrowed: readonly BorrowedProbe[];
	readonly ms: number;
}

export const itemId = (control: ProbeControl, cls: ProbeClass) => `${controlKey(control)}|${cls}`;

/** The route's own sequences of one phase, judged in the order they finished: each control's state and its failures. */
function judgeItems(route: string, items: readonly ProbeItem[], phase: ProbeItem['phase'], acc: { state: Map<string, { control: string; cls: ProbeClass; state: string; ms: number }>; failures: Failure[]; failuresOf: Map<string, Failure[]>; stated: Set<string>; stateMs: number; spread: Record<string, number> }): void {
	const mine = items.filter((i) => i.phase === phase);
	for (const item of [...mine].sort((a, b) => a.queue - b.queue)) {
		const id = itemId(item.control, item.sequence.cls);
		if (!acc.state.has(id)) acc.state.set(id, { control: describeControl(item.control), cls: item.sequence.cls, state: 'probed', ms: 0 });
	}
	for (const item of mine) {
		const id = itemId(item.control, item.sequence.cls);
		const entry = acc.state.get(id)!;
		if ('leftOut' in item.read) {
			entry.state = item.read.leftOut;
			continue;
		}
		const { old, next, oldStates, newStates, again, againStates, files, ms } = item.read;
		acc.stateMs += [...oldStates, ...newStates].reduce((t, r) => t + r.ms, 0);
		for (const [k, v] of Object.entries(stateSpread(oldStates, newStates))) acc.spread[k] = Math.max(acc.spread[k] ?? 0, v);
		// A control the new page lacks is the journeys' and the rendered check's finding; the probe has nothing to drive there.
		if (old[0]?.control !== 'not on the page' && next[0]?.control === 'not on the page') {
			entry.state = 'not on the new page: the journeys and the rendered check compare whether it is there';
			continue;
		}
		const steps = compareRuns(old, next, again);
		const stateSteps = compareStates(oldStates, newStates, againStates);
		entry.ms += ms;
		if (old[0]?.control === 'not on the page') entry.state = 'not found again on the old page';
		else
			for (const { step, diff } of firstDiffs(stateSteps)) {
				if (acc.stated.has(`${controlKey(item.control)}|${diff.field}`)) continue;
				acc.stated.add(`${controlKey(item.control)}|${diff.field}`);
				const failure = stateFailure(route, item.control, item.sequence, step, diff, [...files]);
				acc.failures.push(failure);
				acc.failuresOf.set(id, [...(acc.failuresOf.get(id) ?? []), failure]);
			}
		const k = steps.findIndex((d) => d.length);
		if (k < 0) continue;
		const failure = probeFailure(route, item.control, item.sequence, k, steps, old, next, [...files]);
		acc.failures.push(failure);
		acc.failuresOf.set(id, [...(acc.failuresOf.get(id) ?? []), failure]);
	}
}

const emptyAcc = () => ({ state: new Map<string, { control: string; cls: ProbeClass; state: string; ms: number }>(), failures: [] as Failure[], failuresOf: new Map<string, Failure[]>(), stated: new Set<string>(), stateMs: 0, spread: {} as Record<string, number> });

/** What the route's own sequences found for each control and class: what it hands the routes that render the same widget. */
export function handedOver(route: string, items: readonly ProbeItem[]): Map<string, { readonly state: string; readonly failures: readonly Failure[] }> {
	const acc = emptyAcc();
	judgeItems(route, items, 'work', acc);
	return new Map([...acc.state].map(([id, e]) => [id, { state: e.state, failures: acc.failuresOf.get(id) ?? [] }]));
}

/** The widget probes of one route, judged from what they read on both pages. */
export function judgeProbes(route: string, row: ProbesRow): ProbeResult {
	const controls: { control: string; cls: ProbeClass; state: string; ms?: number }[] = [...row.listed];
	const acc = emptyAcc();
	judgeItems(route, row.items, 'work', acc);
	for (const { control, cls, from, state: done, failures: theirs } of row.borrowed) {
		if (done.startsWith('left out') || done.startsWith('not found')) continue;
		controls.push({ control: describeControl(control), cls, state: done === 'probed' ? `probed on ${from}, which renders the same widget` : `${done} (on ${from}, which renders the same widget)` });
		for (const f of theirs) acc.failures.push({ ...f, route, actual: `${f.actual} (driven on ${from}, which renders the same widget)` });
	}
	judgeItems(route, row.items, 'orphans', acc);
	for (const e of acc.state.values()) {
		controls.push({ control: e.control, cls: e.cls, state: e.state, ...(e.ms ? { ms: e.ms } : {}) });
		if (e.state.startsWith('left out') || e.state.startsWith('not found')) acc.failures.push(unprobed(route, e.control, e.cls, e.state));
	}
	for (const c of controls) if (c.state.startsWith('left out: over')) acc.failures.push(unprobed(route, c.control, c.cls, c.state));
	return { failures: acc.failures, controls, ms: row.ms, stateMs: acc.stateMs, stateSpread: acc.spread };
}

/** Buttons whose click announced something in a live region in the recorded journeys: they get the repeated-use probe. */
export function notifiers(journeys: readonly RecordedJourney[] | undefined): string[] {
	const out = new Set<string>();
	for (const j of journeys ?? []) {
		const step = j.steps[0];
		if (j.steps.length !== 1 || step?.action !== 'click' || step.target.role !== 'button' || !j.expected[0]?.announcements.length) continue;
		out.add(step.target.name);
	}
	return [...out];
}

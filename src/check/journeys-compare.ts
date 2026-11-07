// What a journey's steps did on the original against the port, judged from their recorded step results alone: nothing here opens a page.
import { clockLine } from './clock.ts';
import { HINTS } from './hints.ts';
import { diffLines, lineTemplates, template } from './noise.ts';
import { storageCandidate, type StorageOwner } from './automatic.ts';
import type { CycleAct, Journey, Reaction, RecordedJourney, Run, Step, StepResult, Target, Views } from './journeys.ts';
import type { Structure } from './structure.ts';
import type { Box, Dimension, Failure } from './types.ts';

// Journeys run again after arriving in place, most important first.
export const MAX_ARRIVED = 30;

export const describeStructure = (s: Structure) => `<${s.tag}> #${s.index + 1}${s.scope ? ` in ${s.scope}` : ''}`;

export function describeTarget(t: Target): string {
	if (t.role === SECTION) return `section #${t.name}`;
	if (t.structure) return `${t.role} ${describeStructure(t.structure)} (no name: matched by structure and position)`;
	return `${t.role}${t.name ? ` "${t.name}"` : ''}${t.nth ? ` #${t.nth + 1}` : ''}`;
}

export function describeStep(step: Step): string {
	switch (step.action) {
		case 'click':
			return `click ${describeTarget(step.target)}`;
		case 'press':
			return `press ${step.key} on ${describeTarget(step.target)}`;
		case 'key': {
			const key = step.key === 'Typeahead' ? 'the first letter of the last item' : step.choose ? `${step.key} to choose` : step.key;
			if (step.key === 'Focus') return `focus ${describeTarget(step.target)}`;
			return step.focus ? `focus ${describeTarget(step.target)} and press ${key}` : `press ${key}`;
		}
		case 'outside':
			return `click outside ${describeTarget(step.target)} and what it opened`;
		case 'fill':
			return `type "${step.value}" into ${describeTarget(step.target)}`;
		case 'select':
			return `choose "${step.value}" in ${describeTarget(step.target)}`;
		case 'submit':
			return `fill ${step.fields.map((f) => describeTarget(f.target)).join(', ')} and submit with ${describeTarget(step.target)}`;
		case 'scroll':
			return `scroll to ${describeTarget(step.target)}`;
		case 'hover':
			return `point at ${Math.round(step.at * 100)}% across ${describeTarget(step.target)}`;
		case 'live':
			return step.away ? `the database takes ${step.updates} update${step.updates === 1 ? '' : 's'} while the page is not listening` : `receive ${step.updates} live update${step.updates === 1 ? '' : 's'} from the database`;
		case 'race':
			return step.then === 'back' ? `click ${describeTarget(step.target)}, then go back before its page has arrived` : `click ${describeTarget(step.target)}, then ${describeTarget(step.then)} before the first one's page has arrived`;
		case 'type':
			return `type "${step.value}" into ${describeTarget(step.target)} key by key, ${step.delayMs} ms apart`;
	}
}


export const SECTION = 'section';

/** A request line that only reads: a GET or HEAD, or a GraphQL query (not a mutation). */
export const readLine = (line: string) => /^(GET|HEAD) /.test(line) || /^POST \S+ \{"query":"(query\b|\{)/.test(line);

export const closedBy = (act: CycleAct) => (act === 'escape' ? 'Escape' : act === 'back' ? 'going back' : 'a click outside it');

function stable(values: readonly string[]): (value: string) => boolean {
	return template(values[0]!, ...values.slice(1)).test;
}

export const near = (a: Box, b: Box, pad = 16) => a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;
// The same answer elsewhere in the view (text above it wrapped differently, a page laid out right to left) is a region of about its size: where it sits is the visual check's.
const alike = (a: Box, b: Box) => near(a, b) || Math.min(a.width * a.height, b.width * b.height) / Math.max(a.width * a.height, b.width * b.height) >= 0.25;
const boxAt = (b: Box) => `(${b.x}, ${b.y}) ${b.width}x${b.height}`;

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
/** Share of a changed region the other side's changes must cover where they reach into it: a tab's underline sliding inside the region where the old page also swapped the panel below it is not that panel's answer. */
const COVERED = 0.5;
// Changes that reach into the region answer it only by covering most of it; elsewhere, one of about its size does (where it sits is the visual check's).
const answers = (box: Box, mine: readonly Box[]) => (mine.some((o) => overlap(o, box) > 0) ? mine.reduce((n, o) => n + overlap(o, box), 0) >= COVERED * box.width * box.height : mine.some((o) => alike(o, box)));

/** How every old run of a step answered that the new run did not: widget changes each old run made, and regions of the view each old run changed that the new page left as they were. */
export function missingReaction(olds: readonly StepResult[], next: StepResult): { changes: string[]; regions: Box[] } {
	const reactions = olds.map((o) => o.reaction);
	const mine = next.reaction;
	if (!mine || !reactions.length || reactions.some((r) => !r)) return { changes: [], regions: [] };
	const [first, ...rest] = reactions as Reaction[];
	const changes = first!.changes.filter((c) => rest.every((r) => r.changes.includes(c)) && !mine.changes.includes(c));
	if (first!.scrolled && rest.every((r) => r.scrolled) && !mine.scrolled) changes.push('the page scrolled');
	const framed = !first!.scrolled && rest.every((r) => !r.scrolled) && !mine.scrolled;
	const regions = framed ? first!.regions.filter((box) => rest.every((r) => answers(box, r.regions)) && !answers(box, mine.regions)) : [];
	return { changes, regions };
}

/** The regions every old run changed outside the used control, when the new page changed none: a control whose effect never reaches the page. */
export function deadControl(olds: readonly StepResult[], next: StepResult): string[] | undefined {
	const mine = next.reaction?.affected;
	if (!mine || mine.length || !olds.length || olds.some((o) => !o.reaction?.affected?.length)) return undefined;
	const [first, ...rest] = olds.map((o) => o.reaction!.affected!);
	const common = first!.filter((r) => rest.every((o) => o.includes(r)));
	return common.length ? common : [...first!];
}

/** The regions every old run changed outside the used control that the new page did not change at all (counting namesakes as one): what a control failed to reach. */
export function lostRegions(olds: readonly StepResult[], next: StepResult): string[] | undefined {
	const mine = next.reaction?.affected;
	if (!mine || !olds.length || olds.some((o) => !o.reaction?.affected?.length)) return undefined;
	const bare = (r: string) => r.replace(/ #\d+/g, '');
	const [first, ...rest] = olds.map((o) => o.reaction!.affected!.map(bare));
	const lost = [...new Set(first!.filter((r) => rest.every((o) => o.includes(r)) && !mine.map(bare).includes(r)))];
	return lost.length ? lost : undefined;
}

/** lostRegions, counting a region as changed when the new page changed a named region inside it (the original's `main`, the port's `listbox in main`). */
export function lostWithin(olds: readonly StepResult[], next: StepResult): string[] | undefined {
	const bare = (r: string) => r.replace(/ #\d+/g, '');
	const mine = (next.reaction?.affected ?? []).map(bare);
	const lost = lostRegions(olds, next)?.filter((r) => !mine.some((m) => m.endsWith(` in ${r}`)));
	return lost?.length ? lost : undefined;
}

/** Failures that are a slower answer alone, or a view in between alone, with the journey and step to time again one side at a time before they stand. */
export const timedOnly = new WeakMap<Failure, { readonly journey: number; readonly step: number; readonly views?: true; readonly cadence?: true }>();

const SHIFT_PX = 4;
const SHIFT_SCORE = 0.02;
// Measured on a 2-core runner: identical pages differ by up to about 90 ms from input to first change.
const SLOWER_MS = 100;
const SLOWER_RATIO = 1.5;

/** What starts moving on the new page while its router swaps the page in place, that no old run moved: content morphing from the previous page's look. */
export function morphs(olds: readonly StepResult[], next: StepResult): string[] {
	const seen = new Set(olds.flatMap((o) => o.reaction?.transitions ?? []));
	return (next.reaction?.transitions ?? []).filter((t) => !seen.has(t));
}

/** The new page shifts its layout during a step where every old run held still, or by more: a jump a visitor sees (scroll-lock padding released at the wrong moment). */
export function extraShift(olds: readonly StepResult[], next: StepResult): string | undefined {
	if (!next.reaction || olds.some((o) => !o.reaction)) return undefined;
	const most = (pick: (s: NonNullable<Reaction['shift']>) => number) => Math.max(0, ...olds.map((o) => (o.reaction!.shift ? pick(o.reaction!.shift) : 0)));
	const n = next.reaction.shift ?? { score: 0, x: 0, y: 0 };
	const [x, y, score] = [most((s) => s.x), most((s) => s.y), most((s) => s.score)];
	if (n.x <= x + SHIFT_PX && n.y <= y + SHIFT_PX && n.score <= score + SHIFT_SCORE) return undefined;
	return `old: a large part of the page moves at most ${x} px sideways and ${y} px up or down (layout shift ${score}); new: ${n.x} px sideways and ${n.y} px up or down (layout shift ${n.score})`;
}

// A placeholder shown for under a tenth of a second is a flicker at most; one shown longer is a view the visitor reads.
const INTERIM_MS = 100;

/** The new page shows views between the step and its result (a loading placeholder, the content gone and back) that no old run showed. How long a placeholder both show stays up follows the server's speed: that is the responsiveness check's. */
export function interimViews(olds: readonly StepResult[], next: StepResult): string | undefined {
	const mine = next.reaction?.views;
	if (!mine || olds.some((o) => !o.reaction?.views)) return undefined;
	const seen = new Set(olds.flatMap((o) => o.reaction!.views!.interim));
	if (mine.interimMs < INTERIM_MS || mine.interim.every((v) => seen.has(v))) return undefined;
	return `old: ${viewsLine(olds[0]!.reaction!.views!)}; new: ${viewsLine(mine)}`;
}

const viewsLine = (v: Views) => (v.swaps <= 1 ? 'goes straight to the result' : `shows ${v.swaps - 1} view${v.swaps > 2 ? 's' : ''} in between for ${v.interimMs} ms (${v.interim.map((t) => `"${t}"`).join(', ')}) before the result`);

const TWEEN_FRAMES = 4;
/** What a step can differ in while leaving the page where the old one left it. */
const ON_THE_WAY = new Set(['reaction', 'answer time', 'in between', 'cadence', 'tween', 'shift', 'morph']);
const tweenOf = (line: string) => {
	const [what, frames, ms] = line.split('|');
	return { what: what!, frames: Number(frames), ms: Number(ms) };
};

/** A shape every old run moved over several frames (a chart's path tweened to its new data) that the new page jumps to, or never moves. */
export function lostTweens(olds: readonly StepResult[], next: StepResult): string[] {
	const runs = olds.map((o) => new Map((o.reaction?.tweened ?? []).map(tweenOf).map((t) => [t.what, t])));
	const mine = new Map((next.reaction?.tweened ?? []).map(tweenOf).map((t) => [t.what, t]));
	return [...(runs[0] ?? new Map())].filter(([what]) => runs.every((r) => (r.get(what)?.frames ?? 0) >= TWEEN_FRAMES) && (mine.get(what)?.frames ?? 0) <= 1).map(([what, t]) => `${what} over ${t.frames} frames (${t.ms} ms)`);
}

const STREAMED = 6;

/** Text every old run showed arriving in many small changes (a streamed reply) that the new page shows in a few large ones, or all at once. */
export function choppier(olds: readonly StepResult[], next: StepResult): string | undefined {
	const mine = next.reaction?.views;
	const theirs = olds.map((o) => o.reaction?.views);
	if (!mine || theirs.some((v) => !v || v.swaps < STREAMED || (v.spanMs ?? 0) < 300)) return undefined;
	const fewest = Math.min(...theirs.map((v) => v!.swaps));
	const longest = Math.max(...theirs.map((v) => v!.longestGapMs ?? 0));
	if (mine.swaps * 2 > fewest || (mine.swaps > 1 && (mine.longestGapMs ?? 0) < Math.max(150, longest * 2))) return undefined;
	const line = (v: Views) => (v.swaps <= 1 ? 'all at once' : `in ${v.swaps} changes over ${v.spanMs} ms, at most ${v.longestGapMs} ms apart`);
	return `old: ${line(theirs[0]!)}; new: ${line(mine)}`;
}

/** The new page takes meaningfully longer than every old run to show its first change after a step. */
export function slowerAnswer(olds: readonly StepResult[], next: StepResult): string | undefined {
	// A step that asks the server first is as fast as the server; how fast each side's server answers is the responsiveness check's, on a fair network.
	if ([...olds, next].some((r) => r.requests.length || r.writes?.length)) return undefined;
	const times = olds.map((o) => o.reaction?.answeredMs);
	const mine = next.reaction?.answeredMs;
	if (mine === undefined || times.some((t) => t === undefined)) return undefined;
	const old = Math.max(...(times as number[]));
	if (mine - old <= SLOWER_MS || mine <= old * SLOWER_RATIO) return undefined;
	return `the old page changes ${old} ms after the step; the new page ${mine} ms after it`;
}

function answered(r: StepResult, missing: { changes: string[]; regions: Box[] }, old: boolean): string {
	if (old) return `answers with: ${[...missing.changes, ...missing.regions.map((b) => `the view changes at ${boxAt(b)}`)].join(' | ')}`;
	const changes = r.reaction?.changes.length ? r.reaction.changes.join(' | ') : 'no widget changes';
	const view = missing.regions.length ? `the view does not change at ${missing.regions.map(boxAt).join(', ')}${r.reaction?.regions.length ? ` (it changes at ${r.reaction.regions.slice(0, 3).map(boxAt).join(', ')})` : ''}` : '';
	return `answers with: ${[changes, view].filter(Boolean).join('; ')}`;
}

// A step that swaps most of the page lists thousands of lines; the first ones show what happened, and a run's report stays a size it can write.
const LISTED = 80;
const listed = (lines: readonly string[]) => `${lines.slice(0, LISTED).join(' | ')}${lines.length > LISTED ? ` | … and ${lines.length - LISTED} more lines` : ''}`;

function format(result: StepResult, parts: readonly string[], missing?: { changes: string[]; regions: Box[]; lost?: readonly string[] }, old = false): string {
	const out: string[] = [];
	if (parts.includes('failed') && result.failed) out.push(result.failed);
	if (parts.includes('url')) out.push(`URL ${result.url}`);
	if (parts.includes('added')) out.push(`appears: ${listed(result.added) || '(nothing)'}`);
	if (parts.includes('removed')) out.push(`disappears: ${listed(result.removed) || '(nothing)'}`);
	if (parts.includes('moved')) out.push(`moves: ${listed(result.moved ?? []) || '(nothing)'}`);
	if (parts.includes('requests')) out.push(`requests: ${result.requests.join(', ') || '(none)'}`);
	if (parts.includes('errors')) out.push(`console errors: ${result.errors.join(' | ') || '(none)'}`);
	if (parts.includes('announcements')) out.push(`announced: ${result.announcements.join(' | ') || '(nothing)'}`);
	if (parts.includes('focus')) out.push(`focus on ${result.focus}`);
	if (parts.includes('widget')) out.push(`widget: ${result.widget?.join(' | ') || '(not read)'}`);
	if (parts.includes('state')) out.push(`changed: ${result.state?.join(' | ') || '(nothing)'}`);
	if (parts.includes('storage')) out.push(`kept in the browser: ${result.storage?.join(', ') || '(no change)'}`);
	if (parts.includes('dialogs')) out.push(`dialogs: ${result.dialogs?.join(' | ') || '(none)'}`);
	if (parts.includes('downloads')) out.push(`downloads: ${result.downloads?.join(', ') || '(nothing)'}`);
	if (parts.includes('reaction') && missing) out.push(answered(result, missing, old));
	if (parts.includes('region') && missing?.lost) out.push(old ? `changes ${missing.lost.join(', ')}` : `does not change ${missing.lost.join(', ')}${result.reaction?.affected?.length ? ` (it changes ${result.reaction.affected.join(', ')})` : ''}`);
	const shifted = result.reaction?.shift;
	if (parts.includes('shift')) out.push(`layout: ${shifted ? `a large part of the page moves ${shifted.x} px sideways and ${shifted.y} px up or down (layout shift ${shifted.score})` : 'nothing moves'}`);
	if (parts.includes('answer time')) out.push(`first change ${result.reaction?.answeredMs ?? '?'} ms after the step`);
	if (parts.includes('in between') && result.reaction?.views) out.push(`on screen until the result: ${viewsLine(result.reaction.views)}`);
	if (parts.includes('cadence') && result.reaction?.views) out.push(`what it shows arrives ${result.reaction.views.swaps <= 1 ? 'all at once' : `in ${result.reaction.views.swaps} changes over ${result.reaction.views.spanMs} ms, at most ${result.reaction.views.longestGapMs} ms apart`}`);
	if (parts.includes('stale')) out.push(`against a fresh load of where it ended: ${result.stale?.length ? `shows ${listed(result.stale)}` : 'the same page'}`);
	if (parts.includes('morph')) out.push(`moves while the page changes: ${result.reaction?.transitions?.slice(0, 8).join(' | ') || '(nothing)'}`);
	if (parts.includes('tween')) out.push(`moves frame by frame: ${result.reaction?.tweened?.map(tweenOf).filter((t) => t.frames >= TWEEN_FRAMES).map((t) => `${t.what} over ${t.frames} frames (${t.ms} ms)`).slice(0, 6).join(' | ') || '(nothing: it jumps to its end)'}`);
	return out.join('; ');
}

/** Journeys whose cycle changed how the page looks (its background, text colour or colour scheme): a theme or mode, which an OS in dark mode can start from another state. */
export function themed(journeys: readonly RecordedJourney[]): RecordedJourney[] {
	return journeys.filter((j) => j.cycle?.length && !j.destructive && j.expected.some((r) => r.state?.some((l) => /^page (background|text colour|color-scheme):/.test(l))));
}

/** The same journeys as seen with the OS in dark mode, named so. */
export const inDarkMode = (journeys: readonly Journey[]): Journey[] => journeys.map((j) => ({ ...j, name: `${j.name}, with the OS in dark mode` }));

/** What a cycle act is called in a check name: `click button "Theme" (use 2 of 3)`. */
export function cycleLabel(steps: number, acts: readonly CycleAct[], i: number): string {
	const step = `step ${steps + i + 1} of ${steps + acts.length}`;
	const uses = 1 + acts.slice(0, i + 1).filter((a) => a === 'again' || (typeof a === 'object' && 'use' in a)).length;
	const act = acts[i]!;
	const after = acts.slice(0, i).some((a) => a === 'reload') ? ', after the reload' : acts.slice(0, i).some((a) => typeof a === 'object' && 'navigate' in a) ? ', on the page it led to' : '';
	if (act === 'again' || (typeof act === 'object' && 'use' in act)) return `${step}: use ${uses}${after}`;
	if (act === 'reopen') return `${step}: open it again`;
	if (act === 'reload') return `${step}: reload after use ${uses}${after}`;
	if (typeof act === 'object' && 'navigate' in act) return `${step}: follow ${describeTarget(act.navigate)} after use ${uses}`;
	return `${step}: closed by ${closedBy(act)} after use ${uses}`;
}

/** What a state line is about: `html data-theme`, `html class dark`, `localStorage theme`. */
const subject = (line: string) => line.replace(/ class [+-]/, ' class ').split(': ')[0]!;

/** State lines compared between the sides: what the page shows and keeps. How it gets there (attributes and class names on <html> and <body>, a framework's own markers among them) is shown, not compared. */
const effects = (lines: readonly string[] | undefined, owner?: StorageOwner) => (lines ?? []).filter((l) => !/^(html|body) /.test(l) && !(/^(localStorage|sessionStorage|cookie) /.test(l) && owner?.(subject(l))));

/** Each step's changes on one side, one line per step up to `upto`, so a cycle failure shows where the two sides parted. */
function trail(results: readonly (StepResult | undefined)[], first: number, upto: number): string {
	return results
		.slice(first, upto + 1)
		.map((r, i) => `${first + i + 1}. ${r?.failed ? 'could not be used' : r?.state?.join(', ') || r?.added.slice(0, 2).join(', ') || '(no change)'}`)
		.join('; ');
}


/** What a step added and removed, compared without a clock's reading: a clock that only ticked (the same line gone and back) is no change. */
export function untick(r: Pick<StepResult, 'added' | 'removed'>): { added: string[]; removed: string[] } {
	const read = clockLine;
	const removed = [...r.removed];
	const added: string[] = [];
	for (const line of r.added) {
		const clock = read(line);
		const i = clock === undefined ? -1 : removed.findIndex((other) => other !== line && read(other) === clock);
		if (i >= 0) removed.splice(i, 1);
		else added.push(line);
	}
	const reading = (line: string) => read(line) ?? line;
	return { added: added.map(reading), removed: removed.map(reading) };
}

const EXPANDED = / \[expanded\]/;

/**
 * A button the new page marks aria-expanded when it opens or closes what it controls, where the old page set no state on it:
 * WAI-ARIA asks a disclosure or menu button for that state, so the step is compared without it and the addition is listed.
 */
export function ariaImprovements(olds: readonly StepResult[], next: StepResult): { step: StepResult; notes: string[] } {
	const notes: string[] = [];
	let added = [...next.added];
	let removed = [...next.removed];
	const mentions = (r: StepResult, name: string) => [...r.added, ...r.removed].some((l) => l.includes(`button "${name}"`));
	const opened = olds.every((o) => o.added.length || o.removed.length);
	for (const line of next.added.concat(next.removed)) {
		if (!EXPANDED.test(line) || !/^- button "/.test(line)) continue;
		const plain = line.replace(EXPANDED, '');
		const name = /^- button "((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? '';
		const opening = added.includes(line) && removed.includes(plain);
		const closing = removed.includes(line) && added.includes(plain);
		if (!(opening || closing) || !opened || olds.some((o) => mentions(o, name))) continue;
		added = added.filter((l) => l !== (opening ? line : plain));
		removed = removed.filter((l) => l !== (opening ? plain : line));
		notes.push(`button "${name}" sets aria-expanded when it ${opening ? 'opens' : 'closes'} what it controls; the old page sets no state on it (WAI-ARIA disclosure or menu button)`);
	}
	// Focus on that button is the same focus, with or without its new state.
	const named = notes.map((n) => /^button "((?:[^"\\]|\\.)*)"/.exec(n)?.[1]);
	const focus = EXPANDED.test(next.focus) && named.some((name) => next.focus.startsWith(`button "${name}"`)) && olds.every((o) => o.focus === next.focus.replace(EXPANDED, '')) ? next.focus.replace(EXPANDED, '') : next.focus;
	return { step: notes.length ? { ...next, added, removed, focus } : next, notes };
}

export function compareJourneys(route: string, olds: readonly Run[], journeys: readonly Journey[], next: Run, owner?: StorageOwner, doorErrors?: ReadonlyMap<string, readonly string[]>, improvements: string[] = []): Failure[] {
	const failures: Failure[] = [];
	journeys.forEach((journey, j) => {
		const runs = olds.map((o) => o[j]!);
		const actual = next[j]!;
		const acts = journey.cycle ?? [];
		const last = journey.steps.length - 1;
		// Once a step differs, later steps are compared only for a control the original answers and the port does not: an earlier, smaller difference does not hide it.
		let diverged = false;
		// After one step that answered differently on the way, later steps report only what they leave different.
		let answered = false;
		for (let k = 0; k < journey.steps.length + acts.length; k++) {
			const step = journey.steps[Math.min(k, last)]!;
			const act = k > last ? acts[k - last - 1] : undefined;
			// After an in-site navigation only what the journey's own control changed is compared; how the new page loads is the navigation check's.
			const navigatedAway = acts.slice(0, Math.max(0, k - last)).some((x) => typeof x === 'object' && 'navigate' in x);
			// After a reload or a followed link, what is kept is compared only for what the journey's own steps changed: a router's own scroll-restoration entry is not the control's.
			const touched = new Set(runs[0]!.slice(0, k).flatMap((r) => [...(r.state ?? []).map(subject), ...(r.storage ?? []).map((l) => l.replace(/^[+-] /, '').split(' ').slice(0, 2).join(' '))]));
			const kept = (lines: readonly string[] | undefined) => (lines ?? []).filter((l) => touched.has(l.replace(/^[+-] /, '').split(' ').slice(0, 2).join(' ')));
			const following = typeof act === 'object' && 'navigate' in act;
			const restricted = following || (navigatedAway && act === 'reload');
			const mine = (r: StepResult | undefined): StepResult | undefined => (!r ? r : restricted ? { ...r, added: [], removed: [], moved: [], state: (r.state ?? []).filter((l) => touched.has(subject(l))), storage: kept(r.storage) } : act === 'reload' ? { ...r, state: (r.state ?? []).filter((l) => touched.has(subject(l))), storage: kept(r.storage) } : r);
			// An old run that could not repeat the step is left out; the step is compared with those that did, never skipped while one did.
			const oldSteps = runs.map((r) => mine(r[k])).filter((s): s is StepResult => Boolean(s && !s.failed));
			if (!oldSteps.length) break;
			const [a, ...rest] = oldSteps as StepResult[];
			const raw = mine(actual[k]);
			const improved = raw && !raw.failed ? ariaImprovements(oldSteps, raw) : undefined;
			for (const note of improved?.notes ?? []) if (!improvements.includes(note)) improvements.push(note);
			const n = improved?.step ?? raw;
			// A page the front door serves from the old app keeps its state on the old app's origin.
			if ((following || navigatedAway) && n?.door) break;
			const dimension: Dimension = step.action === 'press' || journey.pattern ? 'a11y' : 'behaviour';
			const named = journey.steps.length > 1 && k <= last ? `${journey.name} (step ${k + 1}${journey.pattern ? `: ${describeStep(step)}` : ''})` : journey.name;
			const check = act ? `${journey.name} (${cycleLabel(journey.steps.length, acts, k - last - 1)})` : named;
			const hint = act ? HINTS.cycle : journey.pattern ? HINTS.keyboardPattern : step.action === 'press' ? HINTS.keyboard : HINTS.behaviour;
			const where = (side: string, f: string) => (act ? `${side} ${f}; step by step: ${trail(side === 'old' ? runs[0]! : actual, last, k)}` : f);
			if (!n || n.failed) {
				if (!diverged) failures.push({ route, dimension, check, expected: where('old', format(a!, ['url', 'added', 'state'])), actual: where('new', n?.failed ?? 'the journey stopped before this step'), hint });
				break;
			}
			if (diverged) {
				const moved = n.navigated || n.reloaded || oldSteps.some((x) => x.navigated || x.reloaded);
				// A key pressed where focus already is, or a click outside what is open, follows from the earlier difference: only a step that takes its own control stands alone.
				const own = step.action === 'click' || step.action === 'press' || step.action === 'fill' || step.action === 'type' || step.action === 'select' || (step.action === 'key' && Boolean(step.focus));
				const lost = act || moved || !own ? undefined : (deadControl(oldSteps as StepResult[], n) ?? lostRegions(oldSteps as StepResult[], n));
				// A step that starts on its own control and leaves focus on the page itself, where every old run keeps it on something, lost focus on its own.
				if (!act && !moved && own && n.focus === 'body' && oldSteps.every((o) => o.focus !== 'body')) {
					failures.push({ route, dimension, check, expected: `focus on ${a!.focus}, where an earlier step of this journey already differed`, actual: 'focus on the page (body): the port drops focus', hint });
					break;
				}
				if (lost) {
					failures.push({ route, dimension, check, expected: `${describeTarget(step.target)} changes ${lost.join(', ')} on the original, where an earlier step of this journey already differed; ${format(a!, ['added', 'removed'])}`, actual: `the port does not change ${lost.join(', ')}${n.reaction?.affected?.length ? ` (it changes ${n.reaction.affected.join(', ')})` : ''}; ${format(n, ['added', 'removed'])}`, hint });
					break;
				}
				continue;
			}
			const parts: string[] = [];
			if (!stable([a!.url, ...rest.map((r) => r.url)])(n.url)) parts.push('url');
			const navigated = n.navigated || oldSteps.some((x) => x!.navigated);
			const reloaded = n.reloaded || oldSteps.some((x) => x!.reloaded);
			let automatic: Failure['automatic'];
			// One side read the next page's data in the browser, the other fetched that page from its server: the reads are that route's own check.
			const paged = navigated && (n.paged || oldSteps.some((x) => x!.paged));
			const shown = (r: StepResult): StepResult => (paged ? { ...r, requests: r.requests.filter((line) => !readLine(line)) } : r);
			const fields = navigated ? (following ? (['requests', 'state', 'storage', 'dialogs', 'downloads'] as const) : (['requests', 'storage', 'dialogs', 'downloads'] as const)) : reloaded ? (['added', 'removed', 'state', 'storage'] as const) : (['added', 'removed', 'moved', 'requests', 'announcements', 'state', 'storage', 'dialogs', 'downloads', 'widget'] as const);
			for (const field of fields.filter((f) => !(f === 'storage' && n.door))) {
				// Requests in flight together finish in any order (a client retrying hosts it shuffled), so they count as a set.
				const lines = (r: StepResult) => (field === 'requests' ? [...r[field]].filter((line) => !(paged && readLine(line))).sort() : field === 'state' ? effects(r.state, owner) : field === 'added' || field === 'removed' ? untick(r)[field] : (r[field] ?? []));
				const diff = diffLines(lineTemplates(lines(a!), ...rest.map(lines)), lines(n));
				if (diff.changed.length || diff.missing.length || diff.unexpected.length) parts.push(field);
				if (field === 'storage') automatic = storageCandidate([...diff.missing, ...diff.changed.map((c) => c.expected)], [...diff.unexpected, ...diff.changed.map((c) => c.actual)], owner);
			}
			const own = n.door ? doorErrors?.get(n.url) : undefined;
			const errors = diffLines(lineTemplates(a!.errors, ...rest.map((r) => r.errors)), own ? n.errors.filter((e) => !own.includes(e)) : n.errors);
			if (errors.unexpected.length || errors.changed.length) parts.push('errors');
			if (!navigated && !reloaded && !stable([a!.focus, ...rest.map((r) => r.focus)])(n.focus)) parts.push('focus');
			// The old page answered the step and the new one did not: a control whose effect never happens is red whatever else matches.
			const missing: { changes: string[]; regions: Box[]; lost?: string[] } = navigated || reloaded ? { changes: [], regions: [] } : { ...missingReaction(oldSteps as StepResult[], n), lost: lostWithin(oldSteps as StepResult[], n) };
			if (missing.changes.length || missing.regions.length) parts.push('reaction');
			// A control whose own state changes while the part it drives stays as it was (a tab selected, its panel not swapped).
			if (missing.lost) parts.push('region');
			const jumped = navigated || reloaded ? undefined : extraShift(oldSteps as StepResult[], n);
			if (jumped) parts.push('shift');
			const slower = navigated || reloaded ? undefined : slowerAnswer(oldSteps as StepResult[], n);
			if (slower) parts.push('answer time');
			if (navigated && !n.loaded && morphs(oldSteps as StepResult[], n).length) parts.push('morph');
			if (!navigated && !reloaded && lostTweens(oldSteps as StepResult[], n).length) parts.push('tween');
			if (!reloaded && !n.loaded && interimViews(oldSteps as StepResult[], n)) parts.push('in between');
			if (!navigated && !reloaded && choppier(oldSteps as StepResult[], n)) parts.push('cadence');
			if (n.stale?.length && !n.door && oldSteps.every((x) => !x.stale?.length)) parts.push('stale');
			const onTheWay = parts.every((p) => ON_THE_WAY.has(p));
			if (parts.length && !(answered && onTheWay)) {
				const dead = act || navigated || reloaded ? undefined : deadControl(oldSteps as StepResult[], n);
				const lead = (side: 'old' | 'new') => (!dead ? '' : side === 'old' ? `${describeTarget(step.target)} changes ${dead.join(', ')} on the original; ` : 'nothing changed on the port; ');
				const failure: Failure = { route, dimension, check, expected: lead('old') + where('old', format(shown(a!), parts, missing, true)), actual: lead('new') + where('new', format(shown(n), parts, missing)), hint, ...(automatic && parts.length === 1 && parts[0] === 'storage' ? { automatic } : {}) };
				if (parts.length === 1 && parts[0] === 'answer time') timedOnly.set(failure, { journey: j, step: k });
				// A placeholder shown only while an answer is late follows the server's speed that time, as an answer time does.
				if (parts.length === 1 && parts[0] === 'in between') timedOnly.set(failure, { journey: j, step: k, views: true });
				// A busy machine paints fewer frames on whichever side it slows: a stream's cadence stands only when it holds every time.
				if (parts.length === 1 && parts[0] === 'cadence') timedOnly.set(failure, { journey: j, step: k, cadence: true });
				failures.push(failure);
				// A step that ends with the same page and focus but answered differently on the way (a widget's state attributes, its
				// timing or motion) leaves the next step on the same ground: it is compared too, so a later step's bug is not hidden.
				if (dead) break;
				if (onTheWay) answered = true;
				else diverged = true;
			}
		}
	});
	return failures;
}

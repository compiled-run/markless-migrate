// The forced CSS states, judged from what states.ts read of the old page twice and the new page once in each state.
import { PNG } from 'pngjs';
import { responsiveRegionsCandidate } from './automatic.ts';
import { isClock } from './clock.ts';
import { cssTargets, noisyStyles, withFailures } from './compare.ts';
import { HINTS } from './hints.ts';
import { carry, failureElements, failureRules } from './locate.ts';
import { describe, matchElements } from './match.ts';
import { describeRule, type CssRule, type CssState } from './stylesheet.ts';
import type { Box, ElementSnapshot, Failure, ImageRecord, PageCapture, RouteCapture, RouteResult, Shot, Viewport } from './types.ts';
import { compareWithNoise, identicalShots, visuallyDifferent } from './visual.ts';

export const MAX_STATES = 40;
export const TARGETS_PER_STATE = 2;
export const ELEMENTS_PER_STATE = 5;
export const CLIP_PADDING = 8;
// font-family is compared through the font files that render, so generated family names do not differ.
const IGNORED = new Set(['font-family']);

/** OLD elements whose text or styles varied between the default OLD loads, with the varying properties. */
export type StateNoise = readonly { readonly element: ElementSnapshot; readonly props: ReadonlySet<string> | 'text' }[];

/** A default-state computed-style failure to trace back to the OLD rule. */
export interface ExplainTarget {
	readonly failure: Failure;
	readonly element: ElementSnapshot;
	readonly props: readonly string[];
}

/** The OLD rule behind a computed style, as the old page's cascade answered: `rule sets prop with value`, and the first rule found. */
export interface Explanation {
	readonly line: string;
	readonly rule?: CssRule;
}

/** One forced state on one viewport: why it was not forced, or every element of each page in it, and what was explained and shot. */
export type StateRun =
	| { readonly label: string; readonly kind: CssState['kind']; readonly skipped: string }
	| {
			readonly label: string;
			readonly kind: CssState['kind'];
			/** Indices into `base1` of the elements the state was forced on (pseudo and property states). */
			readonly targets: readonly number[];
			readonly s1: readonly ElementSnapshot[];
			readonly s2: readonly ElementSnapshot[];
			readonly sn: readonly ElementSnapshot[];
			/** For each of the first ELEMENTS_PER_STATE differing elements, the OLD rule behind its style. */
			readonly explanations: readonly (Explanation | undefined)[];
			/** Images drawn and the screenshots, old, old again and new, when the state changed what shows. */
			readonly images?: readonly [readonly ImageRecord[], readonly ImageRecord[], readonly ImageRecord[]];
			readonly shots?: readonly [Buffer, Buffer, Buffer];
	  };

/** What states.ts read on one viewport: the default-state failures explained, each page's elements before any state, each state. */
export interface StatesViewportRow {
	readonly viewport: string;
	readonly explained: readonly (Explanation | undefined)[];
	readonly base1: readonly ElementSnapshot[];
	readonly baseN: readonly ElementSnapshot[];
	readonly states: readonly StateRun[];
	/** The old side's noise, when its half came from the original's dataset: what varied across the loads produced with it. */
	readonly noise?: StateNoise;
}

/** The OLD page's cascade for one element: per property, the index of the rule that sets it, its value, and the rule behind a var() it reads. */
export type CascadeAnswers = Readonly<Record<string, { readonly rule: number; readonly value: string; readonly variable?: { readonly name: string; readonly rule: number; readonly value: string } } | null>>;

/** The line naming the OLD rules behind `props`, from the page's cascade answers. */
export function explanationOf(rules: readonly CssRule[], found: CascadeAnswers, props: readonly string[]): Explanation | undefined {
	const lines = new Set<string>();
	let first: CssRule | undefined;
	for (const prop of props) {
		const hit = found[prop];
		if (!hit) continue;
		const rule = rules[hit.rule]!;
		first ??= rule;
		let line = `${describeRule(rule)} sets ${prop} with \`${hit.value}\``;
		if (hit.variable) line += `, reading ${hit.variable.name} from ${describeRule(rules[hit.variable.rule]!)} (\`${hit.variable.value}\`)`;
		lines.add(line);
	}
	return lines.size ? { line: [...lines].join('; '), ...(first ? { rule: first } : {}) } : undefined;
}

/** One forced state on the OLD page alone, twice: what the new side's half is read against. */
export type OldStateRun =
	| { readonly label: string; readonly kind: CssState['kind']; readonly skipped: string }
	| {
			readonly label: string;
			readonly kind: CssState['kind'];
			readonly state: CssState;
			/** Indices into `base1` the state was forced on: the pseudo and property state's targets, or the size containers. */
			readonly targets: readonly number[];
			readonly containers: readonly number[];
			readonly s1: readonly ElementSnapshot[];
			readonly s2: readonly ElementSnapshot[];
			/** By `s1` element id: the cascade behind each property the state changed on it. */
			readonly answers: ReadonlyMap<number, CascadeAnswers>;
			/** Taken whenever a new page differing could make the state shot: page-wide, changed something, or forced on targets. */
			readonly images?: readonly [readonly ImageRecord[], readonly ImageRecord[]];
			readonly shots?: readonly [Buffer, Buffer];
	  };

/** The forced_states row of the original's dataset: the first viewport's states on the old page alone, and its noise. */
export interface ForcedStatesRow {
	readonly viewport: string;
	/** Digest of the stylesheets the states were found in: a check whose old loads hold others reads no row of these. */
	readonly sources: string;
	readonly base1: readonly ElementSnapshot[];
	readonly noise: StateNoise;
	readonly states: readonly OldStateRun[];
}

/** The ids of `base1` elements on the new page, or none when it shows none of them. */
export const newIds = (indices: readonly number[], pairs: ReadonlyMap<number, number>, baseN: readonly ElementSnapshot[]): number[] => indices.flatMap((i) => (pairs.has(i) ? [baseN[pairs.get(i)!]!.id] : []));

/** Why a stored state is not forced on the new page: none of the elements it was forced on are there. */
export function newSkip(run: Extract<OldStateRun, { s1: unknown }>, pairs: ReadonlyMap<number, number>): string | undefined {
	if ((run.kind === 'pseudo' || run.kind === 'property') && !run.targets.some((i) => pairs.has(i))) return `${run.label}: no visible element on the page matches it on both sides`;
	if (run.kind === 'container' && !run.containers.some((i) => pairs.has(i))) return `${run.label}: no size container on the page`;
	return undefined;
}

/**
 * A stored state and the new page's half in it, as one state run: what is explained is chosen by the same diff a live run
 * makes, from the cascade the old page answered when the state was produced. `shotN` takes the new page's shot with the clip.
 */
export async function joinState(rules: readonly CssRule[], stored: ForcedStatesRow, run: Extract<OldStateRun, { s1: unknown }>, baseN: readonly ElementSnapshot[], sn: readonly ElementSnapshot[], shotN: (clip: Box | undefined) => Promise<{ readonly images: readonly ImageRecord[]; readonly shot: Buffer }>): Promise<StateRun> {
	const { changedBoxes, differing } = stateDiff(stored.base1, baseN, run.s1, run.s2, sn, stored.noise);
	const explanations = differing.slice(0, ELEMENTS_PER_STATE).map(({ el, props }) => {
		const found = run.answers.get(el.id);
		return found ? explanationOf(rules, found, props) : undefined;
	});
	const base = { label: run.label, kind: run.kind, targets: run.targets, s1: run.s1, s2: run.s2, sn, explanations };
	const { shoot, clip } = stateShot(run.kind, changedBoxes, differing.length, run.targets, stored.base1);
	if (!shoot) return base;
	if (!run.images || !run.shots) throw new Error(`the original's forced states hold no screenshots of ${run.label}, which changed what shows`);
	const n = await shotN(clip);
	return { ...base, images: [run.images[0], run.images[1], n.images], shots: [run.shots[0], run.shots[1], n.shot] };
}

export interface StatesRow {
	readonly viewports: readonly StatesViewportRow[];
}

/** The viewports the states are forced or explained on, and what each explains: the request states.ts answers. */
export interface StatesRequest {
	readonly viewports: readonly { readonly name: string; readonly forced: boolean; readonly explain: readonly { readonly element: ElementSnapshot; readonly props: readonly string[] }[] }[];
}

export interface StateOutput {
	readonly failures: Failure[];
	readonly explained: Map<Failure, Failure>;
	readonly shots: Shot[];
	readonly checked: string[];
	readonly skipped: string[];
}

/** Each viewport's default-state failures to explain, and whether the states are forced there (the first viewport only). */
export function statesPlan(result: RouteResult, olds: readonly RouteCapture[], viewports: readonly Viewport[], states: readonly CssState[]): { readonly viewport: Viewport; readonly explain: ExplainTarget[]; readonly forced: readonly CssState[] }[] {
	const first = viewports[0]!;
	return viewports.flatMap((viewport) => {
		if (!olds[0]!.pages[viewport.name]) return [];
		const explain = result.failures.flatMap((failure) => {
			const target = failure.viewport === viewport.name ? cssTargets.get(failure) : undefined;
			return target ? [{ failure, ...target }] : [];
		});
		const forced = viewport === first ? states : [];
		return !forced.length && !explain.length ? [] : [{ viewport, explain, forced }];
	});
}

export function statesRequest(plan: ReturnType<typeof statesPlan>): StatesRequest {
	return { viewports: plan.map((p) => ({ name: p.viewport.name, forced: p.forced.length > 0, explain: p.explain.map(({ element, props }) => ({ element, props })) })) };
}

/** OLD elements whose text or styles varied between the old loads on this viewport. */
export function stateNoise(olds: readonly RouteCapture[], viewport: string): StateNoise {
	const a = olds[0]!.pages[viewport]!;
	const others = olds.slice(1).map((o) => o.pages[viewport]!).filter(Boolean);
	const styleNoise = noisyStyles(a.elements, others.map((o) => o.elements));
	const textNoise = new Set(others.flatMap((o) => [...matchElements(a.elements, o.elements)].filter(([i, j]) => a.elements[i]!.text !== o.elements[j]!.text).map(([i]) => i)));
	return a.elements.flatMap((element, i): StateNoise[number][] => (textNoise.has(i) ? [{ element, props: 'text' }] : styleNoise.get(i)?.size ? [{ element, props: styleNoise.get(i)! }] : []));
}

function noiseIn(noise: StateNoise, elements: readonly ElementSnapshot[]) {
	const textNoise = new Set<number>();
	const styleNoise = new Map<number, ReadonlySet<string>>();
	const pairs = matchElements(
		noise.map((x) => x.element),
		elements,
	);
	noise.forEach((x, k) => {
		const j = pairs.get(k);
		if (j === undefined) return;
		if (x.props === 'text') textNoise.add(j);
		else styleNoise.set(j, x.props);
	});
	return { textNoise, styleNoise };
}

/** What a forced state changed on the old page, and the elements whose style in it differs on the new page where both old runs agree. */
export function stateDiff(base1: readonly ElementSnapshot[], baseN: readonly ElementSnapshot[], s1: readonly ElementSnapshot[], s2: readonly ElementSnapshot[], sn: readonly ElementSnapshot[], noise: StateNoise) {
	const b1 = new Map(base1.map((el) => [el.id, el]));
	const bN = new Map(baseN.map((el) => [el.id, el]));
	const p12 = matchElements(s1, s2);
	const p1n = matchElements(s1, sn);
	const { textNoise, styleNoise } = noiseIn(noise, s1);
	const changedBoxes: Box[] = [];
	const differing: { el: ElementSnapshot; other: ElementSnapshot; props: string[] }[] = [];
	for (const [i, el] of s1.entries()) {
		const before = b1.get(el.id);
		const props = Object.keys(el.style).filter((p) => !IGNORED.has(p));
		const changed1 = props.filter((p) => !before || before.style[p] !== el.style[p]);
		if (changed1.length) changedBoxes.push(el.box);
		const j = p1n.get(i);
		const twin = s2[p12.get(i) ?? -1];
		if (j === undefined || !twin) continue;
		const other = sn[j]!;
		const bn = bN.get(other.id);
		const changed = new Set([...changed1, ...props.filter((p) => !bn || bn.style[p] !== other.style[p])]);
		const noisy = styleNoise.get(i);
		const diff = [...changed].filter((p) => twin.style[p] === el.style[p] && !noisy?.has(p) && el.style[p] !== other.style[p]);
		if (diff.length) differing.push({ el, other, props: diff });
	}
	return { changedBoxes, differing, p12, p1n, textNoise };
}

export const pageWide = (kind: CssState['kind']) => kind === 'media' || kind === 'width' || kind === 'container';

function union(boxes: readonly Box[]): Box | undefined {
	if (!boxes.length) return undefined;
	const x0 = Math.min(...boxes.map((b) => b.x));
	const y0 = Math.min(...boxes.map((b) => b.y));
	const x1 = Math.max(...boxes.map((b) => b.x + b.width));
	const y1 = Math.max(...boxes.map((b) => b.y + b.height));
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Whether the state is shot (a page-wide state always; another only when it changed something), and the clip around what it changed. */
export function stateShot(kind: CssState['kind'], changedBoxes: readonly Box[], differing: number, targets: readonly number[], base1: readonly ElementSnapshot[]): { readonly shoot: boolean; readonly clip?: Box } {
	const wide = pageWide(kind);
	if (!wide && !changedBoxes.length && !differing) return { shoot: false };
	const clip = wide ? undefined : union([...changedBoxes, ...targets.map((i) => base1[i]!.box)]);
	return { shoot: true, ...(clip ? { clip } : {}) };
}

function hintWith(rule: string | undefined, base: string): string {
	return rule ? `Old rule: ${rule}. ${base}` : base;
}

// Text whose width varies moves the rest of its line (right-aligned and centred text most visibly), so the whole block around it is noise.
function blockAround(elements: readonly ElementSnapshot[], el: ElementSnapshot): Box {
	const inside = (outer: Box, inner: Box) => outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
	const blocks = elements.filter((other) => !other.style.display?.startsWith('inline') && inside(other.box, el.box) && other.box.height <= el.box.height * 3);
	return blocks.sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0]?.box ?? el.box;
}

/** One viewport's forced states, judged: computed-style failures with the OLD rule behind them, and screenshots that differ. */
export function judgeStateViewport(route: string, viewport: Viewport, row: StatesViewportRow, explain: readonly ExplainTarget[], noise: StateNoise): StateOutput {
	const out: StateOutput = { failures: [], explained: new Map(), shots: [], checked: [], skipped: [] };
	row.explained.forEach((found, k) => {
		if (!found) return;
		const { failure } = explain[k]!;
		const explained = carry(failure, { ...failure, hint: hintWith(found.line, failure.hint) });
		if (found.rule) failureRules.set(explained, found.rule);
		out.explained.set(failure, explained);
	});
	for (const state of row.states) {
		if ('skipped' in state) {
			out.skipped.push(state.skipped);
			continue;
		}
		const { s1, s2, sn } = state;
		const { changedBoxes, differing, p12, p1n, textNoise } = stateDiff(row.base1, row.baseN, s1, s2, sn, noise);
		out.checked.push(state.label);
		for (const [k, { el, other, props }] of differing.slice(0, ELEMENTS_PER_STATE).entries()) {
			const found = state.explanations[k];
			const failure: Failure = {
				route,
				dimension: 'css',
				check: `computed style in ${state.label}: ${describe(el)}`,
				viewport: viewport.name,
				expected: props.map((p) => `${p}: ${el.style[p]}`).join('; '),
				actual: props.map((p) => `${p}: ${other.style[p] ?? '(unset)'}`).join('; '),
				hint: hintWith(found?.line, HINTS.cssState),
			};
			failureElements.set(failure, { old: el, new: other });
			if (found?.rule) failureRules.set(failure, found.rule);
			out.failures.push(failure);
		}
		if (differing.length > ELEMENTS_PER_STATE) {
			out.failures.push({ route, dimension: 'css', check: `computed style in ${state.label}`, viewport: viewport.name, expected: '', actual: `${differing.length - ELEMENTS_PER_STATE} more elements differ`, hint: HINTS.cssState });
		}
		const { shoot, clip } = stateShot(state.kind, changedBoxes, differing.length, state.targets, row.base1);
		if (!shoot) continue;
		if (!state.shots || !state.images) throw new Error(`the forced states row has no screenshots of ${state.label}, which changed what shows`);
		const images = state.images;
		const [shot1, shot2, shotN] = state.shots;
		const shift = (b: Box): Box => (clip ? { ...b, x: b.x - Math.max(0, clip.x - CLIP_PADDING), y: b.y - Math.max(0, clip.y - CLIP_PADDING) } : b);
		const noisyBoxes = s1.flatMap((el, i) => (textNoise.has(i) || s2[p12.get(i) ?? -1]?.text !== el.text ? [shift(blockAround(s1, el))] : []));
		// Where both pages show a clock at another reading: its glyphs differ, the clock does not.
		for (const [i, j] of p1n) if (isClock(s1[i]!.text) && isClock(sn[j]!.text) && s1[i]!.text !== sn[j]!.text) noisyBoxes.push(shift(blockAround(s1, s1[i]!)), shift(blockAround(sn, sn[j]!)));
		const diff = identicalShots(shot1, shotN) ?? compareWithNoise(shot1, shotN, [shot2], noisyBoxes);
		const different = visuallyDifferent(diff);
		if (different) {
			// Boxes into the shot's coordinates: a state's shot may be clipped around its target.
			const inShot = (list: readonly ImageRecord[]) => list.map((img) => (img.box ? { ...img, box: shift(img.box) } : img));
			const auto = !diff.sizeMismatch ? responsiveRegionsCandidate(diff.regions, { images: inShot(images[0]) } as unknown as PageCapture, { images: inShot(images[2]) } as unknown as PageCapture, diff.differing, { old: PNG.sync.read(shot1), new: PNG.sync.read(shotN) }) : undefined;
			out.failures.push({
				route,
				dimension: 'visual',
				check: `screenshot in ${state.label}`,
				viewport: viewport.name,
				expected: diff.sizeMismatch ? diff.sizeMismatch.expected : 'same pixels outside the noise mask',
				actual: diff.sizeMismatch ? diff.sizeMismatch.actual : `${diff.differing} pixels differ${clip ? ' around the state target' : ''}`,
				hint: HINTS.visualState,
				...(auto ? { automatic: auto } : {}),
			});
			out.shots.push({ label: `${viewport.name} in ${state.label}`, viewport: viewport.name, old: shot1, new: shotN, diff: diff.png, regions: diff.regions, ok: false });
		}
	}
	return out;
}

/** Every viewport's forced states on top of the route's result: the default-state failures they explain carry the OLD rule. */
export function judgeStates(route: string, result: RouteResult, plan: ReturnType<typeof statesPlan>, olds: readonly RouteCapture[], viewports: readonly Viewport[], row: StatesRow): RouteResult {
	const failures: Failure[] = [];
	const explained = new Map<Failure, Failure>();
	const shots: Shot[] = [];
	const checked: string[] = [];
	const skipped: string[] = [];
	plan.forEach(({ viewport, explain }, k) => {
		const seen = row.viewports[k];
		if (!seen || seen.viewport !== viewport.name) throw new Error(`the forced states row has no ${viewport.name} viewport where the judge asks for one`);
		const out = judgeStateViewport(route, viewport, seen, explain, seen.noise ?? stateNoise(olds, viewport.name));
		failures.push(...out.failures);
		for (const [from, to] of out.explained) explained.set(from, to);
		shots.push(...out.shots);
		checked.push(...out.checked.map((label) => (viewports.length > 1 ? `${label} (${viewport.name})` : label)));
		skipped.push(...out.skipped);
	});
	return withFailures(result, [...result.failures.map((f) => explained.get(f) ?? f), ...failures], { shots: [...result.shots, ...shots], states: { checked, skipped } });
}

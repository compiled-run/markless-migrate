// Control parity, judged from what control-parity.ts read of each control on the original and the port: nothing here opens a page.
import { PNG } from 'pngjs';
import type { Failure, Shot } from './types.ts';

/** One visible control of a page, as the page lists it (control-parity-page.ts). */
export interface ParityControl {
	readonly key: string;
	readonly role: string;
	readonly name: string;
	readonly layout: boolean;
	readonly leaves: boolean;
	readonly disabled: boolean;
	readonly popup: boolean;
	readonly template: string;
	readonly type: string;
	readonly hint: string;
	readonly options?: readonly string[];
	readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
	readonly parent?: { readonly w: number; readonly h: number };
	/** The example frame (preview, figure, section, dialog) it sits in; none for the page's main or body. */
	readonly frame?: { readonly w: number; readonly h: number };
	readonly frameId: number;
	readonly pageY: number;
}

export interface GridPoint {
	readonly region: string;
	readonly fx: number;
	readonly fy: number;
	readonly key: string;
	readonly near?: readonly string[];
}

export interface Anchor {
	readonly side: string;
	readonly dx: number;
	readonly dy: number;
	readonly w: number;
	readonly h: number;
	readonly tw: number;
}

/** What one use of a control did on one side. */
export interface Use {
	readonly missing?: string;
	readonly hits?: readonly string[];
	readonly affected?: readonly string[];
	readonly url?: string;
	readonly focus?: string;
	readonly popupRole?: string;
	readonly first?: { readonly ms: number; readonly opacity: number; readonly transform: string; readonly anims: readonly string[] };
	readonly anchor?: Anchor;
	readonly errors?: readonly string[];
	readonly field?: { readonly value: string; readonly invalid: string; readonly badInput: boolean };
	readonly shown?: string;
	readonly motion?: Motion;
	readonly close?: { readonly motion?: Motion; readonly still: boolean };
}

export interface Motion {
	readonly distinct: number;
	readonly durationMs: number;
	readonly maxGapMs: number;
	readonly medianGapMs: number;
	readonly frames: readonly PNG[];
}

export interface ControlParityResult {
	readonly failures: readonly Failure[];
	readonly shots: readonly Shot[];
	readonly tried: number;
	/** Uses, keys and typed values left out once the budget ran out. */
	readonly leftOut: number;
	readonly ms: number;
}

export const PARITY_HINTS = {
	hit: 'Something covers this spot on the port, or the control there is smaller or elsewhere: a click lands on another element than on the original.',
	box: 'The control or its container is drawn at another size or place than on the original; compare its padding, line height, gap and the container\'s layout classes.',
	presence: 'The original shows this control at this width and the port does not: a responsive class, a breakpoint or a capture taken at one width only.',
	anchor: 'The pop-up opens elsewhere against its trigger than on the original: its side, align, offset or collision handling, or the width it takes from its trigger.',
	motion: 'The pop-up shows (or leaves) with other motion than on the original: its enter/exit animation, its starting style or the frames it is painted in. The route\'s shots hold both sides\' frames.',
	key: 'The original answers this key from this control and the port answers differently: its keyboard handler, its roving focus or the pop-up it opens.',
	input: 'The field takes this value differently from the original: how it parses, formats or validates what was typed, or what it updates from it.',
	error: 'The port throws where the original does not, after this use.',
} as const;

export const INPUT_VALUES = {
	date: ['May 28, 2025', '05/28/2025', '2025-05-28', 'abc', '2025-02-30', '28/05/2025', '28.05.2025', '5/28/25', 'tomorrow'],
	nativeDate: ['2025-05-28', '05282025', '2025-02-28'],
	number: ['42', '0', '-1', '3.14', '1e3', '99999999', 'abc', ''],
	text: ['May 28, 2025', '42', 'abc', 'zq zq', ''],
} as const;

export function inputKind(c: Pick<ParityControl, 'type' | 'hint' | 'name' | 'role'>): keyof typeof INPUT_VALUES {
	if (c.type === 'date') return 'nativeDate';
	if (/date|day|month|year|birth|calendar|yyyy|\d{1,2}\/\d{1,2}/i.test(`${c.hint} ${c.name}`)) return 'date';
	if (c.type === 'number' || c.role === 'spinbutton' || /numeric|decimal|amount|price|quantity/i.test(c.hint)) return 'number';
	return 'text';
}

export const isField = (c: Pick<ParityControl, 'role' | 'type' | 'options'>): boolean => /^(textbox|searchbox|spinbutton|combobox)$/.test(c.role) && !c.options && /^(text|search|date|number|email|tel|url|textarea|)$/.test(c.type);

/** The standard keys each kind of control is tried with: one key, then short sequences. */
export function keySet(c: Pick<ParityControl, 'role' | 'popup'>): string[][] {
	if (c.popup && c.role === 'button') return [['ArrowDown'], ['Enter'], ['Enter', 'Escape'], ['Space'], ['ArrowUp'], ['Enter', 'ArrowDown', 'ArrowDown', 'Enter']];
	if (/^(tab|radio|menuitemradio|treeitem|option)$/.test(c.role)) return [['ArrowRight'], ['End'], ['ArrowRight', 'Enter'], ['Tab'], ['ArrowLeft'], ['ArrowDown'], ['Home']];
	if (/^(textbox|searchbox)$/.test(c.role)) return [['ArrowDown', 'Enter'], ['Escape'], ['Tab'], ['ArrowDown']];
	if (c.role === 'combobox') return [['Enter'], ['ArrowDown', 'ArrowDown', 'Enter'], ['Enter', 'Escape'], ['Tab'], ['Space'], ['ArrowUp']];
	if (/^(slider|spinbutton)$/.test(c.role)) return [['ArrowRight'], ['End'], ['ArrowLeft'], ['Home'], ['PageUp']];
	if (/^(checkbox|switch|menuitemcheckbox)$/.test(c.role)) return [['Space'], ['Enter'], ['Tab']];
	if (c.role === 'link') return [['Tab'], ['Shift+Tab']];
	return [['Enter'], ['Space'], ['Enter', 'ArrowDown', 'ArrowDown', 'Enter'], ['Enter', 'Escape'], ['Tab'], ['Shift+Tab'], ['ArrowDown'], ['Escape']];
}

/** Pairs each original control with the port's: namesakes (a page's many Copy buttons) by place, so one missing does not shift every later pair. */
export function pairControls(olds: readonly ParityControl[], news: readonly ParityControl[]): Map<string, ParityControl> {
	const pool = new Map<string, ParityControl[]>();
	for (const n of news) {
		const k = countless(`${n.role}|${n.name}`);
		(pool.get(k) ?? pool.set(k, []).get(k)!).push(n);
	}
	const pairs = new Map<string, ParityControl>();
	let drift = 0;
	for (const c of [...olds].sort((a, b) => a.pageY - b.pageY)) {
		const left = pool.get(countless(`${c.role}|${c.name}`)) ?? [];
		if (!left.length) continue;
		const best = left.reduce((a, b) => (Math.abs(b.pageY - c.pageY - drift) < Math.abs(a.pageY - c.pageY - drift) ? b : a));
		if (left.length > 1 && Math.abs(best.pageY - c.pageY - drift) > 400) continue;
		left.splice(left.indexOf(best), 1);
		drift = best.pageY - c.pageY;
		pairs.set(c.key, best);
	}
	return pairs;
}

/** How two filmings of one use differ: one moves while the other jumps to its result, or both move with other durations or cadence. */
export function motionDiff(om: Motion, nm: Motion): 'jump' | 'duration' | 'cadence' | undefined {
	const moving = (m: Motion) => m.distinct >= 4 && m.durationMs >= 80;
	if ((moving(om) && nm.distinct <= 1) || (moving(nm) && om.distinct <= 1)) return 'jump';
	if (!moving(om) || !moving(nm)) return undefined;
	if (Math.abs(om.durationMs - nm.durationMs) > Math.max(150, 0.5 * om.durationMs)) return 'duration';
	if (nm.distinct < om.distinct * 0.5 || om.distinct < nm.distinct * 0.5 || nm.maxGapMs > Math.max(2 * om.maxGapMs, om.maxGapMs + 100)) return 'cadence';
	return undefined;
}

/** Up to eight of a filming's distinct frames, evenly spread, side by side in one picture. */
export function strip(frames: readonly PNG[]): Buffer {
	const n = Math.min(8, frames.length);
	const picked = Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / Math.max(1, n - 1))]!);
	const w = Math.max(1, ...picked.map((p) => p.width)), h = Math.max(1, ...picked.map((p) => p.height));
	const out = new PNG({ width: w * 8, height: h });
	out.data.fill(255);
	picked.forEach((p, c) => PNG.bitblt(p, out, 0, 0, p.width, p.height, c * w, 0));
	return PNG.sync.write(out);
}

export const line = (m: Motion) => `${m.distinct} painted changes over ${m.durationMs} ms (longest gap ${m.maxGapMs} ms, median ${m.medianGapMs} ms)`;
export const transformMoves = (t: string) => t !== 'none' && !/^matrix\(1, 0, 0, 1, 0, -?[\d.e-]+\)$/.test(t);

export function anchorDiffers(a: Anchor, b: Anchor): boolean {
	return a.side !== b.side || Math.abs(a.dx - b.dx) > 4 || Math.abs(a.dy - b.dy) > 4 || Math.abs(a.w - b.w) > 4;
}

export const describeAnchor = (a: Anchor) => `${a.side} its trigger, ${a.dx} px across and ${a.dy} px down from its corner, ${a.w}x${a.h} (trigger ${a.tw} wide)`;
const did = (u: Use) => Boolean(u.affected?.length || u.url || u.popupRole);
export const effect = (u: Use) => [u.affected?.length ? `changes ${u.affected.join(', ')}` : '', u.url ? `address becomes ${u.url}` : '', u.popupRole ? `opens a ${u.popupRole}` : ''].filter(Boolean).join('; ') || 'changes nothing';

/** The pairs of readings a keyboard trial's two sides differ in, as [what, expected, actual]. */
export function keyDifferences(old: Use, port: Use): [string, string, string][] {
	const out: [string, string, string][] = [];
	if (did(old) && !did(port) && old.focus === port.focus) out.push(['answer', effect(old), 'nothing changed on the port']);
	if (!sameControl(old.focus ?? '', port.focus ?? '')) out.push(['focus', `focus ends on ${old.focus}`, `on ${port.focus}`]);
	if ((old.url ?? '') !== (port.url ?? '')) out.push(['address', old.url ? `address becomes ${old.url}` : 'the address stays', port.url ? `becomes ${port.url}` : 'the address stays']);
	if ((old.popupRole ?? '') !== (port.popupRole ?? '')) out.push(['pop-up', old.popupRole ? `a ${old.popupRole} is open` : 'no pop-up open', port.popupRole ? `a ${port.popupRole} is open` : 'no pop-up open']);
	const lost = (old.affected ?? []).filter((a) => !(port.affected ?? []).includes(a));
	if (did(port) && old.affected?.length && lost.length === old.affected.length) out.push(['region', `changes ${old.affected.join(', ')}`, `changes ${port.affected?.join(', ') || 'no region'}`]);
	return out;
}

/** The pairs of readings an input trial's two sides differ in. */
export function inputDifferences(old: Use, port: Use): [string, string, string][] {
	const out: [string, string, string][] = [];
	const o = old.field, n = port.field;
	if (o && n && o.value !== n.value) out.push(['value', `the field ends as "${o.value}"`, `"${n.value}"`]);
	if (o && n && (o.invalid !== n.invalid || o.badInput !== n.badInput)) out.push(['validity', `aria-invalid ${o.invalid || 'unset'}, ${o.badInput ? 'invalid' : 'valid'} to the browser`, `aria-invalid ${n.invalid || 'unset'}, ${n.badInput ? 'invalid' : 'valid'}`]);
	// Equal-score search results can come in another order from a CI-built original: what a pop-up shows is compared as a set.
	const asSet = (t?: string) => (t ?? '').split('; ').sort().join('; ');
	if (old.shown && asSet(old.shown) !== asSet(port.shown)) out.push(['pop-up', `its pop-up then shows ${old.shown}`, port.shown ? `shows ${port.shown}` : 'no pop-up opens']);
	if ((old.url ?? '') !== (port.url ?? '')) out.push(['address', old.url ? `address becomes ${old.url}` : 'the address stays', port.url ? `becomes ${port.url}` : 'the address stays']);
	const lost = (old.affected ?? []).filter((a) => !(port.affected ?? []).includes(a));
	if (old.affected?.length && lost.length === old.affected.length) out.push(['region', `changes ${old.affected.join(', ')}`, port.affected?.length ? `changes ${port.affected.join(', ')}` : 'nothing changed on the port']);
	return out;
}

// A count in a control's name (stars, downloads) is live data, and a calendar day's name ("Today, Tuesday, October 28th,
// 2026") is each site's build date: neither tells which control it is.
const DAY = /(?:Today, )?(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, )?(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:st|nd|rd|th)?,? \d{4}/g;
export const countless = (key: string) => key.replace(DAY, 'a day').replace(/\d[\d.,]*[kKmM]?/g, '#');
export const sameControl = (a: string, b: string): boolean => a === b || countless(a) === countless(b);

export const thrownOnlyBy = (old: Use, port: Use) => (port.errors ?? []).filter((e) => !(old.errors ?? []).includes(e));

/** One use, key or typed value on both sides: what each did, and the second pair taken when the first differed. */
export interface ParityPair {
	readonly old: Use;
	readonly port: Use;
}

/** What one width showed: the original's controls and grid read twice, the port's once, and what the port's grid reached. */
export interface WidthRead {
	readonly width: number;
	readonly a: { readonly list: readonly ParityControl[]; readonly grid: readonly GridPoint[] };
	readonly b?: { readonly list: readonly ParityControl[]; readonly grid: readonly GridPoint[] };
	readonly n?: { readonly list: readonly ParityControl[] };
	readonly portGrid?: readonly GridPoint[];
}

type Tried = { readonly first: ParityPair; readonly second?: ParityPair } | { readonly leftOut: true };

/** What a trial uses: a click (filmed or not), a pop-up placed at a width in an engine, a key sequence, a typed value. */
export type TrialHead =
	| { readonly phase: 'use'; readonly control: ParityControl; readonly film: boolean }
	| { readonly phase: 'anchor'; readonly engine: string; readonly width: number; readonly control: ParityControl }
	| { readonly phase: 'key'; readonly control: ParityControl; readonly keys: readonly string[] }
	| { readonly phase: 'input'; readonly control: ParityControl; readonly value: string };

/** Each trial in the order control parity ran it. */
export type ParityTrial = TrialHead & Tried;

/** What control parity read on one route, with the widths and tolerance it read them at. */
export interface ParityRow {
	readonly widths: readonly number[];
	readonly tolerance: number;
	readonly usesOnly: boolean;
	readonly reads: readonly WidthRead[];
	readonly trials: readonly ParityTrial[];
	readonly ms: number;
}

/** The original's controls that hold still between its two loads at a width. */
export function stableControls(a: readonly ParityControl[], b: readonly ParityControl[]): ParityControl[] {
	const steady = new Map(b.map((c) => [c.key, c]));
	return a.filter((c) => steady.has(c.key));
}

/** The original's grid points that reach the same control on both its loads. */
export function steadyPoints(a: readonly GridPoint[], b: readonly GridPoint[]): GridPoint[] {
	return a.filter((g) => g.key !== 'no control' && b.some((h) => h.region === g.region && h.fx === g.fx && h.fy === g.fy && h.key === g.key));
}

/** The controls control parity uses: those the original shows at the first width on both loads, that neither leave nor are disabled. */
export function usedControls(first: WidthRead, usesOnly: boolean): ParityControl[] {
	const list = usesOnly ? first.a.list : stableControls(first.a.list, first.b!.list);
	return list.filter((c) => !c.leaves && !c.disabled);
}

const hitOff = (o: Use, p: Use) => {
	const off = (o.hits ?? []).map((h, i) => (h !== p.hits?.[i] ? `${['centre', 'left quarter', 'right quarter', 'top quarter', 'bottom quarter'][i]}: ${p.hits?.[i] ?? 'nothing'}` : '')).filter(Boolean);
	return off.length ? off.join('; ') : undefined;
};
const thrown = (o: Use, p: Use) => (thrownOnlyBy(o, p).length ? thrownOnlyBy(o, p).join('; ') : undefined);
const anchorOff = (o: Use, p: Use) => (o.anchor && p.anchor && anchorDiffers(o.anchor, p.anchor) ? describeAnchor(p.anchor) : undefined);
const firstFrameOff = (a: Use, b: Use) => (a.first && b.first && ((a.first.opacity < 0.95 || transformMoves(a.first.transform)) !== (b.first.opacity < 0.95 || transformMoves(b.first.transform)) || Math.abs(a.first.opacity - b.first.opacity) > 0.3 || b.first.ms - a.first.ms > 80) ? true : undefined);
const openedOnlyOld = (o: Use, p: Use) => (o.anchor && !p.anchor ? true : undefined);
const keyOff = (o: Use, p: Use) => {
	const d = keyDifferences(o, p);
	return d.length ? d : undefined;
};
const inputOff = (o: Use, p: Use) => {
	const d = inputDifferences(o, p);
	return d.length ? d : undefined;
};
const motions = (u: Use) => [u.motion, u.close?.motion] as const;
const MOTIONS = ['opening', 'closing (Escape)'] as const;

/**
 * Whether a trial's first pair differs in anything a second pair confirms, and whether that second pair waits for each page
 * to stop changing first: it does unless only the filmed motion asked for it.
 */
export function needsAgain(trial: TrialHead, first: ParityPair, route: string): { readonly again: boolean; readonly calm: boolean } {
	const { old: o, port: p } = first;
	if (trial.phase === 'anchor') return { again: Boolean(o.anchor && (!p.anchor || anchorOff(o, p))), calm: true };
	if (o.missing || p.missing) return { again: false, calm: true };
	if (trial.phase === 'key') return { again: !(o.url && o.url.split('?')[0] !== route.split('?')[0]) && Boolean(keyOff(o, p) || thrown(o, p)), calm: true };
	if (trial.phase === 'input') return { again: Boolean(inputOff(o, p) || thrown(o, p)), calm: true };
	const confirms = Boolean(hitOff(o, p) || thrown(o, p) || (o.anchor && p.anchor && anchorOff(o, p)) || (o.first && p.first && firstFrameOff(o, p)));
	const filmed = trial.film && motions(o).some((om, k) => om && motions(p)[k] && motionDiff(om, motions(p)[k]!));
	return { again: confirms || Boolean(filmed), calm: confirms };
}

/** Control parity of one route, judged from what it read: a difference stands when the original repeats itself and the port, used again, still differs the same way. */
export function judgeControlParity(route: string, row: ParityRow): ControlParityResult {
	const failures: Failure[] = [];
	const shots: Shot[] = [];
	const HINTS = PARITY_HINTS;
	const { widths, tolerance } = row;
	const fail = (dimension: Failure['dimension'], check: string, expected: string, actual: string, hint: string, width?: number) => failures.push({ route, dimension, check, expected, actual, hint, ...(width ? { viewport: `${width} px wide` } : {}) });
	for (const read of row.reads) {
		const width = read.width;
		if (row.usesOnly) break;
		const a = read.a, b = read.b!, n = read.n!;
		const steady = new Map(b.list.map((c) => [c.key, c]));
		const stable = stableControls(a.list, b.list);
		const port = pairControls(stable, n.list);
		let boxes = 0, missing = 0;
		const containers = new Set<string>();
		// A control moved only by what moved above it in its frame is no finding of its own: only where the shift changes.
		const shiftIn = new Map<number, number>();
		for (const c of [...stable].sort((a, b) => a.frameId - b.frameId || a.box.y - b.box.y)) {
			if (c.layout && width !== widths[0]) continue;
			const p = port.get(c.key);
			if (!p) {
				if (!c.layout && missing++ < 10) fail('rendered', 'controls at each width', `${c.key} shown at ${width} px wide`, 'not on the port at this width', HINTS.presence, width);
				continue;
			}
			const again = steady.get(c.key)!;
			const still = (x: { w: number; h: number }, y: { w: number; h: number }) => Math.abs(x.w - y.w) <= 1 && Math.abs(x.h - y.h) <= 1;
			const dy = p.box.y - c.box.y;
			const before = shiftIn.get(c.frameId) ?? 0;
			shiftIn.set(c.frameId, dy);
			const d = [p.box.w - c.box.w, p.box.h - c.box.h, p.box.x - c.box.x, dy - before].map(Math.abs);
			if (still(c.box, again.box) && Math.abs(c.box.x - again.box.x) <= 1 && Math.abs(c.box.y - again.box.y) <= 1 && Math.max(...d) > tolerance && boxes++ < 20) fail('css', 'control box', `${c.key}: ${c.box.w}x${c.box.h} at (${c.box.x}, ${c.box.y}) in its frame`, `${p.box.w}x${p.box.h} at (${p.box.x}, ${p.box.y})`, HINTS.box, width);
			for (const [what, x, y, z] of [['its parent', c.parent, p.parent, again.parent], ['its example frame', c.frame, p.frame, again.frame]] as const) {
				if (!x || !y || !z) continue;
				const k = `${what}|${x.w}x${x.h}|${y.w}x${y.h}`;
				if (containers.has(k) || !still(x, z) || (Math.abs(x.w - y.w) <= tolerance && Math.abs(x.h - y.h) <= tolerance)) continue;
				containers.add(k);
				if (boxes++ < 20) fail('css', 'container box', `${what} of ${c.key}: ${x.w}x${x.h}`, `${y.w}x${y.h}`, HINTS.box, width);
			}
		}
		const steadyAt = steadyPoints(a.grid, b.grid);
		const portGrid = read.portGrid ?? [];
		let misses = 0;
		for (const g of portGrid) if (!g.near?.some((k) => sameControl(k, g.key)) && misses++ < 10) fail('behaviour', 'hit target over a region', `a click ${Math.round(g.fx * 100)}% across and ${Math.round(g.fy * 100)}% down ${g.region} (in view) reaches ${g.key}`, `reaches ${g.near?.join(' / ') || 'nothing'}`, HINTS.hit, width);
		const portRegions = new Set(portGrid.map((g) => g.region));
		for (const region of new Set(steadyAt.map((g) => g.region))) if (!portRegions.has(region)) fail('behaviour', 'hit target over a region', `${region} in view, with controls`, 'no such region in view on the port', HINTS.hit, width);
	}

	let tried = 0;
	let leftOut = 0;
	let keyTrials = 0;
	let inputTrials = 0;
	for (const trial of row.trials) {
		if ('leftOut' in trial) {
			leftOut++;
			continue;
		}
		const { first, second } = trial;
		const control = trial.control;
		const confirmed = <T>(differs: (old: Use, port: Use) => T | undefined): T | undefined => {
			const found = differs(first.old, first.port);
			if (found === undefined) return undefined;
			if (!second) throw new Error(`control parity's row has no second pair for ${control.key}, whose first pair differs`);
			const oldAgrees = differs(first.old, second.old) === undefined;
			const still = differs(second.old, second.port);
			return oldAgrees && still !== undefined ? found : undefined;
		};
		if (trial.phase === 'use') {
			tried++;
			if (first.old.missing) continue;
			if (first.port.missing) {
				fail('behaviour', 'control used', `${control.key}: ${effect(first.old)}`, first.port.missing, HINTS.hit);
				continue;
			}
			const hit = confirmed(hitOff);
			if (hit) fail('behaviour', 'hit target over a control', `a click on ${control.key} reaches ${[...new Set(first.old.hits)].join(' / ')}`, hit, HINTS.hit);
			const threw = confirmed(thrown);
			if (threw) fail('behaviour', 'errors after a use', `clicking ${control.key} throws ${first.old.errors?.join('; ') || 'nothing'}`, `throws ${threw}`, HINTS.error);
			if (first.old.anchor && first.port.anchor) {
				const off = confirmed(anchorOff);
				if (off) fail('behaviour', 'pop-up place', `${control.key} opens its ${first.old.popupRole} ${describeAnchor(first.old.anchor)}`, off, HINTS.anchor, widths[0]);
			}
			if (first.old.first && first.port.first) {
				const o = first.old.first, n = first.port.first;
				const animOld = o.opacity < 0.95 || transformMoves(o.transform), animNew = n.opacity < 0.95 || transformMoves(n.transform);
				if ((animOld !== animNew || Math.abs(o.opacity - n.opacity) > 0.3 || n.ms - o.ms > 80) && confirmed(firstFrameOff)) fail('motion', 'pop-up first frame', `${control.key}: its ${first.old.popupRole} is first visible ${o.ms} ms after the press at opacity ${o.opacity}, ${o.transform}; animations ${o.anims.join(', ') || 'none'}`, `first visible ${n.ms} ms after it at opacity ${n.opacity}, ${n.transform}; animations ${n.anims.join(', ') || 'none'}`, HINTS.motion);
			}
			if (trial.film) {
				for (const [k, what] of MOTIONS.entries()) {
					const om = motions(first.old)[k], nm = motions(first.port)[k];
					if (!om || !nm) continue;
					const kind = motionDiff(om, nm);
					if (!kind) continue;
					if (!second) throw new Error(`control parity's row has no second pair for ${control.key}, whose ${what} differs`);
					const om2 = motions(second.old)[k], nm2 = motions(second.port)[k];
					if (!om2 || !nm2 || motionDiff(om, om2) || motionDiff(om2, nm2) !== kind) continue;
					fail('motion', `pop-up ${what}, frame by frame`, `${control.key}: ${line(om)}`, line(nm), HINTS.motion);
					shots.push({ label: `${control.key}: ${what}, frame by frame`, viewport: `${widths[0]} px wide`, old: strip(om.frames), new: strip(nm.frames), regions: [], ok: false });
				}
				if (first.old.close && first.port.close && !first.old.close.still && first.port.close.still) fail('behaviour', 'pop-up closing', `Escape closes the ${first.old.popupRole} ${control.key} opened`, 'it stays open on the port', HINTS.key);
			}
		} else if (trial.phase === 'anchor') {
			const { engine, width } = trial;
			if (!first.old.anchor) continue;
			if (!first.port.anchor) {
				const why = first.port.missing ?? 'no pop-up opens on the port';
				if (confirmed(openedOnlyOld)) fail('behaviour', `pop-up at each width (${engine})`, `${control.key} opens a ${first.old.popupRole} at ${width} px wide`, why, HINTS.presence, width);
				continue;
			}
			const off = confirmed(anchorOff);
			if (off) fail('behaviour', `pop-up place (${engine})`, `${control.key} opens its ${first.old.popupRole} ${describeAnchor(first.old.anchor)}`, off, HINTS.anchor, width);
		} else if (trial.phase === 'key') {
			keyTrials++;
			if (first.old.missing || (first.old.url && first.old.url.split('?')[0] !== route.split('?')[0])) continue;
			const named = `${control.key} focused, then ${trial.keys.join(', ')}`;
			if (first.port.missing) {
				fail('behaviour', 'keyboard', `${named}: ${effect(first.old)}`, first.port.missing, HINTS.key);
				continue;
			}
			for (const [what, expected, actual] of confirmed(keyOff) ?? []) fail('behaviour', `keyboard: ${what}`, `${named}: ${expected}`, actual, HINTS.key);
			const threw = confirmed(thrown);
			if (threw) fail('behaviour', 'errors after a key', `${named} throws ${first.old.errors?.join('; ') || 'nothing'}`, `throws ${threw}`, HINTS.error);
		} else {
			inputTrials++;
			if (first.old.missing) continue;
			const named = `"${trial.value}" typed into ${control.key}, then Enter and a blur`;
			if (first.port.missing) {
				fail('behaviour', 'field input', `${named}: the field takes it`, first.port.missing, HINTS.input);
				continue;
			}
			for (const [what, expected, actual] of confirmed(inputOff) ?? []) fail('behaviour', `field input: ${what}`, `${named}: ${expected}`, actual, HINTS.input);
			const threw = confirmed(thrown);
			if (threw) fail('behaviour', 'errors after typing', `${named} throws ${first.old.errors?.join('; ') || 'nothing'}`, `throws ${threw}`, HINTS.error);
		}
	}
	return { failures, shots, tried: tried + keyTrials + inputTrials, leftOut, ms: row.ms };
}

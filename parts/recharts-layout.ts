// recharts 3.8's layout of a cartesian chart, for a drawing at a size or in a time zone the capture did not see: the
// plot box, the band and point scales, the bars' sizes, the ticks getTicks keeps (measured as recharts measures them)
// and the tooltip's places, from what convert wrote on the drawing (its facts: every possible tick, the layout, the bar
// settings) and what the old page drew.
import { curvePath, rectPath, rt, shapeOf, through, type Geo } from './recharts-motion.ts';

/** A cartesian axis as recharts' CartesianAxis was given it (convert's AxisModel). */
export interface Axis {
	readonly t: 'xAxis' | 'yAxis';
	readonly o: 'top' | 'bottom' | 'left' | 'right';
	readonly box: readonly [number, number, number, number];
	readonly vb: readonly [number, number, number, number];
	readonly gap: number;
	readonly iv: string | number;
	readonly ts: number;
	readonly tm: number;
	readonly m?: true;
	readonly u?: string;
	readonly ang?: number;
	readonly off: number;
	readonly num?: true;
	readonly rev?: true;
	readonly v?: readonly string[];
	readonly f?: Intl.DateTimeFormatOptions;
	readonly lo?: string;
	readonly pad?: readonly [number, number] | string;
	readonly c: readonly number[];
	readonly l: readonly string[];
}

interface Tick {
	readonly coordinate: number;
	readonly index: number;
	tickCoord?: number;
	isShow?: boolean;
}

type Size = (tick: Tick, index: number) => number;

const sizes = new Map<string, { width: number; height: number }>();
let measure: Text | undefined;

// A node of the part's own past the end of the page Markless renders (as recharts' span is the body's last child).
function afterPage(node: Element): void {
	document.body.append(node);
}

// recharts' getStringSize: a span at the end of the body, in the tick's font size and letter spacing.
function stringSize(text: string, style: { fontSize: string; letterSpacing: string }): { width: number; height: number } {
	const key = `${text}|${style.fontSize}|${style.letterSpacing}`;
	const known = sizes.get(key);
	if (known) return known;
	if (!measure?.parentElement?.isConnected) {
		const span = document.createElement('span');
		span.setAttribute('aria-hidden', 'true');
		measure = document.createTextNode('');
		span.append(measure);
		afterPage(span);
	}
	Object.assign(measure.parentElement!.style, { position: 'absolute', top: '-20000px', left: 0, padding: 0, margin: 0, border: 'none', whiteSpace: 'pre' }, style);
	measure.data = text;
	const rect = measure.parentElement!.getBoundingClientRect();
	const size = { width: rect.width, height: rect.height };
	sizes.set(key, size);
	return size;
}

// recharts' getAngledRectangleWidth.
function angledWidth(width: number, height: number, angle = 0): number {
	const normalized = ((angle % 180) + 180) % 180;
	const radians = (normalized * Math.PI) / 180;
	const threshold = Math.atan(height / width);
	const length = radians > threshold && radians < Math.PI - threshold ? height / Math.sin(radians) : width / Math.cos(radians);
	return Math.abs(length);
}

function isVisible(sign: number, at: number, size: () => number, start: number, end: number): boolean {
	if (sign * at < sign * start || sign * at > sign * end) return false;
	const s = size();
	return sign * (at - (sign * s) / 2 - start) >= 0 && sign * (at + (sign * s) / 2 - end) <= 0;
}

const everyNth = <T>(array: readonly T[], n: number): T[] => {
	if (n < 1) return [];
	if (n === 1) return [...array];
	const out: T[] = [];
	for (let i = 0; i < array.length; i += n) out.push(array[i]!);
	return out;
};

function ticksEnd(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number): Tick[] {
	const result = ticks.map((t) => ({ ...t }));
	let { end } = bounds;
	for (let i = result.length - 1; i >= 0; i--) {
		const entry = result[i]!;
		let s: number | undefined;
		const get = () => (s ??= size(ticks[i]!, i));
		if (i === result.length - 1) {
			const over = sign * (entry.coordinate + (sign * get()) / 2 - end);
			entry.tickCoord = over > 0 ? entry.coordinate - over * sign : entry.coordinate;
		} else entry.tickCoord = entry.coordinate;
		if (isVisible(sign, entry.tickCoord, get, bounds.start, end)) {
			end = entry.tickCoord - sign * (get() / 2 + gap);
			entry.isShow = true;
		}
	}
	return result;
}

function ticksStart(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number, preserveEnd: boolean): Tick[] {
	const result = ticks.map((t) => ({ ...t }));
	let { start, end } = bounds;
	const len = result.length;
	if (preserveEnd && len) {
		const tail = result[len - 1]!;
		const tailSize = size(ticks[len - 1]!, len - 1);
		const over = sign * (tail.coordinate + (sign * tailSize) / 2 - end);
		tail.tickCoord = over > 0 ? tail.coordinate - over * sign : tail.coordinate;
		if (isVisible(sign, tail.tickCoord, () => tailSize, start, end)) {
			end = tail.tickCoord - sign * (tailSize / 2 + gap);
			tail.isShow = true;
		}
	}
	for (let i = 0; i < (preserveEnd ? len - 1 : len); i++) {
		const entry = result[i]!;
		let s: number | undefined;
		const get = () => (s ??= size(ticks[i]!, i));
		if (i === 0) {
			const under = sign * (entry.coordinate - (sign * get()) / 2 - start);
			entry.tickCoord = under < 0 ? entry.coordinate - under * sign : entry.coordinate;
		} else entry.tickCoord = entry.coordinate;
		if (isVisible(sign, entry.tickCoord, get, start, end)) {
			start = entry.tickCoord + sign * (get() / 2 + gap);
			entry.isShow = true;
		}
	}
	return result;
}

function equidistant(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number): Tick[] {
	let index = 0;
	let step = 1;
	let start = bounds.start;
	while (step <= ticks.length) {
		const entry = ticks[index];
		if (entry === undefined) return everyNth(ticks, step);
		const i = index;
		let s: number | undefined;
		const get = () => (s ??= size(entry, i));
		if (index === 0 || isVisible(sign, entry.coordinate, get, start, bounds.end)) {
			start = entry.coordinate + sign * (get() / 2 + gap);
			index += step;
		} else {
			index = 0;
			start = bounds.start;
			step += 1;
		}
	}
	return [];
}

function equidistantEnd(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number): Tick[] {
	const len = ticks.length;
	for (let step = 1; step <= len; step++) {
		const offset = (len - 1) % step;
		let start = bounds.start;
		let ok = true;
		for (let index = offset; index < len; index += step) {
			const entry = ticks[index]!;
			let s: number | undefined;
			const get = () => (s ??= size(entry, index));
			if (index !== offset && !isVisible(sign, entry.coordinate, get, start, bounds.end)) {
				ok = false;
				break;
			}
			start = entry.coordinate + sign * (get() / 2 + gap);
		}
		if (ok) return everyNth(ticks.slice(offset), step);
	}
	return [];
}

/** recharts' getTicks: the ticks an axis shows, each with the coordinate its text is drawn at. */
export function chooseTicks(axis: Axis, labels: readonly string[], style: { fontSize: string; letterSpacing: string }): Tick[] {
	const ticks: Tick[] = axis.c.map((coordinate, index) => ({ coordinate, index }));
	if (!ticks.length) return [];
	if (typeof axis.iv === 'number') return everyNth(ticks, axis.iv + 1);
	const horizontal = axis.o === 'top' || axis.o === 'bottom';
	const unit = axis.u && horizontal ? stringSize(axis.u, style) : { width: 0, height: 0 };
	const size: Size = (tick) => {
		const text = stringSize(labels[tick.index] ?? '', style);
		return horizontal ? angledWidth(text.width + unit.width, text.height + unit.height, axis.ang) : text.height;
	};
	const sign = ticks.length >= 2 ? Math.sign(ticks[1]!.coordinate - ticks[0]!.coordinate) : 1;
	const [x, y, width, height] = axis.vb;
	const bounds = sign === 1 ? { start: horizontal ? x : y, end: horizontal ? x + width : y + height } : { start: horizontal ? x + width : y + height, end: horizontal ? x : y };
	if (axis.iv === 'equidistantPreserveStart') return equidistant(sign, bounds, size, ticks, axis.gap);
	if (axis.iv === 'equidistantPreserveEnd') return equidistantEnd(sign, bounds, size, ticks, axis.gap);
	const all = axis.iv === 'preserveStart' || axis.iv === 'preserveStartEnd' ? ticksStart(sign, bounds, size, ticks, axis.gap, axis.iv === 'preserveStartEnd') : ticksEnd(sign, bounds, size, ticks, axis.gap);
	return all.filter((t) => t.isShow);
}

// CartesianAxis' getTickLineCoord: where a tick's line and text go.
function placeOf(axis: Axis, tick: Tick): { line: { x1: number; y1: number; x2: number; y2: number }; text: { x: number; y: number } } {
	const [x, y, width, height] = axis.box;
	const sign = axis.m ? -1 : 1;
	const at = tick.tickCoord ?? tick.coordinate;
	const c = tick.coordinate;
	switch (axis.o) {
		case 'top': {
			const y2 = y + +!axis.m * height;
			const y1 = y2 - sign * axis.ts;
			return { line: { x1: c, x2: c, y1, y2 }, text: { x: at, y: y1 - sign * axis.tm } };
		}
		case 'left': {
			const x2 = x + +!axis.m * width;
			const x1 = x2 - sign * axis.ts;
			return { line: { x1, x2, y1: c, y2: c }, text: { x: x1 - sign * axis.tm, y: at } };
		}
		case 'right': {
			const x2 = x + +!!axis.m * width;
			const x1 = x2 + sign * axis.ts;
			return { line: { x1, x2, y1: c, y2: c }, text: { x: x1 + sign * axis.tm, y: at } };
		}
		default: {
			const y2 = y + +!!axis.m * height;
			const y1 = y2 + sign * axis.ts;
			return { line: { x1: c, x2: c, y1, y2 }, text: { x: at, y: y1 + sign * axis.tm } };
		}
	}
}

const set = (el: Element, name: string, value: number | string) => {
	if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value));
};

/**
 * Draws the axis' ticks for `labels` (the formatter's text as this visitor's page shows it): the ones getTicks keeps,
 * text and line placed as CartesianAxis places them. `claim` tells the clock part a text is written for this visitor
 * already. Does nothing where the drawing is not recharts' own.
 */
export function drawTicks(svg: SVGSVGElement, axis: Axis, nth: number, labels: readonly string[], claim?: (node: Text) => void): void {
	const group = svg.querySelectorAll(`g.recharts-${axis.t}-tick-labels`)[nth];
	const lines = svg.querySelectorAll(`g.recharts-${axis.t}-tick-lines`)[nth];
	const template = group?.querySelector(':scope > g.recharts-cartesian-axis-tick-label');
	const value = template?.querySelector('text.recharts-cartesian-axis-tick-value');
	if (!group || !template || !value || value.querySelectorAll('tspan').length !== 1) return;
	const style = getComputedStyle(value);
	const shown = chooseTicks(axis, labels, { fontSize: style.fontSize, letterSpacing: style.letterSpacing });
	// Markless owns these nodes: convert gave each drawing spare ticks (display none), which are shown or hidden here.
	const labelsNow = [...group.querySelectorAll(':scope > g.recharts-cartesian-axis-tick-label')];
	const linesNow = lines ? [...lines.querySelectorAll(':scope > g.recharts-cartesian-axis-tick')] : [];
	if (shown.length > labelsNow.length || (lines && linesNow.length && shown.length > linesNow.length)) return;
	shown.forEach((tick, i) => {
		const place = placeOf(axis, tick);
		const label = labelsNow[i]!;
		label.removeAttribute('display');
		const text = label.querySelector('text.recharts-cartesian-axis-tick-value')!;
		const span = text.querySelector('tspan')!;
		set(text, 'x', place.text.x);
		set(text, 'y', place.text.y);
		// CartesianAxis spreads the axis' box onto its ticks' text.
		if (text.hasAttribute('width')) set(text, 'width', axis.box[2]);
		if (text.hasAttribute('height')) set(text, 'height', axis.box[3]);
		set(span, 'x', place.text.x);
		const node = span.firstChild;
		if (node instanceof Text) {
			node.data = `${labels[tick.index] ?? ''}${axis.u ?? ''}`;
			claim?.(node);
		}
		const line = linesNow[i]?.querySelector('line');
		linesNow[i]?.removeAttribute('display');
		if (line) for (const [k, v] of Object.entries(place.line)) set(line, k, v);
	});
	for (const extra of labelsNow.slice(shown.length)) extra.setAttribute('display', 'none');
	for (const extra of linesNow.slice(shown.length)) extra.setAttribute('display', 'none');
}

/** recharts' getBarPositions sizing, as convert read it off the store (BarModel). */
export interface Bars {
	readonly gap: number | string;
	readonly cat: number | string;
	readonly max?: number;
	readonly size?: number;
	readonly groups: readonly { readonly size?: number; readonly max?: number }[];
}

/** What the converter wrote on a drawing (data-mm-facts) that its layout reads. */
export interface Facts {
	readonly w: number;
	readonly h: number;
	readonly v: readonly [number, number, number, number];
	readonly m: string;
	readonly g: readonly (readonly [number, number, number])[];
	readonly sp?: readonly [number, number];
	readonly p: readonly (readonly [number | null, number | null])[];
	readonly k?: readonly (readonly [number, number, number])[];
	readonly a?: readonly (Axis | null)[];
	readonly b?: Bars;
	readonly l?: 'horizontal' | 'vertical';
	/** Per state, the coordinate recharts anchors the tooltip at along the category axis (a relaid drawing's). */
	readonly pa?: readonly (number | null)[];
	/** Where the horizontal grid could draw lines: fractions of the plot's height from its bottom. */
	readonly gy?: readonly number[];
	/** A polar chart's innerRadius, outerRadius, cx and cy as given. */
	readonly pl?: readonly (number | string)[];
	readonly c?: readonly [number, number];
	readonly q?: readonly number[];
	readonly [key: string]: unknown;
}

const isPercent = (v: unknown): v is string => typeof v === 'string' && v.indexOf('%') === v.length - 1;

// recharts' getPercentValue.
function percentOf(value: number | string | undefined, total: number, fallback = 0, validate = false): number {
	if (typeof value !== 'number' && typeof value !== 'string') return fallback;
	let out = isPercent(value) ? (total * parseFloat(value.slice(0, value.indexOf('%')))) / 100 : +value;
	if (Number.isNaN(out)) out = fallback;
	if (validate && out > total) out = total;
	return out;
}

const wellBehaved = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// recharts' getBarPositions: each bar group's offset in its band and its size, whole pixels where recharts truncates.
export function barPositions(bars: Bars, band: number): { offset: number; size: number }[] {
	const list = bars.groups.map((g) => ({ barSize: g.size ?? bars.size }));
	const len = list.length;
	if (len < 1) return [];
	let gap = percentOf(bars.gap, band, 0, true);
	const max = bars.groups[0]?.max ?? bars.max;
	if (wellBehaved(list[0]!.barSize)) {
		let useFull = false;
		let full = band / len;
		let sum = list.reduce((s, e) => s + (e.barSize || 0), 0) + (len - 1) * gap;
		if (sum >= band) {
			sum -= (len - 1) * gap;
			gap = 0;
		}
		if (sum >= band && full > 0) {
			useFull = true;
			full *= 0.9;
			sum = len * full;
		}
		let prev = { offset: ((band - sum) / 2 >> 0) - gap, size: 0 };
		return list.map((e) => (prev = { offset: prev.offset + prev.size + gap, size: useFull ? full : (e.barSize ?? 0) }));
	}
	const offset = percentOf(bars.cat, band, 0, true);
	if (band - 2 * offset - (len - 1) * gap <= 0) gap = 0;
	let original = (band - 2 * offset - (len - 1) * gap) / len;
	if (original > 1) original >>= 0;
	const size = wellBehaved(max) ? Math.min(original, max) : original;
	return list.map((_, i) => ({ offset: offset + (original + gap) * i + (original - size) / 2, size }));
}

// d3-scale's band and point scales (no padding, align 0.5, unrounded): each category's start, and the band's width.
function categories(n: number, r0: number, r1: number, point: boolean): { at: number[]; bw: number } {
	const reverse = r1 < r0;
	let start = reverse ? r1 : r0;
	const stop = reverse ? r0 : r1;
	const inner = point ? 1 : 0;
	const step = (stop - start) / Math.max(1, n - inner);
	start += (stop - start - step * (n - inner)) * 0.5;
	const at = Array.from({ length: n }, (_, i) => start + step * i);
	return { at: reverse ? at.reverse() : at, bw: step * (1 - inner) };
}

const nearest = (values: readonly number[], v: number): number => {
	let best = 0;
	for (let i = 1; i < values.length; i++) if (Math.abs(values[i]! - v) < Math.abs(values[best]! - v)) best = i;
	return best;
};

/** The chart laid out at one size: its plot box, its category axis, and its number axis' range. */
interface Frame {
	readonly W: number;
	readonly H: number;
	readonly v: readonly [number, number, number, number];
	/** Each category's start (a band's) or place (a point's), and the band width (0 on a point axis). */
	readonly at: readonly number[];
	readonly bw: number;
	/** The number axis' range, from its zero end: [from, to]. */
	readonly num: readonly [number, number];
	readonly bars?: readonly { offset: number; size: number }[];
}

interface Plan {
	readonly horizontal: boolean;
	readonly cat: Axis;
	readonly numAxis?: Axis;
	readonly bars?: Bars;
}

function frameOf(plan: Plan, W: number, H: number, v: readonly [number, number, number, number]): Frame {
	const [vx, vy, vw, vh] = v;
	const pad = (axis: Axis | undefined) => (Array.isArray(axis?.pad) ? (axis!.pad as readonly [number, number]) : [0, 0]);
	const [c0, c1] = pad(plan.cat);
	const range: [number, number] = plan.horizontal ? [vx + c0, vx + vw - c1] : [vy + c0, vy + vh - c1];
	if (plan.cat.rev) range.reverse();
	const { at, bw } = categories(plan.cat.c.length, range[0], range[1], !(plan.cat.off > 0));
	const [n0, n1] = pad(plan.numAxis);
	const num: [number, number] = plan.horizontal ? [vy + vh - n1, vy + n0] : [vx + n0, vx + vw - n1];
	if (plan.numAxis?.rev) num.reverse();
	return { W, H, v, at, bw, num, ...(plan.bars ? { bars: barPositions(plan.bars, bw) } : {}) };
}

/** The chart's layout from the drawing's size to another: the plot box keeps its margins and the axes' sizes. */
export function framesOf(facts: Facts, W: number, H: number, hidden?: { n: number; band: boolean }): { plan: Plan; from: Frame; to: Frame } | undefined {
	const horizontal = (facts.l ?? 'horizontal') === 'horizontal';
	const axes = (facts.a ?? []).filter((a): a is Axis => !!a);
	// A chart that draws no category axis has recharts' own, over its data: one category per bar or point of a series.
	const own: Axis | undefined = hidden && { t: horizontal ? 'xAxis' : 'yAxis', o: horizontal ? 'bottom' : 'left', box: [0, 0, 0, 0], vb: [0, 0, 0, 0], gap: 5, iv: 'preserveEnd', ts: 6, tm: 2, off: hidden.band ? 1 : 0, c: Array.from({ length: hidden.n }, () => 0), l: [] };
	const cat = axes.find((a) => !a.num && a.t === (horizontal ? 'xAxis' : 'yAxis')) ?? own;
	if (!cat || !cat.c.length) return undefined;
	const numAxis = axes.find((a) => a.num && a.t === (horizontal ? 'yAxis' : 'xAxis'));
	const plan: Plan = { horizontal, cat, ...(numAxis ? { numAxis } : {}), ...(facts.b ? { bars: facts.b } : {}) };
	const [vx, vy, vw, vh] = facts.v;
	return { plan, from: frameOf(plan, facts.w, facts.h, facts.v), to: frameOf(plan, W, H, [vx, vy, vw + W - facts.w, vh + H - facts.h]) };
}

type Attrs = Record<string, string>;
const n = (a: Attrs, k: string) => Number(a[k]);
const fmt = (v: number) => String(v);
// recharts' util/round: what its Rectangle writes in x, y, width and height.
const round4 = (v: number) => {
	const r = Math.round(v * 1e4) / 1e4;
	return Object.is(r, -0) ? 0 : r;
};

/** Maps a drawing's coordinates from one frame to the other, along each of the chart's directions. */
class Mapper {
	readonly plan: Plan;
	readonly from: Frame;
	readonly to: Frame;
	constructor(plan: Plan, from: Frame, to: Frame) {
		this.plan = plan;
		this.from = from;
		this.to = to;
	}
	/** Category index of a coordinate drawn at a category's middle (a point, a band's centre). */
	index(c: number): number {
		return nearest(this.from.at.map((a) => a + this.from.bw / 2), c);
	}
	middle(c: number): number {
		const i = this.index(c);
		return this.to.at[i]! + this.to.bw / 2;
	}
	num(c: number): number {
		const [f0, f1] = this.from.num;
		const [t0, t1] = this.to.num;
		return f1 === f0 ? t0 : t0 + ((c - f0) * (t1 - t0)) / (f1 - f0);
	}
	/** x and y of a point drawn at a category's middle and a value. */
	point(x: number, y: number): [number, number] {
		return this.plan.horizontal ? [this.middle(x), this.num(y)] : [this.num(x), this.middle(y)];
	}
	/** A plot edge or a place along the plot box in one direction ('x' or 'y'), scaled with the box. */
	box(c: number, dir: 'x' | 'y'): number {
		const [fx, fy, fw, fh] = this.from.v;
		const [tx, ty, tw, th] = this.to.v;
		return dir === 'x' ? tx + ((c - fx) * tw) / fw : ty + ((c - fy) * th) / fh;
	}
	/** A place along the category axis between its categories' middles, as the scale (affine) puts it. */
	along(c: number): number {
		const [f0, f1] = [this.from.at[0]! + this.from.bw / 2, (this.from.at[1] ?? this.from.at[0]!) + this.from.bw / 2];
		const [t0, t1] = [this.to.at[0]! + this.to.bw / 2, (this.to.at[1] ?? this.to.at[0]!) + this.to.bw / 2];
		return f1 === f0 ? t0 : t0 + ((c - f0) * (t1 - t0)) / (f1 - f0);
	}
	/** A grid line or tick along a direction: the category axis' middles there, the number axis' scale on the other. */
	line(c: number, dir: 'x' | 'y'): number {
		const [fx, fy, fw, fh] = this.from.v;
		const [tx, ty, tw, th] = this.to.v;
		const start = dir === 'x' ? fx : fy;
		const end = dir === 'x' ? fx + fw : fy + fh;
		if (Math.abs(c - start) < 1e-9) return dir === 'x' ? tx : ty;
		if (Math.abs(c - end) < 1e-9) return dir === 'x' ? tx + tw : ty + th;
		return (dir === 'x') === this.plan.horizontal ? this.middle(c) : this.num(c);
	}
}

const GEOMETRY = ['x', 'y', 'width', 'height', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'd', 'points', 'transform', 'viewBox'];
const hasGeometry = (el: Element) => GEOMETRY.some((a) => el.hasAttribute(a));
const inside = (el: Element, cls: string) => !!el.closest(`.${cls}`);

/**
 * An element's attributes in the other frame, from its attributes as the old page drew them; undefined where the
 * element is none recharts draws from the chart's layout alone (a label, a custom shape), null where it keeps them.
 */
function placed(el: Element, ref: Attrs, map: Mapper, geo: Geo | null): Attrs | null | undefined {
	const { to, from, plan } = map;
	const [vx, vy, vw, vh] = to.v;
	const cls = el.getAttribute('class') ?? '';
	const tag = el.tagName.toLowerCase();
	const sized = (out: Attrs) => {
		// recharts spreads the plot's size onto its curves and dots.
		if ('width' in ref && n(ref, 'width') === from.v[2]) out.width = fmt(vw);
		if ('height' in ref && n(ref, 'height') === from.v[3]) out.height = fmt(vh);
		return out;
	};
	const clip = el.parentElement?.tagName.toLowerCase() === 'clippath' ? el.parentElement : undefined;
	if (tag === 'rect' && clip?.id.startsWith('animationClipPath')) return areaClip(el, clip.id, map);
	if (tag === 'rect' && clip) return { x: fmt(vx), y: fmt(vy), width: fmt(vw), height: fmt(vh) };
	if (tag === 'line' && (inside(el, 'recharts-cartesian-grid-horizontal') || inside(el, 'recharts-cartesian-grid-vertical'))) {
		const horizontalLine = inside(el, 'recharts-cartesian-grid-horizontal');
		const c = horizontalLine ? map.line(n(ref, 'y1'), 'y') : map.line(n(ref, 'x1'), 'x');
		return {
			...('x' in ref ? { x: fmt(vx), y: fmt(vy), width: fmt(vw), height: fmt(vh) } : {}),
			...(horizontalLine ? { x1: fmt(vx), x2: fmt(vx + vw), y1: fmt(c), y2: fmt(c) } : { x1: fmt(c), x2: fmt(c), y1: fmt(vy), y2: fmt(vy + vh) }),
		};
	}
	if (tag === 'path' && geo && geo.k !== 'bar' && geo.t?.startsWith('step')) {
		// A step's corners sit halfway between categories, which no point of the data names: every corner is mapped,
		// the scales being affine along each axis.
		const d = mapPath(ref.d ?? '', (x, y) => (plan.horizontal ? [map.along(x), map.num(y)] : [map.num(x), map.along(y)]));
		return d === undefined ? undefined : sized({ d });
	}
	if (tag === 'path' && geo && geo.k !== 'bar') {
		const all = through(ref.d ?? '');
		if (!all) return undefined;
		const shapeNow = shapeOf(el, geo, ref.d ?? '');
		if (!shapeNow?.points) return undefined;
		const points = shapeNow.points.map((p) => {
			if (p.x === null || p.y === null) return p;
			const [x, y] = map.point(p.x, p.y);
			return { x, y };
		});
		const base = shapeNow.base?.map((b) => (b === null ? b : map.num(b)));
		return sized({ d: curvePath(geo, points, base) });
	}
	if (tag === 'path' && cls.includes('recharts-tooltip-cursor') && cls.includes('recharts-curve')) {
		const pts = through(ref.d ?? '');
		if (!pts || pts.length !== 2) return undefined;
		const c = plan.horizontal ? map.middle(pts[0]!.x!) : map.middle(pts[0]!.y!);
		const line = plan.horizontal ? [{ x: c, y: vy }, { x: c, y: vy + vh }] : [{ x: vx, y: c }, { x: vx + vw, y: c }];
		return sized({ d: curvePath({ k: 'line', t: 'linear' }, line, undefined) });
	}
	if (tag === 'path' && cls.includes('recharts-rectangle')) {
		const radius = geo?.r ?? (el.hasAttribute('radius') ? Number(el.getAttribute('radius')) : undefined);
		let x = n(ref, 'x');
		let y = n(ref, 'y');
		let width = n(ref, 'width');
		let height = n(ref, 'height');
		if (cls.includes('recharts-tooltip-cursor')) {
			// recharts' getCursorRectangle: the band at the active category, inset half a pixel across the plot.
			if (plan.horizontal) {
				x = map.middle(x + from.bw / 2) - to.bw / 2;
				width = to.bw;
				y = vy + 0.5;
				height = vh - 1;
			} else {
				y = map.middle(y + from.bw / 2) - to.bw / 2;
				height = to.bw;
				x = vx + 0.5;
				width = vw - 1;
			}
		} else {
			const box = barIn({ x, y, width, height }, map);
			if (!box) return undefined;
			({ x, y, width, height } = box);
		}
		return { x: fmt(round4(x)), y: fmt(round4(y)), width: fmt(round4(width)), height: fmt(round4(height)), d: rectPath(x, y, width, height, radius) };
	}
	if (tag === 'circle' && cls.includes('recharts-dot') && !inside(el, 'recharts-polar-grid') && !cls.includes('recharts-radar-dot')) {
		const [cx, cy] = map.point(n(ref, 'cx'), n(ref, 'cy'));
		return sized({ cx: fmt(cx), cy: fmt(cy) });
	}
	if (tag === 'svg' && cls.includes('recharts-surface')) return { width: fmt(to.W), height: fmt(to.H), viewBox: `0 0 ${to.W} ${to.H}` };
	const list = el.closest('g.recharts-label-list[data-mm-geo]');
	if (list && tag === 'text') return labelIn(el, ref, list, map);
	if (list && tag === 'tspan') {
		const text = el.closest('text');
		const at = text && labelIn(text, refOf(text), list, map);
		return at === undefined || at === null ? at : 'x' in ref ? { x: at.x! } : null;
	}
	// A custom dot (an icon) sits on its line's point: it moves with it; what it draws inside keeps its own coordinates.
	const dots = el.parentElement?.closest('g.recharts-line-dots');
	if (dots && el.parentElement === dots && tag !== 'circle') return dotIn(el, ref, dots, map);
	if (dots && el.closest('svg') !== el.closest('svg.recharts-surface')) return null;
	// The axes are drawn on their own (drawAxis); what holds no geometry keeps it.
	if (inside(el, 'recharts-cartesian-axis') || inside(el, 'recharts-cartesian-axis-tick-labels') || !hasGeometry(el)) return null;
	// A gradient's geometry is in its fill box's units.
	if (tag === 'stop' || tag === 'lineargradient' || tag === 'radialgradient') return null;
	return undefined;
}

// Area's animation clip (its HorizontalRect or VerticalRect at the animation's end): the area's span along the
// categories, and to its furthest point on the other axis plus its stroke.
function areaClip(rect: Element, id: string, map: Mapper): Attrs | undefined {
	const path = rect.closest('svg.recharts-surface')?.querySelector(`[clip-path="url(#${id})"] path.recharts-area-area[data-mm-geo]`);
	const geo = path && geoOfEl(path);
	const shape = path && geo && shapeOf(path, geo, refOf(path).d ?? '');
	const points = shape?.points?.filter((p) => p.x !== null && p.y !== null).map((p): [number, number] => map.point(p.x!, p.y!));
	if (!path || !points?.length) return undefined;
	const base = (shape!.base ?? []).filter((b): b is number => b !== null).map((b) => map.num(b));
	const stroke = parseInt(path.parentElement?.querySelector('.recharts-area-curve')?.getAttribute('stroke-width') ?? path.getAttribute('stroke-width') ?? '', 10) || 1;
	const [start, end] = [points[0]!, points.at(-1)!];
	if (map.plan.horizontal) {
		const width = Math.abs(start[0] - end[0]);
		return { x: fmt(start[0] < end[0] ? start[0] : start[0] - width), y: '0', width: fmt(width), height: fmt(Math.floor(Math.max(...points.map((p) => p[1]), ...base) + stroke)) };
	}
	const height = Math.abs(start[1] - end[1]);
	return { x: '0', y: fmt(start[1] < end[1] ? start[1] : start[1] - height), width: fmt(Math.max(...points.map((p) => p[0]), ...base) + stroke), height: fmt(Math.floor(height)) };
}

// d3-path's output (absolute M, L, C and Z) with each point moved, written to d3-shape's three decimals.
function mapPath(d: string, move: (x: number, y: number) => [number, number]): string | undefined {
	let out = '';
	for (const [, cmd, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
		const n = (args!.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
		if (n.length % 2) return undefined;
		const pts: string[] = [];
		for (let i = 0; i < n.length; i += 2) {
			const [x, y] = move(n[i]!, n[i + 1]!);
			pts.push(`${Math.round(x * 1e3) / 1e3},${Math.round(y * 1e3) / 1e3}`);
		}
		out += cmd + pts.join(',');
	}
	return /[^MLCZ0-9,.\-eZ\s]/i.test(d) ? undefined : out;
}

type Box = { x: number; y: number; width: number; height: number };

// A bar in the other frame: its category's band start plus its group's offset (getBarPositions), its value's extent
// on the number axis' scale.
function barIn(box: Box, map: Mapper): Box | undefined {
	const { from, to, plan } = map;
	const old = from.bars;
	const now = to.bars;
	if (!old || !now) return undefined;
	const start = plan.horizontal ? box.x : box.y;
	let best: [number, number] = [0, 0];
	let gap = Infinity;
	from.at.forEach((a, i) =>
		old.forEach((p, g) => {
			const d = Math.abs(a + p.offset - start);
			if (d < gap) {
				gap = d;
				best = [i, g];
			}
		}),
	);
	const [i, g] = best;
	if (plan.horizontal) {
		const top = map.num(box.y);
		return { x: to.at[i]! + now[g]!.offset, y: top, width: now[g]!.size, height: map.num(box.y + box.height) - top };
	}
	const left = map.num(box.x);
	return { x: left, y: to.at[i]! + now[g]!.offset, width: map.num(box.x + box.width) - left, height: now[g]!.size };
}

/** Each bar or point a label list labels, in the old frame and the other: the series' own marks, in order. */
function anchorsOf(list: Element, map: Mapper): { from: Box; to: Box }[] | undefined {
	const geo = geoOfEl(list) as unknown as { s?: string } | null;
	const series = geo?.s ? list.closest('svg.recharts-surface')?.querySelector(`[id="${CSS.escape(geo.s)}"]`) : undefined;
	if (!series) return undefined;
	if (series.tagName.toLowerCase() === 'path') {
		const points = through(refOf(series).d ?? '');
		return points?.map((p) => {
			const [x, y] = map.point(p.x!, p.y!);
			return { from: { x: p.x!, y: p.y!, width: 0, height: 0 }, to: { x, y, width: 0, height: 0 } };
		});
	}
	const out: { from: Box; to: Box }[] = [];
	for (const bar of series.querySelectorAll('path.recharts-rectangle')) {
		const ref = refOf(bar);
		const box = { x: n(ref, 'x'), y: n(ref, 'y'), width: n(ref, 'width'), height: n(ref, 'height') };
		const now = barIn(box, map);
		if (!now) return undefined;
		out.push({ from: box, to: now });
	}
	return out;
}

// recharts' getCartesianPosition for the positions a LabelList takes, and the size it clamps the label's text to.
function labelAt(box: Box, position: string | undefined, offset: number, parent: Box): { x: number; y: number; width?: number; height?: number } {
	const { x, y, width, height } = box;
	const v = (height >= 0 ? 1 : -1) * offset;
	const h = (width >= 0 ? 1 : -1) * offset;
	const size = { width, height };
	switch (position) {
		case 'top':
			return { x: x + width / 2, y: y - v, height: Math.max(y - parent.y, 0), width };
		case 'bottom':
			return { x: x + width / 2, y: y + height + v, height: Math.max(parent.y + parent.height - (y + height), 0), width };
		case 'left': {
			const at = x - h;
			return { x: at, y: y + height / 2, width: Math.max(at - parent.x, 0), height };
		}
		case 'right': {
			const at = x + width + h;
			return { x: at, y: y + height / 2, width: Math.max(parent.x + parent.width - at, 0), height };
		}
		case 'insideLeft':
			return { x: x + h, y: y + height / 2, ...size };
		case 'insideRight':
			return { x: x + width - h, y: y + height / 2, ...size };
		case 'insideTop':
			return { x: x + width / 2, y: y + v, ...size };
		case 'insideBottom':
			return { x: x + width / 2, y: y + height - v, ...size };
		case 'insideTopLeft':
			return { x: x + h, y: y + v, ...size };
		case 'insideTopRight':
			return { x: x + width - h, y: y + v, ...size };
		case 'insideBottomLeft':
			return { x: x + h, y: y + height - v, ...size };
		case 'insideBottomRight':
			return { x: x + width - h, y: y + height - v, ...size };
		default:
			return { x: x + width / 2, y: y + height / 2, ...size };
	}
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

// A label of a LabelList: placed against its bar or point in the other frame; its text's width and height where
// recharts clamps them to the room the chart leaves it (they were so in the old frame).
function labelIn(text: Element, ref: Attrs, list: Element, map: Mapper): Attrs | undefined {
	const geo = geoOfEl(list) as unknown as { p?: string; o?: number } | null;
	const texts = [...list.querySelectorAll(':scope > text, :scope > * > text')];
	const i = texts.indexOf(text);
	const anchor = anchorsOf(list, map)?.[i];
	if (!anchor || i < 0) return undefined;
	const offset = geo?.o ?? 5;
	const parent = (frame: Frame): Box => ({ x: 0, y: 0, width: frame.W, height: frame.H });
	const was = labelAt(anchor.from, geo?.p, offset, parent(map.from));
	if (!near(was.x, n(ref, 'x')) || !near(was.y, n(ref, 'y'))) return undefined;
	const now = labelAt(anchor.to, geo?.p, offset, parent(map.to));
	const out: Attrs = { x: fmt(now.x), y: fmt(now.y) };
	if ('width' in ref && was.width !== undefined && near(was.width, n(ref, 'width')) && now.width !== undefined) out.width = fmt(now.width);
	if ('height' in ref && was.height !== undefined && near(was.height, n(ref, 'height')) && now.height !== undefined) out.height = fmt(now.height);
	return out;
}

function dotIn(el: Element, ref: Attrs, dots: Element, map: Mapper): Attrs | undefined {
	// recharts draws a line's dots in a layer of their own, in the lines' order.
	const svg = dots.closest('svg.recharts-surface');
	const line = svg?.querySelectorAll('path.recharts-line-curve')[[...(svg?.querySelectorAll('g.recharts-line-dots') ?? [])].indexOf(dots)];
	const points = line && through(refOf(line).d ?? '');
	const i = [...dots.children].indexOf(el);
	const p = points?.[i];
	if (!p || !('x' in ref) || !('y' in ref)) return undefined;
	const [x, y] = map.point(p.x!, p.y!);
	return { x: fmt(n(ref, 'x') + x - p.x!), y: fmt(n(ref, 'y') + y - p.y!) };
}

/** The axis as recharts lays it out in the other frame: its box follows the plot's, its ticks the scales. */
function axisIn(axis: Axis, map: Mapper): Axis {
	const dw = map.to.W - map.from.W;
	const dh = map.to.H - map.from.H;
	const [x, y, w, h] = axis.box;
	const horizontal = axis.o === 'top' || axis.o === 'bottom';
	const box: [number, number, number, number] = horizontal ? [x, axis.o === 'bottom' ? y + dh : y, w + dw, h] : [axis.o === 'right' ? x + dw : x, y, w, h + dh];
	const [bx, by, bw, bh] = axis.vb;
	const category = axis === map.plan.cat;
	const c = category ? map.to.at.map((a) => a + (axis.off > 0 ? map.to.bw / 2 : 0)) : axis.c.map((v) => map.num(v));
	return { ...axis, box, vb: [bx, by, bw + dw, bh + dh], c, off: category && axis.off > 0 ? map.to.bw / 2 : axis.off };
}

// CartesianAxis' AxisLine.
function axisLine(svg: SVGSVGElement, axis: Axis, nth: number): void {
	const line = svg.querySelectorAll(`g.recharts-${axis.t} line.recharts-cartesian-axis-line`)[nth];
	if (!line) return;
	const [x, y, width, height] = axis.box;
	const out: Attrs = {};
	if (line.hasAttribute('width')) Object.assign(out, { x: fmt(x), y: fmt(y), width: fmt(width), height: fmt(height) });
	if (axis.o === 'top' || axis.o === 'bottom') {
		const at = y + +((axis.o === 'top' && !axis.m) || (axis.o === 'bottom' && !!axis.m)) * height;
		Object.assign(out, { x1: fmt(x), y1: fmt(at), x2: fmt(x + width), y2: fmt(at) });
	} else {
		const at = x + +((axis.o === 'left' && !axis.m) || (axis.o === 'right' && !!axis.m)) * width;
		Object.assign(out, { x1: fmt(at), y1: fmt(y), x2: fmt(at), y2: fmt(y + height) });
	}
	for (const [k, v] of Object.entries(out)) set(line, k, v);
}

/**
 * recharts' calculateActiveTickIndex along the category axis, as ranges: a category takes the pointer from halfway
 * after the one before it to halfway to the next (both computed as recharts computes them, so a pointer on a boundary
 * goes where recharts sends it), the first and last to the plot's edges. Each category keeps the state the capture
 * found at its middle.
 */
function hits(captured: Facts['g'], from: Frame, to: Frame, dir: number): [number, number, number][] {
	// recharts searches the ticks sorted by coordinate (a reversed axis runs right to left).
	const order = from.at.map((_, i) => i).sort((i, j) => to.at[i]! - to.at[j]!);
	const was = order.map((i) => from.at[i]! + from.bw / 2);
	const now = order.map((i) => to.at[i]! + to.bw / 2);
	const start = to.v[dir]!;
	const end = start + to.v[dir + 2]!;
	const out: [number, number, number][] = [];
	now.forEach((c, i) => {
		const state = captured.find(([a, b]) => was[i]! >= Math.min(a, b) && was[i]! <= Math.max(a, b))?.[2];
		if (state === undefined) return;
		out.push([i === 0 ? start : (c + now[i - 1]!) / 2, i === now.length - 1 ? end : (c + now[i + 1]!) / 2, state]);
	});
	return out;
}

/**
 * The tooltip's hit areas and anchors in the other frame: the boundaries between categories move with the categories'
 * middles, and recharts anchors the tooltip at the active category's middle, kept in the plot as getTooltipTranslate does.
 */
function factsIn(facts: Facts, map: Mapper, axes: readonly (Axis | null)[]): Facts {
	const { from, to, plan } = map;
	const dir = plan.horizontal ? 0 : 1;
	const cross = (c: number) => map.box(c, plan.horizontal ? 'y' : 'x');
	const middleOf = (state: number) => {
		const seg = facts.g.find((s) => s[2] === state);
		if (!seg) return null;
		const i = from.at.findIndex((a) => a + from.bw / 2 >= Math.min(seg[0], seg[1]) && a + from.bw / 2 <= Math.max(seg[0], seg[1]));
		return i < 0 ? null : to.at[i]! + to.bw / 2;
	};
	const pa = facts.p.map((_, k) => middleOf(k));
	return {
		...facts,
		w: to.W,
		h: to.H,
		v: to.v,
		g: facts.g.length ? hits(facts.g, from, to, dir) : facts.g,
		...(facts.sp ? { sp: [cross(facts.sp[0]), cross(facts.sp[1])] as const } : {}),
		p: facts.p.map(([x, y], k) => (pa[k] === null ? [x, y] : plan.horizontal ? [null, y] : [x, null])),
		pa,
		...(facts.k ? { k: facts.k.map(([s, x, y]) => [s, plan.horizontal ? x : map.box(x, 'x'), plan.horizontal ? map.box(y, 'y') : y] as const) } : {}),
		a: axes,
	};
}

const originals = new WeakMap<SVGSVGElement, Facts>();
const refs = new WeakMap<Element, Attrs>();
const ours = new WeakMap<Element, Attrs>();
const observed = new WeakMap<SVGSVGElement, { place?: Place; observer?: MutationObserver }>();

const refOf = (el: Element): Attrs => {
	let ref = refs.get(el);
	if (!ref) {
		ref = {};
		for (const a of GEOMETRY) if (el.hasAttribute(a)) ref[a] = el.getAttribute(a)!;
		refs.set(el, ref);
	}
	return ref;
};

function write(el: Element, attrs: Attrs): void {
	const mine = ours.get(el) ?? {};
	for (const [k, v] of Object.entries(attrs)) {
		mine[k] = v;
		if (el.getAttribute(k) !== v) el.setAttribute(k, v);
	}
	ours.set(el, mine);
}

const geoOfEl = (el: Element): Geo | null => {
	try {
		return el.hasAttribute('data-mm-geo') ? (JSON.parse(el.getAttribute('data-mm-geo')!) as Geo) : null;
	} catch {
		return null;
	}
};

/** Where an element goes in the other frame (null: it keeps its attributes; undefined: it cannot be laid out). */
type Place = (el: Element, ref: Attrs) => Attrs | null | undefined;

/** Every element's attributes in the frame, or undefined when one is drawn from more than the layout (a label). */
function plan(root: Element, place: Place): [Element, Attrs][] | undefined {
	const out: [Element, Attrs][] = [];
	for (const el of [root, ...root.querySelectorAll('*')]) {
		const attrs = place(el, refOf(el));
		if (attrs === undefined) return undefined;
		if (attrs) out.push([el, attrs]);
	}
	return out;
}

function drawAxes(svg: SVGSVGElement, axes: readonly (Axis | null)[], local: ((axis: Axis) => readonly string[] | undefined) | undefined, claim: ((node: Text) => void) | undefined): void {
	const seen = { xAxis: 0, yAxis: 0 };
	for (const axis of axes) {
		if (!axis) continue;
		const nth = seen[axis.t]++;
		axisLine(svg, axis, nth);
		drawTicks(svg, axis, nth, local?.(axis) ?? axis.l, claim);
	}
}

const gridLines = new WeakMap<Element, Element[]>();
/** A grid line's display attribute as convert wrote it (a spare's is none). */
const hiddenAtFirst = new WeakMap<Element, string | null>();

/**
 * CartesianGrid's horizontal lines: getTicks over the number axis' ticks with the axis' default props and no font size
 * (the body's), then the plot's top and bottom where no tick is (getCoordinatesOfGrid). `fractions`: each tick's place
 * up the plot (convert's `gy`), or the drawn axis' ticks.
 */
function drawGrid(svg: SVGSVGElement, map: Mapper, fractions: readonly number[] | undefined, axis: Axis | undefined): void {
	const group = svg.querySelector('g.recharts-cartesian-grid-horizontal');
	const original = group && (gridLines.get(group) ?? [...group.querySelectorAll(':scope > line')]);
	if (!group || !original?.length || !map.plan.horizontal) return;
	if (!gridLines.has(group)) for (const line of original) hiddenAtFirst.set(line, line.getAttribute('display'));
	gridLines.set(group, original);
	const [bottom, top] = map.to.num;
	const coords = fractions ? fractions.map((f) => bottom + f * (top - bottom)) : axis?.num ? axis.c.map((c) => map.num(c)) : undefined;
	if (!coords) return;
	const ticks: Axis = { t: 'yAxis', o: 'left', box: [0, 0, 0, 0], vb: [0, 0, map.to.W, map.to.H], gap: axis?.gap ?? 5, iv: axis?.iv ?? 'preserveEnd', ts: 6, tm: 2, off: 0, c: coords, l: axis?.num ? axis.l : coords.map(() => '0') };
	const kept = chooseTicks(ticks, ticks.l, { fontSize: '', letterSpacing: '' }).map((t) => t.coordinate);
	const [vx, vy, vw, vh] = map.to.v;
	if (!kept.includes(vy)) kept.push(vy);
	if (!kept.includes(vy + vh)) kept.push(vy + vh);
	// Markless owns these lines: convert gave the grid spares (display none), shown or hidden here.
	if (kept.length > original.length) return;
	original.forEach((line, i) => {
		const y = kept[i];
		if (y === undefined) return line.setAttribute('display', 'none');
		line.removeAttribute('display');
		write(line, { ...(line.hasAttribute('width') ? { x: fmt(vx), y: fmt(vy), width: fmt(vw), height: fmt(vh) } : {}), x1: fmt(vx), x2: fmt(vx + vw), y1: fmt(y), y2: fmt(y) });
	});
}

const origins = new WeakMap<Element, string>();

// The bars' entry animation grows them from the number axis' zero (convert's motion: --mm-o), which moves with its scale.
function growFrom(svg: SVGSVGElement, map?: Mapper): void {
	for (const g of svg.querySelectorAll<SVGGElement>('g.recharts-bar-rectangles')) {
		const was = origins.get(g) ?? g.style.getPropertyValue('--mm-o');
		if (!was) continue;
		origins.set(g, was);
		const [x, y] = was.split(/\s+/).map((v) => parseFloat(v));
		const now = !map ? was : map.plan.horizontal ? `0px ${map.num(y!)}px` : `${map.num(x!)}px 0px`;
		if (g.style.getPropertyValue('--mm-o') !== now) g.style.setProperty('--mm-o', now);
	}
}

// What a tooltip's state puts into the drawing, or sets on it, is the old page's: it is laid out the same way.
function observe(svg: SVGSVGElement, place: Place): void {
	const state = observed.get(svg);
	if (state) {
		state.place = place;
		// What this layout itself moved is no state's.
		state.observer?.takeRecords();
		return;
	}
	const observer = new MutationObserver((records) => {
		const now = observed.get(svg)?.place;
		if (!now) return;
		// Every attribute the page set is read before any is written: one state sets several on an element.
		const changed = new Set<Element>();
		for (const r of records) {
			if (r.type !== 'attributes') continue;
			const el = r.target as Element;
			// A line's, an area's or a bar's path is the update animation's to draw (recharts-motion), from the shapes laid out here.
			if (['line', 'area', 'curve', 'bar'].includes(geoOfEl(el)?.k ?? '')) continue;
			const value = el.getAttribute(r.attributeName!);
			if (value === null || value === ours.get(el)?.[r.attributeName!]) continue;
			refOf(el)[r.attributeName!] = value;
			changed.add(el);
		}
		for (const r of records) if (r.type === 'childList') for (const node of r.addedNodes) if (node instanceof Element) for (const [el, attrs] of plan(node, now) ?? []) write(el, attrs);
		for (const el of changed) {
			const attrs = now(el, refOf(el));
			if (attrs) write(el, attrs);
		}
	});
	observer.observe(svg, { subtree: true, childList: true, attributes: true, attributeFilter: GEOMETRY });
	observed.set(svg, { place, observer });
}

/**
 * Lays the drawing out at W x H as recharts would for a container that size, from what the old page drew at its own
 * size: the plot box keeps its margins, the scales and bar sizes are recomputed, and the axes keep the ticks getTicks
 * keeps there. `local` gives an axis' text as this visitor reads it (dates behind UTC). Returns the drawing's facts for
 * its tooltip, or undefined where the drawing holds more than recharts' layout draws (it stays as it is).
 */
export function fit(svg: SVGSVGElement, W: number, H: number, local?: (axis: Axis) => readonly string[] | undefined, claim?: (node: Text) => void): Facts | undefined {
	let facts = originals.get(svg);
	if (!facts) {
		try {
			facts = JSON.parse(svg.getAttribute('data-mm-facts') ?? '') as Facts;
		} catch {
			return undefined;
		}
		originals.set(svg, facts);
	}
	if (W === facts.w && H === facts.h) {
		// The capture's own size: its drawing as the old page drew it, the axes for this visitor's dates.
		const grid = svg.querySelector('g.recharts-cartesian-grid-horizontal');
		const lines = grid && gridLines.get(grid);
		for (const line of (grid && lines) || []) {
			const was = hiddenAtFirst.get(line);
			if (was == null) line.removeAttribute('display');
			else line.setAttribute('display', was);
		}
		for (const el of [svg, ...svg.querySelectorAll('*')]) if (ours.has(el)) write(el, refOf(el));
		growFrom(svg);
		drawAxes(svg, facts.a ?? [], local, claim);
		svg.setAttribute('data-mm-facts', JSON.stringify(facts));
		const state = observed.get(svg);
		if (state) state.place = undefined;
		state?.observer?.takeRecords();
		return facts;
	}
	if (facts.pl) {
		const raw = facts.pl;
		const [vx, vy, vw, vh] = facts.v;
		const to: [number, number, number, number] = [vx, vy, vw + W - facts.w, vh + H - facts.h];
		const place: Place = (el, ref) => placedPolar(el, ref, raw, facts!.v, to, W, H);
		const writes = plan(svg, place);
		if (!writes) return undefined;
		for (const [el, attrs] of writes) write(el, attrs);
		const next = polarFacts(facts, raw, to, W, H);
		svg.setAttribute('data-mm-facts', JSON.stringify(next));
		observe(svg, place);
		return next;
	}
	const series = svg.querySelector('g.recharts-bar');
	const curve = svg.querySelector('path.recharts-line-curve[data-mm-geo], path.recharts-area-curve[data-mm-geo]');
	const count = series ? series.querySelectorAll('path.recharts-rectangle').length : curve ? (through(refOf(curve).d ?? '')?.length ?? 0) : 0;
	const frames = framesOf(facts, W, H, count ? { n: count, band: !!series } : undefined);
	if (!frames) return undefined;
	const map = new Mapper(frames.plan, frames.from, frames.to);
	const place: Place = (el, ref) => placed(el, ref, map, geoOfEl(el));
	const writes = plan(svg, place);
	if (!writes) return undefined;
	for (const [el, attrs] of writes) write(el, attrs);
	growFrom(svg, map);
	drawGrid(svg, map, facts.gy, frames.plan.numAxis);
	const axes = (facts.a ?? []).map((a) => (a ? axisIn(a, map) : null));
	drawAxes(svg, axes, local && ((axis) => local(facts.a![axes.indexOf(axis)]!)), claim);
	const next = factsIn(facts, map, axes);
	svg.setAttribute('data-mm-facts', JSON.stringify(next));
	observe(svg, place);
	return next;
}

// recharts' polarToCartesian and Sector's getSectorPath (no corner radius), as written.
const RADIAN = Math.PI / 180;
const polar = (cx: number, cy: number, r: number, angle: number) => ({ x: cx + Math.cos(-RADIAN * angle) * r, y: cy + Math.sin(-RADIAN * angle) * r });
export function sectorPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
	const sign = Math.sign(end - start);
	const angle = sign * Math.min(Math.abs(end - start), 359.999);
	const tempEnd = start + angle;
	const os = polar(cx, cy, outer, start);
	const oe = polar(cx, cy, outer, tempEnd);
	let path = rt`M ${os.x},${os.y}
    A ${outer},${outer},0,
    ${+(Math.abs(angle) > 180)},${+(start > tempEnd)},
    ${oe.x},${oe.y}
  `;
	if (inner > 0) {
		const is = polar(cx, cy, inner, start);
		const ie = polar(cx, cy, inner, tempEnd);
		path += rt`L ${ie.x},${ie.y}
            A ${inner},${inner},0,
            ${+(Math.abs(angle) > 180)},${+(start <= tempEnd)},
            ${is.x},${is.y} Z`;
	} else path += rt`L ${cx},${cy} Z`;
	return path;
}

type SectorGeo = { k: 'sector'; r: [number, number]; a: [number, number]; p: [number | string, number | string, number | string, number | string] };

/** Places in a polar chart from one plot box to another: distances from the centre and points. */
function polarMap(raw: readonly (number | string)[], from: readonly [number, number, number, number], to: readonly [number, number, number, number]) {
	const was = polarOf(raw, from);
	const now = polarOf(raw, to);
	const distance = (d: number) => (was.or === now.or ? d : d >= was.or - 1e-6 ? d - was.or + now.or : (d * now.or) / was.or);
	const point = (x: number, y: number): [number, number] => {
		const d = Math.hypot(x - was.cx, y - was.cy);
		if (d < 1e-9) return [now.cx, now.cy];
		const k = distance(d) / d;
		return [now.cx + (x - was.cx) * k, now.cy + (y - was.cy) * k];
	};
	return { was, now, distance, point };
}

/** A polar chart's centre and outer radius in a plot box (recharts' getMaxRadius over its polar options). */
function polarOf(raw: readonly (number | string)[], v: readonly [number, number, number, number]): { cx: number; cy: number; ir: number; or: number } {
	const [x, y, w, h] = v;
	const max = Math.min(w, h) / 2;
	return { cx: x + percentOf(raw[2]!, w), cy: y + percentOf(raw[3]!, h), ir: percentOf(raw[0]!, max), or: percentOf(raw[1]!, max) };
}

/**
 * A polar drawing's elements at another size. Every place is a distance from the centre at an angle: one inside the
 * outer radius scales with it (a value on the radius axis), one past it keeps its distance past it (an angle axis'
 * ticks and labels); radii given in pixels keep everything where it was, moved with the centre. A pie's sectors are
 * drawn again from their radii and angles (getSectorPath).
 */
export function placedPolar(el: Element, ref: Attrs, raw: readonly (number | string)[], from: readonly [number, number, number, number], to: readonly [number, number, number, number], W: number, H: number): Attrs | null | undefined {
	const tag = el.tagName.toLowerCase();
	const { was, now, distance, point } = polarMap(raw, from, to);
	if (tag === 'svg' && el.classList.contains('recharts-surface')) return { width: fmt(W), height: fmt(H), viewBox: `0 0 ${W} ${H}` };
	if (tag === 'rect' && el.parentElement?.tagName.toLowerCase() === 'clippath') return { x: fmt(to[0]), y: fmt(to[1]), width: fmt(to[2]), height: fmt(to[3]) };
	if ('transform' in ref) return undefined;
	const out: Attrs = {};
	if ('cx' in ref && 'cy' in ref) [out.cx, out.cy] = point(n(ref, 'cx'), n(ref, 'cy')).map(fmt) as [string, string];
	if ('radius' in ref) out.radius = fmt(distance(n(ref, 'radius')));
	if (tag === 'path' && el.classList.contains('recharts-sector')) {
		const geo = geoOfEl(el) as unknown as SectorGeo | null;
		if (geo?.k === 'sector') {
			const pie = polarOf(geo.p, from);
			const pieNow = polarOf(geo.p, to);
			const radius = (r: number) => (Math.abs(r - pie.ir) < 1e-6 ? pieNow.ir : r >= pie.or - 1e-6 ? r - pie.or + pieNow.or : (r * pieNow.or) / pie.or);
			return { ...out, cx: fmt(pieNow.cx), cy: fmt(pieNow.cy), d: sectorPath(pieNow.cx, pieNow.cy, radius(geo.r[0]), radius(geo.r[1]), geo.a[0], geo.a[1]) };
		}
	}
	if ('d' in ref) {
		const d = was.or === now.or ? shiftPath(ref.d!, now.cx - was.cx, now.cy - was.cy) : mapPath(ref.d!, point);
		if (d === undefined) return undefined;
		out.d = d;
	}
	if ('x1' in ref) [out.x1, out.y1] = point(n(ref, 'x1'), n(ref, 'y1')).map(fmt) as [string, string];
	if ('x2' in ref) [out.x2, out.y2] = point(n(ref, 'x2'), n(ref, 'y2')).map(fmt) as [string, string];
	if (tag === 'circle' && 'r' in ref && el.classList.contains('recharts-polar-grid-concentric-circle')) out.r = fmt(distance(n(ref, 'r')));
	// Text the chart puts at its centre (a total and its caption, a Label's content) moves with the centre; an axis'
	// or a label list's text is a place on the chart.
	const onChart = !!el.closest('.recharts-polar-angle-axis, .recharts-polar-radius-axis, .recharts-pie-labels, .recharts-label-list') || (tag !== 'text' && tag !== 'tspan');
	const at = onChart ? point : (x: number, y: number): [number, number] => [x + now.cx - was.cx, y + now.cy - was.cy];
	if ('x' in ref && 'y' in ref) [out.x, out.y] = at(n(ref, 'x'), n(ref, 'y')).map(fmt) as [string, string];
	else if ('x' in ref || 'y' in ref) {
		// A tspan with only its x: its text's place.
		const text = el.parentElement;
		const t = text && refOf(text);
		if (!t || !('x' in t) || !('y' in t)) return undefined;
		const [x, y] = at(n(t, 'x'), n(t, 'y'));
		if ('x' in ref) out.x = fmt(n(ref, 'x') + x - n(t, 'x'));
		if ('y' in ref) out.y = fmt(n(ref, 'y') + y - n(t, 'y'));
	}
	if (('width' in ref || 'height' in ref) && tag !== 'text') return undefined;
	return Object.keys(out).length ? out : hasGeometry(el) && tag !== 'text' ? undefined : null;
}

// A path moved: every coordinate pair of its commands (an arc's radii and flags kept).
function shiftPath(d: string, dx: number, dy: number): string | undefined {
	let out = '';
	for (const [, cmd, args] of d.matchAll(/([MLAZmlaz])([^MLAZmlaz]*)/g)) {
		const n = (args!.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
		const up = cmd!.toUpperCase();
		if (cmd !== up) return undefined;
		const size = up === 'A' ? 7 : up === 'Z' ? 0 : 2;
		if (size && n.length % size) return undefined;
		const vals = n.map((v, i) => (size === 0 ? v : i % size === size - 2 ? round4(v + dx) : i % size === size - 1 ? round4(v + dy) : v));
		out += up === 'Z' ? 'Z' : `${up} ${vals.join(',')}`;
	}
	return out;
}

// A polar drawing's tooltip at another size: its centre, the radii its hit ranges and axes are at (a radial bar's rings).
function polarFacts(facts: Facts, raw: readonly (number | string)[], to: readonly [number, number, number, number], W: number, H: number): Facts {
	const { was, now, distance, point } = polarMap(raw, facts.v, to);
	const dx = now.cx - was.cx;
	const dy = now.cy - was.cy;
	const radial = facts.m === 'r';
	return {
		...facts,
		w: W,
		h: H,
		v: to,
		...(facts.c ? { c: [facts.c[0] + dx, facts.c[1] + dy] as const } : {}),
		...(radial ? { g: facts.g.map(([a, b, k]) => [distance(a), distance(b), k] as const) } : {}),
		...(facts.sp && facts.m !== 'x' && facts.m !== 'y' ? { sp: [distance(facts.sp[0]), distance(facts.sp[1])] as const } : {}),
		...(facts.q && radial ? { q: facts.q.map(distance) } : {}),
		...(facts.k ? { k: facts.k.map(([k, x, y]) => [k, ...point(x, y)] as const) } : {}),
	};
}

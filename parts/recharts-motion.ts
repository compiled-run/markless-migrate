// recharts 3.8's update animation, for a card's control switching what its chart shows: each line, area and bar moves
// from the shape it has to the new one, point by point, eased and timed as recharts' JavascriptAnimate does, and drawn
// with recharts' own path makers (d3-shape's curves, Rectangle's path). A mark's points are the ones its own path goes
// through; convert marks it with what its path does not say (`data-mm-geo`: its kind, curve, layout and animation).
import { area, curveBasis, curveBasisClosed, curveBasisOpen, curveBumpX, curveBumpY, curveLinear, curveLinearClosed, curveMonotoneX, curveMonotoneY, curveNatural, curveStep, curveStepAfter, curveStepBefore, line, type CurveFactory } from 'd3-shape';

type Point = { x: number | null; y: number | null };
/** What convert read off the old page's mark: a line, an area's fill or its stroke, or a bar; and its animation. */
export interface Geo {
	readonly k: 'line' | 'area' | 'curve' | 'bar';
	readonly t?: string;
	readonly l?: 'horizontal' | 'vertical';
	readonly n?: 1;
	/** animationBegin, animationDuration, animationEasing. */
	readonly a?: readonly [number, number, string];
}

interface Shape {
	readonly points?: readonly Point[];
	/** An area's baseline, by the coordinate across its layout. */
	readonly base?: readonly (number | null)[];
	readonly rect?: { x: number; y: number; width: number; height: number };
}

interface Mark {
	readonly el: SVGPathElement;
	readonly geo: Geo;
	readonly final: string;
	readonly to: Shape | undefined;
}

const geos = new WeakMap<Element, Geo | null>();
/** What each chart draws now, by mark kind and order: where the next switch starts from. */
const drawn = new WeakMap<Element, { surface: Element; shapes: Map<string, (Shape | undefined)[]>; stop: () => void }>();

function geoOf(el: Element): Geo | null {
	if (!geos.has(el)) {
		try {
			geos.set(el, JSON.parse(el.getAttribute('data-mm-geo') ?? '') as Geo);
		} catch {
			geos.set(el, null);
		}
	}
	return geos.get(el)!;
}

// The points a d3-shape path goes through: its move's and each segment's end. One run only: a gap leaves it unanimated.
function through(d: string): Point[] | undefined {
	const out: Point[] = [];
	let moves = 0;
	for (const [, cmd, args] of d.matchAll(/([MLCZHVAQSTmlczhvaqst])([^MLCZHVAQSTmlczhvaqst]*)/g)) {
		const n = (args!.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
		if (cmd === 'Z') continue;
		const size = cmd === 'C' ? 6 : cmd === 'M' || cmd === 'L' ? 2 : 0;
		if (!size || n.length % size) return undefined;
		if (cmd === 'M' && ++moves > 1) return undefined;
		for (let i = 0; i < n.length; i += size) out.push({ x: n[i + size - 2]!, y: n[i + size - 1]! });
	}
	return out;
}

function shapeOf(el: Element, geo: Geo, d: string): Shape | undefined {
	if (geo.k === 'bar') {
		const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a)));
		return [x, y, width, height].every((v) => Number.isFinite(v)) ? { rect: { x: x!, y: y!, width: width!, height: height! } } : undefined;
	}
	const all = through(d);
	if (!all) return undefined;
	if (geo.k !== 'area') return { points: all };
	if (all.length % 2) return undefined;
	// An area goes along its points, then back along its baseline.
	const n = all.length / 2;
	const across = geo.l === 'vertical' ? 'x' : 'y';
	return { points: all.slice(0, n), base: all.slice(n).reverse().map((p) => p[across]) };
}

function marksOf(surface: Element, finals: WeakMap<Element, string>): Mark[] {
	const out: Mark[] = [];
	for (const el of surface.querySelectorAll<SVGPathElement>('path[data-mm-geo]')) {
		const geo = geoOf(el);
		if (!geo) continue;
		if (!finals.has(el)) finals.set(el, el.getAttribute('d') ?? '');
		const final = finals.get(el)!;
		out.push({ el, geo, final, to: shapeOf(el, geo, final) });
	}
	return out;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);
// recharts' DataUtils.interpolate
const lerp = (from: unknown, to: unknown, t: number): number | null => (isNum(from) && isNum(to) ? from + t * (to - from) : (to as number | null));

// recharts' easing.js configBezier, Newton's method and its stopping rule included.
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
	const factor = (c1: number, c2: number) => [0, 3 * c1, 3 * c2 - 6 * c1, 3 * c1 - 3 * c2 + 1];
	const poly = (params: number[], t: number) => params.map((p, i) => p * t ** i).reduce((a, b) => a + b);
	const curveX = (t: number) => poly(factor(x1, x2), t);
	const curveY = (t: number) => poly(factor(y1, y2), t);
	const derX = (t: number) => poly([...factor(x1, x2).map((p, i) => p * i).slice(1), 0], t);
	const range = (v: number) => (v > 1 ? 1 : v < 0 ? 0 : v);
	return (_t) => {
		const t = _t > 1 ? 1 : _t;
		let x = t;
		for (let i = 0; i < 8; ++i) {
			const evalT = curveX(x) - t;
			const der = derX(x);
			if (Math.abs(evalT - t) < 1e-4 || der < 1e-4) return curveY(x);
			x = range(x - evalT / der);
		}
		return curveY(x);
	};
}

const NAMED: Record<string, [number, number, number, number]> = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0.42, 0, 0.58, 1], 'ease-in-out': [0, 0, 0.58, 1] };

export function easing(name: string): ((t: number) => number) | null {
	if (NAMED[name]) return bezier(...NAMED[name]!);
	const m = /^cubic-bezier\(([^)]*)\)$/.exec(name);
	const n = m?.[1]!.split(',').map((x) => parseFloat(x));
	return n?.length === 4 ? bezier(n[0]!, n[1]!, n[2]!, n[3]!) : null;
}

const FACTORIES: Record<string, CurveFactory> = { curveBasisClosed, curveBasisOpen, curveBasis, curveBumpX, curveBumpY, curveLinearClosed, curveLinear, curveMonotoneX, curveMonotoneY, curveNatural, curveStep, curveStepAfter, curveStepBefore };

// recharts' Curve getCurveFactory and getPath: an area's baseline points share its points' position along the layout.
function curvePath(geo: Geo, points: readonly Point[], base: readonly (number | null)[] | undefined): string {
	const type = geo.t ?? 'linear';
	const layout = geo.l;
	let name = `curve${type.charAt(0).toUpperCase()}${type.slice(1)}`;
	if ((name === 'curveMonotone' || name === 'curveBump') && layout) name += layout === 'vertical' ? 'Y' : 'X';
	const factory = FACTORIES[name] ?? curveLinear;
	const ok = (v: number | null | undefined): v is number => isNum(v) && Number.isFinite(v);
	const defined = (p: Point) => ok(p.x) && ok(p.y);
	if (base) {
		type Paired = Point & { b: number | null };
		const paired: Paired[] = points.map((p, i) => ({ ...p, b: base[i] ?? null }));
		const areaDefined = (d: Paired) => ok(d.b) && defined(d);
		const shape = layout === 'vertical' ? area<Paired>().y((d) => d.y!).x1((d) => d.x!).x0((d) => d.b!) : area<Paired>().x((d) => d.x!).y1((d) => d.y!).y0((d) => d.b!);
		return shape.defined(areaDefined).curve(factory)(geo.n ? paired.filter(areaDefined) : paired) ?? '';
	}
	return line<Point>().x((d) => d.x!).y((d) => d.y!).defined(defined).curve(factory)(geo.n ? points.filter(defined) : points) ?? '';
}

// recharts' util/round and Rectangle's getRectanglePath, whitespace and all.
const round = (n: number): number => {
	const r = Math.round(n * 1e4) / 1e4;
	return Object.is(r, -0) ? 0 : r;
};
const rt = (strings: TemplateStringsArray, ...values: number[]) => strings.reduce((out, s, i) => out + (i ? round(values[i - 1]!) : '') + s);

export function rectPath(x: number, y: number, width: number, height: number, radius: number | readonly number[] | undefined): string {
	const w = round(width);
	const h = round(height);
	const maxRadius = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
	const ySign = h >= 0 ? 1 : -1;
	const xSign = w >= 0 ? 1 : -1;
	const clockWise = (h >= 0 && w >= 0) || (h < 0 && w < 0) ? 1 : 0;
	if (maxRadius > 0 && Array.isArray(radius)) {
		const r = [0, 1, 2, 3].map((i) => Math.min((radius as readonly number[])[i] ?? 0, maxRadius) as number);
		let path = rt`M${x},${y + ySign * r[0]!}`;
		if (r[0]! > 0) path += rt`A ${r[0]!},${r[0]!},0,0,${clockWise},${x + xSign * r[0]!},${y}`;
		path += rt`L ${x + width - xSign * r[1]!},${y}`;
		if (r[1]! > 0) path += rt`A ${r[1]!},${r[1]!},0,0,${clockWise},
        ${x + width},${y + ySign * r[1]!}`;
		path += rt`L ${x + width},${y + height - ySign * r[2]!}`;
		if (r[2]! > 0) path += rt`A ${r[2]!},${r[2]!},0,0,${clockWise},
        ${x + width - xSign * r[2]!},${y + height}`;
		path += rt`L ${x + xSign * r[3]!},${y + height}`;
		if (r[3]! > 0) path += rt`A ${r[3]!},${r[3]!},0,0,${clockWise},
        ${x},${y + height - ySign * r[3]!}`;
		return `${path}Z`;
	}
	if (maxRadius > 0 && typeof radius === 'number' && radius > 0) {
		const r = Math.min(maxRadius, radius);
		return rt`M ${x},${y + ySign * r}
            A ${r},${r},0,0,${clockWise},${x + xSign * r},${y}
            L ${x + width - xSign * r},${y}
            A ${r},${r},0,0,${clockWise},${x + width},${y + ySign * r}
            L ${x + width},${y + height - ySign * r}
            A ${r},${r},0,0,${clockWise},${x + width - xSign * r},${y + height}
            L ${x + xSign * r},${y + height}
            A ${r},${r},0,0,${clockWise},${x},${y + height - ySign * r} Z`;
	}
	return rt`M ${x},${y} h ${width} v ${height} h ${-width} Z`;
}

// One frame of recharts' interpolation from what was drawn to the mark's shape: points by their index scaled to the
// previous count (a baseline alike), a bar's box by its index.
function step(from: Shape | undefined, to: Shape, t: number): Shape {
	if (t === 1 || !from) return to;
	if (to.rect) {
		const p = from.rect;
		if (!p) return to;
		return { rect: { x: lerp(p.x, to.rect.x, t)!, y: lerp(p.y, to.rect.y, t)!, width: lerp(p.width, to.rect.width, t)!, height: lerp(p.height, to.rect.height, t)! } };
	}
	const prev = from.points ?? [];
	const next = to.points ?? [];
	const factor = prev.length / next.length;
	const points = next.map((p, i) => {
		const q = prev[Math.floor(i * factor)];
		return q ? { x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t) } : p;
	});
	const base = to.base?.map((b, i) => {
		const q = from.base?.[Math.floor(i * factor)];
		return q === undefined ? b : lerp(q, b, t);
	});
	return { points, ...(base ? { base } : {}) };
}

function draw(mark: Mark, shape: Shape | undefined): void {
	const radius = mark.el.getAttribute('radius')?.split(',').map(Number);
	const d = !shape || shape === mark.to ? mark.final : shape.rect ? rectPath(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height, radius && radius.length > 1 ? radius : radius?.[0]) : curvePath(mark.geo, shape.points ?? [], shape.base);
	if (mark.el.getAttribute('d') !== d) mark.el.setAttribute('d', d);
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The chart switched from one SVG to another: its marks hold the shape they had until recharts' animation would begin
 * (`lag` frames after the control's use, as the old page took), then move to their own over its duration.
 */
export function morph(wrapper: Element, from: Element, to: Element, lag: number, since = 0, finals = new WeakMap<Element, string>()): void {
	const marks = marksOf(to, finals);
	const live = drawn.get(wrapper);
	live?.stop();
	const start = new Map<string, (Shape | undefined)[]>();
	if (live && live.surface === from) for (const [k, v] of live.shapes) start.set(k, v);
	else for (const m of marksOf(from, finals)) (start.get(m.geo.k) ?? start.set(m.geo.k, []).get(m.geo.k)!).push(m.to);
	const seen = new Map<string, number>();
	const prior = marks.map((m) => {
		const i = seen.get(m.geo.k) ?? 0;
		seen.set(m.geo.k, i + 1);
		return start.get(m.geo.k)?.[i];
	});
	const shapes = new Map<string, (Shape | undefined)[]>();
	const render = (t: number) => {
		shapes.clear();
		marks.forEach((m, i) => {
			const s = m.to && step(prior[i], m.to, t);
			(shapes.get(m.geo.k) ?? shapes.set(m.geo.k, []).get(m.geo.k)!).push(s);
			draw(m, s);
		});
	};
	let frame = 0;
	const stop = () => cancelAnimationFrame(frame);
	drawn.set(wrapper, { surface: to, shapes, stop });
	if (!marks.length || reduced()) return render(1);
	const timing = marks[0]!.geo.a ?? [0, 1500, 'ease'];
	const ease = easing(timing[2]);
	if (!ease) return render(1);
	render(0);
	let count = since;
	let begin: number | undefined;
	let waitFrom: number | undefined;
	let last: number | undefined;
	// recharts computes a frame's shape in its animation frame and React commits it after that frame is painted: each
	// frame here shows the shape for the frame before's time, from the frame its clock began at.
	const tick = (now: number) => {
		frame = requestAnimationFrame(tick);
		if (begin === undefined) {
			if (++count < lag) return;
			// animationBegin: the frames that wait it out, as recharts' timeout controller counts them.
			if (timing[0] > 0 && (waitFrom ??= now) + timing[0] > now) return;
			begin = now;
			return;
		}
		if (last !== undefined) {
			const t = (last - begin) / timing[1];
			render(t < 1 ? ease(t) : 1);
			if (t >= 1) stop();
		}
		last = now;
	};
	frame = requestAnimationFrame(tick);
}

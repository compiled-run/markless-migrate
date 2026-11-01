// The desk kit from markless website/components/figures/ink/{desk,plane}.ts and the perspective camera from figures/kit/iso-kit.ts (MIT, see LICENSE-anatomy).
import { normalAt, type P, pathOf, resample, seeded } from './ink.ts';

export type { P };
export type Point3 = [number, number, number];
export const TAU = Math.PI * 2;

export const dot3 = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add3 = (a: Point3, b: Point3): Point3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: Point3, k: number): Point3 => [a[0] * k, a[1] * k, a[2] * k];
export const unit3 = (a: Point3): Point3 => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross3 = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp3 = (a: Point3, b: Point3, t: number): Point3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const LIGHT = unit3([-0.5, -0.45, 0.78]);

interface Projection {
	origin: P;
	scale: number;
	azimuth: number;
	elevation: number;
	distance: number;
	target: Point3;
}

const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);

function iso([x, y, z]: Point3, { origin, scale, azimuth, elevation, distance, target }: Projection): P {
	const sinA = Math.sin(azimuth * RADIANS);
	const cosA = Math.cos(azimuth * RADIANS);
	const sinE = Math.sin(elevation * RADIANS);
	const cosE = Math.cos(elevation * RADIANS);
	const k = scale * UNIT;
	const right = x * sinA - y * cosA;
	const down = (x * cosA + y * sinA) * sinE - z * cosE;
	const [tx, ty, tz] = target;
	const centreRight = tx * sinA - ty * cosA;
	const centreDown = (tx * cosA + ty * sinA) * sinE - tz * cosE;
	const toward = ((x - tx) * cosA + (y - ty) * sinA) * cosE + (z - tz) * sinE;
	const grow = distance / Math.max(distance * 0.05, distance - toward);
	return [origin[0] + (centreRight + (right - centreRight) * grow) * k, origin[1] + (centreDown + (down - centreDown) * grow) * k];
}

export interface CameraOptions {
	width: number;
	height: number;
	view: { azimuth: number; elevation: number; distance: number; target: Point3 };
	/** World points the camera must fit inside the view box. */
	bounds: Point3[];
	pad?: number;
	headroom?: number;
}

/** A pinhole camera from an azimuth and elevation around a target, fitted so `bounds` fill the view box below `headroom`. */
export function createCamera({ width, height, view, bounds, pad = 4, headroom = 0 }: CameraOptions) {
	const unit: Projection = { origin: [0, 0], scale: 1, ...view };
	const flat = bounds.map((p) => iso(p, unit));
	const xs = flat.map(([x]) => x);
	const ys = flat.map(([, y]) => y);
	const [left, right, up, down] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
	const projection: Projection = { ...unit, scale, origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale] };
	const a = view.azimuth * RADIANS;
	const e = view.elevation * RADIANS;
	const eye: Point3 = [view.target[0] + Math.cos(a) * Math.cos(e) * view.distance, view.target[1] + Math.sin(a) * Math.cos(e) * view.distance, view.target[2] + Math.sin(e) * view.distance];
	const proj = (p: Point3): P => iso(p, projection);
	return { EYE: eye, proj, projAll: (pts: Point3[]): P[] => pts.map(proj) };
}

export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, steps = 5): P[] {
	const pts: P[] = [];
	const corners: [number, number, number][] = [
		[x1 - r, y0 + r, -Math.PI / 2],
		[x1 - r, y1 - r, 0],
		[x0 + r, y1 - r, Math.PI / 2],
		[x0 + r, y0 + r, Math.PI],
	];
	for (const [cx, cy, a0] of corners) for (let i = 0; i <= steps; i++) pts.push([cx + Math.cos(a0 + (i / steps) * (Math.PI / 2)) * r, cy + Math.sin(a0 + (i / steps) * (Math.PI / 2)) * r]);
	return pts;
}

export const ellipse = (cx: number, cy: number, rx: number, ry: number, steps = 40): P[] => Array.from({ length: steps }, (_, i) => [cx + Math.cos((i / steps) * TAU) * rx, cy + Math.sin((i / steps) * TAU) * ry]);
export const centreOf = (pts: P[]): P => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
export const jitter = (pts: P[], seed: number, amount: number): P[] => {
	const rnd = seeded(seed);
	return pts.map(([x, y]) => [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]);
};
export const shadowOnDesk = (p: Point3, floor = 0): Point3 => [p[0] - (LIGHT[0] / LIGHT[2]) * (p[2] - floor), p[1] - (LIGHT[1] / LIGHT[2]) * (p[2] - floor), floor];
export const bezier = (a: Point3, b: Point3, c: Point3, d: Point3, steps = 40): Point3[] =>
	Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		const s = 1 - t;
		return add3(add3(mul3(a, s * s * s), mul3(b, 3 * s * s * t)), add3(mul3(c, 3 * s * t * t), mul3(d, t * t * t)));
	});

/** An SVG matrix from three screen points: the origin, one local unit along x, one along y. */
export const matrixOf = (o: P, x: P, y: P, k = 1) => `matrix(${[(x[0] - o[0]) / k, (x[1] - o[1]) / k, (y[0] - o[0]) / k, (y[1] - o[1]) / k, o[0], o[1]].map((n) => Math.round(n * 1000) / 1000).join(' ')})`;

export interface Plane {
	at(u: number, v: number, lift?: number): Point3;
	on(pts: P[], lift?: number): P[];
	/** An SVG matrix at (u, v) whose local unit is `unit` along the plane. */
	matrix(u: number, v: number, unit: number, lift?: number): string;
}

/** A flat surface from an origin and two world axes, seen through `proj`. `N` is the direction `lift` raises it. */
export function plane(proj: (p: Point3) => P, O: Point3, U: Point3, V: Point3, N: Point3 = [0, 0, 1]): Plane {
	const at = (u: number, v: number, lift = 0): Point3 => add3(add3(O, mul3(U, u)), add3(mul3(V, v), mul3(N, lift)));
	return {
		at,
		on: (pts, lift = 0) => pts.map(([u, v]) => proj(at(u, v, lift))),
		matrix: (u, v, unit, lift = 0) => matrixOf(proj(at(u, v, lift)), proj(at(u + unit, v, lift)), proj(at(u, v + unit, lift))),
	};
}

/** A faint pencil line: two loose passes that overshoot their ends a little. */
export function pencil(points: P[], seed: number, closed = false, passes = 2): string {
	const rnd = seeded(seed);
	let d = '';
	for (let p = 0; p < passes; p++) {
		let pts = resample(points, 5, closed);
		if (closed) pts = [...pts, pts[0]!, pts[1] ?? pts[0]!];
		if (pts.length > 1) {
			const ext = (a: P, b: P, by: number): P => {
				const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
				return [a[0] + ((a[0] - b[0]) / l) * by, a[1] + ((a[1] - b[1]) / l) * by];
			};
			pts = [ext(pts[0]!, pts[1]!, 1 + rnd() * 2), ...pts, ext(pts.at(-1)!, pts.at(-2)!, 1 + rnd() * 2)];
		}
		const shift = (rnd() - 0.5) * 0.8;
		d += pathOf(
			jitter(
				pts.map((q, i, all) => {
					const [nx, ny] = normalAt(all, i);
					return [q[0] + nx * shift, q[1] + ny * shift] as P;
				}),
				seed * 3 + p,
				0.6,
			),
		);
	}
	return d;
}

/** Two short barbs at the end of a screen path, pointing along its last stretch. */
export function barbs(path: P[], size: number, spread = 0.45): P[][] {
	const tip = path.at(-1)!;
	const back = path[Math.max(0, path.length - 4)]!;
	const a = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
	return [-spread, spread * 0.8].map((s) => [[tip[0] - Math.cos(a + s) * size, tip[1] - Math.sin(a + s) * size], [tip[0] + Math.cos(a) * 0.6, tip[1] + Math.sin(a) * 0.6]] as P[]);
}

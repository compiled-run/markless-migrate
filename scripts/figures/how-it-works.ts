// Draws the README's "How it works" figure as two static SVGs, light and dark, in the markless.dev ink style: `node scripts/figures/how-it-works.ts`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hatch, hull, line, outline, type P, pathOf, pool, r1, seeded, stroke, wash } from './ink.ts';
import { add3, barbs, centreOf, createCamera, cross3, dot3, ellipse, jitter, lerp3, LIGHT, mul3, pencil, type Plane, plane, type Point3, roundRect, shadowOnDesk, sub3, TAU, unit3 } from './kit.ts';

export const WIDTH = 860;
export const HEIGHT = 440;

const PAGE = { w: 10, h: 13 };
const STACK: P = [7, 15.2];
const STACK_TURNS = [0.09, -0.07, 0.05, -0.1, 0.03, -0.04, 0.02];
const LIFT = { c: [16.2, 9.4, 6.8] as Point3, turn: 0.2 };
const OLD = { c: [24, 15.4] as P, turn: -0.025 };
const NEW = { c: [37.6, 15.4] as P, turn: 0.03 };
const GAP_U = 30.8;
const LENS = { c: [30.8, 18.2] as P, z: 3.4, r: 5.2, inner: 4.55 };
const BOX = { x0: 48.5, x1: 57.5, y0: 11, y1: 18, h: 5.2 };
const PEN = { tip: [41.6, 23.6, 0.42] as Point3, end: [48, 26.4, 0.42] as Point3, r: 0.42 };

const { EYE, proj, projAll } = createCamera({
	width: WIDTH,
	height: HEIGHT,
	view: { azimuth: 92, elevation: 58, distance: 120, target: [29, 15, 2] },
	bounds: [
		[0.5, 7, 0],
		[0.5, 24, 0],
		[46, 26.5, 0],
		[61, 20, 0],
		[58.5, 9, 0],
		[BOX.x0, BOX.y0 + 3, 15.8],
		[BOX.x1, BOX.y0 + 3, 15.8],
		[LIFT.c[0] - 6, LIFT.c[1] - 6, LIFT.c[2] + 2.6],
		[30.8, -3.4, 0],
		[36, 30.6, 0],
		[46, 30.4, 0],
	],
	pad: 6,
	headroom: 40,
});

type Layer = { cls: string; d: string; evenodd?: boolean; raw?: string };
type Text = { cls: string; x: number; y: number; text: string; transform?: string; anchor?: 'start' | 'middle' | 'end' };
const layers: Layer[] = [];
const texts: Text[] = [];
const draw = (cls: string, d: string, evenodd = false) => {
	if (d) layers.push({ cls, d, evenodd });
};

const deskPlane = (c: P, w: number, h: number, turn: number, z = 0): Plane => {
	const U: Point3 = [Math.cos(turn), Math.sin(turn), 0];
	const V: Point3 = [-Math.sin(turn), Math.cos(turn), 0];
	return plane(proj, [c[0] - U[0] * (w / 2) - V[0] * (h / 2), c[1] - U[1] * (w / 2) - V[1] * (h / 2), z], U, V);
};
const desk = plane(proj, [0, 0, 0], [1, 0, 0], [0, 1, 0]);

function rectEdge(w: number, h: number, n = 40): P[] {
	const pts: P[] = [];
	for (let i = 0; i < n; i++) pts.push([(i / n) * w, 0]);
	for (let i = 0; i < n; i++) pts.push([w, (i / n) * h]);
	for (let i = 0; i < n; i++) pts.push([w - (i / n) * w, h]);
	for (let i = 0; i < n; i++) pts.push([0, h - (i / n) * h]);
	return pts;
}

/** A sheet's paper and shadow; returns its edge ink for the caller to place in paint order. */
function sheetArt(pl: Plane, w: number, h: number, seed: number, { lifted = false, weight = 1 } = {}) {
	const sil = pl.on(jitter(rectEdge(w, h), seed, 0.04));
	const corners: Point3[] = [pl.at(0, 0), pl.at(w, 0), pl.at(w, h), pl.at(0, h)];
	if (lifted) {
		const cast = hull(corners.map((p) => proj(shadowOnDesk(p))));
		draw('shade', wash(cast, seed + 1, 1.2, 2.5));
		draw('shade-hatch', hatch(cast, -0.45, 2.6, seed + 2, { cluster: 5, skip: 0.3, trim: 0.4 }));
	} else {
		const lift = corners.map((p) => add3(p, [0, 0, 0.22]));
		const cast = hull([...projAll(corners), ...lift.map((p) => proj(shadowOnDesk(p)))]);
		draw('shade', wash(cast, seed + 1, 0.4, 1));
	}
	draw('paper', pathOf(sil, true));
	return { sil, ink: outline(sil, { w: 1.7 * weight, heavy: 1.5 * weight, centre: centreOf(sil), seed: seed + 3 }) };
}

/** The everyday shop page drawn on a sheet: browser bar, header, a product picture, a heading, text, a button and a link. Returns where each matching spot sits. */
function pageContents(pl: Plane, seed: number, { scale = 1, linkWrong = false } = {}) {
	const k = scale;
	const on = (pts: P[], lift = 0) => pl.on(pts.map(([u, v]) => [u * k, v * k] as P), lift);
	let d = '';
	let tone = '';
	const W = PAGE.w;
	const bar = 1.25;
	tone += hatch(on([[0, 0], [W, 0], [W, bar], [0, bar]]), 0.12, 2, seed, { cluster: 5, skip: 0.2 });
	d += line(on([[0, bar], [W, bar]]), { w: 0.7, seed: seed + 1 });
	d += [0.55, 1.05, 1.55].map((u, i) => outline(on(ellipse(u, bar / 2, 0.17, 0.17, 14)), { w: 0.7, seed: seed + 2 + i })).join('');
	d += outline(on(roundRect(2.3, 0.35, 7.6, 0.95, 0.28, 3)), { w: 0.6, seed: seed + 6 });
	d += outline(on(ellipse(1.15, 2.25, 0.42, 0.3, 16)), { w: 0.8, seed: seed + 7 });
	d += stroke(on([[1.9, 2.3], [4.3, 2.25]]), { w: 1.8, seed: seed + 8, over: 0.3 });
	d += [6.2, 7.4, 8.6].map((u, i) => stroke(on([[u, 2.3], [u + 0.8, 2.3]]), { w: 0.8, seed: seed + 9 + i, over: 0 })).join('');
	const hero = on(roundRect(0.8, 3.1, 9.2, 6.7, 0.25, 3));
	d += outline(hero, { w: 1, heavy: 0.8, centre: centreOf(hero), seed: seed + 12 });
	const bag = on([[4.1, 3.75], [5.9, 3.75], [6.15, 6.25], [3.85, 6.25]]);
	tone += hatch(on([[0.8, 3.1], [9.2, 3.1], [9.2, 6.7], [0.8, 6.7]]), -0.6, 2.2, seed + 13, { cluster: 4, skip: 0.35, trim: 0.4 });
	d += outline(bag, { w: 0.9, heavy: 0.7, centre: centreOf(bag), seed: seed + 14 });
	d += outline(on(ellipse(5, 5, 0.38, 0.27, 14)), { w: 0.7, seed: seed + 15 });
	d += stroke(on([[0.8, 7.75], [6.4, 7.7]]), { w: 2.3, seed: seed + 16, over: 0.3 });
	d += [
		[8.75, 8.9],
		[9.45, 7.6],
		[10.15, 8.3],
	].map(([v, l], i) => stroke(on([[0.8, v!], [0.8 + l!, v!]]), { w: 0.7, seed: seed + 17 + i, over: 0 })).join('');
	const button = on(roundRect(0.8, 10.9, 4.6, 12.15, 0.3, 3));
	d += outline(button, { w: 1.1, heavy: 1, centre: centreOf(button), seed: seed + 21 });
	d += stroke(on([[1.5, 11.53], [3.9, 11.5]]), { w: 0.9, seed: seed + 22, over: 0 });
	const link = linkWrong ? on(roundRect(7.6, 11.15, 9.2, 11.9, 0.2, 3)) : on(roundRect(6.2, 10.95, 9.2, 12.1, 0.3, 3));
	d += outline(link, { w: 0.9, heavy: 0.7, centre: centreOf(link), seed: seed + 23 });
	if (!linkWrong) d += stroke(on([[6.8, 11.53], [8.6, 11.5]]), { w: 0.8, seed: seed + 24, over: 0 });
	return { ink: d, tone, link, spots: [0.62, 2.28, 4.9, 7.72, 9.45, 11.5].map((v) => v * k) };
}

/** A tube in perspective: the magnifier's handle, the pen. Paper fill, a thin lit edge, a heavy shade edge and broken tone along the shade side. */
function tube(points: Point3[], radius: number, seed: number, rings = false) {
	const pts: Point3[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i]!;
		const b = points[i + 1]!;
		const n = Math.max(1, Math.ceil(Math.hypot(...sub3(b, a)) / 0.15));
		for (let k = 0; k < n; k++) pts.push(lerp3(a, b, k / n));
	}
	pts.push(points.at(-1)!);
	const left: P[] = [];
	const right: P[] = [];
	const inner: P[] = [];
	const cast: P[] = [];
	let ticks = '';
	let travelled = 0;
	let next = 0.8;
	pts.forEach((p, i) => {
		if (i) travelled += Math.hypot(...sub3(p, pts[i - 1]!));
		const t = unit3(sub3(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!));
		const n = unit3(cross3(t, sub3(EYE, p)));
		const l = proj(add3(p, mul3(n, radius)));
		const r = proj(sub3(p, mul3(n, radius)));
		left.push(l);
		right.push(r);
		const side = dot3(n, LIGHT) > 0 ? -1 : 1;
		inner.push(proj(add3(p, mul3(n, side * radius * 0.6))));
		cast.push(proj(shadowOnDesk(p)));
		if (rings && travelled >= next && i > 2 && i < pts.length - 3) {
			next += 1.3 + ((i * 37) % 5) * 0.2;
			const c = proj(p);
			const bulge = proj(add3(p, mul3(t, radius * 0.7)));
			const m: P = [bulge[0] * 2 - c[0], bulge[1] * 2 - c[1]];
			ticks += stroke(Array.from({ length: 7 }, (_, k) => {
				const s = (k / 6) * 0.8;
				return [(1 - s) * (1 - s) * l[0] + 2 * s * (1 - s) * m[0] + s * s * r[0], (1 - s) * (1 - s) * l[1] + 2 * s * (1 - s) * m[1] + s * s * r[1]] as P;
			}), { w: 0.45, seed: seed + 20 + i, over: 0, wobble: 0.1 });
		}
	});
	const rnd = seeded(seed + 40);
	let tone = '';
	for (let i = 0; i < inner.length; i += 10) if (rnd() < 0.8) tone += stroke(inner.slice(i, i + 8), { w: 0.55, seed: seed + 41 + i, over: 0.3, wobble: 0.15 });
	const width = Math.hypot(left[0]![0] - right[0]![0], left[0]![1] - right[0]![1]);
	return {
		paper: pathOf([...left, ...[...right].reverse()], true),
		ink: line(left, { w: 0.9, seed, over: 0.8 }) + line(right, { w: 1.6, seed: seed + 1, over: 0.8 }) + ticks,
		tone,
		cast: stroke(cast, { w: width * 1.1, seed: seed + 2, wobble: 0.4, over: 0 }),
		castLine: cast,
		left,
		right,
	};
}

/** A loose hand-drawn arrow through screen points, with two barbs at its head. */
function arrow(points: P[], seed: number, w = 1.3): string {
	const path: P[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)]!;
		const p1 = points[i]!;
		const p2 = points[i + 1]!;
		const p3 = points[Math.min(points.length - 1, i + 2)]!;
		for (let k = 0; k < 12; k++) {
			const t = k / 12;
			const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
			path.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
		}
	}
	path.push(points.at(-1)!);
	return line(path, { w, seed, over: 0.6 }) + barbs(path, 10).map((b, i) => stroke(b, { w, seed: seed + 1 + i, over: 0.4 })).join('');
}

const tick = (pl: Plane, u: number, v: number, s: number, seed: number) => stroke(pl.on([[u - 0.42 * s, v - 0.05 * s], [u - 0.1 * s, v + 0.34 * s], [u + 0.55 * s, v - 0.6 * s]]), { w: 2.1, heavy: 1, seed, over: 0.6, wobble: 0.3 });
const cross = (pl: Plane, u: number, v: number, s: number, seed: number) =>
	stroke(pl.on([[u - 0.38 * s, v - 0.45 * s], [u + 0.38 * s, v + 0.3 * s]]), { w: 2.6, seed, over: 0.5 }) + stroke(pl.on([[u + 0.36 * s, v - 0.47 * s], [u - 0.36 * s, v + 0.32 * s]]), { w: 2.6, seed: seed + 1, over: 0.5 });
const ring = (cx: number, cy: number, rx: number, ry: number): P[] =>
	Array.from({ length: 48 }, (_, i) => {
		const a = -2.2 + (i / 47) * Math.PI * 2.25;
		const grow = 1 + (i / 47) * 0.12;
		return [cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow];
	});

const label = (text: string, at: P, anchor: Text['anchor'] = 'start', cls = 'label') => texts.push({ cls, x: r1(at[0]), y: r1(at[1]), text, anchor });

// The desk under the old site's pages: the stack, the rest of the site still on the old app.
function stackArt() {
	const sheets = STACK_TURNS.map((turn, i) => {
		const rnd = seeded(60 + i);
		const c: P = [STACK[0] + (rnd() - 0.5) * 0.9, STACK[1] + (rnd() - 0.5) * 0.7];
		return { pl: deskPlane(c, PAGE.w, PAGE.h, turn, i * 0.13), seed: 2000 + i * 40 };
	});
	const base = sheets[0]!.pl;
	const lowCorners = [base.at(-0.6, -0.4), base.at(PAGE.w + 0.6, -0.4), base.at(PAGE.w + 0.6, PAGE.h + 0.5), base.at(-0.6, PAGE.h + 0.5)];
	const cast = hull([...projAll(lowCorners), ...lowCorners.map((p) => proj(shadowOnDesk(add3(p, [0, 0, 0.9]))))]);
	draw('shade', wash(cast, 1990, 1, 2));
	draw('shade-hatch', hatch(cast, -0.5, 2.5, 1991, { cluster: 6, skip: 0.25, trim: 0.5 }));
	sheets.forEach(({ pl, seed }, i) => {
		const art = sheetArt(pl, PAGE.w, PAGE.h, seed, { weight: i === sheets.length - 1 ? 1 : 0.7 });
		draw('on-paper-ink', art.ink);
		if (i < sheets.length - 1) draw('on-paper-hatch light', hatch(pl.on([[0, 0], [PAGE.w, 0], [PAGE.w, 1.25], [0, 1.25]]), 0.12, 2.4, seed + 9, { cluster: 5, skip: 0.4 }));
	});
	const top = sheets.at(-1)!.pl;
	const page = pageContents(top, 2400);
	draw('on-paper-hatch', page.tone);
	draw('on-paper-ink', page.ink);
	return { top, labelAt: proj(top.at(-0.2, -0.6)), noteAim: proj(top.at(0.6, PAGE.h - 0.3)), lift: proj(top.at(PAGE.w * 0.65, 0.4)) };
}

// The page lifted out of the stack and recorded.
function liftedArt() {
	const t = LIFT.turn;
	const U = unit3([Math.cos(t), Math.sin(t), 0.62]);
	const V = unit3([-Math.sin(t), Math.cos(t), -0.12]);
	const N = unit3(cross3(V, U));
	const O = sub3(sub3(LIFT.c, mul3(U, PAGE.w / 2)), mul3(V, PAGE.h / 2));
	const flat = plane(proj, O, U, V, N);
	const bow = (u: number, v: number) => 1.1 * Math.sin((Math.PI * v) / PAGE.h) * (0.4 + u / PAGE.w);
	const pl: Plane = {
		at: (u, v, lift = 0) => flat.at(u, v, lift + bow(u, v)),
		on: (pts, lift = 0) => pts.map(([u, v]) => proj(flat.at(u, v, lift + bow(u, v)))),
		matrix: flat.matrix,
	};
	const art = sheetArt(pl, PAGE.w, PAGE.h, 2700, { lifted: true });
	draw('on-paper-ink', art.ink);
	const page = pageContents(pl, 2750);
	draw('on-paper-hatch', page.tone);
	draw('on-paper-ink', page.ink);
	return { from: proj(pl.at(0.2, PAGE.h * 0.7)), to: proj(pl.at(PAGE.w + 0.2, PAGE.h * 0.35)), labelAt: proj(pl.at(PAGE.w * 0.5, -0.7)) };
}

// The old page and its Markless redraw side by side, the redraw washed yellow, check marks between the matching spots and a cross where they differ.
function compareArt() {
	const old = deskPlane(OLD.c, PAGE.w, PAGE.h, OLD.turn);
	const fresh = deskPlane(NEW.c, PAGE.w, PAGE.h, NEW.turn);
	const oldArt = sheetArt(old, PAGE.w, PAGE.h, 3000);
	const freshArt = sheetArt(fresh, PAGE.w, PAGE.h, 3100);
	const freshPoly = fresh.on(rectEdge(PAGE.w, PAGE.h, 8));
	draw('yellow wash', wash(freshPoly, 3150, 1.6, 3.5));
	draw('yellow-pool', wash(pool(freshPoly, freshPoly[Math.floor(freshPoly.length * 0.62)]!, 0.5), 3151, 0.6, 2.5));
	draw('yellow-edge', wash(freshPoly, 3152, 0.8, 3));
	draw('on-paper-ink', oldArt.ink + freshArt.ink);
	const oldPage = pageContents(old, 3200);
	const freshPage = pageContents(fresh, 3300, { linkWrong: true });
	draw('on-paper-hatch', oldPage.tone + freshPage.tone);
	draw('on-paper-ink', oldPage.ink + freshPage.ink);
	let marks = '';
	let links = '';
	oldPage.spots.forEach((v, i) => {
		const a = proj(old.at(PAGE.w + 0.15, v));
		const b = proj(fresh.at(-0.15, v));
		const wrong = i === oldPage.spots.length - 1;
		links += pencil([a, b], 3400 + i, false, 1);
		const [gu, gv] = deskCoord(lerpP(a, b, 0.5));
		marks += wrong ? cross(desk, gu, gv, 1.25, 3420 + i * 2) : tick(desk, gu, gv, 0.95, 3420 + i * 2);
	});
	const bc = proj(fresh.at(7.7, 11.5));
	const bw = 46;
	const loop = ring(bc[0], bc[1], bw * 0.75, 16);
	return {
		marks,
		links,
		loop: stroke(loop, { w: 1.7, heavy: 0.6, seed: 3460, over: 0.8, wobble: 0.4 }),
		loopEnd: loop.at(-6)!,
		buttonAt: bc,
		convert: [proj(old.at(7.4, -0.4)), proj(fresh.at(2.4, -0.4))] as [P, P],
		freshRight: proj(fresh.at(PAGE.w + 0.1, 3)),
		oldLeft: proj(old.at(0.3, 1.5)),
		pencil: [pencil(projAll([old.at(-1.5, 0), fresh.at(PAGE.w + 1.5, 0)]), 3470), pencil(projAll([old.at(-1.2, PAGE.h), fresh.at(PAGE.w + 1.2, PAGE.h)]), 3471)].join(''),
	};
}

const lerpP = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The desk point under a screen point, by a few steps of Newton on the projection. */
function deskCoord(s: P): P {
	let u: P = [GAP_U, 15];
	for (let i = 0; i < 20; i++) {
		const p = proj([u[0], u[1], 0]);
		const px = proj([u[0] + 0.01, u[1], 0]);
		const py = proj([u[0], u[1] + 0.01, 0]);
		const a = (px[0] - p[0]) / 0.01;
		const b = (py[0] - p[0]) / 0.01;
		const c = (px[1] - p[1]) / 0.01;
		const d = (py[1] - p[1]) / 0.01;
		const det = a * d - b * c;
		const ex = s[0] - p[0];
		const ey = s[1] - p[1];
		u = [u[0] + (d * ex - b * ey) / det, u[1] + (-c * ex + a * ey) / det];
	}
	return u;
}

// The magnifying glass over both sheets: the checker.
function lensArt() {
	const { c, z, r, inner } = LENS;
	const circle = (rad: number, h: number, n = 96): Point3[] => Array.from({ length: n }, (_, i) => [c[0] + Math.cos((i / n) * TAU) * rad, c[1] + Math.sin((i / n) * TAU) * rad, h]);
	const outerTop = projAll(circle(r, z + 0.3));
	const innerTop = projAll(circle(inner, z + 0.3));
	const outerLow = circle(r, z - 0.3);
	const annulus = (o: P[], i: P[]) => [...o, o[0]!, i[0]!, ...[...i].reverse(), i[0]!];
	const castOuter = outerLow.map((p) => proj(shadowOnDesk(p)));
	const castInner = circle(inner, z).map((p) => proj(shadowOnDesk(p)));
	draw('shade soft', pathOf(castOuter, true) + pathOf(castInner, true), true);
	draw('shade-hatch soft', hatch(annulus(castOuter, castInner), -0.5, 2.2, 3501, { cluster: 3, skip: 0.3 }));
	const a0 = Math.PI / 2 - 0.75;
	const rim: Point3 = [c[0] + Math.cos(a0) * r, c[1] + Math.sin(a0) * r, z];
	const dir = unit3([Math.cos(a0), Math.sin(a0), 0.06]);
	const handlePts = [add3(rim, mul3(dir, -0.2)), add3(rim, mul3(dir, 1.6)), add3(rim, mul3(dir, 6.4))];
	const ferrule = tube(handlePts.slice(0, 2), 0.55, 3510);
	const handle = tube([handlePts[1]!, handlePts[2]!], 0.7, 3520, true);
	draw('glass', pathOf(innerTop, true));
	const glint = (from: number, to: number, rad: number, seed: number) => line(projAll(Array.from({ length: 16 }, (_, i) => {
		const a = from + ((to - from) * i) / 15;
		return [c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad, z + 0.3] as Point3;
	})), { w: 0.9, seed, over: 0.4 });
	const rimFront = outerLow.filter((p) => p[1] > c[1] - 0.2).map(proj).sort((p, q) => p[0] - q[0]);
	draw('rim', pathOf(outerTop, true) + pathOf(innerTop, true), true);
	const rimBand = annulus(outerTop, innerTop);
	draw('desk-hatch', hatch(rimBand, 1.1, 1.6, 3540, { cluster: 3, skip: 0.45, trim: 0.3 }));
	draw('desk-ink', outline(outerTop, { w: 2, heavy: 1.6, seed: 3541 }) + outline(innerTop, { w: 1.1, heavy: 0.8, seed: 3542 }) + line(rimFront, { w: 1.8, heavy: 1.2, seed: 3543, over: 1.5 }));
	draw('desk-ink light', glint(3.5, 4.3, inner * 0.82, 3544) + glint(3.75, 4.05, inner * 0.68, 3545));
	draw('handle', ferrule.paper + handle.paper);
	draw('desk-ink', ferrule.ink + handle.ink + ferrule.tone + handle.tone);
	return { labelAt: proj(handlePts[2]!), pencil: pencil(projAll([[c[0], c[1], z + 3], [c[0], c[1], -0.6]]), 3550) + pencil(projAll(circle(r + 0.5, z + 0.3, 60)), 3551, true, 1) };
}

// The fineliner that redraws the page in Markless, lying on the desk beside the new sheet.
function penArt() {
	const dir = unit3(sub3(PEN.end, PEN.tip));
	const capAt = add3(PEN.end, mul3(dir, -2.6));
	const nose = add3(PEN.tip, mul3(dir, 1.1));
	const body = tube([nose, capAt], PEN.r, 3600);
	const cap = tube([capAt, PEN.end], PEN.r * 1.18, 3610);
	const clipPts = [add3(capAt, [0, 0, PEN.r * 1.25]), add3(add3(capAt, mul3(dir, 2.2)), [0, 0, PEN.r * 1.25])];
	const tipCone = [proj(PEN.tip), body.left[0]!, body.right[0]!];
	draw('shade', body.cast + cap.cast);
	draw('handle', body.paper + cap.paper + pathOf(tipCone, true));
	draw('desk-hatch', hatch(tipCone, 0.9, 1, 3620, { cluster: 1, trim: 0 }));
	draw('desk-ink', body.ink + cap.ink + body.tone + cap.tone + outline(tipCone, { w: 1, seed: 3621 }) + stroke(projAll(clipPts), { w: 1.6, seed: 3622, over: 0.2 }));
	return { tip: proj(PEN.tip), mid: proj(lerp3(PEN.tip, PEN.end, 0.55)), end: proj(PEN.end) };
}

/** The Migrate box icon from markless.dev's ink marks, so the box reads as Markless Migrate's own. */
const ICON = (() => {
	const svg = readFileSync(new URL('../../docs/assets/migrate-icon-on-light.svg', import.meta.url), 'utf8');
	return [...svg.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]).join('');
})();

// The live box: an open carton marked with the Migrate icon, pages already switched standing in it, and the checked page dropping in.
function boxArt() {
	const { x0, x1, y0, y1, h } = BOX;
	const corner = (x: number, y: number, z: number): Point3 => [x, y, z];
	const face = (pts: Point3[]) => projAll(pts);
	const bottom = [corner(x0, y0, 0), corner(x1, y0, 0), corner(x1, y1, 0), corner(x0, y1, 0)];
	const tops = bottom.map((p) => add3(p, [0, 0, h]));
	const cast = hull([...projAll(bottom), ...tops.map((p) => proj(shadowOnDesk(p))), proj(shadowOnDesk(corner(x0 - 1.7, y0 - 0.2, h + 3.2)))]);
	draw('shade', wash(cast, 3700, 1, 2.5));
	draw('shade-hatch', hatch(cast, -0.5, 2.3, 3701, { cluster: 5, skip: 0.2, trim: 0.4 }) + hatch(hull([...projAll(bottom), ...bottom.map((p) => proj(shadowOnDesk(add3(p, [0, 0, 1.2]))))]), 0.6, 1.5, 3702, { cluster: 3, skip: 0.2 }));
	const back = face([tops[0]!, tops[1]!, bottom[1]!, bottom[0]!]);
	const right = face([tops[1]!, tops[2]!, bottom[2]!, bottom[1]!]);
	const front = face([tops[3]!, tops[2]!, bottom[2]!, bottom[3]!]);
	const left = face([tops[0]!, tops[3]!, bottom[3]!, bottom[0]!]);
	const flapBack = face([tops[0]!, tops[1]!, corner(x1 + 0.2, y0 - 1.5, h + 3.1), corner(x0 - 0.3, y0 - 1.6, h + 3.2)]);
	const flapLeft = face([tops[0]!, tops[3]!, corner(x0 - 2.2, y1 - 0.2, h + 2.2), corner(x0 - 2.1, y0 + 0.1, h + 2.4)]);
	draw('kraft', pathOf(flapBack, true));
	draw('desk-hatch', hatch(flapBack, 1.3, 2.6, 3710, { cluster: 4, skip: 0.4, trim: 0.4 }));
	draw('desk-ink', outline(flapBack, { w: 1.4, heavy: 1, seed: 3711 }));
	draw('kraft-dark', pathOf(back, true) + pathOf(right, true));
	draw('desk-hatch', hatch(right, 1.4, 1.4, 3712, { cluster: 3, skip: 0.1 }) + hatch(back, 0.4, 2.2, 3713, { cluster: 4, skip: 0.3 }));
	[0.9, 2.3].forEach((dy, i) => {
		const O = corner(x0 + 0.5 + i * 0.25, y0 + dy, 0.2);
		const pl = plane(proj, O, [1, 0, 0], unit3([0, -0.22, 1]));
		const w = 8;
		const ht = h + 1.5 - i * 0.5;
		const sil = pl.on(jitter(rectEdge(w, ht, 10), 3720 + i, 0.03));
		draw('paper', pathOf(sil, true));
		draw('on-paper-hatch', hatch(pl.on([[0, ht - 1], [w, ht - 1], [w, ht], [0, ht]]), 0.1, 2.2, 3725 + i, { cluster: 5, skip: 0.2 }));
		draw('on-paper-ink', outline(sil, { w: 1.2, heavy: 1, centre: centreOf(sil), seed: 3730 + i }) + line(pl.on([[0, ht - 1], [w, ht - 1]]), { w: 0.6, seed: 3735 + i }));
	});
	// The checked page on its way in.
	const pw = 7.8;
	const ph = 10.1;
	const O = corner(x0 + 0.7, y0 + 3.4, h + 10.2);
	const U = unit3([1, 0.02, -0.17]);
	const V = unit3([0.12, 0.3, -1]);
	const pl = plane(proj, O, U, V, unit3(cross3(U, V)));
	const sil = pl.on(jitter(rectEdge(pw, ph, 30), 3760, 0.03));
	draw('paper', pathOf(sil, true));
	draw('pink wash', wash(sil, 3762, 1.8, 3.5));
	draw('pink-pool', wash(pool(sil, sil[Math.floor(sil.length * 0.6)]!, 0.5), 3763, 0.6, 2));
	const page = pageContents(pl, 3770, { scale: pw / PAGE.w });
	draw('on-paper-hatch', page.tone);
	draw('on-paper-ink', outline(sil, { w: 1.6, heavy: 1.4, centre: centreOf(sil), seed: 3790 }) + page.ink + tick(pl, pw - 1.2, ph - 1.3, 1.5, 3791));
	const motion = [0.18, 0.5, 0.82].map((t, i) => line(projAll([add3(pl.at(pw * t, -0.5), [0, 0, 0.6 + i * 0.3]), add3(pl.at(pw * t, -0.5), [0, 0, 2.4 + i * 0.2])]), { w: 0.9, seed: 3795 + i, over: 0.5 })).join('');
	draw('desk-ink light', motion);
	draw('kraft', pathOf(left, true) + pathOf(flapLeft, true));
	draw('desk-ink', outline(left, { w: 1.5, heavy: 1, seed: 3740 }) + outline(flapLeft, { w: 1.4, heavy: 1, seed: 3741 }));
	draw('desk-hatch light', hatch(flapLeft, -0.3, 2.8, 3742, { cluster: 4, skip: 0.45, trim: 0.5 }));
	draw('kraft', pathOf(front, true));
	draw('desk-hatch', hatch(front, -0.8, 2.8, 3743, { cluster: 5, skip: 0.55, trim: 0.5 }));
	draw('desk-ink', outline(front, { w: 2, heavy: 1.7, centre: centreOf(front), seed: 3744 }) + line(face([tops[0]!, tops[1]!, tops[2]!]), { w: 1.2, seed: 3745 }));
	const facePlane = plane(proj, corner(x0, y1, h), [1, 0, 0], [0, 0, -1], [0, 1, 0]);
	const size = 5.6;
	layers.push({ cls: '', d: '', raw: `<g class="icon" transform="${facePlane.matrix((x1 - x0 - size) / 2, -1.05, size / 108, 0.02)}">${ICON}</g>` });
	const pencils = pencil(projAll([corner(x0, y1, 0), corner(x0 - 3, y1, 0)]), 3750) + pencil(projAll([corner(x0, y1, h), corner(x0, y1, -1)]), 3751) + pencil(projAll([corner(x1, y1, h + 1.2), corner(x1, y1, -0.6)]), 3752);

	return { pencil: pencils, dropLeft: proj(pl.at(-0.4, ph * 0.2)), dropTop: proj(pl.at(0, -0.6)), under: proj(corner((x0 + x1) / 2, y1 + 0.6, 0)) };
}

function scene() {
	const stack = stackArt();
	const lifted = liftedArt();
	const compare = compareArt();
	draw('pencil', compare.pencil);
	draw('pencil', compare.links);
	draw('desk-ink', compare.marks);
	const pen = penArt();
	const box = boxArt();
	draw('pencil', box.pencil);
	const lens = lensArt();
	draw('pencil', lens.pencil);
	draw('on-paper-ink', compare.loop);

	draw('desk-ink', arrow([stack.lift, [stack.lift[0] - 6, stack.lift[1] - 40], [lifted.from[0] - 24, lifted.from[1] - 18], lifted.from], 4000));
	draw('desk-ink', arrow([lifted.to, [lifted.to[0] + 26, lifted.to[1] + 8], [compare.oldLeft[0] + 4, compare.oldLeft[1] - 14]], 4010));
	const [c0, c1] = compare.convert;
	const top = Math.min(c0[1], c1[1]) - 44;
	draw('desk-ink', arrow([c0, [c0[0] + 18, top], [c1[0] - 18, top], c1], 4050));
	const fixFrom = compare.loopEnd;
	draw('desk-ink', arrow([fixFrom, [fixFrom[0] + 8, fixFrom[1] + 22], [pen.tip[0] - 4, pen.tip[1] - 14], [pen.tip[0] + 1, pen.tip[1] - 3]], 4020));
	draw('desk-ink', arrow([compare.freshRight, [compare.freshRight[0] + 30, compare.freshRight[1] - 36], [box.dropLeft[0] - 34, box.dropLeft[1] - 26], [box.dropLeft[0] - 6, box.dropLeft[1] - 2]], 4030));

	label('1 PLAN', [stack.labelAt[0] - 30, stack.labelAt[1] - 14]);
	label('2 RECORD', [lifted.labelAt[0], lifted.labelAt[1] - 12], 'middle');
	label('3 CONVERT', [(c0[0] + c1[0]) / 2, top - 34], 'middle');
	label('+ BUILD', [(c0[0] + c1[0]) / 2, top - 10], 'middle');
	label('4 CHECK', [lens.labelAt[0] - 4, lens.labelAt[1] + 30], 'middle');
	label('5 FIX', [pen.mid[0] + 10, pen.mid[1] + 36], 'middle');
	label('6 SWITCH', [box.dropTop[0] - 20, box.dropTop[1] - 22], 'middle');
	label('LIVE ON MARKLESS', [box.under[0], box.under[1] + 34], 'middle', 'note');
	const noteAt: P = [stack.noteAim[0] - 22, stack.noteAim[1] + 52];
	label('THE REST STILL RUNS', noteAt, 'start', 'note');
	label('ON THE OLD APP', [noteAt[0], noteAt[1] + 21], 'start', 'note');
	draw('desk-ink', arrow([[noteAt[0] + 6, noteAt[1] - 18], [noteAt[0] + 2, noteAt[1] - 34], stack.noteAim], 4040, 1.2));
}

interface Theme {
	sheet: string;
	sheetInk: string;
	deskInk: string;
	shade: string;
	shadeInk: string;
	yellow: string;
	yellowPool: string;
	yellowEdge: string;
	pink: string;
	pencil: string;
	pencilOpacity: number;
	kraft: string;
	kraftDark: string;
	glass: string;
	handle: string;
	rim: string;
}

const LIGHT_THEME: Theme = {
	sheet: '#fbf6ee',
	sheetInk: '#2f2c25',
	deskInk: '#2f2c25',
	shade: 'rgba(47,44,37,0.22)',
	shadeInk: '#2f2c25',
	yellow: '#f3e15b',
	yellowPool: '#f0c548',
	yellowEdge: '#e2a73a',
	pink: '#f08aa6',
	pencil: '#ec7f6e',
	pencilOpacity: 0.5,
	kraft: '#e6d2ae',
	kraftDark: '#cdb48a',
	glass: 'rgba(255,255,255,0.35)',
	handle: '#efe4d2',
	rim: '#efe4d2',
};

const DARK_THEME: Theme = {
	sheet: '#ebe6d4',
	sheetInk: '#1e1b17',
	deskInk: '#ece8df',
	shade: 'rgba(0,0,0,0.55)',
	shadeInk: 'rgba(0,0,0,0.85)',
	yellow: '#f3e15b',
	yellowPool: '#f0c548',
	yellowEdge: '#e2a73a',
	pink: '#f08aa6',
	pencil: '#ec7f6e',
	pencilOpacity: 0.32,
	kraft: '#5c4a35',
	kraftDark: '#45372a',
	glass: 'rgba(255,255,255,0.07)',
	handle: '#2a2620',
	rim: '#2a2620',
};

const FONT = readFileSync(new URL('./hand.woff2', import.meta.url)).toString('base64');
const HAND = `'MM Hand', 'Shantell Sans', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive`;

function css(t: Theme) {
	return [
		`@font-face{font-family:'MM Hand';src:url(data:font/woff2;base64,${FONT}) format('woff2');font-weight:700}`,
		`.paper{fill:${t.sheet}}`,
		`.on-paper-ink{fill:${t.sheetInk}}`,
		`.on-paper-hatch{fill:none;stroke:${t.sheetInk};stroke-width:.6;stroke-linecap:round;opacity:.8}`,
		`.desk-ink{fill:${t.deskInk}}`,
		`.desk-hatch{fill:none;stroke:${t.deskInk};stroke-width:.65;stroke-linecap:round;opacity:.85}`,

		`.shade{fill:${t.shade}}`,
		`.shade-hatch{fill:none;stroke:${t.shadeInk};stroke-width:.6;stroke-linecap:round;opacity:.7}`,
		`.pencil{fill:none;stroke:${t.pencil};stroke-width:.7;stroke-linecap:round;opacity:${t.pencilOpacity}}`,
		`.wash{mix-blend-mode:multiply}`,
		`.yellow{fill:${t.yellow};opacity:.85}`,
		`.yellow-pool{fill:${t.yellowPool};opacity:.5;mix-blend-mode:multiply}`,
		`.yellow-edge{fill:none;stroke:${t.yellowEdge};stroke-width:1;opacity:.55;mix-blend-mode:multiply}`,
		`.pink{fill:${t.pink};opacity:.6}`,
		`.pink-pool{fill:${t.pink};opacity:.45;mix-blend-mode:multiply}`,
		`.kraft{fill:${t.kraft}}`,
		`.kraft-dark{fill:${t.kraftDark}}`,
		`.glass{fill:${t.glass}}`,
		`.handle{fill:${t.handle}}`,
		`.rim{fill:${t.rim}}`,
		`.icon{color:${t.deskInk}}`,
		`text{font-family:${HAND};font-weight:700;fill:${t.deskInk}}`,
		`.label{font-size:22px;letter-spacing:.06em}`,
		`.note{font-size:17px;letter-spacing:.08em;opacity:.85}`,
		`.light{opacity:.55}`,
		`.soft{opacity:.45}`,
	].join('');
}

const num = (n: number) => {
	const t = (Math.round(n * 10) / 10).toString();
	return t.replace(/^(-?)0\./, '$1.');
};

/** Rewrites absolute M/L/Q/Z path data as relative commands with short numbers; the drawing is unchanged, the file about half the size. */
export function compact(d: string): string {
	const tokens = d.match(/[MLQZ]|-?\d*\.?\d+/g) ?? [];
	let out = '';
	const push = (t: string) => {
		out += /[\d.]$/.test(out) && /^[\d.]/.test(t) ? ' ' + t : t;
	};
	let [cx, cy, sx, sy] = [0, 0, 0, 0];
	let cmd = '';
	let last = '';
	for (let i = 0; i < tokens.length; ) {
		const t = tokens[i++]!;
		if (t === 'Z') {
			push('z');
			[cx, cy, last] = [sx, sy, 'z'];
			continue;
		}
		if (/[MLQ]/.test(t)) {
			cmd = t;
			continue;
		}
		const n = cmd === 'Q' ? 4 : 2;
		const v = [Number(t), ...tokens.slice(i, i + n - 1).map(Number)];
		i += n - 1;
		const letter = cmd.toLowerCase();
		if (letter !== last || letter === 'm') push(letter);
		for (let k = 0; k < n; k += 2) {
			push(num(v[k]! - cx));
			push(num(v[k + 1]! - cy));
		}
		[cx, cy] = [v[n - 2]!, v[n - 1]!];
		last = letter === 'm' ? 'l' : letter;
		if (cmd === 'M') {
			[sx, sy] = [cx, cy];
			cmd = 'L';
		}
	}
	return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const ALT = 'A stack of old-site pages: one page is lifted out, recorded and redrawn as a Markless page, checked side by side against the original under a magnifying glass, sent back to be fixed where they differ, and switched live only once they match, while the rest of the site stays on the old app.';

export function render(theme: Theme): string {
	layers.length = 0;
	texts.length = 0;
	scene();
	const body = layers.map((l) => l.raw ?? `<path class="${l.cls}"${l.evenodd ? ' fill-rule="evenodd"' : ''} d="${compact(l.d)}"/>`);
	const words = texts.map((t) => `<text class="${t.cls}"${t.anchor && t.anchor !== 'start' ? ` text-anchor="${t.anchor}"` : ''}${t.transform ? ` transform="${t.transform}"` : ` x="${t.x}" y="${t.y}"`}>${esc(t.text)}</text>`);
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="t">`,
		`<title id="t">${esc(ALT)}</title>`,
		`<!-- Drawn by scripts/figures/how-it-works.ts. Lettering: Shantell Sans, Copyright 2022 The Shantell Sans Project Authors, SIL Open Font License 1.1. -->`,
		`<style>${css(theme)}</style>`,
		...body,
		...words,
		'</svg>',
		'',
	].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const out = new URL('../../docs/assets/', import.meta.url);
	writeFileSync(new URL('how-it-works-light.svg', out), render(LIGHT_THEME));
	writeFileSync(new URL('how-it-works-dark.svg', out), render(DARK_THEME));
}


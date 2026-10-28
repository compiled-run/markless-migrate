import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import type { Browser, Locator, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS, type Viewport } from '../check/types.ts';
import { attr, childrenOf, isElement, setAttr, textContent, walk, type Element as Tree } from './dom.ts';
import { emitChildren, emitElement, lit, type Binding } from './tsrx.ts';

/** What a recharts chart shows for one active data point, as the old page drew it with that point active. */
export interface ChartState {
	/** The tooltip's content. */
	readonly tooltip: string;
	/** The tooltip's translate when recharts placed it at the point; null on an axis where it follows the pointer. */
	readonly x: number | null;
	readonly y: number | null;
	/** The nodes the chart put into its SVG for this point (active dots, the cursor), by insertion point. */
	readonly added: readonly { readonly at: string; readonly html: string }[];
	/** Attributes the chart changed on its own nodes for this point (a pie sector made the active shape); null: removed. */
	readonly changed: readonly { readonly path: readonly number[]; readonly attr: string; readonly value: string | null }[];
}

/**
 * How the pointer picks a point, as the old page answered it: along x or y (a cartesian chart), by the distance from
 * the centre (a radial bar chart), by the angle (a radar), or by the shape under the pointer (a pie's sectors).
 */
export type HitMode = 'x' | 'y' | 'r' | 'a' | 'i';

export interface ChartVariant {
	/** The SVG and the legend the chart drew for this state of its card's controls. */
	readonly svg?: string;
	readonly legend?: string;
	readonly mode: HitMode;
	/** Polar charts' centre. */
	readonly center?: readonly [number, number];
	/** Ranges of the mode's coordinate (px, degrees, or the shape's index) and the state each activates. */
	readonly segments: readonly (readonly [number, number, number])[];
	/** The range of the other coordinate where the pointer activates anything (y for `x`, the radius for `a`). */
	readonly span?: readonly [number, number];
	readonly states: readonly ChartState[];
	/** Where each node a state adds goes: element indexes from the surface, and the child it goes before (-1: the end). */
	readonly points: Readonly<Record<string, { readonly path: readonly number[]; readonly before: number }>>;
	/** The states the arrow keys step through once the chart has focus, with the tooltip's translate for each. */
	readonly keys?: readonly (readonly [number, number, number])[];
	/** The number of elements in the SVG at rest, which the paths index. */
	readonly elements: number;
	/** What recharts laid the drawing out from that it does not show (`chartModel`). */
	readonly model?: ChartModel;
}

/**
 * A cartesian axis as recharts' CartesianAxis was given it: every tick it could show (`c`: coordinates, `l`: the
 * formatter's text, in the capture's time zone), from which `getTicks` keeps the ones that fit, and the box and
 * settings that place them.
 */
export interface AxisModel {
	readonly t: 'xAxis' | 'yAxis';
	readonly o: 'top' | 'bottom' | 'left' | 'right';
	readonly box: readonly [number, number, number, number];
	/** The view box `getTicks` keeps the ticks inside. */
	readonly vb: readonly [number, number, number, number];
	readonly gap: number;
	readonly iv: string | number;
	readonly ts: number;
	readonly tm: number;
	readonly m?: true;
	readonly u?: string;
	readonly ang?: number;
	/** Half a band (a band axis' tick offset). */
	readonly off: number;
	/** A number axis (recharts' `type`); a category axis otherwise. */
	readonly num?: true;
	readonly rev?: true;
	/** The axis' padding along its length: [start, end] in px, or recharts' 'gap' / 'no-gap'. */
	readonly pad?: readonly [number, number] | string;
	readonly c: readonly number[];
	readonly l: readonly string[];
}

/** The chart's bars as recharts sized them: its gaps and maximum, and each bar's size setting, stacked bars as one. */
export interface BarModel {
	readonly gap: number | string;
	readonly cat: number | string;
	readonly max?: number;
	readonly size?: number;
	readonly groups: readonly { readonly size?: number; readonly max?: number }[];
}

export interface ChartModel {
	/** Each axis the SVG draws, in order; null where its ticks are custom. */
	readonly axes: readonly (AxisModel | null)[];
	readonly bars?: BarModel;
	/** recharts' layoutType, where the chart is cartesian: which axis holds the categories. */
	readonly layout?: 'horizontal' | 'vertical';
	readonly stack?: string;
}

/** A control in the chart's card that switches what the chart shows (a time range, a metric). */
export interface ChartDriver {
	readonly sig: string;
	readonly nth: number;
	/** `press`: the control itself (a button, a toggle); `choose`: an option of the select it opens, by its text. */
	readonly kind: 'press' | 'choose';
	readonly label?: string;
	readonly variant: number;
	/** The control marks the active one with data-active, which nothing else on the page drives. */
	readonly active?: boolean;
}

/** The chart as the old page drew it at another width. */
export interface ChartWidth {
	/** The page's width (a frame's, where the old site shows the chart in one). */
	readonly viewport: number;
	readonly width: number;
	readonly height: number;
	readonly view: readonly [number, number, number, number];
	readonly variants: readonly ChartVariant[];
	readonly drivers: readonly ChartDriver[];
}

export interface ChartFacts {
	readonly sig: string;
	readonly nth: number;
	/** The chart's place among the page's charts, which finds it at other widths, where its text differs. */
	readonly index: number;
	readonly width: number;
	readonly height: number;
	/** recharts' view box: the plot area inside the margins, which the tooltip is kept in. */
	readonly view: readonly [number, number, number, number];
	readonly variants: readonly ChartVariant[];
	readonly drivers: readonly ChartDriver[];
	readonly widths: readonly ChartWidth[];
	/** Frames from a control's use to the one the old page's update animation began at (`animationLag`). */
	readonly lag?: number;
}

declare global {
	interface Window {
		__mmc?: {
			mark(root: Element): number;
			read(root: Element): { visible: boolean; tooltip: string; x: number | null; y: number | null; added: { path: number[]; before: number; html: string }[]; changed: { path: number[]; attr: string; value: string | null }[] };
		};
	}
}

// Runs in the old page: marks the chart's SVG at rest, then reads what a point being active changed in it.
function installProbe(): void {
	const rest = new WeakMap<Element, { path: number[]; attrs: Map<string, string> }>();
	const svgOf = (root: Element) => root.querySelector('svg.recharts-surface')!;
	window.__mmc = {
		mark(root) {
			const svg = svgOf(root);
			let n = 0;
			const visit = (el: Element, path: number[]) => {
				[...el.children].forEach((child, i) => {
					const p = [...path, i];
					child.setAttribute('data-mm-old', '');
					rest.set(child, { path: p, attrs: new Map([...child.attributes].map((a) => [a.name, a.value])) });
					n++;
					visit(child, p);
				});
			};
			visit(svg, []);
			return n;
		},
		read(root) {
			const svg = svgOf(root);
			const tip = root.querySelector<HTMLElement>('.recharts-tooltip-wrapper');
			const clean = (html: string) => html.replace(/ data-mm-old=""/g, '');
			const added: { path: number[]; before: number; html: string }[] = [];
			const changed: { path: number[]; attr: string; value: string | null }[] = [];
			for (const el of svg.querySelectorAll('*')) {
				const known = rest.get(el);
				if (!known) {
					const parent = el.parentElement!;
					if (parent !== svg && !rest.has(parent)) continue;
					let next = el.nextElementSibling;
					while (next && !rest.has(next)) next = next.nextElementSibling;
					added.push({ path: parent === svg ? [] : rest.get(parent)!.path, before: next ? rest.get(next)!.path.at(-1)! : -1, html: clean(el.outerHTML) });
					continue;
				}
				const now = new Map([...el.attributes].filter((a) => a.name !== 'data-mm-old').map((a) => [a.name, a.value]));
				for (const [name, value] of known.attrs) if (name !== 'data-mm-old' && now.get(name) !== value) changed.push({ path: known.path, attr: name, value: now.get(name) ?? null });
				for (const [name, value] of now) if (!known.attrs.has(name)) changed.push({ path: known.path, attr: name, value });
			}
			const m = tip ? /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(tip.style.transform) : null;
			const visible = !!tip && tip.style.visibility === 'visible' && tip.innerHTML.trim() !== '';
			return { visible, tooltip: visible ? tip!.innerHTML : '', x: m ? Number(m[1]) : null, y: m ? Number(m[2]) : null, added, changed };
		},
	};
}

/**
 * Runs in the old page: marks each line, area and bar of a chart with what recharts' update animation needs and its
 * path does not say (`data-mm-geo`: its kind, curve, layout and animation, read off the props recharts rendered it
 * with), and returns the marked elements. The part (recharts-motion) reads each mark's points off its path.
 */
export function markGeometry(svg: Element): Element[] {
	type Fiber = { memoizedProps?: Record<string, unknown> | null; return?: Fiber | null };
	const fiberOf = (el: Element): Fiber | undefined => (el as unknown as Record<string, Fiber>)[Object.keys(el).find((k) => k.startsWith('__reactFiber$')) ?? ''];
	const up = (el: Element, has: (p: Record<string, unknown>) => boolean) => {
		for (let f: Fiber | null | undefined = fiberOf(el); f; f = f.return) if (f.memoizedProps && typeof f.memoizedProps === 'object' && has(f.memoizedProps)) return f.memoizedProps;
		return undefined;
	};
	const kinds: [string, string][] = [['recharts-line-curve', 'line'], ['recharts-area-area', 'area'], ['recharts-area-curve', 'curve'], ['recharts-rectangle', 'bar']];
	const marked: Element[] = [];
	for (const el of svg.querySelectorAll('path')) {
		const k = kinds.find(([c]) => el.classList.contains(c))?.[1];
		if (!k || (k === 'bar' && !el.closest('.recharts-bar-rectangle'))) continue;
		const a = up(el, (p) => 'animationDuration' in p);
		const curve = k === 'bar' ? undefined : up(el, (p) => Array.isArray(p.points));
		const layout = up(el, (p) => p.layout === 'horizontal' || p.layout === 'vertical')?.layout;
		// An easing recharts was given as a function, or a spring, is no curve the part can draw: it shows the end.
		const easing = typeof a?.animationEasing === 'string' ? a.animationEasing : undefined;
		if (curve && curve.type !== undefined && typeof curve.type !== 'string') continue;
		const animated = a && a.isAnimationActive !== false && easing ? { a: [Number(a.animationBegin ?? 0), Number(a.animationDuration ?? 0), easing] } : {};
		const geo = { k, ...(curve ? { t: curve.type ?? 'linear' } : {}), ...(layout ? { l: layout } : {}), ...(curve?.connectNulls ? { n: 1 } : {}), ...animated };
		el.setAttribute('data-mm-geo', JSON.stringify(geo));
		marked.push(el);
	}
	return marked;
}

/**
 * Runs in the old page: what recharts laid the chart's drawing out from and does not draw, read off the props its
 * CartesianAxis components and its store were given: each axis' every possible tick (getTicks keeps the ones that fit
 * the width and their text), and the bars' gaps and size settings. A custom tick (an element or a function) is left out.
 */
export function chartModel(svg: Element): ChartModel {
	type Fiber = { memoizedProps?: Record<string, unknown> | null; return?: Fiber | null };
	const fiberOf = (el: Element): Fiber | undefined => (el as unknown as Record<string, Fiber>)[Object.keys(el).find((k) => k.startsWith('__reactFiber$')) ?? ''];
	const up = (el: Element, has: (p: Record<string, unknown>) => boolean) => {
		for (let f: Fiber | null | undefined = fiberOf(el); f; f = f.return) if (f.memoizedProps && typeof f.memoizedProps === 'object' && has(f.memoizedProps)) return f.memoizedProps;
		return undefined;
	};
	const num = (v: unknown, or = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : or);
	const axes: (AxisModel | null)[] = [];
	for (const g of svg.querySelectorAll('g.recharts-cartesian-axis')) {
		const p = up(g, (q) => Array.isArray(q.ticks) && 'orientation' in q && 'tickFormatter' in q);
		const custom = !p || (p.tick !== undefined && p.tick !== true && typeof p.tick !== 'object') || (!!p.tick && typeof p.tick === 'object' && ('type' in (p.tick as object) || '$$typeof' in (p.tick as object)));
		if (!p || custom || (p.axisType !== 'xAxis' && p.axisType !== 'yAxis')) {
			axes.push(null);
			continue;
		}
		const ticks = p.ticks as { coordinate: number; value: unknown; offset?: number }[];
		const format = typeof p.tickFormatter === 'function' ? (p.tickFormatter as (v: unknown, i: number) => unknown) : (v: unknown) => v;
		const vb = (p.viewBox ?? {}) as Record<string, unknown>;
		axes.push({
			t: p.axisType,
			o: p.orientation as AxisModel['o'],
			box: [num(p.x), num(p.y), num(p.width), num(p.height)],
			vb: [num(vb.x), num(vb.y), num(vb.width), num(vb.height)],
			gap: num(p.minTickGap, 5),
			iv: typeof p.interval === 'number' || typeof p.interval === 'string' ? p.interval : 'preserveEnd',
			ts: num(p.tickSize, 6),
			tm: num(p.tickMargin, 2),
			...(p.mirror ? { m: true as const } : {}),
			...(typeof p.unit === 'string' || typeof p.unit === 'number' ? { u: String(p.unit) } : {}),
			...(num(p.angle) ? { ang: num(p.angle) } : {}),
			off: num(ticks[0]?.offset),
			...(p.type === 'number' ? { num: true as const } : {}),
			...(p.reversed ? { rev: true as const } : {}),
			...(typeof p.padding === 'string' ? { pad: p.padding } : p.padding && typeof p.padding === 'object' ? { pad: (p.axisType === 'xAxis' ? [num((p.padding as Record<string, unknown>).left), num((p.padding as Record<string, unknown>).right)] : [num((p.padding as Record<string, unknown>).top), num((p.padding as Record<string, unknown>).bottom)]) as [number, number] } : {}),
			c: ticks.map((t) => t.coordinate),
			l: ticks.map((t, i) => String(format(t.value, i))),
		});
	}
	const store = up(svg, (q) => !!(q.value as { store?: { getState?: unknown } } | undefined)?.store?.getState || !!(q.store as { getState?: unknown } | undefined)?.getState);
	type State = { rootProps?: Record<string, unknown>; layout?: { layoutType?: string }; graphicalItems?: { cartesianItems?: Record<string, unknown>[] } };
	const state = ((store?.value as { store?: { getState(): State } } | undefined)?.store ?? (store?.store as { getState(): State } | undefined))?.getState();
	const layoutType = state?.layout?.layoutType;
	const chart = {
		...(layoutType === 'horizontal' || layoutType === 'vertical' ? { layout: layoutType as 'horizontal' | 'vertical' } : {}),
		...(typeof state?.rootProps?.stackOffset === 'string' && state.rootProps.stackOffset !== 'none' ? { stack: state.rootProps.stackOffset } : {}),
	};
	const items = (state?.graphicalItems?.cartesianItems ?? []).filter((i) => i.type === 'bar' && !i.hide);
	if (!items.length || !state?.rootProps) return { axes, ...chart };
	const groups: { size?: number; max?: number }[] = [];
	const seen = new Set<unknown>();
	for (const item of [...items.filter((i) => i.stackId != null), ...items.filter((i) => i.stackId == null)]) {
		if (item.stackId != null && seen.has(item.stackId)) continue;
		seen.add(item.stackId);
		groups.push({ ...(typeof item.barSize === 'number' ? { size: item.barSize } : {}), ...(typeof item.maxBarSize === 'number' ? { max: item.maxBarSize } : {}) });
	}
	const r = state.rootProps;
	const bars: BarModel = { gap: r.barGap as number | string, cat: r.barCategoryGap as number | string, ...(typeof r.maxBarSize === 'number' ? { max: r.maxBarSize } : {}), ...(typeof r.barSize === 'number' ? { size: r.barSize } : {}), groups };
	return { axes, bars, ...chart };
}

/**
 * Frames from a control's use to the one recharts' update animation's clock begins at, as the old page took them, from
 * a film of the chart's marks: the first of three frames in a row that each change them is its first frames of motion.
 */
export function animationLag(frames: readonly string[]): number | undefined {
	// frames[0] is read at the input, frames[j] at the start of the j-th frame after it: what frame j-1 painted, which
	// React drew from frame j-2's tick. The first sample of the run of motion is two frames after the clock's start.
	for (let k = 1; k + 2 < frames.length; k++) if (frames[k] !== frames[k - 1] && frames[k + 1] !== frames[k] && frames[k + 2] !== frames[k + 1]) return Math.max(0, k - 2);
	return undefined;
}

interface Sample {
	readonly px: number;
	readonly py: number;
	readonly state: number;
	readonly x: number | null;
	readonly y: number | null;
}

/** States as they are found, one per distinct thing the chart showed. */
class States {
	readonly list: { tooltip: string; added: { at: string; html: string }[]; changed: ChartState['changed'] }[] = [];
	readonly points: Record<string, { path: number[]; before: number }> = {};
	private readonly keys = new Map<string, number>();

	knows(seen: Awaited<ReturnType<NonNullable<Window['__mmc']>['read']>>): boolean {
		return this.keys.has(JSON.stringify([seen.tooltip, seen.added.map((a) => ({ at: `${a.path.join('.')}@${a.before}`, html: a.html })), seen.changed]));
	}

	add(seen: Awaited<ReturnType<NonNullable<Window['__mmc']>['read']>>): number {
		if (!seen.visible) return -1;
		const added = seen.added.map((a) => {
			const at = `${a.path.join('.')}@${a.before}`;
			this.points[at] = { path: a.path, before: a.before };
			return { at, html: a.html };
		});
		const key = JSON.stringify([seen.tooltip, added, seen.changed]);
		const known = this.keys.get(key);
		if (known !== undefined) return known;
		this.keys.set(key, this.list.length);
		this.list.push({ tooltip: seen.tooltip, added, changed: seen.changed });
		return this.list.length - 1;
	}
}

async function captureVariant(page: Page, wrapper: Locator, view: readonly [number, number, number, number]): Promise<Omit<ChartVariant, 'svg' | 'legend'>> {
	const elements = await wrapper.evaluate((root) => window.__mmc!.mark(root));
	const surface = wrapper.locator('svg.recharts-surface').first();
	const box = await surface.boundingBox();
	if (!box || !(await wrapper.locator('.recharts-tooltip-wrapper').count())) return { mode: 'x', segments: [], states: [], points: {}, elements };
	const kind = await surface.evaluate((svg) => {
		if (svg.querySelector('.recharts-pie-sector')) return { mode: 'i' as const };
		const radial = svg.querySelector('.recharts-radial-bar-sector');
		if (radial) return { mode: 'r' as const, center: [Number(radial.getAttribute('cx')), Number(radial.getAttribute('cy'))] as [number, number] };
		if (svg.querySelector('.recharts-radar')) {
			// The radar's centre: where its grid's spokes start, or the middle of its axis labels or its angle axis' outline.
			const spoke = svg.querySelector('.recharts-polar-grid-angle line');
			if (spoke) return { mode: 'a' as const, center: [Number(spoke.getAttribute('x1')), Number(spoke.getAttribute('y1'))] as [number, number] };
			const ticks = [...svg.querySelectorAll('.recharts-polar-angle-axis-tick text')].map((t) => [Number(t.getAttribute('x')), Number(t.getAttribute('y'))]);
			if (ticks.length > 2 && ticks.every((t) => !Number.isNaN(t[0]) && !Number.isNaN(t[1]))) return { mode: 'a' as const, center: [ticks.reduce((t, q) => t + q[0]!, 0) / ticks.length, ticks.reduce((t, q) => t + q[1]!, 0) / ticks.length] as [number, number] };
			const outline = svg.querySelector('.recharts-polar-angle-axis-line');
			if (outline?.tagName === 'circle') return { mode: 'a' as const, center: [Number(outline.getAttribute('cx')), Number(outline.getAttribute('cy'))] as [number, number] };
			const points = [...(outline?.getAttribute('d') ?? '').matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
			if (points.length > 2) return { mode: 'a' as const, center: [points.reduce((t, q) => t + q[0]!, 0) / points.length, points.reduce((t, q) => t + q[1]!, 0) / points.length] as [number, number] };
			return { mode: 'a' as const };
		}
		return { mode: 'c' as const };
	});
	const states = new States();
	const samples: Sample[] = [];
	let last = '';
	const at = async (px: number, py: number): Promise<number> => {
		await page.mouse.move(box.x + px, box.y + py);
		await page.waitForTimeout(16);
		let seen = await wrapper.evaluate((root) => window.__mmc!.read(root));
		// recharts adds a point's active dots a frame after its tooltip: a reading not seen before is read again until it holds.
		for (let i = 0; i < 6 && seen.visible && !states.knows(seen) && JSON.stringify([seen.tooltip, seen.added, seen.changed]) !== last; i++) {
			last = JSON.stringify([seen.tooltip, seen.added, seen.changed]);
			await page.waitForTimeout(16);
			seen = await wrapper.evaluate((root) => window.__mmc!.read(root));
		}
		last = '';
		const state = states.add(seen);
		if (state >= 0) samples.push({ px, py, state, x: seen.x, y: seen.y });
		return state;
	};
	// Runs of one state along a sweep, each boundary found to a quarter of the step between the samples on either side.
	const sharpen = async (sweep: readonly { at: number; state: number }[], probe: (at: number) => Promise<number>, step: number): Promise<[number, number, number][]> => {
		const bounds: number[] = [];
		for (let i = 0; i + 1 < sweep.length; i++) {
			const a = sweep[i]!;
			const b = sweep[i + 1]!;
			if (a.state === b.state) continue;
			let lo = a.at;
			let hi = b.at;
			for (let k = 0; k < 2; k++) {
				const mid = (lo + hi) / 2;
				if ((await probe(mid)) === a.state) lo = mid;
				else hi = mid;
			}
			bounds[i] = (lo + hi) / 2;
		}
		const out: [number, number, number][] = [];
		for (let i = 0; i < sweep.length; ) {
			let j = i;
			while (j + 1 < sweep.length && sweep[j + 1]!.state === sweep[i]!.state) j++;
			if (sweep[i]!.state >= 0) out.push([i > 0 ? bounds[i - 1]! : sweep[i]!.at - step / 2, j + 1 < sweep.length ? bounds[j]! : sweep[j]!.at + step / 2, sweep[i]!.state]);
			i = j + 1;
		}
		return out;
	};
	let mode: HitMode;
	let segments: [number, number, number][] = [];
	let span: [number, number] | undefined;
	let center: [number, number] | undefined;
	const [vx, vy, vw, vh] = view;
	if (kind.mode === 'i') {
		mode = 'i';
		const inside = await surface.evaluate((svg) =>
			[...svg.querySelectorAll('.recharts-pie-sector')].map((sector) => {
				const path = sector.querySelector('path') as SVGPathElement | null;
				if (!path) return [];
				const b = path.getBBox();
				const pts: [number, number][] = [];
				for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) {
					const x = b.x + (b.width * i) / 16;
					const y = b.y + (b.height * j) / 16;
					if (path.isPointInFill(new DOMPoint(x, y))) pts.push([x, y]);
				}
				const cx = pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1);
				const cy = pts.reduce((s, p) => s + p[1], 0) / (pts.length || 1);
				return pts.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy)).filter((_, k) => k % 4 === 0).slice(0, 12);
			}),
		);
		for (let i = 0; i < inside.length; i++) {
			let state = -1;
			// A label over the sector's middle can hide it from the pointer: points further out are tried until one answers.
			for (const [x, y] of inside[i]!) {
				state = Math.max(state, await at(x, y));
				if (state >= 0 && samples.filter((s) => s.state === state).length >= 2) break;
			}
			if (state >= 0) segments.push([i, i, state]);
			await page.mouse.move(box.x - 5, box.y - 5);
		}
	} else if (kind.mode === 'r') {
		mode = 'r';
		center = kind.center;
		const [cx, cy] = center;
		const reach = Math.max(cy, box.height - cy, cx, box.width - cx);
		const dir = [[0, -1], [0, 1], [-1, 0], [1, 0]][[cy, box.height - cy, cx, box.width - cx].indexOf(reach)]!;
		const sweep: { at: number; state: number }[] = [];
		const probe = (r: number) => at(cx + dir[0]! * r, cy + dir[1]! * r);
		for (let r = 0; r < reach; r += 1) sweep.push({ at: r, state: await probe(r) });
		segments = await sharpen(sweep, probe, 1);
	} else if (kind.mode === 'a') {
		mode = 'a';
		center = kind.center ?? [vx + vw / 2, vy + vh / 2];
		const [cx, cy] = center;
		const radius = Math.min(vw, vh) / 2;
		const sweep: { at: number; state: number }[] = [];
		const probe = (a: number) => at(cx + Math.cos((a * Math.PI) / 180) * radius * 0.5, cy - Math.sin((a * Math.PI) / 180) * radius * 0.5);
		for (let a = 0; a < 360; a += 1) sweep.push({ at: a, state: await probe(a) });
		segments = await sharpen(sweep, probe, 1);
		const first = segments[0];
		if (first) {
			const a = (((first[0] + first[1]) / 2) * Math.PI) / 180;
			const ray: { at: number; state: number }[] = [];
			for (let r = 0; r <= radius * 1.3; r += 1) ray.push({ at: r, state: await at(cx + Math.cos(a) * r, cy - Math.sin(a) * r) });
			const hits = ray.filter((s) => s.state >= 0);
			if (hits.length) span = [hits[0]!.at - 0.5, hits.at(-1)!.at + 0.5];
		}
	} else {
		const step = 2;
		const along = async (axis: 'x' | 'y', cross: number) => {
			const sweep: { at: number; state: number }[] = [];
			const length = axis === 'x' ? box.width : box.height;
			const probe = (p: number) => (axis === 'x' ? at(p, cross) : at(cross, p));
			for (let p = 0; p <= length; p += step) sweep.push({ at: p, state: await probe(p) });
			return sharpen(sweep, probe, step);
		};

		const byX = await along('x', vy + vh / 2);
		const byY = new Set(byX.map((s) => s[2])).size > 1 ? [] : await along('y', vx + vw / 2);
		mode = byY.length > byX.length ? 'y' : 'x';
		segments = mode === 'x' ? byX : byY;
		const first = segments[0];
		if (first) {
			const mid = (first[0] + first[1]) / 2;
			const cross = await along(mode === 'x' ? 'y' : 'x', mid);
			const hits = cross.filter((s) => s[2] === first[2]);
			if (hits.length) span = [hits[0]![0], hits.at(-1)![1]];
		}
	}
	await page.mouse.move(box.x - 5, box.y - 5);
	await page.waitForTimeout(50);
	// Whether the tooltip follows the pointer on each axis: a second pointer position in the same state moves it.
	let followX = false;
	let followY = false;
	for (const s of [...samples]) {
		if (followX && followY) break;
		const again = await at(s.px + 3, s.py + 3);
		const last = samples.at(-1)!;
		if (again !== s.state || last.state !== s.state) continue;
		if (last.x !== s.x) followX = true;
		if (last.y !== s.y) followY = true;
		if (samples.indexOf(s) > 40) break;
	}
	await page.mouse.move(box.x - 5, box.y - 5);
	await page.waitForTimeout(50);
	const placed = states.list.map((_, k) => samples.find((s) => s.state === k));
	// The arrow keys, once the chart has focus (recharts' accessibilityLayer).
	let keys: [number, number, number][] | undefined;
	if ((await surface.getAttribute('tabindex')) === '0') {
		keys = [];
		await page.mouse.move(1, 1);
		for (let i = 0; i < 20 && (await wrapper.evaluate((root) => window.__mmc!.read(root).visible)); i++) await page.waitForTimeout(50);
		await surface.evaluate((svg) => (svg as SVGElement).focus());
		await page.waitForTimeout(60);
		// Focus shows nothing once Escape dismissed the tooltip; the first arrow shows the first point again.
		if (!(await wrapper.evaluate((root) => window.__mmc!.read(root).visible))) {
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(60);
			// recharts keeps the last point the keys reached: back to the first.
			let last = '';
			for (let i = 0; i <= states.list.length; i++) {
				const now = (await wrapper.evaluate((root) => window.__mmc!.read(root))).tooltip;
				if (now === last) break;
				last = now;
				await page.keyboard.press('ArrowLeft');
				await page.waitForTimeout(30);
			}
		}
		for (let i = 0; i <= states.list.length + 1; i++) {
			const seen = await wrapper.evaluate((root) => window.__mmc!.read(root));
			const state = states.add(seen);
			if (state < 0 || seen.x === null || seen.y === null) break;
			const entry: [number, number, number] = [state, seen.x, seen.y];
			if (keys.length && keys.at(-1)![0] === state) break;
			keys.push(entry);
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(40);
		}
		await page.keyboard.press('Escape');
		await surface.evaluate((svg) => (svg as SVGElement).blur());
		if (!keys.length) keys = undefined;
	}
	const finished: ChartState[] = states.list.map((s, k) => {
		const p = placed[k];
		const key = keys?.find((e) => e[0] === k);
		return { ...s, x: followX ? null : (p?.x ?? key?.[1] ?? 0), y: followY ? null : (p?.y ?? key?.[2] ?? 0) };
	});
	return { mode, ...(center ? { center } : {}), segments, ...(span ? { span } : {}), states: finished, points: states.points, ...(keys ? { keys } : {}), elements };
}

const CONTROLS = '[data-slot="card-header"] button, [data-slot="card-action"] button, [data-slot="toggle-group-item"], [data-slot="select-trigger"]';

/**
 * Drives every recharts chart on the old page: the pointer across its plot (each shape, for a pie), the arrow keys once
 * it has focus, and each control in its card that changes what it shows, recording every state it draws: the
 * tooltip's content and placement, the nodes recharts adds to the SVG and the attributes it changes, and for each
 * control the SVG it draws instead.
 */
async function captureAt(browser: Browser, origin: string, route: string, viewport: Viewport): Promise<ChartFacts[]> {
	const { context, page } = await openPage(browser, defaultEnv(origin), viewport);
	const charts: ChartFacts[] = [];
	const load = async () => {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(2200);
		await page.evaluate(installProbe);
		await page.evaluate(`window.markGeometry = ${markGeometry.toString()}; window.chartModel = ${chartModel.toString()}`);
	};
	try {
		await load();
		const count = await page.locator('.recharts-wrapper').count();
		for (let i = 0; i < count; i++) {
			const wrapper = page.locator('.recharts-wrapper').nth(i);
			if (!(await wrapper.isVisible().catch(() => false))) continue;
			await wrapper.scrollIntoViewIfNeeded().catch(() => {});
			await page.mouse.move(1, 1);
			await page.waitForTimeout(300);
			const found = await wrapper.evaluate((root, controls) => {
				const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				const nthOf = (el: Element) => {
					let nth = 0;
					for (const e of document.body.querySelectorAll('*')) {
						if (e === el) break;
						if (sigOf(e) === sigOf(el)) nth++;
					}
					return nth;
				};
				const svg = root.querySelector('svg.recharts-surface')!;
				const clip = svg.querySelector('defs clipPath rect');
				const w = Number(svg.getAttribute('width'));
				const h = Number(svg.getAttribute('height'));
				const view: [number, number, number, number] = clip ? [Number(clip.getAttribute('x')), Number(clip.getAttribute('y')), Number(clip.getAttribute('width')), Number(clip.getAttribute('height'))] : [5, 5, w - 10, h - 10];
				const card = root.closest('[data-slot="card"]');
				const visible = (el: Element) => {
					const r = el.getBoundingClientRect();
					return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
				};
				const drivers = card ? [...card.querySelectorAll(controls)].filter((el) => visible(el) && !root.contains(el)).map((el) => ({ sig: sigOf(el), nth: nthOf(el), select: el.getAttribute('data-slot') === 'select-trigger', active: el.hasAttribute('data-active') })) : [];
				return { sig: sigOf(root), nth: nthOf(root), w, h, view, drivers };
			}, CONTROLS);
			const svgNow = () =>
				wrapper.evaluate((root) => {
					const clean = (el: Element | null) => (el ? el.outerHTML.replace(/ data-mm-old=""/g, '') : '');
					const svg = root.querySelector('svg.recharts-surface');
					const geo = svg ? markGeometry(svg) : [];
					const out = { svg: clean(svg), legend: clean(root.querySelector('.recharts-legend-wrapper')), model: svg ? chartModel(svg) : undefined };
					for (const el of geo) el.removeAttribute('data-mm-geo');
					return out;
				});
			const variants: ChartVariant[] = [];
			const seen = new Map<string, number>();
			const rest = await svgNow();
			seen.set(rest.svg, 0);
			variants.push({ svg: rest.svg, ...(rest.legend ? { legend: rest.legend } : {}), ...(rest.model ? { model: rest.model } : {}), ...(await captureVariant(page, wrapper, found.view)) });
			const drivers: ChartDriver[] = [];
			const settle = () => page.waitForTimeout(2100);
			const record = async (driver: Omit<ChartDriver, 'variant'>) => {
				await page.mouse.move(1, 1);
				await settle();
				const now = await svgNow();
				let variant = seen.get(now.svg);
				if (variant === undefined) {
					variant = variants.length;
					seen.set(now.svg, variant);
					variants.push({ svg: now.svg, ...(now.legend ? { legend: now.legend } : {}), ...(now.model ? { model: now.model } : {}), ...(await captureVariant(page, wrapper, found.view)) });
				}
				drivers.push({ ...driver, variant });
			};
			const byNth = (sig: string, nth: number) =>
				page.locator('body *').evaluateAll(
					(els, [s, n]) => {
						const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
						const hit = els.filter((e) => sigOf(e) === s)[n as number];
						hit?.setAttribute('data-mm-driver', '');
						return !!hit;
					},
					[sig, nth] as const,
				);
			for (const d of found.drivers) {
				await page.evaluate(() => document.querySelectorAll('[data-mm-driver]').forEach((e) => e.removeAttribute('data-mm-driver')));
				if (!(await byNth(d.sig, d.nth))) continue;
				const control = page.locator('[data-mm-driver]').first();
				if (!d.select) {
					await control.click({ timeout: 3000 }).catch(() => {});
					await record({ sig: d.sig, nth: d.nth, kind: 'press', ...(d.active ? { active: true } : {}) });
					continue;
				}
				await control.click({ timeout: 3000 }).catch(() => {});
				await page.waitForTimeout(400);
				const labels = (await page.locator('[role="option"]').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim());
				await page.keyboard.press('Escape');
				for (const label of labels) {
					await page.waitForTimeout(300);
					await control.click({ timeout: 3000 }).catch(() => {});
					await page.waitForTimeout(400);
					await page.locator('[role="option"]').filter({ hasText: label }).first().click({ timeout: 3000 }).catch(() => {});
					await record({ sig: d.sig, nth: d.nth, kind: 'choose', label });
				}
			}
			if (found.drivers.length) await load();
			charts.push({ sig: found.sig, nth: found.nth, index: i, width: found.w, height: found.h, view: found.view, variants, drivers, widths: [] });
		}
	} finally {
		await context.close().catch(() => {});
	}
	return charts;
}

/** The widths a chart is captured at besides the desktop page: the frames the old site shows it in (a phone, a 1280 and a 1440 screen's grid column, a 1440 screen's full row) and a 1440 screen's page. */
export const CHART_WIDTHS: readonly number[] = [342, 373, 419, 1336, 1440];

/**
 * Every recharts chart on the old page, on the desktop page and at each of CHART_WIDTHS: recharts lays a chart out
 * again for its container's width, so each width the old site shows it at is drawn as the old page drew it there.
 */
export async function captureCharts(browser: Browser, origin: string, route: string, dir: string): Promise<{ readonly route: string; readonly charts: readonly ChartFacts[] }> {
	const file = join(dir, `${createHash('sha256').update(`charts4:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; charts: ChartFacts[] }, () => undefined);
	// A capture from before the update animation (a chart with controls and no lag) or the layout model was read is taken again.
	const stale = (c: ChartFacts) => (c.drivers.length && c.lag === undefined) || [c.variants, ...c.widths.map((w) => w.variants)].flat().some((v) => v.svg && !v.model);
	const known = cached?.route === route && !cached.charts.some(stale) ? cached.charts : undefined;
	const have = new Set(known?.flatMap((c) => c.widths.map((w) => w.viewport)) ?? []);
	const missing = known && !known.length ? [] : CHART_WIDTHS.filter((w) => !have.has(w));
	if (known && !missing.length) return { route, charts: known };
	const charts = known ?? (await captureAt(browser, origin, route, VIEWPORTS[0]!));
	for (const width of missing) {
		const other = await captureAt(browser, origin, route, { name: `w${width}`, width, height: 900, isMobile: false });
		for (const chart of charts) {
			const same = other.find((o) => o.index === chart.index);
			if (same) (chart.widths as ChartWidth[]).push({ viewport: width, width: same.width, height: same.height, view: same.view, variants: same.variants, drivers: same.drivers });
		}
	}
	if (charts.some((c) => c.drivers.length && c.lag === undefined)) await measureLags(browser, origin, route, charts);
	const capture = { route, charts };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/**
 * Uses each chart's controls on the old page with motion allowed (the captures run with reduced motion, where recharts
 * does not animate), filming its marks frame by frame from the input: the chart's lag is the one most of them took.
 */
async function measureLags(browser: Browser, origin: string, route: string, charts: ChartFacts[]): Promise<void> {
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	try {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		for (const chart of charts) {
			if (!chart.drivers.length) continue;
			const lags: number[] = [];
			for (const d of chart.drivers) {
				await loadPage(page, new URL(route, origin).href);
				await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
				// The entry animation ends first.
				await page.waitForTimeout(2500);
				const found = await page.locator('body *').evaluateAll(
					(els, [s, n]) => {
						const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
						const hit = els.filter((e) => sigOf(e) === s)[n as number];
						hit?.setAttribute('data-mm-driver', '');
						return !!hit;
					},
					[d.sig, d.nth] as const,
				);
				if (!found) continue;
				const control = page.locator('[data-mm-driver]').first();
				if (d.kind === 'choose') {
					await control.click({ timeout: 3000 }).catch(() => {});
					await page.waitForTimeout(400);
				}
				await page.evaluate((index) => {
					const root = document.querySelectorAll('.recharts-wrapper')[index];
					const film: string[] = [];
					const read = () => [...(root?.querySelectorAll('svg.recharts-surface path') ?? [])].map((p) => p.getAttribute('d')).join('|');
					(window as unknown as { __mmFilm: string[] }).__mmFilm = film;
					let started = false;
					document.addEventListener('pointerup', () => ((started = true), film.push(read())), { capture: true, once: true });
					const tick = () => {
						if (started) film.push(read());
						if (film.length < 40) requestAnimationFrame(tick);
					};
					requestAnimationFrame(tick);
				}, chart.index);
				if (d.kind === 'choose') await page.locator('[role="option"]').filter({ hasText: d.label ?? '' }).first().click({ timeout: 3000 }).catch(() => {});
				else await control.click({ timeout: 3000 }).catch(() => {});
				await page.waitForTimeout(1000);
				const lag = animationLag(await page.evaluate(() => (window as unknown as { __mmFilm: string[] }).__mmFilm));
				if (lag !== undefined) lags.push(lag);
			}
			const counts = new Map<number, number>();
			for (const lag of lags) counts.set(lag, (counts.get(lag) ?? 0) + 1);
			const lag = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
			(chart as { lag?: number }).lag = lag ?? 0;
		}
	} finally {
		await context.close().catch(() => {});
	}
}

const HOLE = (k: number) => `MMHOLE${k}MMHOLE`;

const svgTree = (html: string): Tree => childrenOf(parseFragment(`<svg>${html}</svg>`) as unknown as Tree).find(isElement)!;

/**
 * One tsrx template for markup the old page drew alike for every state but for some text and attribute values: those
 * become `{table[state][k]}`. Undefined when the states differ in structure.
 */
export function template(htmls: readonly string[], table: string, svg = false): { readonly markup: string; readonly rows: string[][] } | undefined {
	// SVG content is parsed inside an <svg>, so its elements and attribute names keep SVG's case.
	const trees = htmls.map((h) => (svg ? svgTree(h) : (parseFragment(h) as unknown as Tree)));
	const rows: string[][] = htmls.map(() => []);
	const holes = new Map<Tree, Record<string, string>>();
	let k = 0;
	const same = (nodes: readonly Tree[]): boolean => {
		const kids = nodes.map((n) => childrenOf(n));
		if (kids.some((c) => c.length !== kids[0]!.length)) return false;
		for (let i = 0; i < kids[0]!.length; i++) {
			const column = kids.map((c) => c[i]!);
			const head = column[0]!;
			if (head.nodeName === '#text') {
				if (column.some((n) => n.nodeName !== '#text')) return false;
				const values = column.map((n) => (n as unknown as { value: string }).value);
				if (values.some((v) => v !== values[0])) {
					values.forEach((v, s) => rows[s]!.push(v));
					(head as unknown as { value: string }).value = HOLE(k++);
				}
				continue;
			}
			if (!isElement(head)) continue;
			const els = column as Tree[];
			if (els.some((e) => !isElement(e) || e.tagName !== head.tagName)) return false;
			const names = head.attrs.map((a) => a.name);
			if (els.some((e) => e.attrs.length !== names.length || e.attrs.some((a, j) => a.name !== names[j]))) return false;
			for (const name of names) {
				const values = els.map((e) => attr(e, name) ?? '');
				if (values.every((v) => v === values[0])) continue;
				values.forEach((v, s) => rows[s]!.push(v));
				holes.set(head, { ...holes.get(head), [name]: `${table}[${k++}]` });
			}
			if (!same(els)) return false;
		}
		return true;
	};
	if (!same(trees)) return undefined;
	const markup = emitChildren(trees[0]! as never, { bind: (el) => (holes.has(el) ? { expressions: holes.get(el) } : undefined) }).replace(/MMHOLE(\d+)MMHOLE/g, (_, n: string) => `{${table}[${n}]}`);
	return { markup, rows };
}

const num = (v: string | undefined) => (v === undefined || v === '' ? NaN : Number(v));
const round = (n: number) => Math.round(n * 1000) / 1000;
const styleWith = (el: Tree, css: string) => setAttr(el, 'style', `${attr(el, 'style') ? `${attr(el, 'style')!.replace(/;?\s*$/, '; ')}` : ''}${css}`);
const classes = (el: Tree) => (attr(el, 'class') ?? '').split(/\s+/);

/** A sector's start (screen degrees clockwise from 12 o'clock), its sweep, and the way it turns, from its outer arc. */
function sectorAngles(el: Tree): { start: number; width: number; dir: 1 | -1; cx: number; cy: number } | undefined {
	const cx = num(attr(el, 'cx'));
	const cy = num(attr(el, 'cy'));
	if (Number.isNaN(cx) || Number.isNaN(cy)) return undefined;
	const tokens = (attr(el, 'd') ?? '').match(/[MLAZ]|-?[\d.]+(?:e-?\d+)?/gi) ?? [];
	let at: [number, number] = [cx, cy];
	let outer: { r: number; large: boolean; sweep: boolean; from: [number, number]; to: [number, number] } | undefined;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!.toUpperCase();
		if (t === 'M' || t === 'L') at = [Number(tokens[++i]), Number(tokens[++i])];
		else if (t === 'A') {
			const [r, , , large, sweep, x, y] = tokens.slice(i + 1, i + 8).map(Number) as number[];
			const to: [number, number] = [x!, y!];
			if (!outer || r! > outer.r) outer = { r: r!, large: large === 1, sweep: sweep === 1, from: at, to };
			at = to;
			i += 7;
		}
	}
	if (!outer) return undefined;
	const screen = ([x, y]: [number, number]) => ((Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI + 360) % 360;
	const start = screen(outer.from);
	const end = screen(outer.to);
	const dir = outer.sweep ? 1 : -1;
	let width = ((dir === 1 ? end - start : start - end) + 360) % 360;
	if (outer.large && width < 180) width = 360 - width;
	if (width < 0.01 && outer.large) width = 360;
	return { start, width, dir, cx, cy };
}

/**
 * recharts' entry animation as CSS on the chart's own nodes: the values each one animates from, as custom properties
 * the shared stylesheet (MOTION_CSS) reads. Areas wipe in, bars grow from the axis, lines draw, radars grow from the
 * centre, pie and radial sectors sweep open; labels and dots appear when it ends.
 */
export function motion(svg: Tree, view: readonly [number, number, number, number]): void {
	const els = [...walk(svg)];
	const has = (name: string) => els.some((e) => classes(e).includes(name));
	// recharts shows labels once its marks finish: 400 ms for bars, 1.5 s for the rest, after a pie's 400 ms delay.
	const after = has('recharts-pie') ? 1900 : has('recharts-area') || has('recharts-line') || has('recharts-radar') || has('recharts-radial-bar-sector') ? 1500 : has('recharts-bar-rectangles') ? 400 : 0;
	if (after) styleWith(svg, `--mm-after: ${after}ms`);
	const bars = els.filter((e) => classes(e).includes('recharts-rectangle') && e.tagName === 'path');
	if (bars.length) {
		const mode = (values: number[]) => {
			const counts = new Map<number, number>();
			for (const v of values.filter((x) => !Number.isNaN(x))) counts.set(round(v), (counts.get(round(v)) ?? 0) + 1);
			return [...counts].sort((a, b) => b[1] - a[1])[0] ?? [NaN, 0];
		};
		const base = mode(bars.map((b) => num(attr(b, 'y')) + num(attr(b, 'height'))));
		const side = mode(bars.map((b) => num(attr(b, 'x'))));
		const vertical = side[1] > base[1];
		for (const g of els.filter((e) => classes(e).includes('recharts-bar-rectangles'))) styleWith(g, vertical ? `--mm-o: ${side[0]}px 0px; --mm-s: scaleX(0)` : `--mm-o: 0px ${base[0]}px; --mm-s: scaleY(0)`);
	}
	// A line draws over its own length, which recharts measures in the browser: pathLength makes it 1.
	for (const curve of els.filter((e) => classes(e).includes('recharts-line-curve'))) setAttr(curve, 'pathLength', '1');
	for (const radar of els.filter((e) => classes(e).includes('recharts-radar-polygon'))) styleWith(radar, `--mm-c: ${round(view[0] + view[2] / 2)}px ${round(view[1] + view[3] / 2)}px`);
	const sweep = (sectors: readonly Tree[], cumulative: boolean) => {
		const angles = sectors.map(sectorAngles);
		const first = angles.find(Boolean);
		if (!first) return;
		sectors.forEach((sector, i) => {
			const a = angles[i];
			if (!a) return;
			const offset = cumulative ? ((first.dir === 1 ? a.start - first.start : first.start - a.start) + 360) % 360 : 0;
			styleWith(sector, `--mm-c: ${a.cx}px ${a.cy}px; --mm-a: ${round(a.start)}; --mm-w: ${round(a.width)}; --mm-k: ${a.dir === 1 ? 0 : 1}; --mm-o: ${round(first.dir * offset)}`);
		});
	};
	for (const pie of els.filter((e) => classes(e).includes('recharts-pie'))) sweep([...walk(pie)].filter((e) => e.tagName === 'path' && classes(e).includes('recharts-sector')), true);
	sweep(
		els.filter((e) => classes(e).includes('recharts-radial-bar-sector')),
		false,
	);
}

/** The stylesheet the animated charts share, cached once for every page and frame that shows one. */
export const MOTION_CSS = `@property --mm-t { syntax: '<number>'; inherits: false; initial-value: 1; }
@keyframes mm-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes mm-grow { from { transform: var(--mm-s); } to { transform: none; } }
@keyframes mm-draw { from { stroke-dasharray: 0 1; } to { stroke-dasharray: 1 0; } }
@keyframes mm-scale { from { transform: scale(0); } to { transform: none; } }
@keyframes mm-sweep { from { --mm-t: 0; } to { --mm-t: 1; } }
@keyframes mm-after { from { opacity: 0; } to { opacity: 0; } }
@media (prefers-reduced-motion: no-preference) {
[data-mm-chart] .recharts-area { animation: mm-wipe 1500ms ease backwards; }
[data-mm-chart] .recharts-bar-rectangles { transform-box: view-box; transform-origin: var(--mm-o); animation: mm-grow 400ms ease backwards; }
[data-mm-chart] .recharts-line-curve { animation: mm-draw 1500ms ease backwards; }
[data-mm-chart] .recharts-radar-polygon { transform-box: view-box; transform-origin: var(--mm-c); animation: mm-scale 1500ms ease backwards; }
[data-mm-chart] .recharts-label-list, [data-mm-chart] .recharts-pie-labels { animation: mm-after var(--mm-after, 0ms) backwards; }
[data-mm-chart] .recharts-pie .recharts-sector, [data-mm-chart] .recharts-radial-bar-sector {
	transform-box: view-box; transform-origin: var(--mm-c); transform: rotate(calc(-1deg * var(--mm-o, 0) * (1 - var(--mm-t))));
	mask-image: conic-gradient(from calc((var(--mm-a) - var(--mm-k) * var(--mm-t) * var(--mm-w)) * 1deg) at var(--mm-c), #000 calc((var(--mm-t) * var(--mm-w) + max(0, var(--mm-t) - 0.99999) * 36000000) * 1deg), transparent 0);
	mask-origin: view-box; mask-clip: no-clip; mask-repeat: no-repeat;
}
[data-mm-chart] .recharts-pie .recharts-sector { animation: mm-sweep 1500ms ease 400ms backwards; }
[data-mm-chart] .recharts-radial-bar-sector { animation: mm-sweep 1500ms ease backwards; }
[data-mm-chart][data-mm-moved] * { animation: none !important; }
}
`;


/** Container widths in 40 px steps from 280 px: each SVG a chart has is shown in the steps nearest the width it was drawn at. */
const BUCKETS = 34;
const bucketRange = (b: number): [number, number] => [b === 0 ? 0 : 280 + 40 * (b - 1), b === BUCKETS - 1 ? Infinity : 280 + 40 * b];

/** Hides each SVG outside the container widths it was drawn for (the chart's container is an inline-size container). */
export const WIDTH_CSS = Array.from({ length: BUCKETS }, (_, b) => {
	const [lo, hi] = bucketRange(b);
	const query = [lo > 0 ? `(min-width: ${lo}px)` : '', Number.isFinite(hi) ? `(max-width: ${hi - 0.02}px)` : ''].filter(Boolean).join(' and ');
	return `@container ${query} { [data-mm-b]:not([data-mm-b~="${b}"]) { display: none !important; } }`;
}).join('\n');

/** The stylesheet every chart page links: the entry animation and the widths. */
export const CHART_CSS = `${MOTION_CSS}${WIDTH_CSS}\n`;
export const MOTION_FILE = `/_converted/styles/recharts-${createHash('sha256').update(CHART_CSS).digest('hex').slice(0, 12)}.css`;

const labelOf = (d: ChartDriver) => d.label ?? d.sig.split('|')[2] ?? '';

/**
 * recharts charts on Markless state: the active point's index in a state() per chart, set by the recharts part from
 * where the pointer is (or the arrow keys); the tooltip, the nodes recharts adds to the SVG and the attributes it
 * changes are one template each over a table of the old page's values per point. Each width the old site shows the
 * chart at has the SVG the old page drew there, shown by a container query; a card whose controls change the chart
 * has a state() for which SVG it shows, set by those controls. The part places the tooltip as recharts does; the
 * shared stylesheet plays recharts' entry animation.
 */
export class ChartPlan {
	private readonly bindings = new Map<Tree, Binding>();
	private n = 0;

	bind(el: Tree): Binding | undefined {
		return this.bindings.get(el);
	}

	add(root: Tree, charts: readonly ChartFacts[], locate: (sig: string, nth: number) => Tree | undefined, emit: (html: string) => string): number {
		let placed = 0;
		let linked = false;
		// The chart's place among the page's charts finds it where its signature's count is thrown off by markup the page lost or gained.
		const scope = (root.parentNode as Tree | null) ?? root;
		const wrappers = [...walk(scope)].filter((e) => classes(e).includes('recharts-wrapper'));
		const text = (el: Tree) => textContent(el).trim().replace(/\s+/g, ' ').slice(0, 60);
		for (const chart of charts) {
			const at = wrappers[chart.index];
			const wrapper = at && text(at) === chart.sig.split('|').slice(2).join('|') ? at : locate(chart.sig, chart.nth);
			if (!wrapper || this.bindings.has(wrapper)) continue;
			const kids = childrenOf(wrapper).filter(isElement);
			const svg = kids.find((e) => e.tagName === 'svg');
			const tip = kids.find((e) => classes(e).includes('recharts-tooltip-wrapper'));
			const legend = kids.find((e) => classes(e).includes('recharts-legend-wrapper'));
			if (!svg) continue;
			const name = `chart${this.n++}`;
			const v = `${name}v`;
			const many = chart.variants.length > 1;
			const declare = [`let ${name} = state(-1);`, ...(many ? [`let ${v} = state(0);`] : [])];
			const entries: ChartWidth[] = [{ viewport: 0, width: chart.width, height: chart.height, view: chart.view, variants: chart.variants, drivers: chart.drivers }, ...chart.widths];
			// Each width's variants by the reference's: the rest is 0, a control's state is the one the same control (by its text) shows.
			const refOf = (entry: ChartWidth, j: number): number => {
				if (entry === entries[0]) return j;
				for (const driver of entry.drivers.filter((d) => d.variant === j)) {
					const k = chart.drivers.find((d) => labelOf(d) === labelOf(driver))?.variant;
					if (k !== undefined) return k;
				}
				return j === 0 ? 0 : -1;
			};
			const buckets = new Map<string, number[]>();
			const tooltips: string[] = [];
			const svgs: string[] = [];
			chart.variants.forEach((reference, k) => {
				const shown = entries.map((entry) => ({ entry, j: entry.variants.findIndex((_, j) => refOf(entry, j) === k) })).filter((x) => x.j >= 0);
				for (let b = 0; b < BUCKETS; b++) {
					const [lo, hi] = bucketRange(b);
					const mid = Number.isFinite(hi) ? (lo + hi) / 2 : lo + 20;
					const near = shown.reduce((best, x) => (Math.abs(x.entry.width - mid) < Math.abs(best.entry.width - mid) ? x : best));
					const key = `${entries.indexOf(near.entry)}/${k}`;
					(buckets.get(key) ?? buckets.set(key, []).get(key)!).push(b);
				}
				const on = many ? `${v} === ${k} && ` : '';
				const arms = (htmls: readonly string[], table: string, inSvg = false): { markup: string; declare: string[] } => {
					const t = template(htmls, `${table}[${name}]`, inSvg);
					if (t) return { markup: `@if (${on}${name} >= 0) { <>${t.markup}</> }`, declare: [`const ${table} = ${JSON.stringify(t.rows)};`] };
					return { markup: htmls.map((h, st) => (h ? `@if (${on}${name} === ${st}) { <>${inSvg ? emitChildren(svgTree(h) as never) : emit(h)}</> }` : '')).join(''), declare: [] };
				};
				if (tip && reference.states.length) {
					const t = arms(reference.states.map((st) => st.tooltip), `${name}${many ? `v${k}` : ''}t`);
					declare.push(...t.declare);
					tooltips.push(t.markup);
				}
				for (const { entry, j } of shown) {
					const e = entries.indexOf(entry);
					const own = buckets.get(`${e}/${k}`);
					if (!own?.length) continue;
					const variant = e === 0 ? reference : align(entry.variants[j]!, reference);
					const tree: Tree | undefined = e === 0 && k === 0 ? svg : parsedSvg(entry.variants[j]!.svg ?? '');
					if (!tree) continue;
					if (tree === svg) copyGeometry(parsedSvg(reference.svg ?? ''), tree);
					const prefix = `${name}w${e}v${k}`;
					const local = new Map<Tree, Binding>();
					this.states(tree, variant, prefix, name, on, arms, local, declare);
					motion(tree, entry.view);
					const style = attr(tree, 'style');
					const extra = [`data-mm-b="${own.join(' ')}"`, `data-mm-facts={${lit(JSON.stringify({ ...this.factsOf(entry, variant, tree), ...(many && chart.lag ? { z: chart.lag } : {}) }))}}`];
					const hide = `${v} === ${k} ? ${lit(style ?? '')} : ${lit(`${style ? `${style.replace(/;?\s*$/, ';')} ` : ''}display: none;`)}`;
					if (many && style === undefined) extra.unshift(`style={${hide}}`);
					const rootBinding: Binding = { ...local.get(tree), extra: [...(local.get(tree)?.extra ?? []), ...extra], ...(many && style !== undefined ? { expressions: { ...local.get(tree)?.expressions, style: hide } } : {}) };
					local.set(tree, rootBinding);
					const declarations: string[] = [];
					svgs.push(emitElement(tree, { bind: (el) => local.get(el), declarations }));
					declare.push(...declarations);
				}
			});
			this.bindings.set(svg, { declare, replace: svgs.length > 1 ? `<>${svgs.join('')}</>` : svgs.join('') });
			if (legend) {
				const legends = entries.flatMap((entry, e) => entry.variants.map((variant, j) => ({ e, k: refOf(entry, j), html: variant.legend }))).filter((x) => x.k >= 0 && x.html && buckets.get(`${x.e}/${x.k}`)?.length);
				const markup = legends.map((x) => this.legendMarkup(x.html!, buckets.get(`${x.e}/${x.k}`)!, many ? `${v} === ${x.k}` : undefined));
				if (legends.length) this.bindings.set(legend, { declare, replace: markup.length > 1 ? `<>${markup.join('')}</>` : markup.join('') });
			}
			// The chart fills its container, which its SVGs are scaled to and which picks among them by width.
			const fluid = (el: Tree, css: string) => setAttr(el, 'style', css);
			const parent = wrapper.parentNode as Tree;
			if (isElement(parent) && /width:\s*0/.test(attr(parent, 'style') ?? '')) fluid(parent, 'width:100%;height:100%;container-type:inline-size');
			if (attr(wrapper, 'style')) fluid(wrapper, attr(wrapper, 'style')!.replace(/width:\s*[\d.]+px/, 'width: 100%').replace(/height:\s*[\d.]+px/, 'height: 100%'));
			for (const name of ['width', 'height']) wrapper.attrs = wrapper.attrs.filter((a) => a.name !== name);
			const extra = ['data-mm-chart="1"', `onMmchart={(event) => (${name} = (event as CustomEvent<number>).detail)}`, 'onVisible={() => mount("data-mm-chart")}'];
			if (!linked) {
				linked = true;
				const link = { nodeName: 'link', tagName: 'link', attrs: [{ name: 'rel', value: 'stylesheet' }, { name: 'href', value: MOTION_FILE }], namespaceURI: wrapper.namespaceURI, childNodes: [], parentNode: parent } as unknown as Tree;
				const holder = isElement(parent) && /container-type/.test(attr(parent, 'style') ?? '') ? (parent.parentNode as Tree) : parent;
				const before = holder === parent ? wrapper : parent;
				holder.childNodes.splice(holder.childNodes.indexOf(before as never), 0, link as never);
			}
			this.bindings.set(wrapper, { declare, extra });
			if (tip && tooltips.length) this.bindings.set(tip, { declare, children: tooltips.join('') });
			if (many) this.drive(chart, wrapper, name, v, locate, declare);
			placed++;
		}
		return placed;
	}

	/** The bindings that draw a variant's states into its SVG: the nodes each point adds and the attributes it changes. */
	private states(own: Tree, variant: ChartVariant, prefix: string, name: string, on: string, arms: (htmls: readonly string[], table: string, inSvg?: boolean) => { markup: string; declare: string[] }, local: Map<Tree, Binding>, declare: string[]): void {
		if ([...walk(own)].length - 1 !== variant.elements) return;
		let p = 0;
		for (const [at, point] of Object.entries(variant.points)) {
			let parent: Tree | undefined = own;
			for (const index of point.path) parent = parent && childrenOf(parent).filter(isElement)[index];
			if (!parent) continue;
			const a = arms(variant.states.map((s) => s.added.filter((x) => x.at === at).map((x) => x.html).join('')), `${prefix}a${p++}`, true);
			declare.push(...a.declare);
			const before = point.before >= 0 ? (childrenOf(parent).filter(isElement)[point.before] ?? null) : null;
			const prev = local.get(parent);
			local.set(parent, { ...prev, inserts: [...(prev?.inserts ?? []), { before, markup: a.markup }] });
		}
		const changes = new Map<string, { path: readonly number[]; attr: string }>();
		for (const s of variant.states) for (const c of s.changed) changes.set(`${c.path.join('.')}|${c.attr}`, c);
		let c = 0;
		for (const change of changes.values()) {
			let el: Tree | undefined = own;
			for (const index of change.path) el = el && childrenOf(el).filter(isElement)[index];
			if (!el || el === own) continue;
			const atRest = attr(el, change.attr);
			const values = variant.states.map((s) => {
				const hit = s.changed.find((x) => x.attr === change.attr && x.path.join('.') === change.path.join('.'));
				return hit ? hit.value : (atRest ?? null);
			});
			const table = `${prefix}c${c++}`;
			declare.push(`const ${table} = ${JSON.stringify(values)};`);
			const prev = local.get(el);
			const expression = `${on}${name} >= 0 ? (${table}[${name}] ?? undefined) : ${atRest === undefined ? 'undefined' : lit(atRest)}`;
			// An attribute the point adds is written after the copied ones; one it changes, in place of the copy.
			local.set(el, atRest === undefined ? { ...prev, extra: [...(prev?.extra ?? []), `${change.attr}={${expression}}`] } : { ...prev, expressions: { ...prev?.expressions, [change.attr]: expression } });
		}
	}

	private legendMarkup(html: string, buckets: readonly number[], when: string | undefined): string {
		const tree = childrenOf(parseFragment(html) as unknown as Tree).find(isElement);
		if (!tree) return '';
		const style = attr(tree, 'style');
		const extra = [`data-mm-b="${buckets.join(' ')}"`];
		const hide = when && `${when} ? ${lit(style ?? '')} : ${lit(`${style ? `${style.replace(/;?\s*$/, ';')} ` : ''}display: none;`)}`;
		if (hide && style === undefined) extra.unshift(`style={${hide}}`);
		const binding: Binding = { extra, ...(hide && style !== undefined ? { expressions: { style: hide } } : {}) };
		return emitElement(tree, { bind: (el) => (el === tree ? binding : undefined) });
	}

	/** The facts the part reads, compact: the view box, how the pointer picks a state, and where the tooltip goes. */
	private factsOf(entry: ChartWidth, variant: ChartVariant, tree?: Tree): Record<string, unknown> {
		// A polar chart's tooltip is at the pointer's radius on the point's axis (a radar) or at the point's ring on the pointer's angle (radial bars).
		const polar = variant.mode === 'a' || variant.mode === 'r';
		return {
			w: entry.width,
			h: entry.height,
			v: entry.view,
			m: variant.mode,
			...(variant.center ? { c: variant.center } : {}),
			g: variant.segments.map((s) => s.map(round)),
			...(variant.span ? { sp: variant.span.map(round) } : {}),
			p: variant.states.map((s, k) => {
				// recharts fixes the tooltip on the point's axis and follows the pointer on the other (both for a pie's sector, neither for a polar axis); the keys' reading is the settled one.
				const key = variant.keys?.find((e) => e[0] === k);
				const x = key?.[1] ?? s.x;
				const y = key?.[2] ?? s.y;
				return polar ? [null, null] : variant.mode === 'x' ? [x, null] : variant.mode === 'y' ? [null, y] : [x, y];
			}),
			...(polar ? { q: variant.states.map((_, k) => round(snap(variant, axisOf(variant, k), tree))) } : {}),
			...(variant.keys ? { k: variant.keys } : {}),
			...(variant.model?.axes.some((a) => a) ? { a: variant.model.axes } : {}),
			...(variant.model?.bars ? { b: variant.model.bars } : {}),
			...(variant.model?.layout ? { l: variant.model.layout } : {}),
		};
	}

	/** The card's controls set which SVG the chart shows: a press by the control, a choice by the option's text. */
	private drive(chart: ChartFacts, wrapper: Tree, name: string, v: string, locate: (sig: string, nth: number) => Tree | undefined, declare: string[]): void {
		const controls = chart.drivers.map((d) => ({ d, el: locate(d.sig, d.nth) })).filter((x): x is { d: ChartDriver; el: Tree } => x.el !== undefined);
		const chosen: Record<string, number> = {};
		for (const d of [chart.drivers, ...chart.widths.map((w) => w.drivers)].flat()) {
			if (d.kind !== 'choose' || d.label === undefined) continue;
			const k = chart.drivers.find((r) => labelOf(r) === d.label)?.variant;
			if (k !== undefined) chosen[d.label] = k;
		}
		let card: Tree | undefined = wrapper;
		const within = (outer: Tree, el: Tree) => [...walk(outer)].includes(el);
		while (card && !controls.every((c) => within(card!, c.el))) card = card.parentNode as Tree | undefined;
		if (!card || !isElement(card)) return;
		const pressed = new Map<Tree, number>();
		for (const { d, el } of controls) if (d.kind === 'press') pressed.set(el, d.variant);
		for (const [el, k] of pressed) {
			const own: Binding = { extra: [`data-mm-variant="${k}"`] };
			const active = controls.find((c) => c.el === el)?.d.active;
			this.bindings.set(el, active ? { ...own, expressions: { 'data-active': `${v} === ${k} ? "true" : "false"` } } : own);
		}
		// The pointer or focus coming to the card fetches the update animation before a control is used.
		const extra: string[] = ['data-mm-morph=""'];
		if (pressed.size) extra.push(`onClick={(event) => { const k = (event.target as Element).closest('[data-mm-variant]')?.getAttribute('data-mm-variant'); if (k != null && ${v} !== Number(k)) { ${v} = Number(k); ${name} = -1; } }}`);
		if (Object.keys(chosen).length) {
			declare.push(`const ${name}o: Record<string, number> = ${JSON.stringify(chosen)};`);
			extra.push(`onMmchoose={(event) => { const k = ${name}o[(event as CustomEvent<string>).detail]; if (k !== undefined && ${v} !== k) { ${v} = k; ${name} = -1; } }}`);
		}
		const prev = this.bindings.get(card);
		this.bindings.set(card, { ...prev, declare: [...(prev?.declare ?? []), ...declare], extra: [...(prev?.extra ?? []), ...extra] });
	}
}

/** The angle (a radar) or radius (radial bars) of a state's axis: the middle of the range it answers, across 0° for an angle. */
function axisOf(variant: ChartVariant, state: number): number {
	const own = variant.segments.filter((g) => g[2] === state);
	if (!own.length) return 0;
	if (variant.mode === 'a' && own.some((g) => g[0] <= 1) && own.some((g) => g[1] >= 359)) {
		const unwrapped = own.map((g) => (g[0] <= 1 ? [g[0] + 360, g[1] + 360] : [g[0], g[1]]));
		const lo = Math.min(...unwrapped.map((g) => g[0]!));
		const hi = Math.max(...unwrapped.map((g) => g[1]!));
		return ((lo + hi) / 2) % 360;
	}
	return (Math.min(...own.map((g) => g[0])) + Math.max(...own.map((g) => g[1]))) / 2;
}

/**
 * A polar axis as recharts drew it rather than as the sweep's 1 px or 1° steps met it: a radar's angles are 90° less
 * whole shares of the circle, a radial bar's ring is the middle of its sector's radii.
 */
function snap(variant: ChartVariant, value: number, tree: Tree | undefined): number {
	if (variant.mode === 'a') {
		const step = 360 / new Set(variant.segments.map((g) => g[2])).size;
		const k = Math.round((90 - value) / step);
		const exact = (((90 - k * step) % 360) + 360) % 360;
		return Math.abs(((exact - value + 540) % 360) - 180) < 2 ? exact : value;
	}
	if (variant.mode === 'r' && tree) {
		const rings = [...walk(tree)].filter((e) => classes(e).includes('recharts-radial-bar-sector')).map((e) => {
			const all = [...(attr(e, 'd') ?? '').matchAll(/A\s*(-?[\d.]+)/gi)].map((m) => Number(m[1]));
			// A rounded sector's corner arcs are small; its ring is between its outer and inner arcs.
			const radii = all.filter((r) => r > Math.max(...all) * 0.25);
			return radii.length ? (Math.max(...radii) + (radii.length > 1 ? Math.min(...radii) : 0)) / 2 : NaN;
		});
		const near = rings.filter((r) => !Number.isNaN(r)).sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
		return near !== undefined && Math.abs(near - value) < 3 ? near : value;
	}
	return value;
}

/** The page's own SVG takes the marks' `data-mm-geo` from the capture of the same drawing, element for element. */
function copyGeometry(from: Tree | undefined, to: Tree): void {
	if (!from) return;
	const a = [...walk(from)];
	const b = [...walk(to)];
	if (a.length !== b.length) return;
	a.forEach((el, i) => {
		const geo = attr(el, 'data-mm-geo');
		if (geo !== undefined && b[i]!.tagName === el.tagName && attr(b[i]!, 'class') === attr(el, 'class')) setAttr(b[i]!, 'data-mm-geo', geo);
	});
}

/** A captured SVG as a tree, with its own attributes (each width's size and view box). */
function parsedSvg(html: string): Tree | undefined {
	return childrenOf(parseFragment(html) as unknown as Tree).find((n): n is Tree => isElement(n) && n.tagName === 'svg');
}

/** Another width's states in the reference's order (the same point shows the same tooltip at every width). */
function align(variant: ChartVariant, reference: ChartVariant): ChartVariant {
	const index = new Map(reference.states.map((s, k) => [s.tooltip, k]));
	const to = variant.states.map((s) => index.get(s.tooltip) ?? -1);
	const states: ChartState[] = reference.states.map((r) => ({ ...r, added: [], changed: [], x: r.x, y: r.y }));
	variant.states.forEach((s, k) => {
		if (to[k]! >= 0) states[to[k]!] = s;
	});
	return {
		...variant,
		states,
		segments: variant.segments.filter((s) => to[s[2]]! >= 0).map((s) => [s[0], s[1], to[s[2]]!] as const),
		...(variant.keys ? { keys: variant.keys.filter((key) => to[key[0]]! >= 0).map((key) => [to[key[0]]!, key[1], key[2]] as const) } : {}),
	};
}

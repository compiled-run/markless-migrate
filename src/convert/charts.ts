import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import type { Browser, Locator, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, childrenOf, isElement, setAttr, walk, type Element as Tree } from './dom.ts';
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
	/** The SVG and the legend the chart drew for this state of its card's controls (absent for the one shown at rest). */
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

export interface ChartFacts {
	readonly sig: string;
	readonly nth: number;
	readonly width: number;
	readonly height: number;
	/** recharts' view box: the plot area inside the margins, which the tooltip is kept in. */
	readonly view: readonly [number, number, number, number];
	readonly variants: readonly ChartVariant[];
	readonly drivers: readonly ChartDriver[];
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

/** Contiguous runs of one state along a sweep, as [from, to, state]. */
function runs(samples: readonly { readonly at: number; readonly state: number }[], step: number): [number, number, number][] {
	const out: [number, number, number][] = [];
	for (const s of samples) {
		const last = out.at(-1);
		if (s.state < 0) continue;
		if (last && last[2] === s.state && s.at - last[1] <= step + 1e-6) last[1] = s.at;
		else out.push([s.at, s.at, s.state]);
	}
	// A run covers the gap halfway to its neighbours, as the old page's pointer would.
	for (let i = 0; i < out.length; i++) {
		out[i]![0] -= step / 2;
		out[i]![1] += step / 2;
	}
	return out;
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
		if (svg.querySelector('.recharts-radar')) return { mode: 'a' as const };
		return { mode: 'c' as const };
	});
	const states = new States();
	const samples: Sample[] = [];
	const at = async (px: number, py: number): Promise<number> => {
		await page.mouse.move(box.x + px, box.y + py);
		await page.waitForTimeout(16);
		const seen = await wrapper.evaluate((root) => window.__mmc!.read(root));
		const state = states.add(seen);
		if (state >= 0) samples.push({ px, py, state, x: seen.x, y: seen.y });
		return state;
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
				return pts.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy)).slice(0, 3);
			}),
		);
		for (let i = 0; i < inside.length; i++) {
			let state = -1;
			for (const [x, y] of inside[i]!) state = Math.max(state, await at(x, y));
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
		for (let r = 0; r < reach; r += 1) sweep.push({ at: r, state: await at(cx + dir[0]! * r, cy + dir[1]! * r) });
		segments = runs(sweep, 1);
	} else if (kind.mode === 'a') {
		mode = 'a';
		center = [vx + vw / 2, vy + vh / 2];
		const [cx, cy] = center;
		const radius = Math.min(vw, vh) / 2;
		const sweep: { at: number; state: number }[] = [];
		for (let a = 0; a < 360; a += 1) sweep.push({ at: a, state: await at(cx + Math.cos((a * Math.PI) / 180) * radius * 0.5, cy - Math.sin((a * Math.PI) / 180) * radius * 0.5) });
		segments = runs(sweep, 1);
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
			for (let p = 0; p <= length; p += step) sweep.push({ at: p, state: axis === 'x' ? await at(p, cross) : await at(cross, p) });
			return runs(sweep, step);
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
	if (mode !== 'i' && (await surface.getAttribute('tabindex')) === '0') {
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
export async function captureCharts(browser: Browser, origin: string, route: string, dir: string): Promise<{ readonly route: string; readonly charts: readonly ChartFacts[] }> {
	const file = join(dir, `${createHash('sha256').update(`charts2:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; charts: ChartFacts[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const charts: ChartFacts[] = [];
	const load = async () => {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(2200);
		await page.evaluate(installProbe);
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
			const svgNow = () => wrapper.evaluate((root) => {
				const clean = (el: Element | null) => (el ? el.outerHTML.replace(/ data-mm-old=""/g, '') : '');
				return { svg: clean(root.querySelector('svg.recharts-surface')), legend: clean(root.querySelector('.recharts-legend-wrapper')) };
			});
			const variants: ChartVariant[] = [];
			const seen = new Map<string, number>();
			const rest = await svgNow();
			seen.set(rest.svg, 0);
			variants.push(await captureVariant(page, wrapper, found.view));
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
					variants.push({ svg: now.svg, ...(now.legend !== rest.legend ? { legend: now.legend } : {}), ...(await captureVariant(page, wrapper, found.view)) });
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
			charts.push({ sig: found.sig, nth: found.nth, width: found.w, height: found.h, view: found.view, variants, drivers });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture = { route, charts };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
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
	for (const curve of els.filter((e) => classes(e).includes('recharts-line-curve'))) {
		const length = num(/^\s*(-?[\d.]+)/.exec(attr(curve, 'stroke-dasharray') ?? '')?.[1]);
		if (!Number.isNaN(length)) styleWith(curve, `--mm-l: ${length}px`);
	}
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
@keyframes mm-draw { from { stroke-dasharray: 0px var(--mm-l); } }
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
}
`;

export const MOTION_FILE = `/_converted/styles/recharts-motion-${createHash('sha256').update(MOTION_CSS).digest('hex').slice(0, 12)}.css`;

/**
 * recharts charts on Markless state: the active point's index in a state() per chart, set by the recharts part from
 * where the pointer is (or the arrow keys); the tooltip, the nodes recharts adds to the SVG and the attributes it
 * changes are one template each over a table of the old page's values per point. A card whose controls change the
 * chart has a state() for which SVG it shows, each one the old page drew, set by those controls. The part places the
 * tooltip as recharts does; the shared stylesheet plays recharts' entry animation.
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
		for (const chart of charts) {
			const wrapper = locate(chart.sig, chart.nth);
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
			const facts: string[] = [];
			const tooltips: string[] = [];
			const svgs: string[] = [];
			const legends: string[] = [];
			chart.variants.forEach((variant, k) => {
				const tree = k === 0 ? svg : svgTree(variant.svg!.replace(/^<svg[^>]*>|<\/svg>$/g, ''));
				const own = k === 0 ? svg : this.reparent(svg, tree);
				const local = new Map<Tree, Binding>();
				const prefix = `${name}${many ? `v${k}` : ''}`;
				// Every SVG the card can show is on the page, the ones not shown hidden: an @if may not hold another.
				const on = many ? `${v} === ${k} && ` : '';
				const arms = (htmls: readonly string[], table: string, inSvg = false): { markup: string; declare: string[] } => {
					const t = template(htmls, `${table}[${name}]`, inSvg);
					if (t) return { markup: `@if (${on}${name} >= 0) { <>${t.markup}</> }`, declare: [`const ${table} = ${JSON.stringify(t.rows)};`] };
					return { markup: htmls.map((h, s) => `@if (${on}${name} === ${s}) { <>${inSvg ? emitChildren(svgTree(h) as never) : emit(h)}</> }`).join(''), declare: [] };
				};
				if (tip && variant.states.length) {
					const t = arms(variant.states.map((s) => s.tooltip), `${prefix}t`);
					declare.push(...t.declare);
					tooltips.push(t.markup);
				}
				const elements = [...walk(own)].length - 1;
				if (elements === variant.elements) {
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
				motion(own, chart.view);
				if (many) local.set(own, { ...local.get(own), extra: [...(local.get(own)?.extra ?? []), `display={${v} === ${k} ? undefined : "none"}`] });
				const declarations: string[] = [];
				svgs.push(emitElement(own, { bind: (el) => local.get(el), declarations }));
				declare.push(...declarations);
				if (legend) legends.push(variant.legend ?? '');
				facts.push(JSON.stringify(this.factsOf(chart, variant)));
			});
			this.bindings.set(svg, { declare, replace: svgs.join('') });
			if (legend && many && legends.some(Boolean)) this.bindings.set(legend, { declare, replace: legends.map((l, k) => `@if (${v} === ${k}) { <>${k === 0 || !l ? emitElement(legend) : emit(l)}</> }`).join('') });
			const factsExpr = facts.slice(0, -1).reduceRight((rest, f, k) => `${v} === ${k} ? ${lit(f)} : ${rest}`, lit(facts.at(-1)!));
			const extra = [`data-mm-chart={${factsExpr}}`, `onMmchart={(event) => (${name} = (event as CustomEvent<number>).detail)}`];
			if (!linked) {
				linked = true;
				const parent = wrapper.parentNode as Tree;
				const link = { nodeName: 'link', tagName: 'link', attrs: [{ name: 'rel', value: 'stylesheet' }, { name: 'href', value: MOTION_FILE }], namespaceURI: wrapper.namespaceURI, childNodes: [], parentNode: parent } as unknown as Tree;
				parent.childNodes.splice(parent.childNodes.indexOf(wrapper as never), 0, link as never);
			}
			this.bindings.set(wrapper, { declare, extra });
			if (tip && tooltips.length) this.bindings.set(tip, { declare, children: tooltips.join('') });
			if (many) this.drive(chart, wrapper, name, v, locate, declare);
			placed++;
		}
		return placed;
	}

	/** The facts the part reads, compact: the view box, how the pointer picks a state, and where the tooltip goes. */
	private factsOf(chart: ChartFacts, variant: ChartVariant): Record<string, unknown> {
		return {
			w: chart.width,
			h: chart.height,
			v: chart.view,
			m: variant.mode,
			...(variant.center ? { c: variant.center } : {}),
			g: variant.segments.map((s) => s.map(round)),
			...(variant.span ? { sp: variant.span.map(round) } : {}),
			p: variant.states.map((s) => [s.x, s.y]),
			...(variant.keys ? { k: variant.keys } : {}),
		};
	}

	/** A variant's SVG parsed on its own, with the attributes of the SVG shown at rest (its size, class and role). */
	private reparent(rest: Tree, tree: Tree): Tree {
		const holder = svgTree('');
		holder.attrs = rest.attrs.map((a) => ({ ...a }));
		holder.childNodes = childrenOf(tree);
		for (const child of holder.childNodes) (child as { parentNode: unknown }).parentNode = holder;
		return holder;
	}

	/** The card's controls set which SVG the chart shows: a press by the control, a choice by the option's text. */
	private drive(chart: ChartFacts, wrapper: Tree, name: string, v: string, locate: (sig: string, nth: number) => Tree | undefined, declare: string[]): void {
		const controls = chart.drivers.map((d) => ({ d, el: locate(d.sig, d.nth) })).filter((x): x is { d: ChartDriver; el: Tree } => x.el !== undefined);
		if (!controls.length) return;
		let card: Tree | undefined = wrapper;
		const within = (outer: Tree, el: Tree) => [...walk(outer)].includes(el);
		while (card && !controls.every((c) => within(card!, c.el))) card = card.parentNode as Tree | undefined;
		if (!card || !isElement(card)) return;
		const pressed = new Map<Tree, number>();
		const chosen: Record<string, number> = {};
		for (const { d, el } of controls) {
			if (d.kind === 'press') pressed.set(el, d.variant);
			else if (d.label !== undefined) chosen[d.label] = d.variant;
		}
		for (const [el, k] of pressed) {
			const own: Binding = { extra: [`data-mm-variant="${k}"`] };
			const active = controls.find((c) => c.el === el)?.d.active;
			this.bindings.set(el, active ? { ...own, expressions: { 'data-active': `${v} === ${k} ? "true" : "false"` } } : own);
		}
		const extra: string[] = [];
		if (pressed.size) extra.push(`onClick={(event) => { const k = (event.target as Element).closest('[data-mm-variant]')?.getAttribute('data-mm-variant'); if (k != null && ${v} !== Number(k)) { ${v} = Number(k); ${name} = -1; } }}`);
		if (Object.keys(chosen).length) {
			declare.push(`const ${name}o: Record<string, number> = ${JSON.stringify(chosen)};`);
			extra.push(`onMmchoose={(event) => { const k = ${name}o[(event as CustomEvent<string>).detail]; if (k !== undefined && ${v} !== k) { ${v} = k; ${name} = -1; } }}`);
		}
		const prev = this.bindings.get(card);
		this.bindings.set(card, { ...prev, declare: [...(prev?.declare ?? []), ...declare], extra: [...(prev?.extra ?? []), ...extra] });
	}
}

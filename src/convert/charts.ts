import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import type { Browser } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, childrenOf, isElement, type Element as Tree } from './dom.ts';
import { emitChildren, lit, type Binding } from './tsrx.ts';

/** What a recharts chart shows for one active data point, as the old page drew it with the pointer over that point. */
export interface ChartState {
	/** The pointer's range over the plot (px from the surface's left edge) that makes this point active. */
	readonly from: number;
	readonly to: number;
	/** The tooltip's content. */
	readonly tooltip: string;
	/** The tooltip's translate as the old page placed it, with the pointer at `y` (px from the surface's top). */
	readonly x: number;
	readonly y: number;
	/** The nodes the chart put into its SVG for this point (active dots, the cursor), by insertion point. */
	readonly added: readonly { readonly at: string; readonly html: string }[];
}

export interface ChartFacts {
	readonly sig: string;
	readonly nth: number;
	readonly width: number;
	readonly height: number;
	readonly states: readonly ChartState[];
	/** Where in the SVG each insertion point is: the path of element indexes from the surface, and the index of the child it goes before (-1: the end). */
	readonly points: Readonly<Record<string, { readonly path: readonly number[]; readonly before: number }>>;
}

/**
 * Moves the pointer across every recharts chart on the old page, left to right over the middle of its plot, and records
 * each data point it activates: the pointer range that activates it, the tooltip's content and placement, and the
 * nodes recharts adds to the SVG (active dots, the cursor) with where they go.
 */
export async function captureCharts(browser: Browser, origin: string, route: string, dir: string): Promise<{ readonly route: string; readonly charts: readonly ChartFacts[] }> {
	const file = join(dir, `${createHash('sha256').update(`charts:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; charts: ChartFacts[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const charts: ChartFacts[] = [];
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(1600);
		const count = await page.locator('.recharts-wrapper').count();
		for (let i = 0; i < count; i++) {
			const wrapper = page.locator('.recharts-wrapper').nth(i);
			if (!(await wrapper.isVisible().catch(() => false))) continue;
			await wrapper.scrollIntoViewIfNeeded().catch(() => {});
			await page.mouse.move(1, 1);
			await page.waitForTimeout(500);
			const found = await wrapper.evaluate((root) => {
				const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				let nth = 0;
				for (const e of document.body.querySelectorAll('*')) {
					if (e === root) break;
					if (sigOf(e) === sigOf(root)) nth++;
				}
				const svg = root.querySelector('svg.recharts-surface');
				for (const e of svg?.querySelectorAll('*') ?? []) e.setAttribute('data-mm-old', '');
				return { sig: sigOf(root), nth, hasTooltip: root.querySelector('.recharts-tooltip-wrapper') !== null };
			});
			if (!found.hasTooltip) continue;
			const box = await wrapper.locator('svg.recharts-surface').first().boundingBox();
			if (!box) continue;
			const states: ChartState[] = [];
			const points: Record<string, { path: number[]; before: number }> = {};
			const y = Math.round(box.height / 2);
			let last = '';
			for (let x = 0; x <= box.width; x += 2) {
				await page.mouse.move(box.x + x, box.y + y);
				await page.waitForTimeout(16);
				const seen = await wrapper.evaluate((root) => {
					const tip = root.querySelector<HTMLElement>('.recharts-tooltip-wrapper')!;
					const svg = root.querySelector('svg.recharts-surface')!;
					const clean = (html: string) => html.replace(/ data-mm-old=""/g, '');
					const indexIn = (el: Element) => [...el.parentElement!.children].filter((c) => c.hasAttribute('data-mm-old')).indexOf(el);
					const pathOf = (el: Element) => {
						const out: number[] = [];
						for (let n: Element = el; n !== svg; n = n.parentElement!) out.unshift(indexIn(n));
						return out;
					};
					const added = [...svg.querySelectorAll('*:not([data-mm-old])')].filter((e) => e.parentElement === svg || e.parentElement!.hasAttribute('data-mm-old'));
					const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(tip.style.transform);
					return {
						visible: tip.style.visibility === 'visible',
						tooltip: tip.innerHTML,
						x: m ? Number(m[1]) : 0,
						y: m ? Number(m[2]) : 0,
						added: added.map((e) => {
							const parent = e.parentElement!;
							let next = e.nextElementSibling;
							while (next && !next.hasAttribute('data-mm-old')) next = next.nextElementSibling;
							return { path: parent === svg ? [] : pathOf(parent), before: next ? indexIn(next) : -1, html: clean(e.outerHTML) };
						}),
					};
				});
				if (!seen.visible) continue;
				const added = seen.added.map((a) => {
					const at = `${a.path.join('.')}@${a.before}`;
					points[at] = { path: a.path, before: a.before };
					return { at, html: a.html };
				});
				const key = `${seen.tooltip}\u0000${added.map((a) => `${a.at}:${a.html}`).join('\u0000')}`;
				if (key === last) {
					const prev = states[states.length - 1]!;
					states[states.length - 1] = { ...prev, to: x };
					continue;
				}
				last = key;
				states.push({ from: x, to: x, tooltip: seen.tooltip, x: seen.x, y: seen.y - y, added });
			}
			await page.mouse.move(1, 1);
			if (states.length) charts.push({ sig: found.sig, nth: found.nth, width: box.width, height: box.height, states, points });
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

/**
 * One tsrx template for markup the old page drew alike for every state but for some text and attribute values: those
 * become `{table[state][k]}`. Undefined when the states differ in structure.
 */
export function template(htmls: readonly string[], table: string, svg = false): { readonly markup: string; readonly rows: string[][] } | undefined {
	// SVG content is parsed inside an <svg>, so its elements and attribute names keep SVG's case.
	const trees = htmls.map((h) => (svg ? childrenOf(parseFragment(`<svg>${h}</svg>`) as unknown as Tree).find(isElement)! : (parseFragment(h) as unknown as Tree)));
	const rows: string[][] = htmls.map(() => []);
	const holes = new Map<Tree, Record<string, string>>();
	let k = 0;
	const same = (nodes: readonly Tree[]): boolean => {
		const first = nodes[0]!;
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
		void first;
		return true;
	};
	if (!same(trees)) return undefined;
	const markup = emitChildren(trees[0]! as never, { bind: (el) => (holes.has(el) ? { expressions: holes.get(el) } : undefined) }).replace(/MMHOLE(\d+)MMHOLE/g, (_, n: string) => `{${table}[${n}]}`);
	return { markup, rows };
}

/**
 * recharts tooltips and active points on Markless state: the active point's index in a state() per chart, set by the
 * recharts part from where the pointer is (or the arrow keys); the tooltip's content and the nodes recharts adds to the
 * SVG are one template each over a table of the old page's values per point (per-point markup where they differ in
 * structure). The part places the tooltip as recharts does.
 */
export class ChartPlan {
	private readonly bindings = new Map<Tree, Binding>();
	private n = 0;

	bind(el: Tree): Binding | undefined {
		return this.bindings.get(el);
	}

	add(root: Tree, charts: readonly ChartFacts[], locate: (sig: string, nth: number) => Tree | undefined, emit: (html: string) => string): number {
		let placed = 0;
		for (const chart of charts) {
			const wrapper = locate(chart.sig, chart.nth);
			if (!wrapper || this.bindings.has(wrapper)) continue;
			const kids = childrenOf(wrapper).filter(isElement);
			const svg = kids.find((e) => e.tagName === 'svg');
			const tip = kids.find((e) => (attr(e, 'class') ?? '').split(/\s+/).includes('recharts-tooltip-wrapper'));
			if (!svg || !tip) continue;
			const name = `chart${this.n++}`;
			const i = name;
			const arms = (htmls: readonly string[], table: string, inSvg = false): { markup: string; declare: string[] } => {
				const t = template(htmls, `${table}[${i}]`, inSvg);
				if (t) return { markup: `@if (${i} >= 0) { <>${t.markup}</> }`, declare: [`const ${table} = ${JSON.stringify(t.rows)};`] };
				return { markup: htmls.map((h, s) => `@if (${i} === ${s}) { <>${emit(h)}</> }`).join(''), declare: [] };
			};
			const tooltip = arms(chart.states.map((s) => s.tooltip), `${name}t`);
			const declare = [`let ${name} = state(-1);`, ...tooltip.declare];
			const inserts = new Map<Tree, { before: Tree | null; markup: string }[]>();
			let p = 0;
			for (const [at, point] of Object.entries(chart.points)) {
				let parent: Tree | undefined = svg;
				for (const index of point.path) parent = parent && childrenOf(parent).filter(isElement)[index];
				if (!parent) continue;
				const own = arms(chart.states.map((s) => s.added.filter((a) => a.at === at).map((a) => a.html).join('')), `${name}a${p++}`, true);
				declare.push(...own.declare);
				const before = point.before >= 0 ? (childrenOf(parent).filter(isElement)[point.before] ?? null) : null;
				(inserts.get(parent) ?? inserts.set(parent, []).get(parent)!).push({ before, markup: own.markup });
			}
			const facts = { w: chart.width, h: chart.height, s: chart.states.map((s) => [s.from, s.to, s.x, s.y]) };
			this.bindings.set(wrapper, { declare, extra: [`data-mm-chart={${lit(JSON.stringify(facts))}}`, `onMmchart={(event) => (${name} = (event as CustomEvent<number>).detail)}`] });
			this.bindings.set(tip, { declare, children: tooltip.markup });
			for (const [parent, list] of inserts) this.bindings.set(parent, { declare, inserts: list });
			placed++;
		}
		return placed;
	}
}

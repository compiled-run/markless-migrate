import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { contextOptions, settle } from './capture.ts';
import { collectPage } from './collect.ts';
import { HINTS } from './hints.ts';
import { describe, matchElements } from './match.ts';
import { describeRule, type CssRule, type CssState } from './stylesheet.ts';
import type { Box, ElementSnapshot, Failure, Shot, Viewport } from './types.ts';
import { compareScreenshots, visualNoise, visuallyDifferent } from './visual.ts';

const MAX_STATES = 40;
const TARGETS_PER_STATE = 2;
const ELEMENTS_PER_STATE = 5;
const CLIP_PADDING = 8;
// font-family is compared through the font files that render, so generated family names do not differ.
const IGNORED = new Set(['font-family']);

interface Side {
	readonly context: BrowserContext;
	readonly page: Page;
	readonly session: CDPSession;
	base: ElementSnapshot[];
}

export interface StateInput {
	readonly browser: Browser;
	readonly oldOrigin: string;
	readonly newOrigin: string;
	readonly route: string;
	readonly viewport: Viewport;
	readonly states: readonly CssState[];
	readonly rules: readonly CssRule[];
	/** OLD elements whose text or styles varied between the default OLD loads, with the varying properties. */
	readonly noise: readonly { readonly element: ElementSnapshot; readonly props: ReadonlySet<string> | 'text' }[];
	/** Default-state computed-style failures to trace back to the OLD rule. */
	readonly explain: readonly { readonly failure: Failure; readonly element: ElementSnapshot; readonly props: readonly string[] }[];
}

export interface StateOutput {
	readonly failures: Failure[];
	readonly explained: Map<Failure, Failure>;
	readonly shots: Shot[];
	readonly checked: string[];
	readonly skipped: string[];
}

async function open(browser: Browser, origin: string, route: string, viewport: Viewport): Promise<Side> {
	const context = await browser.newContext(contextOptions(viewport));
	const page = await context.newPage();
	await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
	await settle(page);
	const session = await context.newCDPSession(page);
	await session.send('DOM.enable');
	await session.send('CSS.enable');
	const base = (await page.evaluate(collectPage, { origin, full: true })).elements;
	return { context, page, session, base };
}

const collect = async (side: Side, origin: string) => (await side.page.evaluate(collectPage, { origin, full: true })).elements;
// Animations a state starts are frozen at their first frame, so a sample mid-animation is not a difference.
const settleState = (page: Page) =>
	page.evaluate(async () => {
		for (const animation of document.getAnimations()) {
			animation.pause();
			animation.currentTime = 0;
		}
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	});

async function nodeId(side: Side, id: number): Promise<number | undefined> {
	await side.session.send('DOM.getDocument', { depth: 0 });
	const { result } = await side.session.send('Runtime.evaluate', { expression: `window.__mmById?.get(${id})` });
	if (!result.objectId) return undefined;
	return (await side.session.send('DOM.requestNode', { objectId: result.objectId })).nodeId;
}

function matchingIds(selector: string): number[] {
	const scope = window as unknown as { __mmIds?: WeakMap<Element, number> };
	try {
		return [...document.querySelectorAll(selector)].flatMap((el) => (scope.__mmIds?.has(el) ? [scope.__mmIds.get(el)!] : []));
	} catch {
		return [];
	}
}

function setProperty({ id, property, on }: { id: number; property: string; on: boolean }) {
	const el = (window as unknown as { __mmById: Map<number, HTMLElement & { checked?: boolean; disabled?: boolean; open?: boolean }> }).__mmById.get(id);
	if (!el) return;
	if (property === 'open' && !('open' in el)) el.toggleAttribute('open', on);
	else (el as unknown as Record<string, boolean>)[property] = on;
}

function sizeContainer({ id, width }: { id: number; width: number | null }) {
	const el = (window as unknown as { __mmById: Map<number, HTMLElement> }).__mmById.get(id);
	if (!el) return;
	if (width === null) {
		el.style.removeProperty('width');
		el.style.removeProperty('box-sizing');
	} else {
		el.style.setProperty('box-sizing', 'content-box', 'important');
		el.style.setProperty('width', `${width}px`, 'important');
	}
}

// Runs inside the OLD page: which rule sets each property on the element, walking up for inherited ones, and which rule sets a var() it reads.
function explainInPage({ id, props, rules }: { id: number; props: string[]; rules: { selector: string; conditions: { kind: string; text: string }[]; specificity: number[]; order: number; declarations: { property: string; value: string; important: boolean }[] }[] }) {
	const SHORT: Record<string, string[]> = { inset: ['top', 'right', 'bottom', 'left'], gap: ['row-gap', 'column-gap'], font: ['line-height'], 'place-items': ['align-items', 'justify-items'], 'flex-flow': ['flex-direction', 'flex-wrap'] };
	const covers = (d: string, p: string) => d === p || p.startsWith(`${d}-`) || (SHORT[d]?.includes(p) ?? false);
	const holds = (r: (typeof rules)[number]) => r.conditions.every((c) => (c.kind === 'media' ? matchMedia(c.text).matches : c.kind === 'supports' ? CSS.supports(c.text) : true));
	const matches = (node: Element, selector: string) => {
		try {
			return node.matches(selector);
		} catch {
			return false;
		}
	};
	const best = (node: Element, prop: string) => {
		let win: { index: number; value: string; rank: number[] } | undefined;
		rules.forEach((rule, index) => {
			const decl = rule.declarations.findLast((d) => covers(d.property, prop));
			if (!decl || !holds(rule) || !matches(node, rule.selector)) return;
			const rank = [decl.important ? 1 : 0, ...rule.specificity, rule.order];
			const k = win ? rank.findIndex((v, i) => v !== win!.rank[i]) : 0;
			if (!win || (k >= 0 && rank[k]! > win.rank[k]!)) win = { index, value: decl.value, rank };
		});
		return win;
	};
	const find = (start: Element, prop: string, inherit: boolean) => {
		for (let node: Element | null = start; node; node = node.parentElement) {
			const hit = best(node, prop);
			if (hit || !inherit) return hit;
		}
		return undefined;
	};
	const el = (window as unknown as { __mmById: Map<number, Element> }).__mmById.get(id);
	const out: Record<string, { rule: number; value: string; variable?: { name: string; rule: number; value: string } } | null> = {};
	if (!el) return out;
	const style = getComputedStyle(el);
	for (const prop of props) {
		const parent = el.parentElement ? getComputedStyle(el.parentElement).getPropertyValue(prop) : '';
		const hit = find(el, prop, parent === style.getPropertyValue(prop));
		if (!hit) {
			out[prop] = null;
			continue;
		}
		const name = /var\(\s*(--[\w-]+)/.exec(hit.value)?.[1];
		const variable = name ? find(el, name, true) : undefined;
		out[prop] = { rule: hit.index, value: hit.value, ...(name && variable ? { variable: { name, rule: variable.index, value: variable.value } } : {}) };
	}
	return out;
}

async function explain(side: Side, rules: readonly CssRule[], element: ElementSnapshot, props: readonly string[]): Promise<string | undefined> {
	const found = await side.page.evaluate(explainInPage, { id: element.id, props: [...props], rules: rules as unknown as Parameters<typeof explainInPage>[0]['rules'] });
	const lines = new Set<string>();
	for (const prop of props) {
		const hit = found[prop];
		if (!hit) continue;
		const rule = rules[hit.rule]!;
		let line = `${describeRule(rule)} sets ${prop} with \`${hit.value}\``;
		if (hit.variable) line += `, reading ${hit.variable.name} from ${describeRule(rules[hit.variable.rule]!)} (\`${hit.variable.value}\`)`;
		lines.add(line);
	}
	return lines.size ? [...lines].join('; ') : undefined;
}

function hintWith(rule: string | undefined, base: string): string {
	return rule ? `Old rule: ${rule}. ${base}` : base;
}

function union(boxes: readonly Box[]): Box | undefined {
	if (!boxes.length) return undefined;
	const x0 = Math.min(...boxes.map((b) => b.x));
	const y0 = Math.min(...boxes.map((b) => b.y));
	const x1 = Math.max(...boxes.map((b) => b.x + b.width));
	const y1 = Math.max(...boxes.map((b) => b.y + b.height));
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

async function screenshot(page: Page, clip: Box | undefined): Promise<Buffer> {
	if (!clip) return page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
	const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
	const x = Math.max(0, clip.x - CLIP_PADDING);
	const y = Math.max(0, clip.y - CLIP_PADDING);
	const box = { x, y, width: Math.max(1, Math.min(size.width, clip.x + clip.width + CLIP_PADDING) - x), height: Math.max(1, Math.min(size.height, clip.y + clip.height + CLIP_PADDING) - y) };
	return page.screenshot({ fullPage: true, clip: box, animations: 'disabled', caret: 'hide' });
}

export async function compareStates(input: StateInput): Promise<StateOutput> {
	const { browser, oldOrigin, newOrigin, route, viewport } = input;
	const out: StateOutput = { failures: [], explained: new Map(), shots: [], checked: [], skipped: [] };
	const [o1, o2, n] = await Promise.all([open(browser, oldOrigin, route, viewport), open(browser, oldOrigin, route, viewport), open(browser, newOrigin, route, viewport)]);
	try {
		for (const { failure, element, props } of input.explain) {
			const at = matchElements([element], o1.base).get(0);
			const rule = at === undefined ? undefined : await explain(o1, input.rules, o1.base[at]!, props);
			if (rule) out.explained.set(failure, { ...failure, hint: hintWith(rule, failure.hint) });
		}
		const noiseIn = (elements: readonly ElementSnapshot[]) => {
			const textNoise = new Set<number>();
			const styleNoise = new Map<number, ReadonlySet<string>>();
			const pairs = matchElements(
				input.noise.map((x) => x.element),
				elements,
			);
			input.noise.forEach((x, k) => {
				const j = pairs.get(k);
				if (j === undefined) return;
				if (x.props === 'text') textNoise.add(j);
				else styleNoise.set(j, x.props);
			});
			return { textNoise, styleNoise };
		};

		const m12 = matchElements(o1.base, o2.base);
		const m1n = matchElements(o1.base, n.base);
		for (const state of input.states.slice(0, MAX_STATES)) {
			let targets: number[] = [];
			if (state.kind === 'pseudo' || state.kind === 'property') {
				const ids = new Set(await o1.page.evaluate(matchingIds, state.target));
				targets = o1.base.flatMap((el, i) => (ids.has(el.id) ? [i] : [])).filter((i) => m12.has(i) && m1n.has(i)).slice(0, TARGETS_PER_STATE);
				if (!targets.length) {
					out.skipped.push(`${state.label}: no visible element on the page matches it on both sides`);
					continue;
				}
			}
			const sides: [Side, Map<number, number> | undefined][] = [
				[o1, undefined],
				[o2, m12],
				[n, m1n],
			];
			const idsOn = (pairs: Map<number, number> | undefined, side: Side, indices: readonly number[]) => indices.map((i) => side.base[pairs ? pairs.get(i)! : i]!.id);
			const containers = state.kind === 'container' ? o1.base.flatMap((el, i) => (el.style['container-type'] && el.style['container-type'] !== 'normal' && (!state.name || el.style['container-name']?.split(' ').includes(state.name)) && m12.has(i) && m1n.has(i) ? [i] : [])) : [];
			if (state.kind === 'container' && !containers.length) {
				out.skipped.push(`${state.label}: no size container on the page`);
				continue;
			}

			const apply = async (on: boolean) => {
				await Promise.all(
					sides.map(async ([side, pairs]) => {
						if (state.kind === 'pseudo') {
							for (const id of idsOn(pairs, side, targets)) {
								const node = await nodeId(side, id);
								if (node !== undefined) await side.session.send('CSS.forcePseudoState', { nodeId: node, forcedPseudoClasses: on ? [state.pseudo] : [] });
							}
						} else if (state.kind === 'property') {
							for (const id of idsOn(pairs, side, targets)) await side.page.evaluate(setProperty, { id, property: state.property, on });
						} else if (state.kind === 'media') {
							await side.page.emulateMedia(state.feature === 'prefers-color-scheme' ? { colorScheme: on ? (state.value as 'dark' | 'light') : 'light' } : { reducedMotion: on ? 'no-preference' : 'reduce' });
						} else if (state.kind === 'width') {
							await side.page.setViewportSize({ width: on ? state.width : viewport.width, height: viewport.height });
						} else {
							for (const id of idsOn(pairs, side, containers)) await side.page.evaluate(sizeContainer, { id, width: on ? state.width : null });
						}
						await settleState(side.page);
					}),
				);
			};

			await apply(true);
			try {
				const [s1, s2, sn] = await Promise.all([collect(o1, oldOrigin), collect(o2, oldOrigin), collect(n, newOrigin)]);
				const base1 = new Map(o1.base.map((el) => [el.id, el]));
				const baseN = new Map(n.base.map((el) => [el.id, el]));
				const p12 = matchElements(s1, s2);
				const p1n = matchElements(s1, sn);
				const { textNoise, styleNoise } = noiseIn(s1);
				const changedBoxes: Box[] = [];
				const differing: { el: ElementSnapshot; other: ElementSnapshot; props: string[] }[] = [];
				for (const [i, el] of s1.entries()) {
					const b1 = base1.get(el.id);
					const props = Object.keys(el.style);
					const changed1 = props.filter((p) => !b1 || b1.style[p] !== el.style[p]);
					if (changed1.length) changedBoxes.push(el.box);
					const j = p1n.get(i);
					const twin = s2[p12.get(i) ?? -1];
					if (j === undefined || !twin) continue;
					const other = sn[j]!;
					const bn = baseN.get(other.id);
					const changed = new Set([...changed1, ...props.filter((p) => !bn || bn.style[p] !== other.style[p])]);
					const noisy = styleNoise.get(i);
					const diff = [...changed].filter((p) => !IGNORED.has(p) && twin.style[p] === el.style[p] && !noisy?.has(p) && el.style[p] !== other.style[p]);
					if (diff.length) differing.push({ el, other, props: diff });
				}
				out.checked.push(state.label);
				for (const { el, other, props } of differing.slice(0, ELEMENTS_PER_STATE)) {
					const rule = await explain(o1, input.rules, el, props);
					out.failures.push({
						route,
						dimension: 'css',
						check: `computed style in ${state.label}: ${describe(el)}`,
						viewport: viewport.name,
						expected: props.map((p) => `${p}: ${el.style[p]}`).join('; '),
						actual: props.map((p) => `${p}: ${other.style[p] ?? '(unset)'}`).join('; '),
						hint: hintWith(rule, HINTS.cssState),
					});
				}
				if (differing.length > ELEMENTS_PER_STATE) {
					out.failures.push({ route, dimension: 'css', check: `computed style in ${state.label}`, viewport: viewport.name, expected: '', actual: `${differing.length - ELEMENTS_PER_STATE} more elements differ`, hint: HINTS.cssState });
				}

				const pageWide = state.kind === 'media' || state.kind === 'width' || state.kind === 'container';
				if (!pageWide && !changedBoxes.length && !differing.length) continue;
				const clip = pageWide ? undefined : union([...changedBoxes, ...targets.map((i) => o1.base[i]!.box)]);
				const [shot1, shot2, shotN] = await Promise.all([screenshot(o1.page, clip), screenshot(o2.page, clip), screenshot(n.page, clip)]);
				const shift = (b: Box): Box => (clip ? { ...b, x: b.x - Math.max(0, clip.x - CLIP_PADDING), y: b.y - Math.max(0, clip.y - CLIP_PADDING) } : b);
				const noisyBoxes = s1.flatMap((el, i) => (textNoise.has(i) || s2[p12.get(i) ?? -1]?.text !== el.text ? [shift(el.box)] : []));
				const diff = compareScreenshots(shot1, shotN, visualNoise(shot1, [shot2], noisyBoxes));
				const different = visuallyDifferent(diff);
				if (different) {
					out.failures.push({
						route,
						dimension: 'visual',
						check: `screenshot in ${state.label}`,
						viewport: viewport.name,
						expected: diff.sizeMismatch ? diff.sizeMismatch.expected : 'same pixels outside the noise mask',
						actual: diff.sizeMismatch ? diff.sizeMismatch.actual : `${diff.differing} pixels differ${clip ? ' around the state target' : ''}`,
						hint: HINTS.visualState,
					});
					out.shots.push({ label: `${viewport.name} in ${state.label}`, viewport: viewport.name, old: shot1, new: shotN, diff: diff.png, regions: diff.regions, ok: false });
				}
			} finally {
				await apply(false);
			}
		}
	} finally {
		await Promise.all([o1, o2, n].map((side) => side.context.close()));
	}
	return out;
}

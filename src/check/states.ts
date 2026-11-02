import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { settle } from './capture.ts';
import { readPage } from './collect.ts';
import { matchElements } from './match.ts';
import { describeRule, type CssRule, type CssState } from './stylesheet.ts';
import type { Box, ElementSnapshot, ImageRecord, Viewport } from './types.ts';
import { loadPage } from './infrastructure.ts';
import { holdLoops, settleMotion } from './loops.ts';
import { maskedShot } from './embeds.ts';
import { CLIP_PADDING, ELEMENTS_PER_STATE, MAX_STATES, stateDiff, stateShot, TARGETS_PER_STATE, type Explanation, type StateNoise, type StateRun, type StatesViewportRow } from './states-compare.ts';

interface Side {
	readonly context: BrowserContext;
	readonly page: Page;
	readonly session: CDPSession;
	readonly inflight: () => number;
	base: ElementSnapshot[];
}

async function open(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<Side> {
	const origin = env.origin;
	const { context, page } = await openPage(browser, env, viewport, { loops: true, shareThirdParty: true });
	const inflight = trackRequests(page);
	await loadPage(page, new URL(route, origin).href);
	await settle(page);
	await settleMotion(page);
	await page.evaluate(holdLoops).catch(() => 0);
	const session = await context.newCDPSession(page);
	await session.send('DOM.enable');
	await session.send('CSS.enable');
	const base = (await readPage(page, { origin, full: true })).elements;
	return { context, page, session, inflight, base };
}

const collect = async (side: Side, origin: string) => (await readPage(side.page, { origin, full: true })).elements;
/** Counts the page's requests in flight, so a state is sampled after the work it started has landed. */
export function trackRequests(page: Page): () => number {
	const pending = new Set<unknown>();
	page.on('request', (request) => pending.add(request));
	page.on('requestfinished', (request) => pending.delete(request));
	page.on('requestfailed', (request) => pending.delete(request));
	return () => pending.size;
}

const IDLE_MS = 150;
const IDLE_LIMIT_MS = 3_000;

// A state can start loading (a canvas redrawn for the new width, an image for a breakpoint), so the network goes quiet
// first; animations it starts are then frozen at their first frame and transitions run to their end, so a sample
// mid-animation or mid-transition is not a difference.
export async function settleState(page: Page, inflight: () => number): Promise<void> {
	const deadline = Date.now() + IDLE_LIMIT_MS;
	let idleSince = Date.now();
	while (Date.now() < deadline) {
		if (inflight() > 0) idleSince = Date.now();
		else if (Date.now() - idleSince >= IDLE_MS) break;
		await new Promise((done) => setTimeout(done, 25));
	}
	await page.evaluate(async () => {
		for (const animation of document.getAnimations()) {
			// A transition the state started ends at the state's own value; paused at 0 it would still show the old one.
			if (animation instanceof CSSTransition) {
				animation.finish();
				continue;
			}
			if (animation.timeline !== document.timeline) continue;
			animation.pause();
			animation.currentTime = 0;
		}
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	});
}

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

async function explain(side: Side, rules: readonly CssRule[], element: ElementSnapshot, props: readonly string[]): Promise<Explanation | undefined> {
	const found = await side.page.evaluate(explainInPage, { id: element.id, props: [...props], rules: rules as unknown as Parameters<typeof explainInPage>[0]['rules'] });
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

// What a page-wide state newly draws (a breakpoint's image, a dark-mode twin) loads now, as the page's own settle scrolled every lazy image in: the shot compares pictures, not load timing.
async function drawnImages(page: Page): Promise<ImageRecord[]> {
	return page.evaluate(async () => {
		const shown = [...document.images].filter((img) => img.getClientRects().length);
		for (const img of shown) if (img.loading === 'lazy' && !img.complete) img.loading = 'eager';
		await Promise.all(shown.map((img) => Promise.race([img.decode().catch(() => {}), new Promise((done) => setTimeout(done, 3000))])));
		return [...document.images].map((img) => {
			const r = img.getBoundingClientRect();
			const src = img.currentSrc || img.src;
			return {
				src: src.startsWith(location.origin) ? src.slice(location.origin.length) || '/' : src,
				alt: img.getAttribute('alt'),
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight,
				broken: img.complete && img.naturalWidth === 0,
				...(r.width > 0 && r.height > 0 ? { box: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) } } : {}),
			};
		});
	});
}

async function screenshot(page: Page, clip: Box | undefined): Promise<Buffer> {
	if (!clip) return (await maskedShot(page, (mask) => page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', mask }))).shot;
	const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
	// An element outside the document's scroll box (a fixed aside past its right edge) is shot at the edge, not past it.
	const x = Math.min(Math.max(0, size.width - 1), Math.max(0, clip.x - CLIP_PADDING));
	const y = Math.min(Math.max(0, size.height - 1), Math.max(0, clip.y - CLIP_PADDING));
	const box = { x, y, width: Math.max(1, Math.min(size.width, clip.x + clip.width + CLIP_PADDING) - x), height: Math.max(1, Math.min(size.height, clip.y + clip.height + CLIP_PADDING) - y) };
	return (await maskedShot(page, (mask) => page.screenshot({ fullPage: true, clip: box, animations: 'disabled', caret: 'hide', mask }))).shot;
}

export interface StatesInput {
	readonly browser: Browser;
	/** How each app is loaded (frozen clock, blocked trackers, held-back writes, recorded data). */
	readonly envs: { readonly old: SideEnv; readonly new: SideEnv };
	readonly route: string;
	readonly viewport: Viewport;
	readonly states: readonly CssState[];
	readonly rules: readonly CssRule[];
	readonly noise: StateNoise;
	/** Default-state computed styles to trace back to the OLD rule. */
	readonly explain: readonly { readonly element: ElementSnapshot; readonly props: readonly string[] }[];
}

/** Forces each state on the old page twice and the new page once, and reads every element of each page in it; what differs is judged by states-compare.ts. */
export async function observeStates(input: StatesInput): Promise<StatesViewportRow> {
	const { browser, envs, route, viewport } = input;
	const oldOrigin = envs.old.origin;
	const newOrigin = envs.new.origin;
	const [o1, o2, n] = await Promise.all([open(browser, envs.old, route, viewport), open(browser, envs.old, route, viewport), open(browser, envs.new, route, viewport)]);
	try {
		const explained: (Explanation | undefined)[] = [];
		for (const { element, props } of input.explain) {
			const at = matchElements([element], o1.base).get(0);
			explained.push(at === undefined ? undefined : await explain(o1, input.rules, o1.base[at]!, props));
		}
		const runs: StateRun[] = [];
		const m12 = matchElements(o1.base, o2.base);
		const m1n = matchElements(o1.base, n.base);
		for (const state of input.states.slice(0, MAX_STATES)) {
			let targets: number[] = [];
			if (state.kind === 'pseudo' || state.kind === 'property') {
				const ids = new Set(await o1.page.evaluate(matchingIds, state.target));
				targets = o1.base.flatMap((el, i) => (ids.has(el.id) ? [i] : [])).filter((i) => m12.has(i) && m1n.has(i)).slice(0, TARGETS_PER_STATE);
				if (!targets.length) {
					runs.push({ label: state.label, kind: state.kind, skipped: `${state.label}: no visible element on the page matches it on both sides` });
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
				runs.push({ label: state.label, kind: state.kind, skipped: `${state.label}: no size container on the page` });
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
						await settleState(side.page, side.inflight);
					}),
				);
			};

			await apply(true);
			try {
				const [s1, s2, sn] = await Promise.all([collect(o1, oldOrigin), collect(o2, oldOrigin), collect(n, newOrigin)]);
				const { changedBoxes, differing } = stateDiff(o1.base, n.base, s1, s2, sn, input.noise);
				const explanations: (Explanation | undefined)[] = [];
				for (const { el, props } of differing.slice(0, ELEMENTS_PER_STATE)) explanations.push(await explain(o1, input.rules, el, props));
				const { shoot, clip } = stateShot(state.kind, changedBoxes, differing.length, targets, o1.base);
				if (!shoot) {
					runs.push({ label: state.label, kind: state.kind, targets, s1, s2, sn, explanations });
					continue;
				}
				const images = await Promise.all([drawnImages(o1.page), drawnImages(o2.page), drawnImages(n.page)]);
				const shots = await Promise.all([screenshot(o1.page, clip), screenshot(o2.page, clip), screenshot(n.page, clip)]);
				runs.push({ label: state.label, kind: state.kind, targets, s1, s2, sn, explanations, images, shots });
			} finally {
				await apply(false);
			}
		}
		return { viewport: viewport.name, explained, base1: o1.base, baseN: n.base, states: runs };
	} finally {
		await Promise.all([o1, o2, n].map((side) => side.context.close()));
	}
}

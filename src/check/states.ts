import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { settle } from './capture.ts';
import { readPage } from './collect.ts';
import { matchElements } from './match.ts';
import type { CssRule, CssState } from './stylesheet.ts';
import type { Box, ElementSnapshot, ImageRecord, Viewport } from './types.ts';
import { loadPage } from './infrastructure.ts';
import { holdLoops, settleMotion } from './loops.ts';
import { maskedShot } from './embeds.ts';
import { CLIP_PADDING, ELEMENTS_PER_STATE, explanationOf, forcedAlike, joinState, MAX_STATES, newIds, stateDiff, stateShot, TARGETS_PER_STATE, type CascadeAnswers, type Explanation, type ForcedStatesRow, type OldStateRun, type StateNoise, type StateRun, type StatesViewportRow, type TraceOld } from './states-compare.ts';

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
	// Once per page: DOM.getDocument renumbers the nodes, and a state forced under an old number can then never be lifted.
	await session.send('DOM.getDocument', { depth: 0 });
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

// Runs inside the OLD page: for each element, which rule sets each property, walking up for inherited ones, and which rule sets a var() it reads.
function explainInPage({ items, rules }: { items: { id: number; props: string[] }[]; rules: { selector: string; conditions: { kind: string; text: string }[]; specificity: number[]; order: number; declarations: { property: string; value: string; important: boolean }[] }[] }) {
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
	const declaring = new Map<string, number[]>();
	rules.forEach((rule, index) => {
		for (const d of new Set(rule.declarations.map((x) => x.property))) {
			const list = declaring.get(d);
			if (list) list.push(index);
			else declaring.set(d, [index]);
		}
	});
	const candidates = (prop: string) => {
		const parts = prop.split('-');
		const names = [...parts.map((_, i) => parts.slice(0, i + 1).join('-')), ...Object.keys(SHORT).filter((d) => SHORT[d]!.includes(prop))];
		return [...new Set(names.flatMap((d) => declaring.get(d) ?? []))].sort((a, b) => a - b);
	};
	const best = (node: Element, prop: string) => {
		let win: { index: number; value: string; rank: number[] } | undefined;
		for (const index of candidates(prop)) {
			const rule = rules[index]!;
			const decl = rule.declarations.findLast((d) => covers(d.property, prop));
			if (!decl || !holds(rule) || !matches(node, rule.selector)) continue;
			const rank = [decl.important ? 1 : 0, ...rule.specificity, rule.order];
			const k = win ? rank.findIndex((v, i) => v !== win!.rank[i]) : 0;
			if (!win || (k >= 0 && rank[k]! > win.rank[k]!)) win = { index, value: decl.value, rank };
		}
		return win;
	};
	const find = (start: Element, prop: string, inherit: boolean) => {
		for (let node: Element | null = start; node; node = node.parentElement) {
			const hit = best(node, prop);
			if (hit || !inherit) return hit;
		}
		return undefined;
	};
	const byId = (window as unknown as { __mmById: Map<number, Element> }).__mmById;
	return items.map(({ id, props }) => {
		const out: Record<string, { rule: number; value: string; variable?: { name: string; rule: number; value: string } } | null> = {};
		const el = byId.get(id);
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
	});
}

const asPageRules = (rules: readonly CssRule[]) => rules as unknown as Parameters<typeof explainInPage>[0]['rules'];

async function cascade(side: Side, rules: readonly CssRule[], items: readonly { readonly id: number; readonly props: readonly string[] }[]): Promise<CascadeAnswers[]> {
	if (!items.length) return [];
	return side.page.evaluate(explainInPage, { items: items.map(({ id, props }) => ({ id, props: [...props] })), rules: asPageRules(rules) });
}

async function explain(side: Side, rules: readonly CssRule[], element: ElementSnapshot, props: readonly string[]): Promise<Explanation | undefined> {
	const [found] = await cascade(side, rules, [{ id: element.id, props }]);
	return explanationOf(rules, found!, props);
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

/** Forces `state` on one page, on the elements `ids` names for a pseudo, property or container state, or lifts it; then lets it settle. */
async function force(side: Side, state: CssState, viewport: Viewport, ids: readonly number[], on: boolean): Promise<void> {
	if (state.kind === 'pseudo') {
		for (const id of ids) {
			const node = await nodeId(side, id);
			if (node !== undefined) await side.session.send('CSS.forcePseudoState', { nodeId: node, forcedPseudoClasses: on ? [state.pseudo] : [] });
		}
	} else if (state.kind === 'property') {
		for (const id of ids) await side.page.evaluate(setProperty, { id, property: state.property, on });
	} else if (state.kind === 'media') {
		await side.page.emulateMedia(state.feature === 'prefers-color-scheme' ? { colorScheme: on ? (state.value as 'dark' | 'light') : 'light' } : { reducedMotion: on ? 'no-preference' : 'reduce' });
	} else if (state.kind === 'width') {
		await side.page.setViewportSize({ width: on ? state.width : viewport.width, height: viewport.height });
	} else {
		for (const id of ids) await side.page.evaluate(sizeContainer, { id, width: on ? state.width : null });
	}
	await settleState(side.page, side.inflight);
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

/** The size containers of `base` a container state sizes. */
const containersOf = (state: Extract<CssState, { kind: 'container' }>, base: readonly ElementSnapshot[]) => base.flatMap((el, i) => (el.style['container-type'] && el.style['container-type'] !== 'normal' && (!state.name || el.style['container-name']?.split(' ').includes(state.name)) ? [i] : []));

interface LiveSides {
	readonly o1: Side;
	readonly o2: Side;
	readonly n: Side;
	readonly m12: Map<number, number>;
	readonly m1n: Map<number, number>;
}

/** One state forced on both old pages and the new one, on the old elements the new page shows too, as a live run forces it. */
async function liveState({ o1, o2, n, m12, m1n }: LiveSides, state: CssState, viewport: Viewport, origins: { readonly old: string; readonly new: string }, rules: readonly CssRule[], noise: StateNoise): Promise<StateRun> {
	let targets: number[] = [];
	if (state.kind === 'pseudo' || state.kind === 'property') {
		const ids = new Set(await o1.page.evaluate(matchingIds, state.target));
		targets = o1.base.flatMap((el, i) => (ids.has(el.id) ? [i] : [])).filter((i) => m12.has(i) && m1n.has(i)).slice(0, TARGETS_PER_STATE);
		if (!targets.length) return { label: state.label, kind: state.kind, skipped: `${state.label}: no visible element on the page matches it on both sides` };
	}
	const sides: [Side, Map<number, number> | undefined][] = [
		[o1, undefined],
		[o2, m12],
		[n, m1n],
	];
	const idsOn = (pairs: Map<number, number> | undefined, side: Side, indices: readonly number[]) => indices.map((i) => side.base[pairs ? pairs.get(i)! : i]!.id);
	const containers = state.kind === 'container' ? containersOf(state, o1.base).filter((i) => m12.has(i) && m1n.has(i)) : [];
	if (state.kind === 'container' && !containers.length) return { label: state.label, kind: state.kind, skipped: `${state.label}: no size container on the page` };

	const apply = (on: boolean) => Promise.all(sides.map(([side, pairs]) => force(side, state, viewport, idsOn(pairs, side, state.kind === 'container' ? containers : targets), on)));

	await apply(true);
	try {
		const [s1, s2, sn] = await Promise.all([collect(o1, origins.old), collect(o2, origins.old), collect(n, origins.new)]);
		const { changedBoxes, differing } = stateDiff(o1.base, n.base, s1, s2, sn, noise);
		const explanations: (Explanation | undefined)[] = [];
		for (const { el, props } of differing.slice(0, ELEMENTS_PER_STATE)) explanations.push(await explain(o1, rules, el, props));
		const { shoot, clip } = stateShot(state.kind, changedBoxes, differing.length, targets, o1.base);
		if (!shoot) return { label: state.label, kind: state.kind, targets, s1, s2, sn, explanations };
		const images = await Promise.all([drawnImages(o1.page), drawnImages(o2.page), drawnImages(n.page)]);
		const shots = await Promise.all([screenshot(o1.page, clip), screenshot(o2.page, clip), screenshot(n.page, clip)]);
		return { label: state.label, kind: state.kind, targets, s1, s2, sn, explanations, images, shots };
	} finally {
		await apply(false);
	}
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
		const sides = { o1, o2, n, m12: matchElements(o1.base, o2.base), m1n: matchElements(o1.base, n.base) };
		const runs: StateRun[] = [];
		for (const state of input.states.slice(0, MAX_STATES)) runs.push(await liveState(sides, state, viewport, { old: oldOrigin, new: newOrigin }, input.rules, input.noise));
		return { viewport: viewport.name, explained, base1: o1.base, baseN: n.base, states: runs };
	} finally {
		await Promise.all([o1, o2, n].map((side) => side.context.close()));
	}
}


export interface OldStatesInput {
	readonly browser: Browser;
	readonly env: SideEnv;
	readonly route: string;
	readonly viewport: Viewport;
	readonly states: readonly CssState[];
	/** The old stylesheets' rules, in parse order: the cascade answers name them by index. */
	readonly rules: readonly CssRule[];
}

/** What one old page shows in a forced state, and its images and shot, taken right after the state settles as a live run takes them. */
interface OldSeen {
	readonly elements: ElementSnapshot[];
	readonly images: ImageRecord[];
	readonly shot: Buffer;
	readonly clip?: Box;
}

/** Forces each state on `side` in turn, on the elements `ids` names (undefined: not forced), shooting every one, then `after` while it still holds. */
async function oldPass(side: Side, states: readonly CssState[], ids: readonly (readonly number[] | undefined)[], viewport: Viewport, origin: string, clipOf: (k: number, elements: readonly ElementSnapshot[]) => Box | undefined, after: (k: number, elements: readonly ElementSnapshot[]) => Promise<void> = async () => {}): Promise<(OldSeen | undefined)[]> {
	const out: (OldSeen | undefined)[] = [];
	for (const [k, state] of states.entries()) {
		const on = ids[k];
		if (!on) {
			out.push(undefined);
			continue;
		}
		await force(side, state, viewport, on, true);
		try {
			const elements = await collect(side, origin);
			const clip = clipOf(k, elements);
			const images = await drawnImages(side.page);
			const shot = await screenshot(side.page, clip);
			out.push({ elements, images, shot, ...(clip ? { clip } : {}) });
			await after(k, elements);
		} finally {
			await force(side, state, viewport, on, false);
		}
	}
	return out;
}

/** The properties of each element `elements` shows otherwise than `base` did, by element id. */
function changedOn(base: readonly ElementSnapshot[], elements: readonly ElementSnapshot[]): { readonly el: ElementSnapshot; readonly props: string[] }[] {
	const before = new Map(base.map((el) => [el.id, el]));
	return elements.flatMap((el) => {
		const was = before.get(el.id);
		const props = Object.keys(el.style).filter((p) => p !== 'font-family' && (!was || was.style[p] !== el.style[p]));
		return props.length ? [{ el, props }] : [];
	});
}

/**
 * The original's half of the forced states, with no new page in the room. Each state is forced on one old page, then on a
 * second opened after the first is done, so what varies with time differs between the two as it does between loads. Every
 * state is shot, since a new page's difference could ask for any; the cascade is read for each property a state changed.
 */
export async function observeOldStates(input: OldStatesInput): Promise<Pick<ForcedStatesRow, 'viewport' | 'base1' | 'states'>> {
	const { browser, env, route, viewport } = input;
	const states = input.states.slice(0, MAX_STATES);
	const o1 = await open(browser, env, route, viewport);
	const base1 = o1.base;
	const plan: ({ readonly targets: number[]; readonly containers: number[] } | { readonly skipped: string })[] = [];
	const answers: Map<number, CascadeAnswers>[] = [];
	let first: (OldSeen | undefined)[];
	try {
		for (const state of states) {
			if (state.kind === 'pseudo' || state.kind === 'property') {
				const ids = new Set(await o1.page.evaluate(matchingIds, state.target));
				const targets = base1.flatMap((el, i) => (ids.has(el.id) ? [i] : [])).slice(0, TARGETS_PER_STATE);
				plan.push(targets.length ? { targets, containers: [] } : { skipped: `${state.label}: no visible element on the page matches it on both sides` });
			} else if (state.kind === 'container') {
				const containers = containersOf(state, base1);
				plan.push(containers.length ? { targets: [], containers } : { skipped: `${state.label}: no size container on the page` });
			} else plan.push({ targets: [], containers: [] });
		}
		const forcedOn = (p: (typeof plan)[number]) => ('skipped' in p ? undefined : [...p.targets, ...p.containers]);
		first = await oldPass(
			o1,
			states,
			plan.map((p) => forcedOn(p)?.map((i) => base1[i]!.id)),
			viewport,
			env.origin,
			(k, elements) => {
				const p = plan[k]!;
				return stateShot(states[k]!.kind, changedOn(base1, elements).map((c) => c.el.box), 1, 'skipped' in p ? [] : p.targets, base1).clip;
			},
			async (k, elements) => {
				const changed = changedOn(base1, elements);
				const found = await cascade(o1, input.rules, changed.map(({ el, props }) => ({ id: el.id, props })));
				answers[k] = new Map(changed.map(({ el }, j) => [el.id, found[j]!]));
			},
		);
		const o2 = await open(browser, env, route, viewport);
		try {
			const m12 = matchElements(base1, o2.base);
			const second = await oldPass(
				o2,
				states,
				plan.map((p, k) => {
					const on = forcedOn(p);
					return first[k] && on?.every((i) => m12.has(i)) ? on.map((i) => o2.base[m12.get(i)!]!.id) : undefined;
				}),
				viewport,
				env.origin,
				(k) => first[k]!.clip,
			);
			const runs = states.map((state, k): OldStateRun => {
				const p = plan[k]!;
				const [a, b] = [first[k], second[k]];
				if ('skipped' in p) return { label: state.label, kind: state.kind, skipped: p.skipped };
				if (!a || !b) return { label: state.label, kind: state.kind, skipped: `${state.label}: no visible element on the page matches it on both sides` };
				return { label: state.label, kind: state.kind, state, targets: p.targets, containers: p.containers, s1: a.elements, s2: b.elements, answers: answers[k]!, images: [a.images, b.images], shots: [a.shot, b.shot] };
			});
			return { viewport: viewport.name, base1, states: runs };
		} finally {
			await o2.context.close();
		}
	} finally {
		await o1.context.close();
	}
}

export interface StatesAgainstInput {
	readonly browser: Browser;
	readonly envs: { readonly old: SideEnv; readonly new: SideEnv };
	readonly route: string;
	readonly viewport: Viewport;
	/** The original's forced states on this viewport, from its dataset. */
	readonly stored: ForcedStatesRow;
	readonly rules: readonly CssRule[];
	readonly explain: StatesInput['explain'];
}

/**
 * The new page's half of each stored state, forced on the elements that match the stored old page's; the old half and its
 * noise are the dataset's. A state a live run would force on other old elements (one it was stored on is not on the new page)
 * is forced live on two old pages, and an element only the new page changed in a state is traced to its OLD rule on an old
 * page in that state: the hint names the rule, the verdict never reads it.
 */
export async function observeStatesAgainst(input: StatesAgainstInput): Promise<StatesViewportRow> {
	const { browser, envs, route, viewport, stored } = input;
	const [n, explained] = await Promise.all([open(browser, envs.new, route, viewport), explainDefaults(browser, envs.old, route, viewport, input.rules, input.explain)]);
	let first: Promise<Side> | undefined;
	let second: Promise<Side> | undefined;
	const oldPage = () => (first ??= open(browser, envs.old, route, viewport));
	try {
		const pairs = matchElements(stored.base1, n.base);
		const runs: StateRun[] = [];
		for (const run of stored.states) {
			if ('skipped' in run) {
				runs.push(run);
				continue;
			}
			const { state } = run;
			if (!forcedAlike(run, pairs)) {
				const [o1, o2] = await Promise.all([oldPage(), (second ??= open(browser, envs.old, route, viewport))]);
				const seen = await liveState({ o1, o2, n, m12: matchElements(o1.base, o2.base), m1n: matchElements(o1.base, n.base) }, state, viewport, { old: envs.old.origin, new: envs.new.origin }, input.rules, stored.noise);
				runs.push('skipped' in seen ? seen : { ...seen, base1: o1.base });
				continue;
			}
			const trace: TraceOld = async (asked) => {
				const o1 = await oldPage();
				const on = newIds(run.kind === 'container' ? run.containers : run.targets, matchElements(stored.base1, o1.base), o1.base);
				await force(o1, state, viewport, on, true);
				try {
					const seen = await collect(o1, envs.old.origin);
					const out: (Explanation | undefined)[] = [];
					for (const { el, props } of asked) {
						const at = matchElements([el], seen).get(0);
						out.push(at === undefined ? undefined : await explain(o1, input.rules, seen[at]!, props));
					}
					return out;
				} finally {
					await force(o1, state, viewport, on, false);
				}
			};
			const ids = newIds(run.kind === 'container' ? run.containers : run.targets, pairs, n.base);
			await force(n, state, viewport, ids, true);
			try {
				const sn = await collect(n, envs.new.origin);
				runs.push(await joinState(input.rules, stored, run, n.base, sn, async (clip) => ({ images: await drawnImages(n.page), shot: await screenshot(n.page, clip) }), trace));
			} finally {
				await force(n, state, viewport, ids, false);
			}
		}
		return { viewport: viewport.name, explained, base1: stored.base1, baseN: n.base, states: runs, noise: stored.noise };
	} finally {
		const opened = await Promise.all([first, second].map((side) => side?.catch(() => undefined)));
		await Promise.all([n, ...opened].map((side) => side?.context.close()));
	}
}

/** The default-state failures traced to their OLD rule on an old page of its own: the hint names the rule, the verdict never reads it. */
export async function explainDefaults(browser: Browser, env: SideEnv, route: string, viewport: Viewport, rules: readonly CssRule[], targets: StatesInput['explain']): Promise<(Explanation | undefined)[]> {
	if (!targets.length) return [];
	const side = await open(browser, env, route, viewport);
	try {
		const out: (Explanation | undefined)[] = [];
		for (const { element, props } of targets) {
			const at = matchElements([element], side.base).get(0);
			out.push(at === undefined ? undefined : await explain(side, rules, side.base[at]!, props));
		}
		return out;
	} finally {
		await side.context.close();
	}
}

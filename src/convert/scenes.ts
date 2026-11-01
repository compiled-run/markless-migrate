import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';

/** A node of a demo as one frame showed it: an element, or a run of adjacent text (the browser parses a run as one node). */
export type SceneNode = { readonly id: number; readonly tag: string; readonly attrs: readonly (readonly [string, string])[]; readonly kids: readonly SceneNode[] } | { readonly id: number; readonly text: string };

/** The demo as it was `t` ms after the control was used. */
export interface Frame {
	readonly t: number;
	readonly tree: SceneNode;
}

/** One use of a control, from a settled state to the next, with every frame the demo showed on the way. */
export interface Edge {
	readonly from: number;
	readonly control: string;
	readonly to: number;
	readonly frames: readonly Frame[];
}

/**
 * What a demo's own controls did on the old page (its React state: Send, Replay, Show more): the settled states its
 * controls lead to, and each use as the frames it showed. Node ids are the same node across frames and edges.
 */
export interface Scene {
	/** The demo's container (a `[data-slot="preview"]`), found again by signature and occurrence. */
	readonly sig: string;
	readonly nth: number;
	/** The settled states, as frames; the first is the demo as the page loaded. */
	readonly states: readonly SceneNode[];
	readonly edges: readonly Edge[];
	readonly skipped: readonly string[];
}

export interface SceneCapture {
	readonly route: string;
	readonly scenes: readonly Scene[];
}

export interface SceneLimits {
	readonly states: number;
	readonly depth: number;
	/** Quiet time that ends a use, and the longest a use is followed. */
	readonly settle: number;
	readonly max: number;
}

const LIMITS: SceneLimits = { states: 8, depth: 4, settle: 1200, max: 20000 };

/** What a listed text field is given at capture (filled, then Enter): the scene part shows the visitor's own text where it showed this. */
export const TYPED = 'qz typed note 7';
/** A listed text field's uses: filled with TYPED, emptied, and Enter pressed in it. */
export const FIELD_USES = ['fill', 'clear', 'enter'] as const;

// Runs in the page: installs the recorder on a demo. Every node gets an id the first time it is seen; a frame is taken
// on the animation frame after anything in the demo changed.
function install([selector, index]: readonly [string, number]): number {
	const w = window as unknown as { __mmScene: { root: Element; ids: WeakMap<Node, number>; next: number; frames: { t: number; tree: unknown }[]; t0: number; last: number; observer?: MutationObserver; pending: boolean } };
	const root = document.querySelectorAll(selector)[index]!;
	w.__mmScene = { root, ids: new WeakMap(), next: 1, frames: [], t0: performance.now(), last: performance.now(), pending: false };
	return 0;
}

function snapshotIn(): unknown {
	const w = window as unknown as { __mmScene: { root: Element; ids: WeakMap<Node, number>; next: number } };
	const s = w.__mmScene;
	const id = (n: Node) => {
		let v = s.ids.get(n);
		if (v === undefined) s.ids.set(n, (v = s.next++));
		return v;
	};
	const value = (el: Element, a: Attr) => (a.name === 'style' && el instanceof HTMLElement ? el.style.cssText : a.value);
	const snap = (el: Element): unknown => {
		const kids: unknown[] = [];
		let run: { id: number; text: string } | undefined;
		for (const n of el.childNodes) {
			if (n.nodeType === Node.TEXT_NODE) {
				if (run) run.text += n.textContent ?? '';
				else kids.push((run = { id: id(n), text: n.textContent ?? '' }));
				continue;
			}
			// React's server render puts a comment between adjacent text; a client render does not. Neither breaks a run.
			if (n.nodeType === Node.COMMENT_NODE) continue;
			run = undefined;
			if (n instanceof Element) kids.push(snap(n));
		}
		const live: string[][] = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? [['.value', el.value]] : [];
		// Where a transcript's viewport is scrolled: the opening position of a MessageScroller mounted during a use.
		if (el.getAttribute('data-slot') === 'message-scroller-viewport') {
			const max = el.scrollHeight - el.clientHeight;
			live.push(['.scroll', max <= 1 || Math.abs(el.scrollTop - max) <= 1 ? 'end' : el.scrollTop <= 1 ? 'start' : 'last-anchor']);
		}
		// A script's own animation (motion's element.animate) changes nothing in the DOM: its keyframes and timing are recorded.
		const own = el.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.effect instanceof KeyframeEffect && a.effect.target === el);
		if (own.length)
			live.push([
				'.animate',
				JSON.stringify(
					own.map((a) => {
						const effect = a.effect as KeyframeEffect;
						const t = effect.getTiming();
						return { k: effect.getKeyframes().map(({ computedOffset: _, ...k }) => k), d: t.duration, e: t.easing, l: t.delay, f: t.fill };
					}),
				),
			]);
		return { id: id(el), tag: el.tagName.toLowerCase(), attrs: [...[...el.attributes].map((a) => [a.name, value(el, a)]), ...live], kids };
	};
	return snap(s.root);
}

async function snapshot(page: Page): Promise<SceneNode> {
	return (await page.evaluate(snapshotIn)) as SceneNode;
}

async function startRecording(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as unknown as { __mmScene: { root: Element; frames: { t: number; tree: unknown }[]; t0: number; last: number; observer?: MutationObserver; pending: boolean }; __mmSnap: () => unknown };
		const s = w.__mmScene as typeof w.__mmScene & { at?: number; clicked?: boolean };
		s.frames = [];
		s.t0 = performance.now();
		s.last = s.t0;
		s.clicked = false;
		s.observer?.disconnect();
		// A frame's time is when the page changed, after the click itself: the snapshot waits for the next animation frame.
		// A field's use starts as it is given text or a key.
		for (const type of ['click', 'input', 'keydown'])
			document.addEventListener(
				type,
				() => {
					if (s.clicked) return;
					s.clicked = true;
					s.t0 = performance.now();
				},
				{ capture: true, once: true },
			);
		s.observer = new MutationObserver(() => {
			s.last = performance.now();
			if (s.pending) return;
			s.pending = true;
			s.at = s.last - s.t0;
			requestAnimationFrame(() => {
				s.pending = false;
				s.frames.push({ t: Math.max(0, Math.round(s.at ?? 0)), tree: w.__mmSnap() });
			});
		});
		s.observer.observe(s.root, { subtree: true, childList: true, attributes: true, characterData: true });
	});
}

async function stopRecording(page: Page, settle: number, max: number): Promise<Frame[]> {
	const started = Date.now();
	for (;;) {
		await page.waitForTimeout(100);
		const quiet = await page.evaluate(() => {
			const s = (window as unknown as { __mmScene: { last: number } }).__mmScene;
			return performance.now() - s.last;
		});
		if (quiet >= settle || Date.now() - started > max) break;
	}
	return page.evaluate(() => {
		const s = (window as unknown as { __mmScene: { frames: { t: number; tree: unknown }[]; observer?: MutationObserver } }).__mmScene;
		s.observer?.disconnect();
		return s.frames;
	}) as Promise<Frame[]>;
}

/** How long after the use the demo last changed, with nothing recorded but the time. */
async function timeUse(page: Page, act: () => Promise<boolean>, limits: SceneLimits): Promise<number> {
	await page.evaluate(() => {
		const s = (window as unknown as { __mmScene: { root: Element; t0: number; last: number; changed?: number; observer?: MutationObserver } }).__mmScene;
		s.observer?.disconnect();
		s.t0 = performance.now();
		s.last = s.t0;
		s.changed = undefined;
		document.addEventListener('click', () => (s.t0 = performance.now()), { capture: true, once: true });
		s.observer = new MutationObserver(() => {
			s.last = performance.now();
			s.changed = s.last - s.t0;
		});
		s.observer.observe(s.root, { subtree: true, childList: true, attributes: true, characterData: true });
	});
	if (!(await act())) return 0;
	const started = Date.now();
	for (;;) {
		await page.waitForTimeout(100);
		const quiet = await page.evaluate(() => performance.now() - (window as unknown as { __mmScene: { last: number } }).__mmScene.last);
		if (quiet >= limits.settle || Date.now() - started > limits.max) break;
	}
	return page.evaluate(() => Math.round((window as unknown as { __mmScene: { changed?: number } }).__mmScene.changed ?? 0));
}

/**
 * Attributes a port computes from layout as the page runs (MessageScroller's scroll state): not part of what a use
 * did, so neither recorded as its values nor told apart in its states.
 */
export const LAYOUT_OWNED: Readonly<Record<string, readonly string[]>> = {
	'message-scroller': ['data-scrollable', 'data-autoscrolling', 'data-pending-scroll'],
	'message-scroller-viewport': ['data-scrollable', 'data-autoscrolling', 'data-pending-scroll'],
	'message-scroller-button': ['data-active', 'inert', 'tabindex'],
};
export const layoutOwned = (attrs: readonly (readonly [string, string])[], name: string): boolean => LAYOUT_OWNED[attrs.find(([k]) => k === 'data-slot')?.[1] ?? '']?.includes(name) === true;

// Whole ids a framework generates per mount (React's useId and the libraries' ids built on it).
const GENERATED = /base-ui-[\w:-]+|_[Rr]_[\w-]*_|«r\w+»|:r\w+:|react-aria\d*-[\w:-]+/g;
/** Text, attributes and structure, without node ids or the ids a framework generates per mount: two frames that show the same thing are one state. */
export function shape(node: SceneNode): string {
	return 'text' in node ? JSON.stringify(node.text) : `<${node.tag}${[...node.attrs].filter(([k]) => k !== '.scroll' && !layoutOwned(node.attrs, k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => ` ${k}=${JSON.stringify(v.replace(GENERATED, '@id'))}`).join('')}>${node.kids.map(shape).join('')}</${node.tag}>`;
}

const hash = (node: SceneNode) => createHash('sha256').update(shape(node)).digest('hex').slice(0, 16);

// Runs in the page: the demo's listed controls that can be used now, each by its tag, data-slot and text, and which
// element with them it is inside the demo.
function controlsIn([selector, index, listed, text]: readonly [string, number, string, string]): string[] {
	const root = document.querySelectorAll(selector)[index]!;
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.getAttribute('aria-label') ?? (el.matches('textarea, input') ? el.getAttribute('placeholder') : null) ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const out: string[] = [];
	for (const el of root.querySelectorAll(listed)) {
		const sig = sigOf(el);
		const n = counts.get(sig) ?? 0;
		counts.set(sig, n + 1);
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1 || el.matches(':disabled, [aria-disabled="true"], [inert], [inert] *')) continue;
		// A listing that names its controls by text (Replay) leaves the demo's other controls alone.
		if (text && !el.matches('textarea, input') && !new RegExp(text).test(sig.split('|')[2]!)) continue;
		if (el.matches('textarea, input:not([type]), input[type="text"], input[type="search"]')) for (const u of ['fill', 'clear', 'enter']) out.push(`${sig}#${n}|${u}`);
		else out.push(`${sig}#${n}`);
	}
	return out;
}

async function use(page: Page, selector: string, index: number, listed: string, used: string): Promise<boolean> {
	const suffix = used.slice(used.lastIndexOf('|') + 1) as (typeof FIELD_USES)[number];
	const field = FIELD_USES.includes(suffix) ? suffix : undefined;
	const control = field ? used.slice(0, -suffix.length - 1) : used;
	const handle = (
		await page.evaluateHandle(
			([selector, index, listed, control]) => {
				const root = document.querySelectorAll(selector)[index]!;
				const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.getAttribute('aria-label') ?? (el.matches('textarea, input') ? el.getAttribute('placeholder') : null) ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				const counts = new Map<string, number>();
				for (const el of root.querySelectorAll(listed)) {
					const sig = sigOf(el);
					const n = counts.get(sig) ?? 0;
					counts.set(sig, n + 1);
					if (`${sig}#${n}` === control) return el;
				}
				return null;
			},
			[selector, index, listed, control] as const,
		)
	).asElement();
	if (!handle) return false;
	if (field) {
		if (field === 'enter') {
			await handle.focus();
			await page.keyboard.press('Enter');
		} else await handle.fill(field === 'fill' ? TYPED : '');
		return true;
	}
	// A click without the pointer passing over anything: hover cards and tooltips are their own parts' business.
	return handle.evaluate((el) => {
		(el as HTMLElement).click();
		return true;
	});
}

/**
 * Uses the listed controls of each demo on the old page, from every settled state they lead to (breadth first, within
 * `limits`), and records each use frame by frame. A state is reached again by replaying the uses that led to it.
 */
export async function captureScenes(browser: Browser, origin: string, route: string, dir: string, listed: string, limits: SceneLimits = LIMITS, text = ''): Promise<SceneCapture> {
	const file = join(dir, `${createHash('sha256').update(`scenes:7:${route}|${listed}${text ? `|text:${text}` : ''}|${JSON.stringify(limits)}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as SceneCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const scenes: Scene[] = [];
	const url = new URL(route, origin).href;
	const PREVIEW = '[data-slot="preview"]';
	const fresh = async (index: number) => {
		current = index;
		await loadPage(page, url);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(600);
		await page.evaluate(install, [PREVIEW, index] as const);
		await page.evaluate(() => {
			(window as unknown as { __mmSnap: unknown }).__mmSnap = (globalThis as unknown as { __mmSnapshot: () => unknown }).__mmSnapshot;
		});
	};
	const replay = async (control: string) => {
		await startRecording(page);
		await use(page, PREVIEW, current, listed, control);
		await stopRecording(page, limits.settle, limits.max);
	};
	let current = 0;
	try {
		await page.addInitScript(`globalThis.__mmSnapshot = ${snapshotIn.toString()};`);
		await loadPage(page, url);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		const demos = await page.evaluate(([selector, listed, text]) => {
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const counts = new Map<string, number>();
			const order = new Map<Element, number>();
			for (const el of document.body.querySelectorAll('*')) {
				const sig = sigOf(el);
				order.set(el, counts.get(sig) ?? 0);
				counts.set(sig, (counts.get(sig) ?? 0) + 1);
			}
			const named = (el: Element) => !text || el.matches('textarea, input') || new RegExp(text).test((el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60));
			return [...document.querySelectorAll(selector)].map((el, index) => ({ index, sig: sigOf(el), nth: order.get(el) ?? 0, has: [...el.querySelectorAll(listed)].some(named) })).filter((d) => d.has);
		}, [PREVIEW, listed, text] as const);
		for (const demo of demos) {
			const skipped: string[] = [];
			const states: SceneNode[] = [];
			const byHash = new Map<string, number>();
			const paths: string[][] = [];
			const edges: Edge[] = [];
			await fresh(demo.index);
			const first = await snapshot(page);
			states.push(first);
			byHash.set(hash(first), 0);
			paths.push([]);
			// Each state's own ids: a state reached again by replay is matched to them node by node.
			const align = async (state: SceneNode) => {
				await page.evaluate((tree) => {
					const s = (window as unknown as { __mmScene: { root: Element; ids: WeakMap<Node, number>; next: number } }).__mmScene;
					// What the replayed state holds beyond the recorded one is new: it gets ids of its own at the next snapshot.
					const walk = (el: Element, node: { id: number; kids?: { id: number; text?: string }[] } | undefined) => {
						if (!node) return;
						s.ids.set(el, node.id);
						const nodes = node.kids ?? [];
						let k = 0;
						let inRun = false;
						for (const n of el.childNodes) {
							if (n.nodeType === Node.TEXT_NODE) {
								if (!inRun) s.ids.set(n, nodes[k++]?.id ?? s.next++);
								inRun = true;
								continue;
							}
							inRun = false;
							if (n instanceof Element) walk(n, nodes[k++] as never);
						}
					};
					walk(s.root, tree as never);
				}, state);
			};
			let maxId = 0;
			const bump = (node: SceneNode): void => {
				maxId = Math.max(maxId, node.id);
				if ('kids' in node) node.kids.forEach(bump);
			};
			bump(first);
			for (let at = 0; at < states.length && at < limits.states; at++) {
				if (paths[at]!.length >= limits.depth) continue;
				await fresh(demo.index);
				for (const step of paths[at]!) await replay(step);
				const controls = await page.evaluate(controlsIn, [PREVIEW, demo.index, listed, text] as const);
				for (const control of controls) {
					if (edges.some((e) => e.from === at && e.control === control)) continue;
					await fresh(demo.index);
					for (const step of paths[at]!) await replay(step);
					await snapshot(page);
					await align(states[at]!);
					await page.evaluate((next) => {
						(window as unknown as { __mmScene: { next: number } }).__mmScene.next = next;
					}, maxId + 1);
					await startRecording(page);
					if (!(await use(page, PREVIEW, demo.index, listed, control))) {
						skipped.push(`${control} from state ${at}: not usable`);
						continue;
					}
					let frames = await stopRecording(page, limits.settle, limits.max);
					// Taking each frame slows the page: a long use is timed again without frames, and its frames spread over that time.
					const took = frames.at(-1)?.t ?? 0;
					if (frames.length > 3 && took > 0) {
						await fresh(demo.index);
						for (const step of paths[at]!) await replay(step);
						const plain = await timeUse(page, () => use(page, PREVIEW, demo.index, listed, control), limits);
						if (plain > 0 && plain < took) frames = frames.map((f) => ({ ...f, t: Math.round((f.t * plain) / took) }));
					}
					const settled = frames.at(-1)?.tree ?? states[at]!;
					frames.forEach((f) => bump(f.tree));
					const key = hash(settled);
					let to = byHash.get(key);
					if (to === undefined) {
						if (states.length >= limits.states) {
							skipped.push(`${control} from state ${at}: past ${limits.states} states`);
							continue;
						}
						to = states.length;
						states.push(settled);
						byHash.set(key, to);
						paths.push([...paths[at]!, control]);
					}
					edges.push({ from: at, control, to, frames });
				}
			}
			scenes.push({ sig: demo.sig, nth: demo.nth, states, edges, skipped });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: SceneCapture = { route, scenes };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

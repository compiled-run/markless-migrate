import type { Png } from './artifacts.ts';
import type { Browser, Page } from 'playwright';
import type { SideEnv } from './browser.ts';
import { readPage } from './collect.ts';
import { loopKeys, settleAndHoldLoops } from './loops.ts';
import { HINTS } from './hints.ts';
import { cycleLabel, describeTarget, locate, openSession, pool, type CycleAct, type RecordedJourney, type Target } from './journeys.ts';
import { checkCanvases, type CanvasComparison } from './motion-canvas.ts';
import { describe, matchElements } from './match.ts';
import { describeRule, type CssRule } from './stylesheet.ts';
import type { Box, ElementSnapshot, Failure, Viewport } from './types.ts';

export interface MotionOptions {
	/** At most this many journeys' last steps recorded per route, in the order the explorer found them; default 40. */
	readonly maxInteractions?: number;
	/** At most this many controls hovered and focused per route; default 24. */
	readonly maxHovers?: number;
	/** At most this many opened dialogs, menus and popups dismissed with Escape per route, so their exit is recorded; default 16. */
	readonly maxDismissals?: number;
	/** At most this many uses of a control after its journey (closing what it opened, opening it again) per route, so a disclosure's exit is recorded; default 24. */
	readonly maxCycles?: number;
	/** The old stylesheets' rules that declare a transition or an animation, to list those no recorded interaction ran. */
	readonly rules?: readonly { readonly selector: string; readonly label: string }[];
}

export type MotionKind = 'transition' | 'animation' | 'web animation' | 'script' | 'media';

/** One transition or animation that started during an interaction. */
export interface MotionRecord {
	readonly kind: MotionKind;
	/** The transition's property, the CSS animation's name, or the Web Animation's id. */
	readonly name: string;
	readonly properties: readonly string[];
	/** First and last keyframe value, when one property moves. */
	readonly from?: string;
	readonly to?: string;
	readonly duration: number;
	readonly delay: number;
	readonly easing: string;
	readonly iterations: number | 'infinite';
	readonly element: ElementSnapshot;
	readonly pseudo?: string;
}

export interface MotionCapture {
	readonly interaction: string;
	readonly motions: readonly MotionRecord[];
	/** The step loaded another page or changed the path: motion is compared on pages, not across them. */
	readonly navigated?: boolean;
	readonly failed?: string;
	/** Every element on the page, to find the counterpart of one that moves on the other side only. */
	readonly elements?: readonly ElementSnapshot[];
	/** Indices of the rules whose selector matches an element that moved. */
	readonly hits?: readonly number[];
	/** Every animated element at fixed moments of the interaction, every animation held there: the same moments on both sides. */
	readonly pinned?: readonly PinnedFrame[];
}

/** What one element shows at one pinned moment. */
export interface PinnedElement {
	readonly element: ElementSnapshot;
	readonly shown: boolean;
	readonly opacity: number;
	readonly box: Box;
}

/** `t` ms into the interaction; `note` names the animation whose last frame or end it is. */
export interface PinnedMoment {
	readonly t: number;
	readonly note?: string;
}

export interface PinnedFrame extends PinnedMoment {
	readonly elements: readonly PinnedElement[];
}

/** Frames of one interaction on both sides, at the same offsets into the old side's longest animation. */
export interface Filmstrip {
	readonly label: string;
	readonly offsets: readonly number[];
	readonly old: readonly Png[];
	readonly new: readonly Png[];
}

export interface MotionInteraction {
	readonly name: string;
	readonly old: readonly string[];
	readonly new: readonly string[];
	readonly ok: boolean;
	/** The same interaction with prefers-reduced-motion: reduce, recorded when either side animated without it. */
	readonly reduced?: { readonly old: readonly string[]; readonly new: readonly string[]; readonly ok: boolean };
}

export interface MotionResult {
	/** Interactions recorded on both sides: journeys' last steps, Escape after each opened dialog, menu or popup, hovers, focuses and the scroll. */
	readonly checked: number;
	readonly interactions: readonly MotionInteraction[];
	/** Interactions not recorded, with why (a navigation, a step that failed, the cap). */
	readonly skipped: readonly string[];
	/** Old rules declaring a transition or animation that no recorded interaction ran on the old page; the css dimension compares their values. */
	readonly unexercised?: readonly string[];
	/** Each canvas of the old page's first screen, its frames from load compared with the new page's. */
	readonly canvases?: readonly CanvasComparison[];
}

const DEFAULT_MAX_INTERACTIONS = 40;
const DEFAULT_MAX_HOVERS = 24;
const DEFAULT_MAX_DISMISSALS = 16;
const DEFAULT_MAX_CYCLES = 24;
const CONCURRENCY = 4;
const FRAMES = 5;
const LIMIT = 20;
// Animation timing is exact; 10% or 20 ms absorbs a duration computed from a height that differs by a few pixels.
const TOLERANCE_MS = 20;
const TOLERANCE_RATIO = 0.1;
// Script-driven motion is timed by the wall clock between the first and last frame that wrote a style.
const SCRIPT_TOLERANCE_MS = 50;
const SCRIPT_TOLERANCE_RATIO = 0.25;
const HOVER_ROLES = new Set(['link', 'button', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'checkbox', 'radio', 'switch', 'summary', 'treeitem', 'textbox', 'searchbox', 'combobox', 'clickable']);

interface PageRecord {
	readonly kind: MotionKind;
	readonly name: string;
	readonly properties: string[];
	readonly from?: string;
	readonly to?: string;
	readonly duration: number;
	readonly delay: number;
	readonly easing: string;
	readonly iterations: number | 'infinite';
	readonly id?: number;
	readonly tag: string;
	readonly text: string;
	readonly pseudo?: string;
}

interface PageSample {
	readonly id: number;
	readonly shown: boolean;
	readonly opacity: number;
	readonly box: Box;
}

type MotionWindow = Window & { __mmMotionRecorder?: { records(): PageRecord[]; hits(selectors: string[]): number[]; span(): number; ends(): { end: number; what: string; id?: number }[]; sample(): PageSample[]; clip(): Box | null; seek(t: number): void; release(): void; busy(): boolean; stop(): void } };

// Runs in the page: records every transition and animation that starts from now on, and holds finite ones at their start when `pause` is set so frames can be taken at fixed offsets.
export function armMotion(pause: boolean): void {
	// A property a script writes on six frames or more is animated by it; fewer is set-up (a height set before a transition, then cleared). The caret blink a screenshot hides is not motion.
	const SCRIPT_FRAMES = 6;
	const w = window as unknown as MotionWindow;
	w.__mmMotionRecorder?.stop();
	let stopped = false;
	const known = new Set<Animation>(document.getAnimations());
	const sounds: { el: Element | null; what: string; src: string; duration: number }[] = [];
	const onPlay = (e: Event) => {
		const m = e.target;
		if (m instanceof HTMLMediaElement) sounds.push({ el: m, what: m instanceof HTMLVideoElement ? 'video' : 'audio', src: (m.currentSrc || m.src).split('/').pop()?.split('?')[0] ?? '', duration: Number.isFinite(m.duration) ? Math.round(m.duration * 1000) : 0 });
	};
	addEventListener('play', onPlay, true);
	const audio = window as unknown as { __mmWebAudio?: number; AudioScheduledSourceNode?: { prototype: { start: (...a: unknown[]) => void } } };
	const node = audio.AudioScheduledSourceNode?.prototype;
	if (node && audio.__mmWebAudio === undefined) {
		audio.__mmWebAudio = 0;
		const start = node.start;
		node.start = function (this: unknown, ...a: unknown[]) {
			audio.__mmWebAudio!++;
			return start.apply(this, a);
		};
	}
	const audioBefore = audio.__mmWebAudio ?? 0;
	const found: Animation[] = [];
	// A transition reversed part way runs shorter than its rule (CSS's reversing shortening), by however far it had got: its rule's timing is what the stylesheet says.
	const rules = new Map<Animation, { duration: number; delay: number }>();
	const paused: Animation[] = [];
	const heldAt = new Map<Animation, number>();
	let clock = 0;
	let pausing = pause;
	let frame = 0;
	const end = (a: Animation) => {
		const t = a.effect?.getComputedTiming().endTime;
		return typeof t === 'number' && Number.isFinite(t) ? t : undefined;
	};
	const seenAt = new Map<Animation, number>();
	const add = (a: Animation) => {
		if (known.has(a)) return;
		known.add(a);
		found.push(a);
		seenAt.set(a, performance.now());
		if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) {
			const effect = a.effect as KeyframeEffect | null;
			const target = effect?.target;
			if (target) {
				const cs = getComputedStyle(target, effect.pseudoElement ?? undefined);
				const list = (v: string) => v.split(',').map((x) => x.trim());
				const props = list(cs.transitionProperty);
				const at = props.indexOf(a.transitionProperty) >= 0 ? props.indexOf(a.transitionProperty) : props.lastIndexOf('all');
				const ms = (v: string | undefined) => (v === undefined ? undefined : v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000);
				const pick = (v: string[]) => (at < 0 ? undefined : v[at % v.length]);
				const duration = ms(pick(list(cs.transitionDuration)));
				const delay = ms(pick(list(cs.transitionDelay)));
				if (duration !== undefined && delay !== undefined) rules.set(a, { duration, delay });
			}
		}
		// A scroll-driven animation moves with the scroll position, not the clock: it is neither paused nor seeked.
		if (pausing && end(a) !== undefined && a.playState === 'running' && a.timeline === document.timeline) {
			a.pause();
			paused.push(a);
			heldAt.set(a, clock);
		}
	};
	const scan = () => {
		for (const a of document.getAnimations()) add(a);
	};
	addEventListener('transitionrun', scan, true);
	addEventListener('animationstart', scan, true);
	const tick = () => {
		if (stopped) return;
		frame++;
		scan();
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const parse = (text: string) => Object.fromEntries(text.split(';').map((s) => s.split(':')).filter((p) => p.length >= 2).map(([k, ...v]) => [k!.trim(), v.join(':').trim()]));
	const styled = new Map<Element, { props: Map<string, Set<number>>; first: number; last: number }>();
	const observer = new MutationObserver((list) => {
		for (const m of list) {
			if (!(m.target instanceof Element)) continue;
			const a = parse(m.oldValue ?? '');
			const b = parse(m.target.getAttribute('style') ?? '');
			const props = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k] && k !== 'caret-color');
			if (!props.length) continue;
			const now = performance.now();
			const entry = styled.get(m.target) ?? { props: new Map<string, Set<number>>(), first: now, last: now };
			for (const p of props) entry.props.set(p, (entry.props.get(p) ?? new Set<number>()).add(frame));
			entry.last = now;
			styled.set(m.target, entry);
		}
	});
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'], attributeOldValue: true, subtree: true });
	const kebab = (p: string) => (p === 'cssFloat' ? 'float' : p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
	const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80);
	const ids = () => (window as unknown as { __mmIds?: WeakMap<Element, number> }).__mmIds;
	const who = (el: Element | null | undefined) => ({ ...(el && ids()?.has(el) ? { id: ids()!.get(el)! } : {}), tag: el?.tagName.toLowerCase() ?? '', text: clean(el?.textContent ?? '') });
	w.__mmMotionRecorder = {
		records() {
			const out: PageRecord[] = [];
			// Transitions of one property on one element are one motion: a colour inherited from an ancestor's transition starts the child's again each time it ends or is retargeted, as many times as frames happened to allow.
			// Only a transition that starts again before the one before it would have ended: a fade out a timer starts later is motion of its own.
			const chained = new Map<Element, Map<string, { at: number; until: number }>>();
			for (const a of found) {
				const effect = a.effect as KeyframeEffect | null;
				if (!effect) continue;
				const timing = effect.getComputedTiming();
				const duration = typeof timing.duration === 'number' ? timing.duration : 0;
				const iterations = timing.iterations ?? 1;
				if (!(duration > 1) || (Number.isFinite(iterations) && duration * iterations <= 1)) continue;
				const keyframes = effect.getKeyframes();
				const transition = typeof CSSTransition !== 'undefined' && a instanceof CSSTransition;
				const css = typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation;
				const keys = [...new Set(keyframes.flatMap((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))];
				const properties = transition ? [(a as CSSTransition).transitionProperty] : keys.map(kebab).sort();
				const key = keys.length === 1 ? keys[0]! : undefined;
				const first = key ? keyframes[0]?.[key] : undefined;
				const last = key ? keyframes.at(-1)?.[key] : undefined;
				const easing = effect.getTiming().easing ?? 'linear';
				const rule = rules.get(a);
				const shortened = rule !== undefined && rule.duration > duration + 1;
				if (transition && effect.target) {
					const k = `${effect.pseudoElement ?? ''}|${(a as CSSTransition).transitionProperty}`;
					const byKey = chained.get(effect.target) ?? new Map<string, { at: number; until: number }>();
					chained.set(effect.target, byKey);
					const started = seenAt.get(a) ?? 0;
					const until = started + Number(effect.getTiming().delay ?? 0) + duration;
					const prev = byKey.get(k);
					if (prev !== undefined && started <= prev.until + 50) {
						if (last !== undefined && last !== null) out[prev.at] = { ...out[prev.at]!, to: String(last) };
						prev.until = Math.max(prev.until, until);
						continue;
					}
					byKey.set(k, { at: out.length, until });
				}
				out.push({
					kind: transition ? 'transition' : css ? 'animation' : 'web animation',
					name: transition ? (a as CSSTransition).transitionProperty : css ? (a as CSSAnimation).animationName : a.id,
					properties,
					...(first !== undefined && first !== null && !shortened ? { from: String(first) } : {}),
					...(last !== undefined && last !== null ? { to: String(last) } : {}),
					duration: Math.round(shortened ? rule.duration : duration),
					delay: Math.round(shortened ? rule.delay : Number(effect.getTiming().delay ?? 0)),
					easing: easing !== 'linear' ? easing : (keyframes.find((k) => k.easing && k.easing !== 'linear')?.easing ?? 'linear'),
					iterations: Number.isFinite(iterations) ? iterations : 'infinite',
					...who(effect.target),
					...(effect.pseudoElement ? { pseudo: effect.pseudoElement } : {}),
				});
			}
			for (const s of sounds) out.push({ kind: 'media', name: s.src, properties: [s.what], duration: s.duration, delay: 0, easing: '', iterations: 1, ...who(s.el) });
			if ((audio.__mmWebAudio ?? 0) > audioBefore) out.push({ kind: 'media', name: 'Web Audio', properties: ['sound'], duration: 0, delay: 0, easing: '', iterations: 1, ...who(document.body) });
			for (const [el, s] of styled) {
				const moving = [...s.props].filter(([, f]) => f.size >= SCRIPT_FRAMES).map(([p]) => p);
				if (!moving.length) continue;
				out.push({ kind: 'script', name: '', properties: moving.sort(), duration: Math.round(s.last - s.first), delay: 0, easing: '', iterations: 1, ...who(el) });
			}
			return out;
		},
		span() {
			return Math.max(0, ...paused.map((a) => end(a) ?? 0));
		},
		clip() {
			const boxes = [...paused.map((a) => (a.effect as KeyframeEffect | null)?.target), ...[...styled].filter(([, s]) => [...s.props.values()].some((f) => f.size >= SCRIPT_FRAMES)).map(([el]) => el)].flatMap((el) => (el?.isConnected ? [el.getBoundingClientRect()] : [])).filter((r) => r.width > 0 || r.height > 0);
			if (!boxes.length) return null;
			const pad = 12;
			const x = Math.max(0, Math.min(...boxes.map((r) => r.left)) - pad);
			const y = Math.max(0, Math.min(...boxes.map((r) => r.top)) - pad);
			const right = Math.min(innerWidth, Math.max(...boxes.map((r) => r.right)) + pad);
			const bottom = Math.min(innerHeight, Math.max(...boxes.map((r) => r.bottom)) + pad);
			if (right - x < 8 || bottom - y < 8) return null;
			return { x: Math.round(x), y: Math.round(y), width: Math.round(Math.max(48, right - x)), height: Math.round(Math.max(32, bottom - y)) };
		},
		ends() {
			return paused.flatMap((a) => {
				const e = end(a);
				if (e === undefined || !(e > 0)) return [];
				const what = typeof CSSTransition !== 'undefined' && a instanceof CSSTransition ? `the ${a.transitionProperty} transition` : typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation ? `animation ${a.animationName}` : `animation ${a.id || '(script)'}`;
				const el = (a.effect as KeyframeEffect | null)?.target;
				return [{ end: Math.round(e + (heldAt.get(a) ?? 0)), what, ...(el && ids()?.has(el) ? { id: ids()!.get(el)! } : {}) }];
			});
		},
		sample() {
			const targets = new Set(found.flatMap((a) => {
				const effect = a.effect as KeyframeEffect | null;
				return effect?.target && !effect.pseudoElement ? [effect.target] : [];
			}));
			return [...targets].flatMap((el) => {
				const id = ids()?.get(el);
				if (id === undefined) return [];
				const r = el.getBoundingClientRect();
				return [{ id, shown: el.isConnected && el.checkVisibility({ visibilityProperty: true }), opacity: Number(getComputedStyle(el).opacity), box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }];
			});
		},
		// Forward only: an animation seeked to its end finishes, and the page's own end handlers run as they would.
		seek(t: number) {
			clock = t;
			for (const a of paused) {
				const local = Math.max(0, t - (heldAt.get(a) ?? 0));
				a.currentTime = Math.min(local, end(a) ?? local);
			}
		},
		release() {
			pausing = false;
			for (const a of paused) if (a.playState === 'paused') a.play();
		},
		busy() {
			return document.getAnimations().some((a) => a.playState === 'running' && end(a) !== undefined);
		},
		hits(selectors: string[]) {
			const targets = [...found.map((a) => (a.effect as KeyframeEffect | null)?.target), ...styled.keys()].filter((el): el is Element => Boolean(el));
			const plain = (s: string) => s.replace(/::?(before|after|hover|focus-visible|focus-within|focus|active|placeholder|marker)\b/g, '').trim() || '*';
			return selectors.flatMap((s, i) => {
				try {
					return targets.some((el) => el.matches(plain(s))) ? [i] : [];
				} catch {
					return [];
				}
			});
		},
		stop() {
			stopped = true;
			observer.disconnect();
			removeEventListener('transitionrun', scan, true);
			removeEventListener('animationstart', scan, true);
			removeEventListener('play', onPlay, true);
		},
	};
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))).catch(() => {});
const span = (page: Page) => page.evaluate(() => (window as unknown as MotionWindow).__mmMotionRecorder?.span() ?? 0).catch(() => 0);
const clipOf = (page: Page) => page.evaluate(() => (window as unknown as MotionWindow).__mmMotionRecorder?.clip() ?? null).catch(() => null);
const seek = (page: Page, t: number) => page.evaluate((at) => (window as unknown as MotionWindow).__mmMotionRecorder?.seek(at), t).catch(() => {});
const release = (page: Page) => page.evaluate(() => (window as unknown as MotionWindow).__mmMotionRecorder?.release()).catch(() => {});
const ends = (page: Page) => page.evaluate(() => (window as unknown as MotionWindow).__mmMotionRecorder?.ends() ?? []).catch(() => []);
const sample = (page: Page) => page.evaluate(() => (window as unknown as MotionWindow).__mmMotionRecorder?.sample() ?? []).catch(() => [] as PageSample[]);

/** The moments every animated element is compared at: a quarter, half and three quarters into the longest animation, and each animation's last frame and the frame after its end, where the page's own end handlers have run. */
export function pinnedMoments(span: number, ended: readonly { end: number; note: string }[]): PinnedMoment[] {
	if (!(span > 0)) return [];
	const at = new Map<number, string | undefined>([0, 0.25, 0.5, 0.75].map((f) => [Math.round(span * f), undefined]));
	for (const e of ended) {
		at.set(Math.max(0, e.end - 1), at.get(Math.max(0, e.end - 1)) ?? `the last frame of ${e.note}`);
		at.set(e.end, `just after ${e.note} ends`);
	}
	return [...at].sort((a, b) => a[0] - b[0]).map(([t, note]) => ({ t, ...(note ? { note } : {}) }));
}

// Waits for every finite animation to end (at most `cap`), then for one more beat in case one chains another.
type TimerWindow = { __markless_migrate_timer_mark__?: () => number; __markless_migrate_timers_after__?: (mark: number) => number; __markless_migrate_hold_timers__?: (on: boolean) => void };
const holdTimers = (page: Page, on: boolean) => page.evaluate((o) => (globalThis as TimerWindow).__markless_migrate_hold_timers__?.(o), on).catch(() => {});
const timerMark = (page: Page) => page.evaluate(() => (globalThis as TimerWindow).__markless_migrate_timer_mark__?.() ?? 0).catch(() => 0);

/** Waits until the timeouts of up to 3 s set since `mark` have fired (at most 3 s), so what they do falls on the same side of a recording on both apps. */
async function timersOut(page: Page, mark: number, cap = 3_000): Promise<void> {
	const until = Date.now() + cap;
	for (;;) {
		const left = await page.evaluate((m) => (globalThis as TimerWindow).__markless_migrate_timers_after__?.(m) ?? 0, mark).catch(() => 0);
		const room = until - Date.now();
		if (!(left > 0) || room <= 0) return;
		await sleep(Math.min(left + 20, room));
	}
}

async function still(page: Page, cap = 2_000): Promise<void> {
	const until = Date.now() + cap;
	while (Date.now() < until && (await page.evaluate(() => (window as unknown as MotionWindow).__mmMotionRecorder?.busy() ?? document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity))).catch(() => false))) await sleep(30);
	await sleep(120);
}

const shown = (page: Page) => readPage(page, { origin: new URL(page.url()).origin, full: true, styles: false }).then((c) => c.elements as ElementSnapshot[], () => [] as ElementSnapshot[]);

// Elements are described as the other dimensions describe them, from while they moved (`earlier`) when they are hidden by the end.
async function records(page: Page, earlier: readonly ElementSnapshot[] = [], selectors: readonly string[] = []): Promise<{ motions: MotionRecord[]; elements: ElementSnapshot[]; hits?: number[] }> {
	const hits = selectors.length ? await page.evaluate((s) => (window as unknown as MotionWindow).__mmMotionRecorder?.hits(s) ?? [], [...selectors]).catch(() => []) : [];
	const byId = new Map([...(await shown(page)), ...earlier].map((el) => [el.id, el]));
	const raw = ((await page.evaluate(() => (window as unknown as MotionWindow).__mmMotionRecorder?.records()).catch(() => undefined)) ?? []) as PageRecord[];
	const hidden: ElementSnapshot[] = [];
	const motions = raw.flatMap(({ id, tag, text, ...r }) => {
		let element = id !== undefined ? byId.get(id) : undefined;
		// Motion of an element never shown (a closed menu's link, a hidden input) is not seen; a sound is heard all the same.
		if (!element && r.kind !== 'media') return [];
		if (!element) hidden.push((element = { id: -1 - hidden.length, role: '', name: '', tag, text, path: `(not shown)/${tag}`, box: { x: 0, y: 0, width: 0, height: 0 }, style: {} }));
		return [{ ...r, element }];
	});
	return { motions, elements: [...byId.values(), ...hidden], ...(hits.length ? { hits } : {}) };
}

type Learned = SideEnv & { readonly loops: readonly string[] };

/**
 * A journey to record; `dismiss`: after all its steps, Escape is pressed where focus is, and that is the interaction
 * recorded; `act`: after all its steps and the cycle acts before this one, cycle act `act` is the interaction recorded.
 */
type MotionJourney = RecordedJourney & { readonly dismiss?: boolean; readonly act?: number };

async function dismiss(page: Page): Promise<{ failed?: string; navigated: boolean }> {
	const path = new URL(page.url()).pathname;
	await page.keyboard.press('Escape');
	return { navigated: new URL(page.url()).pathname !== path };
}

interface Film {
	readonly span?: number;
	readonly clip?: Box;
	readonly moments?: readonly PinnedMoment[];
}

interface Recorded extends MotionCapture {
	readonly film?: Film;
	readonly frames?: readonly Buffer[];
}

/** The side as motion is recorded: the visitor allows motion (or asks for less), and the clock runs in real time, as while responsiveness is timed. */
export function motionEnv(env: SideEnv, reduced: boolean): SideEnv {
	return { ...env, reducedMotion: reduced ? 'reduce' : 'no-preference', ...(env.freeze ? { freeze: { ...env.freeze, clock: 'ticking' as const } } : {}) };
}

/** One load of the page, settled, for the loops it confirms (every recording then holds them from their first schedule, so each starts at the same phase on its side, without waiting for them to show themselves again) and whether a canvas sits on its first screen. */
async function learnLoops(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<{ loops: readonly string[]; canvas: boolean }> {
	const session = await openSession(browser, env, route, viewport, { loops: true });
	try {
		const canvas = await session.page.evaluate(() => [...document.querySelectorAll('canvas')].some((c) => {
			const r = c.getBoundingClientRect();
			return r.width >= 16 && r.height >= 16 && r.bottom <= innerHeight && r.right <= innerWidth;
		})).catch(() => false);
		await settleAndHoldLoops(session.page);
		return { loops: await loopKeys(session.page), canvas };
	} catch {
		return { loops: [], canvas: false };
	} finally {
		await session.close();
	}
}

/** Replays a journey and records the motion its last step starts; with `film`, frames at fixed offsets across the longest animation. */
async function recordJourney(browser: Browser, env: Learned, route: string, viewport: Viewport, journey: MotionJourney, film?: Film | 'self', selectors: readonly string[] = []): Promise<Recorded> {
	const session = await openSession(browser, env, route, viewport, { loops: { known: env.loops } });
	try {
		const ready = await timerMark(session.page);
		const steps = journey.steps;
		const acted = journey.act !== undefined;
		for (const step of journey.dismiss || acted ? steps : steps.slice(0, -1)) {
			const r = await session.run(step);
			if (r.failed) return { interaction: journey.name, motions: [], failed: r.failed };
		}
		for (const act of acted ? (journey.cycle ?? []).slice(0, journey.act) : []) {
			const r = await session.cycle(steps, act);
			if (r.failed) return { interaction: journey.name, motions: [], failed: r.failed };
		}
		// What the earlier steps set going (a "Copied" label's reset) ends before the recording starts, on both sides.
		await timersOut(session.page, ready);
		await settleAndHoldLoops(session.page);
		// What the step hides when its exit ends (a dialog leaving) can be gone before the page is read after it.
		const before = await shown(session.page);
		const mark = await timerMark(session.page);
		await holdTimers(session.page, true);
		await session.page.evaluate(armMotion, film !== undefined);
		const result = journey.dismiss ? await dismiss(session.page) : acted ? await session.cycle(steps, journey.cycle![journey.act!]!) : await session.run(steps.at(-1)!);
		if (result.failed) return { interaction: journey.name, motions: [], failed: result.failed };
		if (result.navigated) return { interaction: journey.name, motions: [], navigated: true };
		const earlier = await shown(session.page);
		let shots: Buffer[] | undefined;
		let made: Film | undefined;
		const held: { moment: PinnedMoment; items: PageSample[] }[] = [];
		if (film !== undefined) {
			const total = (film !== 'self' && film.span) || (await span(session.page));
			const clip = (film !== 'self' && film.clip) || ((await clipOf(session.page)) ?? undefined);
			if (total > 0) {
				const known = new Map([...before, ...earlier].map((el) => [el.id, el]));
				const moments = (film !== 'self' && film.moments) || pinnedMoments(total, (await ends(session.page)).map((e) => ({ end: e.end, note: `${e.what}${e.id !== undefined && known.has(e.id) ? ` of ${describe(known.get(e.id)!)}` : ''}` })));
				const shotAt = clip ? Array.from({ length: FRAMES }, (_, k) => (total * k) / (FRAMES - 1)) : [];
				made = { span: total, ...(clip ? { clip } : {}), moments };
				if (clip) shots = [];
				for (const t of [...new Set([...shotAt, ...moments.map((m) => m.t)])].sort((a, b) => a - b)) {
					await seek(session.page, t);
					await frames(session.page);
					if (clip && shotAt.includes(t)) shots!.push(await session.page.screenshot({ clip, caret: 'hide' }).catch(() => Buffer.alloc(0)));
					const moment = moments.find((m) => m.t === t);
					if (moment) held.push({ moment, items: await sample(session.page) });
				}
			}
			await release(session.page);
		}
		// What this step set going for later lands inside the recording on both sides, however long the step took on either.
		await holdTimers(session.page, false);
		await timersOut(session.page, mark);
		await still(session.page);
		const recorded = await records(session.page, [...before, ...earlier], selectors);
		const byId = new Map(recorded.elements.map((el) => [el.id, el]));
		const pinned = held.map(({ moment, items }): PinnedFrame => ({ ...moment, elements: items.flatMap((i) => (byId.has(i.id) ? [{ element: byId.get(i.id)!, shown: i.shown, opacity: i.opacity, box: i.box }] : [])) }));
		return { interaction: journey.name, ...recorded, ...(pinned.length ? { pinned } : {}), ...(made ? { film: made } : {}), ...(shots?.length && shots.every((s) => s.length) ? { frames: shots } : {}) };
	} catch (error) {
		return { interaction: journey.name, motions: [], failed: (error as Error).message.split('\n')[0] };
	} finally {
		await session.close();
	}
}

export const SCROLL = 'scroll down one screen';

/** Hovers and keyboard-focuses each target in turn on one page, recording the transitions each starts; with `scroll`, then scrolls down one screen and records what that starts. */
async function recordHovers(browser: Browser, env: Learned, route: string, viewport: Viewport, targets: readonly Target[], scroll: boolean, selectors: readonly string[] = []): Promise<MotionCapture[]> {
	const session = await openSession(browser, env, route, viewport, { loops: { known: env.loops } });
	const page = session.page;
	const out: MotionCapture[] = [];
	try {
		await settleAndHoldLoops(page);
		for (const target of targets) {
			for (const how of ['hover', 'focus'] as const) {
				const interaction = `${how} ${describeTarget(target)}`;
				await page.mouse.move(0, 0).catch(() => {});
				await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()).catch(() => {});
				await still(page, 1_000);
				await page.evaluate(armMotion, false).catch(() => {});
				try {
					if (how === 'hover') await locate(page, target).hover({ timeout: 1_500 });
					else {
						await page.keyboard.press('Shift');
						await locate(page, target).focus({ timeout: 1_500 });
					}
				} catch (error) {
					out.push({ interaction, motions: [], failed: (error as Error).message.split('\n')[0] });
					continue;
				}
				await frames(page);
				await still(page, 1_500);
				out.push({ interaction, ...(await records(page, [], selectors)) });
			}
		}
		if (scroll) {
			await page.mouse.move(viewport.width / 2, viewport.height / 2).catch(() => {});
			await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()).catch(() => {});
			await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
			await still(page, 1_000);
			await page.evaluate(armMotion, false).catch(() => {});
			await page.mouse.wheel(0, viewport.height).catch(() => {});
			await frames(page);
			await still(page, 1_500);
			out.push({ interaction: SCROLL, ...(await records(page, [], selectors)) });
		}
		return out;
	} finally {
		await session.close();
	}
}

const EASINGS: Readonly<Record<string, string>> = {
	ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
	'ease-in': 'cubic-bezier(0.42, 0, 1, 1)',
	'ease-out': 'cubic-bezier(0, 0, 0.58, 1)',
	'ease-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
	linear: 'linear',
	'cubic-bezier(0, 0, 1, 1)': 'linear',
};

export function sameEasing(a: string, b: string): boolean {
	const norm = (e: string) => {
		const s = e.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().toLowerCase();
		return EASINGS[s] ?? s.replace(/(\d)\.0+(?=[,)])/g, '$1').replace(/\b0\.(\d*?)0+(?=[,)])/g, '0.$1');
	};
	return norm(a) === norm(b);
}

function within(a: number, b: number, script: boolean): boolean {
	const [ms, ratio] = script ? [SCRIPT_TOLERANCE_MS, SCRIPT_TOLERANCE_RATIO] : [TOLERANCE_MS, TOLERANCE_RATIO];
	return Math.abs(a - b) <= Math.max(ms, ratio * Math.max(a, b));
}

const key = (r: MotionRecord) => `${r.pseudo ?? ''}|${r.properties.join(',')}`;

function timing(r: MotionRecord): string {
	if (r.kind === 'media') return `plays ${r.properties.join(', ')}${r.name ? ` ${r.name}` : ''}`;
	const values = r.properties.length === 1 && r.from !== undefined && r.to !== undefined && r.from !== r.to ? ` ${r.from}→${r.to}` : '';
	const what = r.kind === 'animation' ? `animation ${r.name} (${r.properties.join(', ')})` : r.kind === 'script' ? `${r.properties.join(', ')} from script, frame by frame,` : r.properties.join(', ');
	return `${what}${values} over ${r.duration} ms${r.delay ? ` after ${r.delay} ms` : ''}${r.easing ? ` ${r.easing}` : ''}${r.iterations === 'infinite' ? ', repeating' : r.iterations !== 1 ? `, ${r.iterations} times` : ''}${r.pseudo ? ` on ${r.pseudo}` : ''}`;
}

/** One line per motion, for the report: what moved, how and for how long. */
export function motionLines(motions: readonly MotionRecord[]): string[] {
	return motions.map((m) => `${describe(m.element)}: ${m.kind === 'transition' ? 'transition of ' : ''}${timing(m)}`);
}

// Several properties of one element that move alike (background-position-x and -y) read as one motion.
function joined(records: readonly MotionRecord[]): string {
	const groups = new Map<string, MotionRecord[]>();
	for (const r of records) {
		const g = `${r.kind}|${r.duration}|${r.delay}|${r.easing}|${r.iterations}|${r.pseudo ?? ''}`;
		groups.set(g, [...(groups.get(g) ?? []), r]);
	}
	return [...groups.values()].map((rs) => (rs.length === 1 ? timing(rs[0]!) : timing({ ...rs[0]!, properties: rs.flatMap((r) => r.properties), from: undefined, to: undefined }))).join('; ');
}

const sound = (rs: readonly MotionRecord[]) => rs.every((r) => r.kind === 'media');

interface Difference {
	readonly key: string;
	/** Differences alike but for the element and its values (every link's colour transition when the theme changes) read as one. */
	readonly group: string;
	readonly what: string;
	readonly failure: Failure;
}

const visible = (p: PinnedElement) => p.shown && p.opacity > 0.02;
const looks = (p: PinnedElement, where: boolean) => (!p.shown ? 'not shown' : `${p.opacity <= 0.02 ? 'shown but transparent' : `shown at opacity ${Math.round(p.opacity * 100) / 100}`}${where ? `, ${p.box.width}x${p.box.height} at (${p.box.x}, ${p.box.y})` : ''}`);

/** How one element differs at one held moment: shown or not, its opacity within 0.1, and how far it has moved and grown since the first moment within 2 px (where it sits on the page is the css and visual checks' business). */
function pinnedDifference(o: PinnedElement, n: PinnedElement, o0?: PinnedElement, n0?: PinnedElement): { old: string; new: string } | undefined {
	if (visible(o) !== visible(n)) return { old: looks(o, false), new: looks(n, false) };
	if (!visible(o)) return undefined;
	const moved = (p: PinnedElement, p0?: PinnedElement) => ({ x: p.box.x - (p0?.box.x ?? p.box.x), y: p.box.y - (p0?.box.y ?? p.box.y) });
	const [mo, mn] = [moved(o, o0), moved(n, n0)];
	const where = Math.abs(mo.x - mn.x) > 2 || Math.abs(mo.y - mn.y) > 2 || Math.abs(o.box.width - n.box.width) > 2 || Math.abs(o.box.height - n.box.height) > 2;
	if (!where && Math.abs(o.opacity - n.opacity) <= 0.1) return undefined;
	return { old: looks(o, where), new: looks(n, where) };
}

const valueless = (text: string) => text.replace(/ \S+→\S+/g, '').replace(/\d+(\.\d+)?/g, '#');

function differences(route: string, label: string, viewport: string, old: MotionCapture, next: MotionCapture, hint: string): Difference[] {
	const els = (c: MotionCapture) => [...new Set([...(c.elements ?? []), ...c.motions.map((m) => m.element)])];
	const oldAll = els(old);
	const newAll = els(next);
	const pairs = matchElements(oldAll, newAll);
	const back = new Map([...pairs].map(([i, j]) => [newAll[j]!, oldAll[i]!]));
	// Matched property by property, so two transitions (opacity, transform) and one keyframe animation of both are the same motion.
	const units = (rs: readonly MotionRecord[]) => rs.flatMap((r) => r.properties.map((p) => ({ r, p })));
	const only = (us: readonly { r: MotionRecord; p: string }[]) => {
		const by = new Map<MotionRecord, string[]>();
		for (const u of us) by.set(u.r, [...(by.get(u.r) ?? []), u.p]);
		return [...by].map(([r, properties]) => (properties.length === r.properties.length ? r : { ...r, properties, from: undefined, to: undefined }));
	};
	const used = new Set<string>();
	const unitKey = (r: MotionRecord, p: string) => `${next.motions.indexOf(r)}|${p}`;
	const out: Difference[] = [];
	const push = (el: ElementSnapshot, what: string, expected: string, actual: string, counterpart?: ElementSnapshot, why = hint) => {
		const failure: Failure = { route, dimension: 'motion', check: `${label}: ${what} of ${describe(el)}`, viewport, expected, actual, hint: why };
		const shape = counterpart ? actual.split(describe(counterpart)).join('it') : actual;
		out.push({ key: `${failure.check}|${expected.replace(/\d+(\.\d+)?/g, '#')}`, group: `${what}|${el.role}|${valueless(expected)}|${valueless(shape)}`, what, failure });
	};
	const nested = (a: ElementSnapshot, b: ElementSnapshot) => Boolean(a.chain && b.chain && (a.chain === b.chain || a.chain.startsWith(`${b.chain}>`) || b.chain.startsWith(`${a.chain}>`)));
	const all = units(next.motions);
	const seen: { el: ElementSnapshot; counterpart?: ElementSnapshot; missing: { r: MotionRecord; p: string }[]; changed: Map<MotionRecord, MotionRecord> }[] = [];
	const take = (m: { r: MotionRecord; p: string }, n: { r: MotionRecord; p: string }, changed: Map<MotionRecord, MotionRecord>) => {
		used.add(unitKey(n.r, n.p));
		const script = m.r.kind === 'script' || n.r.kind === 'script';
		if (!within(m.r.duration, n.r.duration, script) || !within(m.r.delay, n.r.delay, script) || (!script && !sameEasing(m.r.easing, n.r.easing)) || m.r.iterations !== n.r.iterations) changed.set(m.r, n.r);
	};
	const same = (m: { r: MotionRecord; p: string }) => (t: { r: MotionRecord; p: string }) => !used.has(unitKey(t.r, t.p)) && t.p === m.p && (t.r.pseudo ?? '') === (m.r.pseudo ?? '');
	for (const el of new Set(old.motions.map((m) => m.element))) {
		const j = pairs.get(oldAll.indexOf(el));
		const counterpart = j !== undefined ? newAll[j] : undefined;
		const entry = { el, ...(counterpart ? { counterpart } : {}), missing: [] as { r: MotionRecord; p: string }[], changed: new Map<MotionRecord, MotionRecord>() };
		for (const m of units(old.motions.filter((x) => x.element === el))) {
			const n = counterpart ? all.find((t) => t.r.element === counterpart && same(m)(t)) : undefined;
			if (n) take(m, n, entry.changed);
			else entry.missing.push(m);
		}
		seen.push(entry);
	}
	// The same motion on the counterpart's wrapper or child (a panel's transition moved to the element around it) looks the same.
	for (const entry of seen) {
		const c = entry.counterpart;
		if (!c) continue;
		entry.missing = entry.missing.filter((m) => {
			const n = all.find((t) => t.r.element !== c && nested(t.r.element, c) && same(m)(t));
			if (n) take(m, n, entry.changed);
			return !n;
		});
	}
	for (const { el, counterpart, missing, changed } of seen) {
		if (missing.length) {
			const gone = only(missing);
			const props = [...new Set(missing.map((m) => m.p))].join(', ');
			if (sound(gone)) push(el, 'sound', `old ${joined(gone)}`, `new plays nothing (${props})`);
			else push(el, 'motion', `old animates ${joined(gone)}`, counterpart ? `new jumps: ${describe(counterpart)} has no transition or animation of ${props}` : `new jumps: no matching element moves (${props})`, counterpart);
		}
		if (changed.size) push(el, 'motion timing', `old ${joined([...changed.keys()])}`, `new ${joined([...new Set(changed.values())])}`);
	}
	const extra = new Map<ElementSnapshot, { r: MotionRecord; p: string }[]>();
	for (const u of units(next.motions)) if (!used.has(unitKey(u.r, u.p))) extra.set(u.r.element, [...(extra.get(u.r.element) ?? []), u]);
	for (const [el, us] of extra) {
		const ms = only(us);
		const props = [...new Set(us.map((u) => u.p))].join(', ');
		if (sound(ms)) push(back.get(el) ?? el, 'extra sound', `old does not play ${props}`, `new ${joined(ms)}`);
		else push(back.get(el) ?? el, 'extra motion', `old does not animate ${props}`, `new animates ${joined(ms)}`);
	}
	const framed = new Set<ElementSnapshot>();
	const firstOf = (c: MotionCapture, el: ElementSnapshot) => c.pinned?.[0]?.elements.find((p) => p.element === el);
	for (const frame of old.pinned ?? []) {
		const other = next.pinned?.find((f) => f.t === frame.t);
		for (const o of other ? frame.elements : []) {
			if (framed.has(o.element)) continue;
			const j = pairs.get(oldAll.indexOf(o.element));
			const counterpart = j !== undefined ? newAll[j] : undefined;
			const n = counterpart ? other!.elements.find((p) => p.element === counterpart) : undefined;
			if (!n) continue;
			const d = pinnedDifference(o, n, firstOf(old, o.element), firstOf(next, n.element));
			if (!d) continue;
			framed.add(o.element);
			push(o.element, 'frame', `old at ${frame.t} ms${frame.note ? `, ${frame.note}` : ''}: ${d.old}`, `new: ${d.new}`, counterpart, HINTS.motionFrame);
		}
	}
	return out;
}

/** Motion differences of one interaction: what every OLD recording disagrees with NEW on, so motion that varied between OLD runs is not held against NEW. */
export function compareMotion(route: string, label: string, viewport: string, olds: readonly MotionCapture[], next: MotionCapture, hint: string = HINTS.motion): Failure[] {
	if (!olds.length || olds.some((o) => o.failed || o.navigated) || next.failed || next.navigated) return [];
	const [first, ...rest] = olds.map((o) => differences(route, label, viewport, o, next, hint));
	const stands = (d: Difference) => rest.every((r) => r.some((x) => x.key === d.key));
	const groups = new Map<string, Difference[]>();
	for (const d of first!.filter(stands)) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
	return [...groups.values()].map(([d, ...more]) => (more.length ? { ...d!.failure, check: `${d!.failure.check} and ${more.length} more element${more.length === 1 ? '' : 's'} alike` } : d!.failure));
}

/** Old rules that make an element move: a transition or animation with a duration, outside prefers-reduced-motion: reduce. */
export function motionRules(rules: readonly CssRule[]): { selector: string; label: string }[] {
	const inert = (v: string) => /^(none|0m?s|initial|unset)$/i.test(v.trim()) || v.trim().split(/\s*,\s*/).every((x) => /^(none|0m?s)\b/.test(x));
	return rules
		.filter((r) => !r.conditions.some((c) => /prefers-reduced-motion:\s*reduce/.test(c.text)))
		.filter((r) => r.declarations.some((d) => /^(transition|animation)(-name|-duration)?$/.test(d.property) && !inert(d.value) && !(d.property === 'transition' && /^(all\s+)?0m?s/.test(d.value.trim()))))
		.map((r) => ({ selector: r.selector, label: describeRule(r) }));
}

const LAYER = /^- (dialog|alertdialog|menu|listbox)\b/;
const activation = (s: RecordedJourney['steps'][number]) => (s.action === 'click' || (s.action === 'press' && (s.key === 'Enter' || s.key === 'Space')) ? 'use' : `${s.action}${s.action === 'press' ? ` ${s.key}` : ''}`);

/** Journeys whose last step opened a dialog, menu or popup, once per alike opener (the same controls by role and name, clicked or pressed), each to be followed by Escape: what closes them animates only then, and the explorer's own closing journeys may fall past the interaction cap. */
export function motionDismissals(journeys: readonly RecordedJourney[]): MotionJourney[] {
	const out: MotionJourney[] = [];
	const alike = new Set<string>();
	for (const j of journeys) {
		const last = j.expected.at(-1);
		if (j.destructive || !last || j.expected.length < j.steps.length || last.failed || last.navigated || last.writes?.some((w) => !w.sent) || !last.added.some((line) => LAYER.test(line))) continue;
		const key = j.steps.map((s) => `${activation(s)}|${s.target.role}|${s.target.name.replace(/\d+/g, '#')}`).join(' > ');
		if (alike.has(key)) continue;
		alike.add(key);
		out.push({ ...j, name: `${j.name}, then press Escape`, dismiss: true });
	}
	return out;
}

const inPlace = (act: CycleAct) => act === 'again' || act === 'reopen' || act === 'escape' || (typeof act === 'object' && ('use' in act || 'outside' in act));

/** Each use of a journey's control after its steps that stays on the page (the second use of a disclosure's trigger, which closes it, and the third, which opens it again), up to the first one that leaves or reloads it. */
export function motionCycles(journeys: readonly RecordedJourney[]): MotionJourney[] {
	const out: MotionJourney[] = [];
	for (const j of journeys) {
		if (j.destructive || j.expected.length < j.steps.length) continue;
		for (const [i, act] of (j.cycle ?? []).entries()) {
			const r = j.expected[j.steps.length + i];
			if (!inPlace(act) || !r || r.failed || r.navigated || r.writes?.some((w) => !w.sent)) break;
			out.push({ ...j, name: `${j.name} (${cycleLabel(j.steps.length, j.cycle!, i)})`, act: i });
		}
	}
	return out;
}

/** Journeys whose last step stays on the page: their motion is recorded. */
export function motionJourneys(journeys: readonly RecordedJourney[]): { take: RecordedJourney[]; skipped: string[] } {
	const take: RecordedJourney[] = [];
	const skipped: string[] = [];
	const names = new Set<string>();
	for (const j of journeys) {
		if (j.destructive || names.has(j.name)) continue;
		names.add(j.name);
		const last = j.expected.at(-1);
		if (!last || j.expected.length < j.steps.length || last.failed) skipped.push(`${j.name}: it could not be used on the old page`);
		else if (last.navigated) skipped.push(`${j.name}: it leads to another page`);
		// What a page animates after a write depends on the server's answer, and a held-back write gets the checker's empty 204 instead.
		else if (last.writes?.some((w) => !w.sent)) skipped.push(`${j.name}: its write was held back (${last.writes.filter((w) => !w.sent).map((w) => w.line).join(', ')}), so what follows is each app's answer to the checker's empty reply, not to the server's; its hover and focus are still compared, and its motion is when writes are sent (--staging or this machine)`);
		else take.push(j);
	}
	return { take, skipped };
}

export interface MotionCheck {
	readonly failures: readonly Failure[];
	readonly motion: MotionResult;
	readonly filmstrips: readonly Filmstrip[];
}

/** Records the motion every journey's last step starts on both sides, with motion allowed and then with reduced motion, and the transitions hovering and focusing each control start. */
export async function checkMotion(browser: Browser, envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, journeys: readonly RecordedJourney[], options: MotionOptions = {}): Promise<MotionCheck> {
	const { take, skipped } = motionJourneys(journeys);
	const cap = options.maxInteractions ?? DEFAULT_MAX_INTERACTIONS;
	for (const j of take.slice(cap)) skipped.push(`${j.name}: past the ${cap} interactions recorded per route`);
	const dismissCap = options.maxDismissals ?? DEFAULT_MAX_DISMISSALS;
	const dismissals = motionDismissals(journeys).filter((d) => !take.slice(0, cap).some((t) => t.name.startsWith(d.name)));
	for (const j of dismissals.slice(dismissCap)) skipped.push(`${j.name}: past the ${dismissCap} dismissals recorded per route`);
	const cycleCap = options.maxCycles ?? DEFAULT_MAX_CYCLES;
	const cycles = motionCycles(take.slice(0, cap));
	for (const j of cycles.slice(cycleCap)) skipped.push(`${j.name}: past the ${cycleCap} repeated uses recorded per route`);
	const [oldLearned, newLearned] = await Promise.all([learnLoops(browser, motionEnv(envs.old, false), route, viewport), learnLoops(browser, motionEnv(envs.new, false), route, viewport)]);
	const [oldLoops, newLoops] = [oldLearned.loops, newLearned.loops];
	const [oldEnv, newEnv] = [{ ...motionEnv(envs.old, false), loops: oldLoops }, { ...motionEnv(envs.new, false), loops: newLoops }];
	const [oldReduced, newReduced] = [{ ...motionEnv(envs.old, true), loops: oldLoops }, { ...motionEnv(envs.new, true), loops: newLoops }];
	const failures: Failure[] = [];
	const filmstrips: Filmstrip[] = [];
	const name = viewport.name;
	const selectors = (options.rules ?? []).map((r) => r.selector);
	const hit = new Set<number>();
	const interactions = await pool([...take.slice(0, cap), ...dismissals.slice(0, dismissCap), ...cycles.slice(0, cycleCap)], CONCURRENCY, async (journey): Promise<MotionInteraction & { failures: Failure[] }> => {
		const old = await recordJourney(browser, oldEnv, route, viewport, journey, 'self', selectors);
		const next = await recordJourney(browser, newEnv, route, viewport, journey, old.film ?? 'self');
		for (const i of old.hits ?? []) hit.add(i);
		let found = compareMotion(route, journey.name, name, [old], next);
		let again: Recorded | undefined;
		// A difference is measured again on both sides, and stands only if the second recording of the new page shows one too.
		if (found.length) {
			again = await recordJourney(browser, oldEnv, route, viewport, journey, old.film ?? next.film ?? 'self');
			found = compareMotion(route, journey.name, name, [old, again], next);
			if (found.length && !compareMotion(route, journey.name, name, [old, again], await recordJourney(browser, newEnv, route, viewport, journey, old.film ?? 'self')).length) found = [];
		}
		const oldFrames = old.frames ?? again?.frames;
		if (found.length && oldFrames && next.frames) {
			const span = (old.film ?? next.film)?.span ?? 0;
			filmstrips.push({ label: journey.name, offsets: Array.from({ length: FRAMES }, (_, k) => Math.round((span * k) / (FRAMES - 1))), old: oldFrames, new: next.frames });
		}
		let reduced: MotionInteraction['reduced'];
		if (old.motions.length || next.motions.length) {
			const label = `${journey.name}, with prefers-reduced-motion: reduce`;
			const [ro, rn] = await Promise.all([recordJourney(browser, oldReduced, route, viewport, journey), recordJourney(browser, newReduced, route, viewport, journey)]);
			let r = compareMotion(route, label, name, [ro], rn, HINTS.motionReduced);
			if (r.length) {
				const olds = [ro, await recordJourney(browser, oldReduced, route, viewport, journey)];
				r = compareMotion(route, label, name, olds, rn, HINTS.motionReduced);
				if (r.length && !compareMotion(route, label, name, olds, await recordJourney(browser, newReduced, route, viewport, journey), HINTS.motionReduced).length) r = [];
			}
			found.push(...r);
			reduced = { old: motionLines(ro.motions), new: motionLines(rn.motions), ok: !r.length };
		}
		return { name: journey.name, old: motionLines(old.motions), new: motionLines(next.motions), ok: !found.length, ...(reduced ? { reduced } : {}), failures: found };
	});
	for (const i of interactions) failures.push(...i.failures);

	const targets: Target[] = [];
	const seen = new Set<string>();
	for (const j of journeys) {
		const t = j.steps[0]?.target;
		if (!t || j.steps.length !== 1 || j.destructive || !HOVER_ROLES.has(t.role) || seen.has(describeTarget(t)) || j.expected[0]?.failed) continue;
		seen.add(describeTarget(t));
		targets.push(t);
	}
	const hoverCap = options.maxHovers ?? DEFAULT_MAX_HOVERS;
	const hovered = targets.slice(0, hoverCap);
	if (targets.length > hoverCap) skipped.push(`hover and focus of ${targets.length - hoverCap} more controls: past the ${hoverCap} recorded per route`);
	const hovers: MotionInteraction[] = [];
	const [oldHovers, newHovers] = await Promise.all([recordHovers(browser, oldEnv, route, viewport, hovered, true, selectors), recordHovers(browser, newEnv, route, viewport, hovered, true)]);
	const hint = (o: MotionCapture) => (o.interaction === SCROLL ? HINTS.motionScroll : HINTS.motionHover);
	const first = oldHovers.map((o, i) => compareMotion(route, o.interaction, name, [o], newHovers[i]!, hint(o)));
	const differ = new Set(oldHovers.filter((_, i) => first[i]!.length).map((o) => o.interaction));
	const redo = hovered.filter((t) => differ.has(`hover ${describeTarget(t)}`) || differ.has(`focus ${describeTarget(t)}`));
	const [again, newAgain] = differ.size ? await Promise.all([recordHovers(browser, oldEnv, route, viewport, redo, differ.has(SCROLL)), recordHovers(browser, newEnv, route, viewport, redo, differ.has(SCROLL))]) : [[], []];
	oldHovers.forEach((o, i) => {
		const n = newHovers[i]!;
		const second = again.find((a) => a.interaction === o.interaction);
		const newSecond = newAgain.find((a) => a.interaction === o.interaction);
		let found = first[i]!.length && second ? compareMotion(route, o.interaction, name, [o, second], n, hint(o)) : first[i]!;
		if (found.length && second && newSecond && !compareMotion(route, o.interaction, name, [o, second], newSecond, hint(o)).length) found = [];
		failures.push(...found);
		if (o.failed || n.failed) skipped.push(`${o.interaction}: ${o.failed ?? n.failed}`);
		else if (o.motions.length || n.motions.length) hovers.push({ name: o.interaction, old: motionLines(o.motions), new: motionLines(n.motions), ok: !found.length });
	});
	const all = [...interactions.map(({ failures: _, ...i }) => i), ...hovers];
	const shown = failures.slice(0, LIMIT);
	if (failures.length > LIMIT) shown.push({ route, dimension: 'motion', check: 'motion', viewport: name, expected: '', actual: `${failures.length - LIMIT} more motion differences`, hint: HINTS.motion });
	for (const o of oldHovers) for (const i of o.hits ?? []) hit.add(i);
	const unexercised = [...new Set((options.rules ?? []).filter((_, i) => !hit.has(i)).map((r) => r.label))];
	const drawn = oldLearned.canvas ? await checkCanvases(browser, { old: motionEnv(envs.old, false), new: motionEnv(envs.new, false) }, route, viewport) : undefined;
	if (drawn) shown.push(...drawn.failures);
	return { failures: shown, motion: { checked: interactions.length + oldHovers.filter((o) => !o.failed).length, interactions: all, skipped, ...(unexercised.length ? { unexercised } : {}), ...(drawn?.canvases.length ? { canvases: drawn.canvases } : {}) }, filmstrips };
}

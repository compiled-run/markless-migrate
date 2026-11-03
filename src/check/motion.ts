import { shownUrl } from './hash-routes.ts';
import type { Browser, Page } from 'playwright';
import type { SideEnv } from './browser.ts';
import { readPage } from './collect.ts';
import { loopKeys, settleAndHoldLoops } from './loops.ts';
import { HINTS } from './hints.ts';
import { locate, openSession, pool, type RecordedJourney, type Target } from './journeys.ts';
import { describeTarget } from './journeys-compare.ts';
import { checkCanvases } from './motion-canvas.ts';
import { describe } from './match.ts';
import type { Box, ElementSnapshot, Viewport } from './types.ts';
import { confirmedMotion, FRAMES, hoversToRedo, judgeMotion, motionPlan, SCROLL, type Film, type MotionCapture, type MotionCheck, type MotionInteractionRow, type MotionJourney, type MotionKind, type MotionOptions, type MotionRecord, type MotionRow, type PinnedFrame, type PinnedMoment, type Recorded } from './motion-compare.ts';

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
	// A transition that starts and ends inside one long task (an Escape handler blocking a busy runner for 300 ms) is gone before
	// any frame can see it; its run event still names it, and its declared timing is read from the element's style.
	const ran: { el: Element; property: string; pseudo: string }[] = [];
	const onRun = (e: Event) => {
		scan();
		const t = e as TransitionEvent;
		if (t.target instanceof Element && ran.length < 500) ran.push({ el: t.target, property: t.propertyName, pseudo: t.pseudoElement });
	};
	addEventListener('transitionrun', onRun, true);
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
			const filmed = new Map<Element, Set<string>>();
			for (const a of found) {
				const effect = a.effect as KeyframeEffect | null;
				if (typeof CSSTransition === 'undefined' || !(a instanceof CSSTransition) || !effect?.target) continue;
				filmed.set(effect.target, (filmed.get(effect.target) ?? new Set<string>()).add(`${a.transitionProperty}|${effect.pseudoElement ?? ''}`));
			}
			for (const r of ran) {
				const key = `${r.property}|${r.pseudo}`;
				if (filmed.get(r.el)?.has(key)) continue;
				filmed.set(r.el, (filmed.get(r.el) ?? new Set<string>()).add(key));
				const cs = getComputedStyle(r.el, r.pseudo || undefined);
				const list = (v: string) => v.split(/,(?![^(]*\))/).map((x) => x.trim());
				const props = list(cs.transitionProperty);
				// A longhand runs under its shorthand's entry: border-top-color under border-color, padding-left under padding.
				const covers = (shorthand: string) => {
					const want = shorthand.split('-');
					let i = 0;
					for (const part of r.property.split('-')) if (part === want[i]) i++;
					return i === want.length;
				};
				const exact = props.indexOf(r.property);
				const at = exact >= 0 ? exact : props.findLastIndex((p) => p === 'all' || covers(p));
				if (at < 0) continue;
				const ms = (v: string | undefined) => (v === undefined ? 0 : v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000);
				const pick = (v: string[]) => v[at % v.length];
				const duration = ms(pick(list(cs.transitionDuration)));
				if (!(duration > 1)) continue;
				out.push({ kind: 'transition', name: r.property, properties: [r.property], duration: Math.round(duration), delay: Math.round(ms(pick(list(cs.transitionDelay)))), easing: pick(list(cs.transitionTimingFunction)) ?? 'ease', iterations: 1, ...who(r.el), ...(r.pseudo ? { pseudo: r.pseudo } : {}) });
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
			removeEventListener('transitionrun', onRun, true);
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

async function dismiss(page: Page): Promise<{ failed?: string; navigated: boolean }> {
	const path = new URL(shownUrl(page)).pathname;
	await page.keyboard.press('Escape');
	return { navigated: new URL(shownUrl(page)).pathname !== path };
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
		// A key press focuses its control first: the focus ring's own transition runs out before the recording, or whether it is
		// caught depends on how long focusing took on that run.
		const last = steps.at(-1)!;
		if (!journey.dismiss && !acted && last.action === 'press') await locate(session.page, last.target).focus({ timeout: 3_000 }).catch(() => {});
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

/** Records the motion every journey's last step starts on both sides, with motion allowed and then with reduced motion, and the transitions hovering and focusing each control start; judged by motion-compare.ts. */
export async function checkMotion(browser: Browser, envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, journeys: readonly RecordedJourney[], options: MotionOptions = {}): Promise<MotionCheck> {
	return judgeMotion(route, viewport, journeys, options, await observeMotion(browser, envs, route, viewport, journeys, options));
}

const CONCURRENCY = 4;

/** Records each planned interaction on both sides, a second time where the first recordings differ, then the hovers and the canvases. */
export async function observeMotion(browser: Browser, envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, journeys: readonly RecordedJourney[], options: MotionOptions = {}): Promise<MotionRow> {
	const plan = motionPlan(journeys, options);
	const [oldLearned, newLearned] = await Promise.all([learnLoops(browser, motionEnv(envs.old, false), route, viewport), learnLoops(browser, motionEnv(envs.new, false), route, viewport)]);
	const [oldLoops, newLoops] = [oldLearned.loops, newLearned.loops];
	const [oldEnv, newEnv] = [{ ...motionEnv(envs.old, false), loops: oldLoops }, { ...motionEnv(envs.new, false), loops: newLoops }];
	const [oldReduced, newReduced] = [{ ...motionEnv(envs.old, true), loops: oldLoops }, { ...motionEnv(envs.new, true), loops: newLoops }];
	const name = viewport.name;
	const selectors = (options.rules ?? []).map((r) => r.selector);
	let kept = 0;
	const interactions = await pool(plan.pooled, CONCURRENCY, async (journey): Promise<MotionInteractionRow> => {
		const old = await recordJourney(browser, oldEnv, route, viewport, journey, 'self', selectors);
		const next = await recordJourney(browser, newEnv, route, viewport, journey, old.film ?? 'self');
		let again: Recorded | undefined;
		let nextAgain: Recorded | undefined;
		// A difference is measured again on both sides, and stands only if the second recording of the new page shows one too.
		for (let r = confirmedMotion(route, journey.name, name, old, next, again, nextAgain); r.needs; r = confirmedMotion(route, journey.name, name, old, next, again, nextAgain)) {
			if (r.needs === 'again') again = await recordJourney(browser, oldEnv, route, viewport, journey, old.film ?? next.film ?? 'self');
			else nextAgain = await recordJourney(browser, newEnv, route, viewport, journey, old.film ?? 'self');
		}
		const found = confirmedMotion(route, journey.name, name, old, next, again, nextAgain).found;
		const oldFrames = old.frames ?? again?.frames;
		const filmstrip = found.length && oldFrames && next.frames ? kept++ : undefined;
		let reduced: MotionInteractionRow['reduced'];
		if (old.motions.length || next.motions.length) {
			const label = `${journey.name}, with prefers-reduced-motion: reduce`;
			const [ro, rn] = await Promise.all([recordJourney(browser, oldReduced, route, viewport, journey), recordJourney(browser, newReduced, route, viewport, journey)]);
			let oldAgain: Recorded | undefined;
			let rnAgain: Recorded | undefined;
			for (let r = confirmedMotion(route, label, name, ro, rn, oldAgain, rnAgain, HINTS.motionReduced); r.needs; r = confirmedMotion(route, label, name, ro, rn, oldAgain, rnAgain, HINTS.motionReduced)) {
				if (r.needs === 'again') oldAgain = await recordJourney(browser, oldReduced, route, viewport, journey);
				else rnAgain = await recordJourney(browser, newReduced, route, viewport, journey);
			}
			reduced = { old: ro, next: rn, ...(oldAgain ? { oldAgain } : {}), ...(rnAgain ? { nextAgain: rnAgain } : {}) };
		}
		return { old, next, ...(again ? { again } : {}), ...(nextAgain ? { nextAgain } : {}), ...(reduced ? { reduced } : {}), ...(filmstrip !== undefined ? { filmstrip } : {}) };
	});
	const hovered = plan.hovered;
	const [oldHovers, newHovers] = await Promise.all([recordHovers(browser, oldEnv, route, viewport, hovered, true, selectors), recordHovers(browser, newEnv, route, viewport, hovered, true)]);
	const { redo, scroll } = hoversToRedo(route, name, hovered, oldHovers, newHovers);
	const differ = redo.length || scroll;
	const [again, newAgain] = differ ? await Promise.all([recordHovers(browser, oldEnv, route, viewport, redo, scroll), recordHovers(browser, newEnv, route, viewport, redo, scroll)]) : [[], []];
	const drawn = oldLearned.canvas ? await checkCanvases(browser, { old: motionEnv(envs.old, false), new: motionEnv(envs.new, false) }, route, viewport) : undefined;
	return { interactions, hovers: { old: oldHovers, next: newHovers, again, nextAgain: newAgain }, ...(drawn ? { canvases: { failures: drawn.failures, canvases: drawn.canvases } } : {}) };
}

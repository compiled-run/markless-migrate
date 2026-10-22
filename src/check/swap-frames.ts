import type { CDPSession, Page } from 'playwright';
import { PNG } from 'pngjs';
import type { Failure, Shot } from './types.ts';
import { compareScreenshots, type VisualDiff } from './visual.ts';

// Settled-state checks cannot see a flash: a frame of the swap that shows neither page's theme (a dark site painted white
// while <html> lost its script-set `dark` class). This records what every frame of an in-place navigation paints of the theme.

/** What one frame shows of the theme: the <html> class tokens, its computed color-scheme, and the background lightness (0-100) at the left and right edge; and of the layout: where each landmark, the first h1 and the document's bottom are in the viewport. */
export interface ThemeFrame {
	readonly classes: readonly string[];
	readonly scheme: string;
	readonly backdrop: readonly number[];
	/** `name x,y,width,height` per region, `name -` for one not in the document. */
	readonly layout?: readonly string[];
}

export interface ThemeRecording {
	readonly before: ThemeFrame;
	/** Consecutive identical frames are one entry; `at` is when the first of them ran, in milliseconds since recording started. */
	readonly frames: readonly { readonly frame: ThemeFrame; readonly count: number; readonly at?: number }[];
	readonly after: ThemeFrame;
}

type Recorder = { arm(): void; read(): ThemeRecording | undefined };
const GLOBAL = '__mmThemeFrames';

/** In-page, before the page's own scripts: once armed, what each animation frame shows of the theme, until read. Must stay self-contained. */
export function themeFrameRecorder(): void {
	const w = window as unknown as Record<string, Recorder | undefined>;
	if (window !== window.top || w.__mmThemeFrames) return;
	const raf = requestAnimationFrame.bind(window);
	let paint: CanvasRenderingContext2D | null = null;
	// Any CSS colour (lab(), oklch(), a system colour) as the lightness it paints: drawn on a 1x1 canvas and read back.
	const lightness = (color: string): number | undefined => {
		if (!paint) {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			paint = canvas.getContext('2d', { willReadFrequently: true });
		}
		if (!paint) return undefined;
		paint.clearRect(0, 0, 1, 1);
		paint.fillStyle = '#000';
		paint.fillStyle = color;
		paint.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
		if (a! < 250) return undefined;
		const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
		const y = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
		return Math.round(y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
	};
	const at = (x: number, y: number, dark: boolean): number => {
		for (let e = document.elementFromPoint(x, y); e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
			const l = lightness(getComputedStyle(e).backgroundColor);
			if (l !== undefined) return l;
		}
		// The canvas: <html>'s background, else <body>'s (CSS propagates it), else the browser's for the color-scheme.
		const canvas = [document.documentElement, document.body].map((e) => (e ? lightness(getComputedStyle(e).backgroundColor) : undefined)).find((l) => l !== undefined);
		return canvas ?? (dark ? 7 : 100);
	};
	const landmarks = 'header, footer, main, nav, aside, [role=banner], [role=main], [role=navigation], [role=complementary], [role=contentinfo]';
	const layout = (): string[] => {
		const boxes: string[] = [];
		const add = (name: string, e: Element | null | undefined) => {
			if (!e) return void boxes.push(`${name} -`);
			const r = e.getBoundingClientRect();
			boxes.push(`${name} ${[r.x, r.y, r.width, r.height].map(Math.round).join(',')}`);
		};
		const seen = new Map<string, number>();
		for (const e of [...document.querySelectorAll(landmarks)].slice(0, 16)) {
			const name = e.getAttribute('role') ?? e.localName;
			const n = (seen.get(name) ?? 0) + 1;
			seen.set(name, n);
			add(`${name}${n}`, e);
		}
		add('h1', document.querySelector('h1'));
		boxes.push(`bottom ${Math.round(document.documentElement.scrollHeight - scrollY)}`);
		return boxes;
	};
	const snapshot = (): ThemeFrame => {
		const root = document.documentElement;
		const scheme = getComputedStyle(root).colorScheme;
		const dark = /\bdark\b/.test(scheme) && !/\blight\b/.test(scheme);
		const y = innerHeight / 2;
		return { classes: [...root.classList].sort(), scheme, backdrop: [at(1, y, dark), at(innerWidth - 2, y, dark)], layout: layout() };
	};
	let recording: { before: ThemeFrame; frames: { frame: ThemeFrame; count: number; at: number }[] } | undefined;
	let armed = 0;
	const same = (a: ThemeFrame, b: ThemeFrame) => JSON.stringify(a) === JSON.stringify(b);
	const tick = () => {
		if (!recording) return;
		const frame = snapshot();
		const last = recording.frames.at(-1);
		if (last && same(last.frame, frame)) last.count++;
		else if (recording.frames.length < 500) recording.frames.push({ frame, count: 1, at: Math.round(performance.now() - armed) });
		raf(tick);
	};
	Object.defineProperty(w, '__mmThemeFrames', {
		value: {
			arm: () => {
				armed = performance.now();
				recording = { before: snapshot(), frames: [] };
				raf(tick);
			},
			read: () => {
				if (!recording) return undefined;
				const done = { ...recording, after: snapshot() };
				recording = undefined;
				return done;
			},
		} satisfies Recorder,
	});
}

export const armThemeFrames = (page: Page) => page.evaluate((name) => (window as unknown as Record<string, Recorder | undefined>)[name]?.arm(), GLOBAL).catch(() => {});
export const readThemeFrames = (page: Page) => page.evaluate((name) => (window as unknown as Record<string, Recorder | undefined>)[name]?.read(), GLOBAL).catch(() => undefined);

/** Lightness steps (of 100) a frame's background must be from both pages' to count as a flash: dark grey to near black is not one. */
const LIGHTNESS_STEP = 20;

export type FlashAspect = 'background' | 'color-scheme' | 'class';

export interface Flash {
	readonly aspect: FlashAspect;
	/** Frames that showed it. */
	readonly frames: number;
	readonly frame: ThemeFrame;
}

/** Frames that show neither the page before nor the page after, per aspect, the first such frame kept. */
export function themeFlashes(recording: ThemeRecording): Flash[] {
	const { before, after } = recording;
	const offBackdrop = (f: ThemeFrame) => f.backdrop.some((l, i) => Math.abs(l - (before.backdrop[i] ?? l)) > LIGHTNESS_STEP && Math.abs(l - (after.backdrop[i] ?? l)) > LIGHTNESS_STEP);
	const key = (classes: readonly string[]) => classes.join(' ');
	const tests: [FlashAspect, (f: ThemeFrame) => boolean][] = [
		['background', offBackdrop],
		['color-scheme', (f) => f.scheme !== before.scheme && f.scheme !== after.scheme],
		['class', (f) => key(f.classes) !== key(before.classes) && key(f.classes) !== key(after.classes)],
	];
	const out: Flash[] = [];
	for (const [aspect, off] of tests) {
		const hits = recording.frames.filter((f) => off(f.frame));
		if (hits.length) out.push({ aspect, frames: hits.reduce((n, f) => n + f.count, 0), frame: hits[0]!.frame });
	}
	return out;
}

const plural = (n: number, word: string, ending = 's') => `${n} ${word}${n === 1 ? '' : ending}`;

// Class tokens every state has (font and layout classes) are left out: only those that change are named.
function describe(aspect: FlashAspect, f: ThemeFrame, shared: ReadonlySet<string> = new Set()): string {
	if (aspect === 'background') return `background lightness ${f.backdrop.join(' and ')} of 100 at the left and right edge`;
	if (aspect === 'color-scheme') return `color-scheme ${f.scheme}`;
	const own = f.classes.filter((c) => !shared.has(c));
	return `${own.length ? `class "${own.join(' ')}"` : 'none of the changing classes'}${shared.size ? ` beside the ${plural(shared.size, 'class', 'es')} every frame has` : ''}`;
}

export const FLASH_HINT =
	'For a few frames of the in-place navigation the page showed neither the previous page\'s theme nor the next one\'s (a white flash on a dark site). Usually the router replaced <html class> or style with the server\'s and dropped what a theme script added (Markless 0.8\'s <html> sync did this: build on a Markless whose router keeps a script-set theme across the swap), or a stylesheet applied after the content. Keep script-set theme classes and color-scheme across the swap; never edit the converted output by hand.';

/** A failure for each aspect the swap flashed, naming the frames and what they showed against both pages. */
export function flashFailures(route: string, how: string, recording: ThemeRecording | undefined, hint = FLASH_HINT): Failure[] {
	if (!recording) return [];
	return themeFlashes(recording).map((flash) => {
		const missing = flash.aspect === 'class' ? recording.before.classes.filter((c) => recording.after.classes.includes(c) && !flash.frame.classes.includes(c)) : [];
		const extra = flash.aspect === 'class' ? flash.frame.classes.filter((c) => !recording.before.classes.includes(c) && !recording.after.classes.includes(c)) : [];
		const tokens = [missing.length ? `without ${missing.join(' ')}` : '', extra.length ? `with ${extra.join(' ')}` : ''].filter(Boolean).join(', ');
		const shared = new Set(flash.aspect === 'class' ? flash.frame.classes.filter((c) => recording.before.classes.includes(c) && recording.after.classes.includes(c)) : []);
		return {
			route,
			dimension: 'navigation',
			check: `${how}: ${flash.aspect === 'class' ? '<html> class' : flash.aspect === 'background' ? 'page background' : '<html> color-scheme'} during the swap`,
			expected: `every frame shows the page before (${describe(flash.aspect, recording.before, shared)}) or after (${describe(flash.aspect, recording.after, shared)})`,
			actual: `${plural(flash.frames, 'frame')} showed ${describe(flash.aspect, flash.frame, shared)}${tokens ? ` (${tokens})` : ''}`,
			hint,
		};
	});
}

// A swap that inserts the next page over several frames paints it while it builds up: the content laid out without a column
// still to come, then jumping when it arrives (Markless 0.8's chunked swap on ui.shadcn.com and docusaurus.io).

/** Pixels a box may be off by and still be in the same place: subpixel layout rounds either way. */
const BOX_SLACK = 1;

const boxesOf = (layout: readonly string[] = []) => new Map(layout.map((entry) => entry.split(' ') as [string, string]));

function sameBox(a: string | undefined, b: string | undefined): boolean {
	if (a === b) return true;
	if (!a || !b || a === '-' || b === '-') return false;
	const x = a.split(',').map(Number);
	const y = b.split(',').map(Number);
	return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]!) <= BOX_SLACK);
}

// Regions by name, so a frame missing one is compared region for region with the pages.
function regionsOff(frame: readonly string[] | undefined, ...pages: (readonly string[] | undefined)[]): string[] {
	const own = boxesOf(frame);
	const others = pages.map((page) => boxesOf(page));
	const names = new Set([...own.keys(), ...others.flatMap((page) => [...page.keys()])]);
	return [...names].filter((name) => others.every((page) => !sameBox(own.get(name) ?? '-', page.get(name) ?? '-')));
}

const sameLayout = (a: readonly string[] | undefined, b: readonly string[] | undefined) => (!a || !b ? a === b : regionsOff(a, b).length === 0);

export interface LayoutFlash {
	/** Frames that showed it. */
	readonly frames: number;
	readonly frame: ThemeFrame;
	/** When the first such frame ran and when the page first showed its settled layout, in milliseconds since recording started. */
	readonly from?: number;
	readonly to?: number;
}

/** Frames, from the first that leaves the page before's layout until the page first shows the layout it settles on, whose layout is neither. */
export function layoutFlash(recording: ThemeRecording): LayoutFlash | undefined {
	const { before, after } = recording;
	if (!after.layout || !before.layout) return undefined;
	const leaves = recording.frames.findIndex((f) => !sameLayout(f.frame.layout, before.layout));
	if (leaves < 0) return undefined;
	const settles = recording.frames.findIndex((f, i) => i >= leaves && sameLayout(f.frame.layout, after.layout));
	const swap = recording.frames.slice(leaves, settles < 0 ? undefined : settles);
	const off = swap.filter((f) => f.frame.layout && !sameLayout(f.frame.layout, before.layout) && !sameLayout(f.frame.layout, after.layout));
	if (!off.length) return undefined;
	return { frames: off.reduce((n, f) => n + f.count, 0), frame: off[0]!.frame, from: off[0]!.at, to: settles < 0 ? off.at(-1)!.at : recording.frames[settles]!.at };
}

export interface SwapShot {
	/** Milliseconds since recording started. */
	readonly at: number;
	readonly png: Buffer;
}

/** Most painted frames kept of one swap: a looping animation paints every frame. */
const MAX_SHOTS = 90;

/** Records what the compositor paints (Chromium's screencast) until the returned stop is called, timed from `started` (epoch milliseconds, the page's clock may be frozen); other browsers record nothing. */
export async function recordSwapShots(page: Page, started: () => number): Promise<() => Promise<SwapShot[]>> {
	const shots: SwapShot[] = [];
	const size = page.viewportSize();
	let cdp: CDPSession;
	try {
		cdp = await page.context().newCDPSession(page);
		cdp.on('Page.screencastFrame', (frame) => {
			if (shots.length < MAX_SHOTS) shots.push({ at: Math.round((frame.metadata.timestamp ?? Date.now() / 1000) * 1000 - started()), png: Buffer.from(frame.data, 'base64') });
			void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
		});
		await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, ...(size ? { maxWidth: size.width, maxHeight: size.height } : {}) });
	} catch {
		return async () => [];
	}
	return async () => {
		await cdp.send('Page.stopScreencast').catch(() => {});
		await cdp.detach().catch(() => {});
		return shots;
	};
}

/** Share of the viewport the differences of a painted frame must cover, against both pages, to show a layout of its own: a docs column laid out without its table of contents covered 48% on ui.shadcn.com, the table of contents missing for a frame 8% on docusaurus.io, a link's hover about 1%. */
const LAYOUT_SHARE = 0.05;
/** The compositor's and the animation frames' clocks, started a round trip apart, differ by up to a frame or two. */
const FRAME_MS = 40;

// The area the differences cover, not their pixel count: text moved across a white page changes few pixels over a wide area.
const offShare = (diff: VisualDiff) => (diff.sizeMismatch ? 1 : diff.regions.reduce((n, r) => n + r.width * r.height, 0) / diff.area);

/** The painted frame of a layout flash that differs most from both pages, when it differs from each by more than a sliver. */
export function flashShot(flash: LayoutFlash, shots: readonly SwapShot[]): { shot: SwapShot; after: SwapShot; diff: VisualDiff } | undefined {
	if (shots.length < 3) return undefined;
	const before = shots[0]!;
	const after = shots.at(-1)!;
	const { width, height } = PNG.sync.read(after.png);
	const noise = { width, height, mask: new Uint8Array(width * height) };
	let best: { shot: SwapShot; diff: VisualDiff; off: number } | undefined;
	for (const shot of shots.slice(1, -1)) {
		if (flash.from !== undefined && shot.at < flash.from - FRAME_MS) continue;
		if (flash.to !== undefined && shot.at > flash.to + FRAME_MS) continue;
		const diff = compareScreenshots(after.png, shot.png, noise);
		const off = Math.min(offShare(diff), offShare(compareScreenshots(before.png, shot.png, noise)));
		if (off > LAYOUT_SHARE && (!best || off > best.off)) best = { shot, diff, off };
	}
	return best && { shot: best.shot, after, diff: best.diff };
}

export const LAYOUT_HINT =
	'For a few frames of the in-place navigation the page showed a layout neither the previous page nor the next one has: the next page was painted while it was still being inserted (a column or the content below it still missing, then jumping in). Markless 0.8 inserted a long page over several frames and painted each one: build on a Markless whose router keeps the leaving page on screen until the next one is complete. A stylesheet applied after the content or a scroll reset a frame late shows the same way. Never edit the converted output by hand.';

/** A failure when frames of the swap showed a layout of their own, confirmed by a painted frame where the browser records them, with that frame as its screenshot. */
export function layoutFailures(route: string, how: string, viewport: string, recording: ThemeRecording | undefined, shots: readonly SwapShot[], hint = LAYOUT_HINT): { failures: Failure[]; shots: Shot[] } {
	const flash = recording && layoutFlash(recording);
	if (!recording || !flash) return { failures: [], shots: [] };
	const painted = flashShot(flash, shots);
	if (shots.length >= 3 && !painted) return { failures: [], shots: [] };
	const regions = regionsOff(flash.frame.layout, recording.before.layout, recording.after.layout);
	return {
		failures: [
			{
				route,
				dimension: 'navigation',
				check: `${how}: layout during the swap`,
				viewport,
				expected: 'every frame shows the page before or the page after, as a fresh load paints it whole',
				actual: `${plural(flash.frames, 'frame')} showed a layout of ${flash.frames === 1 ? 'its' : 'their'} own${regions.length ? ` (${regions.join(', ')} where neither page has them)` : ''}${painted ? `; a painted frame differs from the finished page in ${painted.diff.differing} pixels` : ''}`,
				hint,
			},
		],
		shots: painted ? [{ label: `navigation: ${how}, a frame during the swap`, viewport, old: painted.after.png, new: painted.shot.png, ...(painted.diff.png ? { diff: painted.diff.png } : {}), regions: painted.diff.regions, ok: false }] : [],
	};
}

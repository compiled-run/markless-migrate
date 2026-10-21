import type { Page } from 'playwright';
import type { Failure } from './types.ts';

// Settled-state checks cannot see a flash: a frame of the swap that shows neither page's theme (a dark site painted white
// while <html> lost its script-set `dark` class). This records what every frame of an in-place navigation paints of the theme.

/** What one frame shows of the theme: the <html> class tokens, its computed color-scheme, and the background lightness (0-100) at the left and right edge. */
export interface ThemeFrame {
	readonly classes: readonly string[];
	readonly scheme: string;
	readonly backdrop: readonly number[];
}

export interface ThemeRecording {
	readonly before: ThemeFrame;
	/** Consecutive identical frames are one entry. */
	readonly frames: readonly { readonly frame: ThemeFrame; readonly count: number }[];
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
	const snapshot = (): ThemeFrame => {
		const root = document.documentElement;
		const scheme = getComputedStyle(root).colorScheme;
		const dark = /\bdark\b/.test(scheme) && !/\blight\b/.test(scheme);
		const y = innerHeight / 2;
		return { classes: [...root.classList].sort(), scheme, backdrop: [at(1, y, dark), at(innerWidth - 2, y, dark)] };
	};
	let recording: { before: ThemeFrame; frames: { frame: ThemeFrame; count: number }[] } | undefined;
	const same = (a: ThemeFrame, b: ThemeFrame) => JSON.stringify(a) === JSON.stringify(b);
	const tick = () => {
		if (!recording) return;
		const frame = snapshot();
		const last = recording.frames.at(-1);
		if (last && same(last.frame, frame)) last.count++;
		else if (recording.frames.length < 500) recording.frames.push({ frame, count: 1 });
		raf(tick);
	};
	Object.defineProperty(w, '__mmThemeFrames', {
		value: {
			arm: () => {
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

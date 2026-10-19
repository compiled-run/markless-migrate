// A canvas a page animates from load (a Rive or WebGL hero) runs no CSS or Web Animation, writes nothing to the DOM
// and is masked as noise in screenshots: it is compared here by its frames, recorded from load on both sides.
import pixelmatch from 'pixelmatch';
import type { Browser } from 'playwright';
import type { SideEnv } from './browser.ts';
import { readPage } from './collect.ts';
import { HINTS } from './hints.ts';
import { openSession } from './journeys.ts';
import { describe, matchElements } from './match.ts';
import type { ElementSnapshot, Failure, Viewport } from './types.ts';

const RECORD_MS = 6_000;
// New frames are matched from here on: what the page shows while it loads is the load's business.
const FROM_MS = 1_500;
const SAMPLE_MS = 100;
// Frames are copied at about this many pixels: what is drawn where, not antialiasing.
const PIXELS = 12_000;
const PIXEL_THRESHOLD = 0.1;
// Best-matching frames that differ by at most twice what the old page differs from itself, or 0.5% of the canvas, are the same drawing.
const NOISE_FACTOR = 2;
const NOISE_FLOOR = 0.005;
const TIE = 0.002;

interface Frame {
	readonly t: number;
	readonly data: Uint8Array;
}

interface CanvasTrack {
	readonly element: ElementSnapshot;
	readonly width: number;
	readonly height: number;
	readonly frames: readonly Frame[];
}

/** One canvas compared old to new by its frames, each new frame against the old frame it looks most like. */
export interface CanvasComparison {
	readonly canvas: string;
	/** How much later the new drawing runs than the old (negative: sooner), in ms: the lag that lines most new frames up with old ones, and how far the lags spread (a drawing that only starts at another time has one lag). */
	readonly gap: { readonly ms: number; readonly spread: number };
	/** The share of the canvas that differs between each new frame and its best-matching old frame, median and worst; and the old page against a second load of itself. */
	readonly best: { readonly median: number; readonly worst: number; readonly oldVsOld: number };
	/** `same`: once lined up in time the frames match, so any difference is when it started; `differs`: no old frame matches. */
	readonly verdict: 'same' | 'differs';
}

const share = (a: Uint8Array, b: Uint8Array, width: number, height: number) => pixelmatch(a, b, null, width, height, { threshold: PIXEL_THRESHOLD, includeAA: false }) / (width * height);

type CanvasWindow = Window & { __mmCanvasFrames?: () => { id?: number; width: number; height: number; frames: { t: number; data: string }[] }[] };

// Init script, run in every document before its own scripts: every animation frame, after the page's own drawing in that frame (a WebGL canvas can still be read there), each canvas is copied small, until `ms` after the document started.
function recordCanvasFrames({ ms, pixels }: { ms: number; pixels: number }): void {
	const raf = requestAnimationFrame.bind(window);
	const tracks = new Map<HTMLCanvasElement, { width: number; height: number; frames: { t: number; data: string }[] }>();
	const unreadable = new WeakSet<HTMLCanvasElement>();
	const scratch = document.createElement('canvas');
	const ctx = scratch.getContext('2d', { willReadFrequently: true });
	let last = -Infinity;
	const tick = (now: number) => {
		if (now > ms || !ctx) return;
		raf(tick);
		if (now - last < 30) return;
		last = now;
		for (const c of document.querySelectorAll('canvas')) {
			const r = c.getBoundingClientRect();
			if (c === scratch || unreadable.has(c) || c.width < 16 || c.height < 16 || r.bottom > innerHeight || r.right > innerWidth) continue;
			const k = Math.min(1, Math.sqrt(pixels / (c.width * c.height)));
			const width = Math.max(1, Math.round(c.width * k));
			const height = Math.max(1, Math.round(c.height * k));
			// A canvas sized again (a player fitting it to its box once it starts) is recorded from its new size on.
			const kept = tracks.get(c);
			const track = kept && kept.width === width && kept.height === height ? kept : { width, height, frames: [] };
			tracks.set(c, track);
			try {
				scratch.width = width;
				scratch.height = height;
				ctx.drawImage(c, 0, 0, width, height);
				const bytes = ctx.getImageData(0, 0, width, height).data;
				let text = '';
				for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
				track.frames.push({ t: Math.round(now), data: btoa(text) });
			} catch {
				// A canvas that drew another origin's image cannot be read back.
				tracks.delete(c);
				unreadable.add(c);
			}
		}
	};
	raf(tick);
	const ids = () => (window as unknown as { __mmIds?: WeakMap<Element, number> }).__mmIds;
	Object.defineProperty(window, '__mmCanvasFrames', { value: () => [...tracks].map(([c, t]) => ({ ...(ids()?.has(c) ? { id: ids()!.get(c)! } : {}), ...t })) });
}

/** Loads the route again with every canvas recorded from the start of the document, and keeps those of the first screen. */
async function recordCanvases(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<CanvasTrack[]> {
	const session = await openSession(browser, env, route, viewport);
	try {
		const page = session.page;
		await page.context().addInitScript(recordCanvasFrames, { ms: RECORD_MS, pixels: PIXELS });
		await page.goto(page.url(), { waitUntil: 'load' }).catch(() => {});
		await page.waitForFunction((ms) => performance.now() > ms, RECORD_MS, { timeout: RECORD_MS + 30_000 }).catch(() => {});
		const elements = await readPage(page, { origin: new URL(page.url()).origin, full: true, styles: false }).then((c) => c.elements as ElementSnapshot[], () => [] as ElementSnapshot[]);
		const byId = new Map(elements.map((el) => [el.id, el]));
		const tracks = await page.evaluate(() => (window as unknown as CanvasWindow).__mmCanvasFrames?.() ?? []).catch(() => []);
		return tracks.flatMap((t) => {
			const element = t.id !== undefined ? byId.get(t.id) : undefined;
			if (!element || element.box.y + element.box.height > viewport.height || element.box.x + element.box.width > viewport.width) return [];
			return [{ element, width: t.width, height: t.height, frames: t.frames.map((f) => ({ t: f.t, data: new Uint8Array(Buffer.from(f.data, 'base64')) })) }];
		});
	} finally {
		await session.close();
	}
}

/** New frames every SAMPLE_MS from FROM_MS on, each with the share that differs from the old frame most like it and that frame's lag (old time minus new). */
export function bestMatches(old: CanvasTrack, next: CanvasTrack): { diff: number; lag: number }[] {
	if (old.width !== next.width || old.height !== next.height || !old.frames.length) return [];
	const out: { diff: number; lag: number }[] = [];
	let due = FROM_MS;
	for (const f of next.frames) {
		if (f.t < due) continue;
		due = f.t + SAMPLE_MS;
		const diffs = old.frames.map((o) => ({ diff: share(f.data, o.data, next.width, next.height), lag: o.t - f.t }));
		const least = Math.min(...diffs.map((d) => d.diff));
		// A looping drawing matches once per loop: the nearest in time of the equally good matches is the shift.
		out.push(diffs.filter((d) => d.diff <= least + TIE).sort((a, b) => Math.abs(a.lag) - Math.abs(b.lag))[0]!);
	}
	return out;
}

const quantile = (xs: readonly number[], q: number) => {
	const s = [...xs].sort((a, b) => a - b);
	return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))]! : 0;
};
const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** Compares one canvas's frames: `same` when each new frame has an old frame as like it as the old page is like itself, whatever the time shift. */
export function compareCanvas(old: CanvasTrack, next: CanvasTrack, twin?: CanvasTrack): CanvasComparison | undefined {
	const matches = bestMatches(old, next);
	if (!matches.length) return undefined;
	const lags = matches.map((m) => m.lag);
	const oldVsOld = twin ? quantile(bestMatches(old, twin).map((m) => m.diff), 0.5) : 0;
	const best = { median: quantile(matches.map((m) => m.diff), 0.5), worst: Math.max(...matches.map((m) => m.diff)), oldVsOld };
	return { canvas: describe(old.element), gap: { ms: -Math.round(quantile(lags, 0.5)), spread: Math.round(quantile(lags, 0.75) - quantile(lags, 0.25)) }, best, verdict: best.median <= Math.max(NOISE_FACTOR * oldVsOld, NOISE_FLOOR) ? 'same' : 'differs' };
}

/** Records the canvases of the first screen from load, twice on the old side (how much it differs from itself) and once on the new, and compares each new frame with its best-matching old frame. */
export async function checkCanvases(browser: Browser, envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport): Promise<{ failures: Failure[]; canvases: CanvasComparison[] }> {
	const [old, again, next] = await Promise.all([recordCanvases(browser, envs.old, route, viewport), recordCanvases(browser, envs.old, route, viewport), recordCanvases(browser, envs.new, route, viewport)]);
	const failures: Failure[] = [];
	const canvases: CanvasComparison[] = [];
	for (const [i, j] of matchElements(old.map((c) => c.element), next.map((c) => c.element))) {
		const o = old[i]!;
		const c = compareCanvas(o, next[j]!, again.find((t) => t.element.path === o.element.path && t.width === o.width && t.height === o.height));
		if (!c) continue;
		canvases.push(c);
		if (c.verdict === 'same') continue;
		failures.push({
			route,
			dimension: 'motion',
			check: `canvas frames from load: ${c.canvas}`,
			viewport: viewport.name,
			expected: `old: the same drawing on every load (a second load differs by ${percent(c.best.oldVsOld)} at its best-matching frames)`,
			actual: `new: ${percent(c.best.median)} of the canvas differs from the best-matching old frame (worst ${percent(c.best.worst)}), whatever the time shift (best lined up ${Math.abs(c.gap.ms)} ms ${c.gap.ms >= 0 ? 'later' : 'sooner'})`,
			hint: HINTS.motionCanvas,
		});
	}
	return { failures, canvases };
}

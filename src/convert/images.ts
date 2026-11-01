import { attr, head, isElement, remove, removeAttr, setAttr, walk, type Document, type Element } from './dom.ts';
import type { Dropped } from './clean.ts';

/** Where one `<img>` of a captured page was drawn, in `document.images` order. */
export interface ImageFact {
	/** `src` and `srcset` as written, to pair the same image across viewports. */
	readonly key: string;
	/** Drawn at all once the page settled: it has a box and is not `visibility: hidden`. */
	readonly shown: boolean;
	/** Its box at scroll 0, in CSS pixels. */
	readonly top: number;
	readonly bottom: number;
	readonly width: number;
	/** The file's own size, as the browser decoded it; 0 when it was not loaded. */
	readonly naturalWidth?: number;
	readonly naturalHeight?: number;
	/** Its CSS width at other viewport widths (the desktop page resized), by viewport width. */
	readonly widths?: Readonly<Record<string, number>>;
}

export interface ImageFacts {
	readonly viewport: { readonly width: number; readonly height: number };
	readonly images: readonly ImageFact[];
}

/** The viewport widths the desktop page is resized to, beside the two it is captured at, to write `sizes` from. */
export const MEASURE_WIDTHS = [767, 768, 1279, 1920] as const;

/** Runs in the page: every image's box at scroll 0. */
export function readImages(): ImageFacts {
	const images = [...document.images].map((img) => {
		const r = img.getBoundingClientRect();
		const shown = img.getClientRects().length > 0 && r.width > 0 && r.height > 0 && getComputedStyle(img).visibility !== 'hidden';
		return { key: `${img.getAttribute('src') ?? ''}|${img.getAttribute('srcset') ?? ''}`, shown, top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), width: Math.round(r.width), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
	});
	return { viewport: { width: innerWidth, height: innerHeight }, images };
}

/** Runs in the page: each image's CSS width, in `document.images` order. */
export function readImageWidths(): number[] {
	return [...document.images].map((img) => (img.getClientRects().length ? Math.round(img.getBoundingClientRect().width) : 0));
}

/** An image optimizer that answers a width from a list: Next.js's `/_next/image?url=&w=&q=`. */
export interface Optimizer {
	readonly path: string;
	/** Widths it answers, ascending. */
	readonly widths: readonly number[];
}

// next/image's defaults (deviceSizes then imageSizes), which a next.config may replace.
export const NEXT_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

/** The widths a Next.js app's image optimizer answers, from its config when it sets them. */
export function nextImageWidths(config: string | undefined): readonly number[] {
	const list = (name: string) => {
		const m = config && new RegExp(`${name}\\s*:\\s*\\[([^\\]]*)\\]`).exec(config);
		return m ? m[1]!.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0) : undefined;
	};
	const device = list('deviceSizes');
	const sizes = list('imageSizes');
	if (!device && !sizes) return NEXT_WIDTHS;
	return [...new Set([...(device ?? NEXT_WIDTHS.filter((w) => w >= 640)), ...(sizes ?? NEXT_WIDTHS.filter((w) => w < 640))])].sort((a, b) => a - b);
}

interface Candidate {
	readonly url: string;
	readonly descriptor: string;
}

const candidates = (srcset: string): Candidate[] =>
	srcset
		.split(/,(?=\s*\S)/)
		.map((c) => c.trim().split(/\s+/))
		.filter((p) => p[0])
		.map(([url, descriptor = '1x']) => ({ url: url!, descriptor }));

/** The optimizer URL with another width; undefined when `url` is not the optimizer's. */
function atWidth(url: string, optimizer: Optimizer, width: number): string | undefined {
	const parsed = URL.parse(url, 'http://x');
	if (!parsed || parsed.pathname !== optimizer.path || !parsed.searchParams.get('url') || !parsed.searchParams.get('w')) return undefined;
	return url.replace(/([?&]w=)\d+/, `$1${width}`);
}

const widthOf = (url: string) => Number(URL.parse(url, 'http://x')?.searchParams.get('w'));

/**
 * The `sizes` an image's measured CSS widths call for: one value up to each layout breakpoint the page was measured on
 * (phone, tablet, desktop), as a share of the viewport, or the desktop width itself where it no longer grows. Each value
 * is the larger of the two widths that bound its range, so the browser never picks a file too small for the box.
 */
export function sizesFor(at: Readonly<Record<string, number>>): string | undefined {
	const w = (v: number) => at[String(v)] ?? 0;
	// A range where it is not drawn may still show it later (a menu opened): the whole viewport, never a blurry file.
	const share = (...vs: number[]) => Math.ceil(Math.max(...vs.map((v) => (w(v) / v) * 100))) || 100;
	if (![390, 767, 768, 1279, 1280, 1920].some((v) => w(v) > 0)) return undefined;
	const phone = share(390, 767);
	const tablet = share(768, 1279);
	const wide = w(1280) > 0 && Math.abs(w(1920) - w(1280)) <= 2 ? `${w(1280)}px` : `${share(1280, 1920)}vw`;
	return `(max-width: 767px) ${phone}vw, (max-width: 1279px) ${tablet}vw, ${wide}`;
}

export interface ImagePlan {
	/** Images made lazy: drawn in no viewport's first screen. */
	lazy: number;
	/** Images in a first screen that the old page had lazy, made eager. */
	eager: number;
	/** Fixed-width optimizer images given a width per device (`srcset` with `w` descriptors and `sizes`). */
	responsive: number;
	/** Head preloads of images the page no longer loads with it. */
	preloadsDropped: number;
	/** Images one first screen shows and another viewport does not draw: lazy, preloaded only where they show. */
	someScreens: number;
}

const MEASURED = [390, 767, 768, 1279, 1280, 1920];

/** The media query of the viewport widths an image is drawn at, when they are one range: `(min-width: 768px)`, `(max-width: 767px)`. */
export function drawnMedia(at: Readonly<Record<string, number>>): string | undefined {
	const drawn = MEASURED.filter((v) => at[String(v)] !== undefined).map((v) => [v, at[String(v)]! > 0] as const);
	const from = drawn.findIndex(([, d]) => d);
	const to = drawn.findLastIndex(([, d]) => d);
	if (from < 0 || drawn.slice(from, to + 1).some(([, d]) => !d)) return undefined;
	if (from > 0 && to === drawn.length - 1) return `(min-width: ${drawn[from]![0]}px)`;
	if (from === 0 && to < drawn.length - 1) return `(max-width: ${drawn[to]![0]}px)`;
	return undefined;
}

export interface View {
	readonly fact: ImageFact;
	readonly viewport: ImageFacts['viewport'];
}

/** Each `<img>` of the parsed desktop document with where it was drawn in every viewport; empty when the capture has no facts or the images no longer line up. */
export function pairImages(doc: Document, facts: Readonly<Record<string, ImageFacts>> | undefined): Map<Element, View[]> {
	const out = new Map<Element, View[]>();
	const desktop = facts?.desktop;
	if (!desktop) return out;
	const imgs = [...walk(doc)].filter((el) => el.tagName === 'img' && !insideTemplate(el));
	if (imgs.length !== desktop.images.length) return out;
	// The same image in the other viewports: the nth with its src and srcset.
	const others = Object.entries(facts)
		.filter(([name]) => name !== 'desktop')
		.map(([, f]) => {
			const byKey = new Map<string, ImageFact[]>();
			for (const img of f.images) byKey.set(img.key, [...(byKey.get(img.key) ?? []), img]);
			return { f, byKey };
		});
	const seen = new Map<string, number>();
	imgs.forEach((el, i) => {
		const fact = desktop.images[i]!;
		const n = seen.get(fact.key) ?? 0;
		seen.set(fact.key, n + 1);
		out.set(el, [{ fact, viewport: desktop.viewport }, ...others.flatMap(({ f, byKey }) => (byKey.get(fact.key)?.[n] ? [{ fact: byKey.get(fact.key)![n]!, viewport: f.viewport }] : []))]);
	});
	return out;
}

/**
 * Loads each image the way a visitor's first screen needs it, from where the old page drew it at each captured viewport:
 * an image drawn in no first screen (below the fold, or not drawn at all, as a dark-mode twin) is `loading="lazy"` and
 * loses the head preload that fetched it at once; one drawn in a first screen is never lazy; a fixed-width optimizer image
 * (next/image without `sizes`: one file of up to 3840 pixels for every device) lists the optimizer's widths up to its own
 * and the `sizes` its measured boxes call for, and its head preload follows.
 */
export function planImages(doc: Document, paired: ReadonlyMap<Element, readonly View[]>, optimizer: Optimizer | undefined, dropped: Dropped): ImagePlan {
	const plan: ImagePlan = { lazy: 0, eager: 0, responsive: 0, preloadsDropped: 0, someScreens: 0 };
	const media = new Map<string, string>();
	const lazySets = new Set<string>();
	const shownSets = new Set<string>();
	const rewritten = new Map<string, { srcset: string; sizes: string }>();
	for (const [el, views] of paired) {
		if (!el.parentNode) continue;
		const { fact, viewport: desktop } = views[0]!;
		const firstScreen = views.some(({ fact: v, viewport }) => v.shown && v.top < viewport.height && v.bottom > 0);
		const srcset = attr(el, 'srcset');
		const loading = attr(el, 'loading');
		if (firstScreen) shownSets.add(srcset ?? attr(el, 'src') ?? '');
		const at: Record<string, number> = { ...fact.widths };
		for (const { fact: v, viewport } of views) at[String(viewport.width)] = v.shown ? v.width : 0;
		const only = firstScreen && views.some(({ fact: v }) => !v.shown) ? drawnMedia(at) : undefined;
		if (only) {
			// Drawn only in one range of widths (a desktop banner a phone hides): lazy never fetches it where it is not drawn, and a preload with that media still fetches it early where it is.
			if (loading !== 'lazy') setAttr(el, 'loading', 'lazy');
			media.set(srcset ?? attr(el, 'src') ?? '', only);
			plan.someScreens++;
		} else if (!firstScreen && loading !== 'lazy') {
			setAttr(el, 'loading', 'lazy');
			plan.lazy++;
			lazySets.add(srcset ?? attr(el, 'src') ?? '');
		} else if (firstScreen && loading === 'lazy') {
			removeAttr(el, 'loading');
			plan.eager++;
		}
		if (!optimizer || attr(el, 'sizes')) continue;
		const listed = srcset ? candidates(srcset) : attr(el, 'src') ? [{ url: attr(el, 'src')!, descriptor: '1x' }] : [];
		if (!listed.length || !listed.every((c) => /^\d+(\.\d+)?x$/.test(c.descriptor) && atWidth(c.url, optimizer, 1))) continue;
		const largest = listed.reduce((a, b) => (widthOf(b.url) > widthOf(a.url) ? b : a));
		const widths: Record<string, number> = { ...fact.widths, [String(desktop.width)]: fact.shown ? fact.width : 0 };
		for (const { fact: v, viewport } of views.slice(1)) widths[String(viewport.width)] = v.shown ? v.width : 0;
		const sizes = sizesFor(widths);
		if (!sizes) continue;
		const top = widthOf(largest.url);
		// The file's own size: the optimizer never upscales, and scales the height to the nearest pixel.
		const W = views.map((v) => v.fact.naturalWidth ?? 0).find((n) => n > 0) ?? Number(attr(el, 'width'));
		const H = views.map((v) => v.fact.naturalHeight ?? 0).find((n) => n > 0) ?? Number(attr(el, 'height'));
		if (!(W > 0 && H > 0)) continue;
		// Nothing narrower than the narrowest box it is drawn in: a smaller file is never picked.
		const narrowest = Math.min(...Object.values(widths).filter((w) => w > 0));
		const from = optimizer.widths.find((w) => w >= narrowest) ?? top;
		// Only widths whose height is a whole pixel: a rounded one changes the box an auto height gets from the file by up to a pixel, and every pixel below it moves.
		const exact = (w: number) => w >= W || (w * H) % W === 0;
		const set = optimizer.widths
			.filter((w) => w >= from && w <= top && exact(w))
			.filter((w, i, all) => w < W || all.findIndex((x) => x >= W) === i)
			.map((w) => `${atWidth(largest.url, optimizer, w)} ${Math.min(w, W)}w`);
		if (set.length < 2) continue;
		const next = set.join(', ');
		rewritten.set(srcset ?? attr(el, 'src')!, { srcset: next, sizes });
		setAttr(el, 'srcset', next);
		setAttr(el, 'sizes', sizes);
		plan.responsive++;
	}
	for (const link of [...walk(head(doc))].filter((el) => el.tagName === 'link' && /\bpreload\b/.test(attr(el, 'rel') ?? '') && attr(el, 'as') === 'image')) {
		const of = attr(link, 'imagesrcset') ?? attr(link, 'href') ?? '';
		if (lazySets.has(of) && !shownSets.has(of)) {
			remove(link);
			plan.preloadsDropped++;
			dropped.set('<link rel=preload as=image>: an image no first screen shows, now lazy', (dropped.get('<link rel=preload as=image>: an image no first screen shows, now lazy') ?? 0) + 1);
			continue;
		}
		const where = media.get(of);
		if (where && !attr(link, 'media')) setAttr(link, 'media', where);
		const to = rewritten.get(of);
		if (to) {
			setAttr(link, 'imagesrcset', to.srcset);
			setAttr(link, 'imagesizes', to.sizes);
		}
	}
	return plan;
}

function insideTemplate(el: Element): boolean {
	for (let p = el.parentNode; p; p = (p as Element).parentNode) {
		if (isElement(p as Element) && (p as Element).tagName === 'template') return true;
		// A template's content fragment has no parent link back to the template in parse5.
		if ((p as { nodeName: string }).nodeName === '#document-fragment') return true;
	}
	return false;
}

/** An iframe a site part mounts keeps the class its server sent (opacity-0 before onLoad): the part plays the change the capture caught. */
export function framesAsServed(doc: Document, served: Document, mounted: (el: Element) => boolean): number {
	const keyOf = (el: Element) => `${attr(el, 'src') ?? ''}|${attr(el, 'title') ?? ''}`;
	const sent = new Map<string, Element[]>();
	for (const el of walk(served)) if (el.tagName === 'iframe') sent.set(keyOf(el), [...(sent.get(keyOf(el)) ?? []), el]);
	const seen = new Map<string, number>();
	let n = 0;
	for (const el of walk(doc)) {
		if (el.tagName !== 'iframe') continue;
		const key = keyOf(el);
		const i = seen.get(key) ?? 0;
		seen.set(key, i + 1);
		const was = sent.get(key)?.[i] && attr(sent.get(key)![i]!, 'class');
		if (was === undefined || was === attr(el, 'class') || !mounted(el)) continue;
		setAttr(el, 'class', was);
		n++;
	}
	return n;
}

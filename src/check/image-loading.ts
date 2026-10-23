import { VIEWPORTS, type Failure, type ImageRecord, type PageCapture } from './types.ts';

export const IMAGE_LOADING_HINT =
	'An image is fetched with the page only when a first screen shows it. Give an image no first screen shows (below the fold on a phone and a desktop, or not drawn at all, as a dark-mode twin) loading="lazy" and drop any <link rel="preload" as="image"> for it; never lazy-load one a first screen shows. Give a first-screen image whose file is much wider than its box a srcset of widths with sizes (convert writes them for next/image from its own optimizer), so a phone downloads the width its box needs. Every request that starts before the largest paint shares the phone\'s bandwidth with it, so Lighthouse counts it toward LCP.';

// Icons and spacers cost a request but no bandwidth worth a finding.
const MIN_AREA = 64 * 64;
// A 2x phone screen is what PageSpeed Insights' Moto G Power (1.75x) and most phones need at most.
const PHONE_DPR = 2;

interface Seen {
	readonly viewport: string;
	readonly height: number;
	readonly img: ImageRecord;
}

const firstScreen = (s: Seen) => !!s.img.box && s.img.box.y < s.height && s.img.box.y + s.img.box.height > 0;

/**
 * How the new page loads its images, from where each was drawn at every viewport once the page settled: an image no first
 * screen shows that still loads with the page (eager, or preloaded in the head), a first-screen image held back by
 * loading="lazy", and a first-screen image whose one file is more than twice as wide as a 2x phone needs for its box.
 */
export function imageLoadingFailures(route: string, pages: Readonly<Record<string, PageCapture>>): Failure[] {
	const views = Object.values(pages);
	const first = views[0];
	if (!first || views.some((p) => p.images.length !== first.images.length)) return [];
	const failures: Failure[] = [];
	first.images.forEach((img, i) => {
		const seen: Seen[] = views.map((p) => ({ viewport: p.viewport, height: VIEWPORTS.find((v) => v.name === p.viewport)?.height ?? 800, img: p.images[i]! }));
		if (seen.some((s) => s.img.alt !== img.alt) || img.broken || img.src.startsWith('data:') || (img.naturalWidth > 0 && img.naturalWidth * img.naturalHeight < MIN_AREA)) return;
		const shown = seen.filter(firstScreen);
		const check = `image loading: ${img.src}`;
		if (!shown.length && (img.loading !== 'lazy' || img.preloaded))
			failures.push({ route, dimension: 'load', check, expected: 'loaded when it is about to be seen (loading="lazy", no head preload): no first screen shows it', actual: `${img.preloaded ? 'preloaded in the head' : 'loaded with the page'}; ${seen.map((s) => `${s.viewport} ${s.img.box ? `drawn at y=${s.img.box.y}, below the first ${s.height} px` : 'not drawn'}`).join(', ')}`, hint: IMAGE_LOADING_HINT });
		// A lazy image some viewport does not draw is fetched early where it shows by a preload scoped to that width.
		if (shown.length && img.loading === 'lazy' && !(img.preloaded && seen.some((s) => !s.img.box)))
			failures.push({ route, dimension: 'load', check, expected: 'fetched with the page: a first screen shows it', actual: `loading="lazy" while ${shown.map((s) => s.viewport).join(' and ')} show${shown.length === 1 ? 's' : ''} it at y=${shown[0]!.img.box!.y}`, hint: IMAGE_LOADING_HINT });
		const phone = shown.find((s) => VIEWPORTS.find((v) => v.name === s.viewport)?.isMobile);
		if (phone && !img.widths && phone.img.naturalWidth > 2 * PHONE_DPR * phone.img.box!.width)
			failures.push({ route, dimension: 'load', check, viewport: phone.viewport, expected: `a srcset of widths with sizes: its ${phone.img.box!.width} px box needs at most ${PHONE_DPR * phone.img.box!.width} px on a 2x phone`, actual: `one ${phone.img.naturalWidth}x${phone.img.naturalHeight} file for every device`, hint: IMAGE_LOADING_HINT });
	});
	return failures;
}

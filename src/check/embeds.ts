import type { Locator, Page } from 'playwright';
import { HINTS } from './hints.ts';
import type { Box, Failure, PageCapture } from './types.ts';

/** A live embed (an iframe or plugin from another origin, or a video): what the page controls of it. Its content is the third party's or the decoder's, and is masked in screenshots on both sides. */
export interface LiveEmbed {
	readonly tag: string;
	/** Origin and path; the app's own origin is left out, so a same-app video compares by path. */
	readonly src: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly box: Box;
	/** Its index among `EMBED_SELECTOR` matches, to mask it. */
	readonly index: number;
}

export const EMBED_SELECTOR = 'iframe, video, embed, object';
const PAD = 8;

/** Runs in the page: the live embeds, with their boxes in page coordinates. Must stay self-contained. */
export function liveEmbeds(): LiveEmbed[] {
	const kept = ['width', 'height', 'loading', 'allow', 'allowfullscreen', 'sandbox', 'referrerpolicy', 'title', 'autoplay', 'controls', 'muted', 'loop', 'playsinline', 'poster', 'preload', 'type'];
	const out: LiveEmbed[] = [];
	[...document.querySelectorAll('iframe, video, embed, object')].forEach((el, index) => {
		const tag = el.tagName.toLowerCase();
		const raw = tag === 'video' ? (el as HTMLVideoElement).currentSrc || el.getAttribute('src') || el.querySelector('source[src]')?.getAttribute('src') || '' : (el.getAttribute(tag === 'object' ? 'data' : 'src') ?? '');
		const url = URL.parse(raw, location.href);
		const foreign = url !== null && /^https?:$/.test(url.protocol) && url.origin !== location.origin;
		if (tag !== 'video' && !foreign) return;
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) return;
		const attributes = Object.fromEntries(kept.flatMap((name) => (el.hasAttribute(name) ? [[name, el.getAttribute(name) ?? '']] : [])));
		const src = url ? (url.origin === location.origin ? url.pathname : `${url.origin}${url.pathname}`) : raw;
		out.push({ tag, src, attributes, box: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) }, index });
	});
	return out;
}

/** Locators for the page's live embeds, to mask in a screenshot. */
export async function embedMasks(page: Page): Promise<Locator[]> {
	const found = await page.evaluate(liveEmbeds).catch(() => [] as LiveEmbed[]);
	return found.map((e) => page.locator(EMBED_SELECTOR).nth(e.index));
}

const describeEmbed = (e: LiveEmbed) => `<${e.tag}> ${e.src} ${e.box.width}x${e.box.height} at (${e.box.x}, ${e.box.y})${Object.keys(e.attributes).length ? ` ${Object.entries(e.attributes).map(([k, v]) => (v ? `${k}="${v}"` : k)).join(' ')}` : ''}`;

const alike = (o: LiveEmbed | undefined, n: LiveEmbed | undefined) => Boolean(o && n && o.tag === n.tag && o.src === n.src && JSON.stringify(o.attributes) === JSON.stringify(n.attributes) && Math.abs(o.box.width - n.box.width) <= 2 && Math.abs(o.box.height - n.box.height) <= 2 && Math.abs(o.box.x - n.box.x) <= PAD && Math.abs(o.box.y - n.box.y) <= PAD);

/** Each live embed of the old page against the new page's, in order: same element, address, attributes, size and place. One the old loads disagree on is left to the noise baseline. */
export function embedFailures(route: string, viewport: string, old: PageCapture, others: readonly PageCapture[], next: PageCapture): Failure[] {
	const a = old.liveEmbeds ?? [];
	const b = next.liveEmbeds ?? [];
	const failures: Failure[] = [];
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const o = a[i];
		const n = b[i];
		if (others.some((p) => (o ? !alike(o, p.liveEmbeds?.[i]) : p.liveEmbeds?.[i] !== undefined)) || alike(o, n)) continue;
		failures.push({ route, dimension: 'rendered', check: `embed #${i + 1}${o ? ` <${o.tag}>` : ''}`, viewport, expected: o ? describeEmbed(o) : '(absent)', actual: n ? describeEmbed(n) : '(absent)', hint: HINTS.embed });
	}
	return failures;
}

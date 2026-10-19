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
}

const MARK = 'data-markless-migrate-embed';
const PAD = 8;

/** Runs in the page: the live embeds, in the document and in open shadow roots (a widget may draw its iframe in one), with their boxes in page coordinates; `mark` tags each for a screenshot mask. Must stay self-contained. */
export function liveEmbeds(mark = false): LiveEmbed[] {
	const kept = ['width', 'height', 'loading', 'allow', 'allowfullscreen', 'sandbox', 'referrerpolicy', 'title', 'autoplay', 'controls', 'muted', 'loop', 'playsinline', 'poster', 'preload', 'type'];
	const found: Element[] = [];
	const walk = (root: Document | ShadowRoot) => {
		for (const el of root.querySelectorAll('*')) {
			if (el.matches('iframe, video, embed, object')) found.push(el);
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(document);
	const out: LiveEmbed[] = [];
	for (const el of found) {
		const tag = el.tagName.toLowerCase();
		const raw = tag === 'video' ? (el as HTMLVideoElement).currentSrc || el.getAttribute('src') || el.querySelector('source[src]')?.getAttribute('src') || '' : (el.getAttribute(tag === 'object' ? 'data' : 'src') ?? '');
		const url = URL.parse(raw, location.href);
		const foreign = url !== null && /^https?:$/.test(url.protocol) && url.origin !== location.origin;
		if (tag !== 'video' && !foreign) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) continue;
		const attributes = Object.fromEntries(kept.flatMap((name) => (el.hasAttribute(name) ? [[name, el.getAttribute(name) ?? '']] : [])));
		const src = url ? (url.origin === location.origin ? url.pathname : `${url.origin}${url.pathname}`) : raw;
		if (mark) {
			el.setAttribute('data-markless-migrate-embed', tag === 'video' ? `${(el as HTMLElement).style.getPropertyValue('visibility')}\u0000${(el as HTMLElement).style.getPropertyPriority('visibility')}` : '');
			// A full-page capture can paint a video's frame a few pixels off its box, outside the mask: the frame is the decoder's, so it is not painted.
			if (tag === 'video') (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
		}
		out.push({ tag, src, attributes, box: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) } });
	}
	return out;
}

/** Runs in the page: takes the screenshot marks off again. */
function unmark(): void {
	const walk = (root: Document | ShadowRoot) => {
		for (const el of root.querySelectorAll('[data-markless-migrate-embed]')) {
			const [visibility = '', priority = ''] = (el.getAttribute('data-markless-migrate-embed') ?? '').split('\u0000');
			if (el.tagName === 'VIDEO') {
				if (visibility) (el as HTMLElement).style.setProperty('visibility', visibility, priority);
				else (el as HTMLElement).style.removeProperty('visibility');
			}
			el.removeAttribute('data-markless-migrate-embed');
		}
		for (const el of root.querySelectorAll('*')) {
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(document);
}

/** A screenshot with every live embed masked (Playwright's locators reach into open shadow roots); returns the embeds too. */
export async function maskedShot(page: Page, shoot: (mask: Locator[]) => Promise<Buffer>): Promise<{ shot: Buffer; embeds: LiveEmbed[] }> {
	const embeds = await page.evaluate(liveEmbeds, true).catch(() => [] as LiveEmbed[]);
	try {
		return { shot: await shoot(embeds.length ? [page.locator(`[${MARK}]`)] : []), embeds };
	} finally {
		if (embeds.length) await page.evaluate(unmark).catch(() => {});
	}
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

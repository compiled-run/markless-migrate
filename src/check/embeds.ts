import type { Locator, Page } from 'playwright';
import { HINTS } from './hints.ts';
import type { Box, Failure, PageCapture } from './types.ts';

/** A live embed (an iframe or plugin from another origin, a video, or what a loader drew in place of its placeholder), or the Markless component that stands in for one: what the page controls of it. Its content is the third party's or the decoder's, and is masked in screenshots on both sides; the embed step compares it pixel for pixel. */
export interface LiveEmbed {
	readonly tag: string;
	/** Origin and path; the app's own origin is left out, so a same-app video compares by path. A widget's is `slot:<provider>`, a component's `markless:<embed id>`. */
	readonly src: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly box: Box;
	/** `widget`: what a provider's loader drew in place of its placeholder (buttons.js's star button); `component`: a Markless component marked `data-markless-embed`, standing in for an embed. */
	readonly role?: 'widget' | 'component';
	/** The embed a component stands in for. */
	readonly id?: string;
}

const MARK = 'data-markless-migrate-embed';
const PAD = 8;

/** Runs in the page: the live embeds, in the document and in open shadow roots (a widget may draw its iframe in one), with what loaders drew and the Markless components standing in for embeds, in document order, with their boxes in page coordinates; `mark` tags each for a screenshot mask. Must stay self-contained. */
export function liveEmbeds(mark = false): LiveEmbed[] {
	const kept = ['width', 'height', 'loading', 'allow', 'allowfullscreen', 'sandbox', 'referrerpolicy', 'title', 'autoplay', 'controls', 'muted', 'loop', 'playsinline', 'poster', 'preload', 'type'];
	const found: { el: Element; role?: 'widget' | 'component'; provider?: string }[] = [];
	const owners: Element[] = [];
	for (const el of document.querySelectorAll('[data-markless-embed]')) {
		found.push({ el, role: 'component' });
		owners.push(el);
	}
	const slots = (window as unknown as { __marklessMigrateEmbedSlots?: { el: Element; parent: Node | null; prev: Node | null; after: boolean; provider: string }[] }).__marklessMigrateEmbedSlots ?? [];
	for (const slot of slots) {
		let el: Element | null = null;
		if (slot.after) el = slot.el.isConnected ? slot.el.nextElementSibling : null;
		else if (slot.el.isConnected) el = slot.el;
		else {
			let n: Node | null = slot.prev ? (slot.prev.parentNode === slot.parent ? slot.prev.nextSibling : null) : (slot.parent?.firstChild ?? null);
			while (n && n.nodeType !== 1) n = n.nextSibling;
			el = n as Element | null;
		}
		if (!el || !el.isConnected || owners.some((o) => o === el || o.contains(el))) continue;
		found.push({ el, role: 'widget', provider: slot.provider });
		owners.push(el);
	}
	const walk = (root: Document | ShadowRoot) => {
		for (const el of root.querySelectorAll('*')) {
			if (el.matches('iframe, video, embed, object') && !owners.some((o) => o.contains(el) || (root !== document && o.contains((root as ShadowRoot).host)))) found.push({ el });
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(document);
	const rootOf = (el: Element): Element => {
		let n: Node = el;
		while (n.getRootNode() instanceof ShadowRoot) n = (n.getRootNode() as ShadowRoot).host;
		return n as Element;
	};
	found.sort((a, b) => (rootOf(a.el) === rootOf(b.el) ? 0 : rootOf(a.el).compareDocumentPosition(rootOf(b.el)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
	const out: LiveEmbed[] = [];
	for (const { el, role, provider } of found) {
		const tag = el.tagName.toLowerCase();
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) continue;
		const box = { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) };
		if (role) {
			if (mark) el.setAttribute('data-markless-migrate-embed', '');
			// Kept after the screenshot: the focus walk counts what a loader drew as one stop, as it counts a frame.
			if (mark && role === 'widget') el.setAttribute('data-markless-migrate-widget', '');
			const id = role === 'component' ? (el.getAttribute('data-markless-embed') ?? '') : undefined;
			out.push({ tag, src: role === 'component' ? `markless:${id}` : `slot:${provider}`, attributes: {}, box, role, ...(id !== undefined ? { id } : {}) });
			continue;
		}
		const raw = tag === 'video' ? (el as HTMLVideoElement).currentSrc || el.getAttribute('src') || el.querySelector('source[src]')?.getAttribute('src') || '' : (el.getAttribute(tag === 'object' ? 'data' : 'src') ?? '');
		const url = URL.parse(raw, location.href);
		const foreign = url !== null && /^https?:$/.test(url.protocol) && url.origin !== location.origin;
		if (tag !== 'video' && !foreign) continue;
		const attributes = Object.fromEntries(kept.flatMap((name) => (el.hasAttribute(name) ? [[name, el.getAttribute(name) ?? '']] : [])));
		const src = url ? (url.origin === location.origin ? url.pathname : `${url.origin}${url.pathname}`) : raw;
		if (mark) {
			el.setAttribute('data-markless-migrate-embed', tag === 'video' ? `${(el as HTMLElement).style.getPropertyValue('visibility')}\u0000${(el as HTMLElement).style.getPropertyPriority('visibility')}` : '');
			// A full-page capture can paint a video's frame a few pixels off its box, outside the mask: the frame is the decoder's, so it is not painted.
			if (tag === 'video') (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
		}
		out.push({ tag, src, attributes, box });
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
export async function maskedShot(page: Page, shoot: (mask: Locator[]) => Promise<Buffer>, marked?: LiveEmbed[]): Promise<{ shot: Buffer; embeds: LiveEmbed[] }> {
	const embeds = marked ?? (await page.evaluate(liveEmbeds, true).catch(() => [] as LiveEmbed[]));
	try {
		return { shot: await shoot(embeds.length ? [page.locator(`[${MARK}]`)] : []), embeds };
	} finally {
		if (embeds.length) await page.evaluate(unmark).catch(() => {});
	}
}

const describeEmbed = (e: LiveEmbed) => `<${e.tag}>${e.role === 'component' ? ` standing in for ${e.id}` : ''} ${e.src} ${e.box.width}x${e.box.height} at (${e.box.x}, ${e.box.y})${Object.keys(e.attributes).length ? ` ${Object.entries(e.attributes).map(([k, v]) => (v ? `${k}="${v}"` : k)).join(' ')}` : ''}`;

const samePlace = (o: LiveEmbed, n: LiveEmbed) => Math.abs(o.box.width - n.box.width) <= 2 && Math.abs(o.box.height - n.box.height) <= 2 && Math.abs(o.box.x - n.box.x) <= PAD && Math.abs(o.box.y - n.box.y) <= PAD;

/** The same embed: element, address, attributes, size and place; a Markless component standing in for an embed is held to its size and place here, and to its pixels and behaviour by the embed step. */
const alike = (o: LiveEmbed | undefined, n: LiveEmbed | undefined) => Boolean(o && n && (o.role === 'component' || n.role === 'component' ? samePlace(o, n) : o.tag === n.tag && o.src === n.src && JSON.stringify(o.attributes) === JSON.stringify(n.attributes) && samePlace(o, n)));

/** Each live embed of the old page against the new page's, in order: same element, address, attributes, size and place. One the old loads disagree on is left to the noise baseline. */
export function embedFailures(route: string, viewport: string, old: PageCapture, others: readonly PageCapture[], next: PageCapture): Failure[] {
	const a = old.liveEmbeds ?? [];
	const b = next.liveEmbeds ?? [];
	const failures: Failure[] = [];
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const o = a[i];
		const n = b[i];
		if (others.some((p) => (o ? !alike(o, p.liveEmbeds?.[i]) : p.liveEmbeds?.[i] !== undefined)) || alike(o, n)) continue;
		// A component the old page shows no embed for at this place is the embed step's to pair, by its id.
		if (!o && n?.role === 'component') continue;
		failures.push({ route, dimension: 'rendered', check: `embed #${i + 1}${o ? ` <${o.tag}>` : ''}`, viewport, expected: o ? describeEmbed(o) : '(absent)', actual: n ? describeEmbed(n) : '(absent)', hint: HINTS.embed });
	}
	return failures;
}

/** An accessibility snapshot without each embed's own lines (their order kept, indentation ignored) and without bare frames: what is inside an embed is the embed step's to compare. */
export function withoutEmbeds(lines: readonly string[], blocks: readonly (readonly string[])[]): string[] {
	let out = [...lines];
	for (const block of blocks) {
		const want = block.map((l) => l.trim()).filter(Boolean);
		if (!want.length) continue;
		const trimmed = out.map((l) => l.trim());
		for (let i = 0; i + want.length <= trimmed.length; i++) {
			if (want.every((w, j) => trimmed[i + j] === w)) {
				out = [...out.slice(0, i), ...out.slice(i + want.length)];
				break;
			}
		}
	}
	return out.filter((l) => !/^\s*- iframe\b/.test(l));
}

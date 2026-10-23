import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { attr, type Element as Parsed } from './dom.ts';
import type { Binding } from './tsrx.ts';

/** A transcript scroller of the old page (@shadcn/react MessageScroller) and where it opened. */
export interface ScrollerOpening {
	readonly sig: string;
	readonly nth: number;
	readonly position: 'start' | 'end' | 'last-anchor';
}

/**
 * Where each MessageScroller opened on the old page: its viewport at the top, at the end, or holding the last anchored
 * turn at the reading line. The provider renders no element, so its `defaultScrollPosition` is read from what it did.
 */
export async function captureScrollers(browser: Browser, origin: string, route: string, dir: string): Promise<{ readonly route: string; readonly scrollers: readonly ScrollerOpening[] }> {
	const file = join(dir, `${createHash('sha256').update(`scrollers:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; scrollers: ScrollerOpening[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	let scrollers: ScrollerOpening[] = [];
	try {
		await loadPage(page, new URL(route, origin).href);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(500);
		scrollers = await page.evaluate(() => {
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const counts = new Map<string, number>();
			const order = new Map<Element, number>();
			for (const el of document.body.querySelectorAll('*')) {
				const sig = sigOf(el);
				order.set(el, counts.get(sig) ?? 0);
				counts.set(sig, (counts.get(sig) ?? 0) + 1);
			}
			return [...document.querySelectorAll('[data-slot="message-scroller"]')].flatMap((root) => {
				const viewport = root.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]');
				if (!viewport) return [];
				const max = viewport.scrollHeight - viewport.clientHeight;
				const top = viewport.scrollTop;
				const position = max <= 1 || Math.abs(top - max) <= 1 ? 'end' : top <= 1 ? 'start' : 'last-anchor';
				return [{ sig: sigOf(root), nth: order.get(root) ?? 0, position } as const];
			});
		});
	} finally {
		await context.close().catch(() => {});
	}
	const capture = { route, scrollers };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

const openings = new Map<Parsed, ScrollerOpening['position']>();
/** The opening position each scroller root of the pages showed. */
export function useScrollerOpenings(next: ReadonlyMap<Parsed, ScrollerOpening['position']>): void {
	openings.clear();
	for (const [el, position] of next) openings.set(el, position);
}

/**
 * A scroller as its server render was: held invisible (`data-pending-scroll`) until the part puts it at its opening
 * position, which it does as the scroller comes into view.
 */
export function bindScroller(el: Parsed): Binding | undefined {
	const slot = attr(el, 'data-slot');
	if (slot !== 'message-scroller' && slot !== 'message-scroller-viewport') return undefined;
	let root: Parsed | null = el;
	while (root && attr(root, 'data-slot') !== 'message-scroller') root = root.parentNode as Parsed | null;
	const position = (root && openings.get(root)) ?? 'end';
	const pending = position !== 'start' ? ['data-pending-scroll=""'] : [];
	if (slot === 'message-scroller-viewport') return pending.length ? { extra: pending } : undefined;
	return { extra: [...pending, `data-mm-default-scroll-position=${JSON.stringify(position)}`, 'data-mm-mount=""', 'onVisible={() => mount("data-mm-mount")}'] };
}

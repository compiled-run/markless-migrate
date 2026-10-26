import type { Browser } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import type { FreezeOptions } from './freeze.ts';
import { loadPage } from './infrastructure.ts';
import { quiet } from './journeys.ts';
import type { Failure, Viewport } from './types.ts';

/** How far the clock is moved for the second look: past a month end and a day boundary, in a time zone far from UTC. */
export const CLOCK_SHIFT_MS = (40 * 24 + 7) * 3_600_000;
export const SHIFTED_ZONE = 'Pacific/Auckland';

export const CLOCK_HINT = 'This text follows the clock on the old page (a date, a relative time, a chart axis), and the new page shows what the old page showed at the instant check freezes its clock to: the value was written into the page when it was converted. Compute it in the browser from the current time and the visitor\'s time zone, as the old page does, or render it on each request; never keep the converter\'s frozen time.';

// Runs in the page: each piece of text a visitor can see, SVG text (a chart's axis) included.
function visibleText(): string[] {
	const out: string[] = [];
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
		const parent = node.parentElement;
		if (!text || !parent || parent.closest('script, style, noscript, template, [aria-hidden="true"]') || !parent.checkVisibility({ visibilityProperty: true })) continue;
		out.push(text.slice(0, 120));
	}
	return out;
}

async function readText(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<string[]> {
	const { context, page } = await openPage(browser, env, viewport, { sameOriginOnly: true });
	try {
		const pending = new Set<unknown>();
		page.on('request', (r) => pending.add(r));
		page.on('requestfinished', (r) => pending.delete(r));
		page.on('requestfailed', (r) => pending.delete(r));
		await loadPage(page, new URL(route, env.origin).href);
		await quiet(page, () => pending.size);
		return await page.evaluate(visibleText);
	} finally {
		await context.close();
	}
}

function minus(a: readonly string[], b: readonly string[]): string[] {
	const left = new Map<string, number>();
	for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
	return a.filter((x) => {
		const n = left.get(x) ?? 0;
		if (!n) return true;
		left.set(x, n - 1);
		return false;
	});
}

/**
 * What the clock decides: the text the old page changes when its clock moves (leaving out text that differs between two loads
 * at the same instant, a server's own time), and the new page's text at the moved time that is exactly what the old page showed
 * at the usual instant; with none of that, other text on new is the rendered check's.
 */
export function clockDifferences(oldAt: readonly string[], oldAgain: readonly string[], oldMoved: readonly string[], newMoved: readonly string[]): { followed: string[]; baked: string[] } {
	const unstable = new Set([...minus(oldAt, oldAgain), ...minus(oldAgain, oldAt)]);
	const before = minus(oldAt, oldMoved).filter((l) => !unstable.has(l));
	const after = minus(oldMoved, oldAt);
	const baked = minus(newMoved, oldMoved).filter((line) => before.includes(line));
	return baked.length ? { followed: minus(after, newMoved), baked } : { followed: [], baked: [] };
}

// A server reading a saved session 40 days on expires it in its store, so with the server's clock moved the look goes signed out.
function movedEnv(env: SideEnv, moved: FreezeOptions): SideEnv {
	const out: SideEnv = { ...env, freeze: moved };
	if (!env.serverClock) return out;
	const { storageState: _session, ...rest } = out;
	return { ...rest, ...(env.frontDoor ? { frontDoor: { ...env.frontDoor, storageState: undefined } } : {}) };
}

const when = (f: FreezeOptions) => `${new Date(f.time).toISOString().replace('T', ' ').slice(0, 16)} ${f.timezone}`;

/**
 * Loads the route again with the frozen clock moved by CLOCK_SHIFT_MS into SHIFTED_ZONE: on old, to see which text follows
 * the clock, and on new, where the same text must follow it. A new page still showing the old page's text from the usual
 * frozen instant was written with the converter's clock.
 */
export async function checkClock(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport): Promise<Failure[]> {
	const freeze = sides.old.freeze;
	if (!freeze) return [];
	const moved: FreezeOptions = { ...freeze, time: freeze.time + CLOCK_SHIFT_MS, timezone: SHIFTED_ZONE };
	const [oldAt, oldMoved] = await Promise.all([readText(browser, sides.old, route, viewport), readText(browser, movedEnv(sides.old, moved), route, viewport)]);
	if (!minus(oldAt, oldMoved).length && !minus(oldMoved, oldAt).length) return [];
	const [oldAgain, newMoved] = await Promise.all([readText(browser, sides.old, route, viewport), readText(browser, movedEnv(sides.new, moved), route, viewport)]);
	const { followed, baked } = clockDifferences(oldAt, oldAgain, oldMoved, newMoved);
	if (!baked.length) return [];
	const list = (xs: readonly string[]) => xs.slice(0, 6).map((x) => `"${x}"`).join(', ') + (xs.length > 6 ? ` and ${xs.length - 6} more` : '');
	return [
		{
			route,
			dimension: 'rendered',
			check: `text that follows the clock, with the clock at ${when(moved)} instead of ${when(freeze)}`,
			viewport: viewport.name,
			expected: `old shows ${list(minus(oldMoved, oldAt))} (at ${when(freeze)} it showed ${list(minus(oldAt, oldMoved))})`,
			actual: `new still shows ${list(baked)}, what the old page shows at ${when(freeze)}, the instant check freezes the clock to${followed.length ? `; it does not show ${list(followed)}` : ''}`,
			hint: CLOCK_HINT,
		},
	];
}

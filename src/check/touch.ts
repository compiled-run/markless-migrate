// A finger's tap on a phone: every control the journeys clicked on the desktop is tapped at phone width with touch input, old and new, in WebKit as an iPhone and in Chromium as an Android phone.
import { devices, type Browser } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { loadPage } from './infrastructure.ts';
import { domQuiet, localUrl, locate, pool, snapshot, stepDiff, type Target } from './journeys.ts';
import { alike, TOUCH_PROFILES, type Tap, type TouchOptions, type TouchRow } from './touch-compare.ts';
import type { Viewport } from './types.ts';

const TAP_MS = 3_000;
const SETTLE_MS = 3_000;
const CONCURRENCY = 4;

/** Each phone's viewport and user agent, from Playwright's device list. */
export const touchViewport = (name: string): Viewport => {
	const p = TOUCH_PROFILES.find((x) => x.name === name)!;
	return { name: p.name, ...devices[p.device]!.viewport, isMobile: true };
};

/** One journey of taps on a freshly loaded page: each tap's target found as the journeys find it, tapped, and what the page then shows read. */
async function tapJourney(browser: Browser, env: SideEnv, route: string, viewport: Viewport, targets: readonly Target[]): Promise<Tap[]> {
	const { context, page } = await openPage(browser, env, viewport, { sameOriginOnly: true });
	const origins = [new URL(env.origin).origin];
	const settled = async () => {
		await page.waitForLoadState('networkidle', { timeout: SETTLE_MS }).catch(() => {});
		await domQuiet(page);
	};
	const taps: Tap[] = [];
	try {
		await loadPage(page, new URL(route, env.origin).href);
		await settled();
		const start = new URL(page.url()).pathname;
		for (const target of targets) {
			const before = await snapshot(page, origins);
			try {
				const control = locate(page, target);
				await control.scrollIntoViewIfNeeded({ timeout: TAP_MS }).catch(() => {});
				await control.tap({ timeout: TAP_MS });
			} catch (error) {
				taps.push({ url: localUrl(page.url(), env.origin), navigated: false, added: [], removed: [], failed: (error as Error).message.split('\n')[0]! });
				break;
			}
			await settled();
			const { added, removed } = stepDiff(before, await snapshot(page, origins));
			taps.push({ url: localUrl(page.url(), env.origin), navigated: new URL(page.url()).pathname !== start, added: added.sort(), removed: removed.sort() });
		}
		return taps;
	} catch (error) {
		return [...taps, { url: '', navigated: false, added: [], removed: [], failed: (error as Error).message.split('\n')[0]! }];
	} finally {
		await context.close().catch(() => {});
	}
}

const tapsOf = (run: readonly Tap[] | undefined, n: number): Tap[] => Array.from({ length: n }, (_, k) => run?.[k] ?? { url: '', navigated: false, added: [], removed: [], failed: k > 0 && run?.[k - 1]?.failed ? 'an earlier tap could not be made' : 'the page did not open' });

/** Each control tapped once on a freshly loaded page per side and phone; OLD again where it and NEW differ. */
export async function observeTouch(browsers: { readonly chromium: Browser; readonly webkit?: Browser }, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, controls: readonly (readonly Target[])[], options: TouchOptions = {}): Promise<TouchRow> {
	const wanted = TOUCH_PROFILES.filter((p) => (options.profiles ?? TOUCH_PROFILES.map((x) => x.name)).includes(p.name));
	// The two phones are different browsers: each taps on its own, at the same time.
	const profiles = await Promise.all(wanted.map(async (profile): Promise<TouchRow['profiles'][number]> => {
		const browser = profile.engine === 'webkit' ? browsers.webkit : browsers.chromium;
		if (!browser) throw new Error(`taps on ${profile.label} need WebKit, which this check did not start`);
		const userAgent = devices[profile.device]!.userAgent;
		const viewport = touchViewport(profile.name);
		const env = (side: SideEnv): SideEnv => (side.userAgent ? side : { ...side, userAgent });
		const tapAll = (side: SideEnv, list: readonly (readonly Target[])[]) => pool(list, CONCURRENCY, (targets) => tapJourney(browser, env(side), route, viewport, targets));
		const [olds, news] = await Promise.all([tapAll(sides.old, controls), tapAll(sides.new, controls)]);
		const differing = controls.filter((targets, i) => !tapsOf(olds[i], targets.length).every((t, k) => alike(t, tapsOf(news[i], targets.length)[k]!)));
		const again = await tapAll(sides.old, differing);
		return {
			profile: profile.name,
			controls: controls.map((targets, i) => {
				const old = tapsOf(olds[i], targets.length);
				const at = differing.indexOf(targets);
				return { targets, old: at < 0 ? [old] : [old, tapsOf(again[at], targets.length)], new: tapsOf(news[i], targets.length) };
			}),
		};
	}));
	return { profiles };
}

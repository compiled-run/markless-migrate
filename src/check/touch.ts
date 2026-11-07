// A finger's tap on a phone: every control the journeys clicked on the desktop is tapped at phone width with touch input, old and new, in WebKit as an iPhone and in Chromium as an Android phone.
import { devices, type Browser } from 'playwright';
import type { SideEnv } from './browser.ts';
import { replayAll, type StepResult, type Target } from './journeys.ts';
import { alike, tapping, TOUCH_PROFILES, type Tap, type TouchOptions, type TouchRow } from './touch-compare.ts';
import type { Viewport } from './types.ts';

/** Each phone's viewport and user agent, from Playwright's device list. */
export const touchViewport = (name: string): Viewport => {
	const p = TOUCH_PROFILES.find((x) => x.name === name)!;
	return { name: p.name, ...devices[p.device]!.viewport, isMobile: true };
};

const tapsOf = (run: readonly StepResult[] | undefined, n: number): Tap[] => Array.from({ length: n }, (_, k) => tapOf(run?.[k], k > 0 && Boolean(run?.[k - 1]?.failed)));
const tapOf = (r: StepResult | undefined, stopped = false): Tap =>
	stopped ? { url: '', navigated: false, added: [], removed: [], failed: 'an earlier tap could not be made' } : (r ? { url: r.url, navigated: r.navigated, added: [...r.added].sort(), removed: [...r.removed].sort(), ...(r.failed ? { failed: r.failed } : {}) } : { url: '', navigated: false, added: [], removed: [], failed: 'the page did not open' });

/** Each control tapped once on a freshly loaded page per side and phone; OLD again where it and NEW differ. */
export async function observeTouch(browsers: { readonly chromium: Browser; readonly webkit?: Browser }, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, controls: readonly (readonly Target[])[], options: TouchOptions = {}): Promise<TouchRow> {
	const wanted = TOUCH_PROFILES.filter((p) => (options.profiles ?? TOUCH_PROFILES.map((x) => x.name)).includes(p.name));
	const profiles: TouchRow['profiles'][number][] = [];
	for (const profile of wanted) {
		const browser = profile.engine === 'webkit' ? browsers.webkit : browsers.chromium;
		if (!browser) throw new Error(`taps on ${profile.label} need WebKit, which this check did not start`);
		const userAgent = devices[profile.device]!.userAgent;
		const viewport = touchViewport(profile.name);
		const env = (side: SideEnv): SideEnv => (side.userAgent ? side : { ...side, userAgent });
		const journeys = controls.map((targets) => ({ name: tapping(targets), steps: targets.map((target) => ({ action: 'click' as const, target })) }));
		const [olds, news] = await Promise.all([replayAll(browser, env(sides.old), route, viewport, journeys, { touch: true }), replayAll(browser, env(sides.new), route, viewport, journeys, { touch: true })]);
		const differing = journeys.filter((j, i) => !tapsOf(olds[i], j.steps.length).every((t, k) => alike(t, tapsOf(news[i], j.steps.length)[k]!)));
		const again = await replayAll(browser, env(sides.old), route, viewport, differing, { touch: true });
		profiles.push({
			profile: profile.name,
			controls: controls.map((targets, i) => {
				const old = tapsOf(olds[i], targets.length);
				const at = differing.indexOf(journeys[i]!);
				return { targets, old: at < 0 ? [old] : [old, tapsOf(again[at], targets.length)], new: tapsOf(news[i], targets.length) };
			}),
		});
	}
	return { profiles };
}

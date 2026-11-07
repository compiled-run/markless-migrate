// A finger's tap on a phone: every control the journeys clicked on the desktop is tapped at phone width with touch input, old and new, in WebKit as an iPhone and in Chromium as an Android phone.
import { devices, type Browser } from 'playwright';
import type { SideEnv } from './browser.ts';
import { HINTS } from './hints.ts';
import { describeTarget } from './journeys-compare.ts';
import { replayAll, type RecordedJourney, type StepResult, type Target } from './journeys.ts';
import type { Failure, Viewport } from './types.ts';

export type TouchProfileName = 'iphone' | 'android';

export interface TouchProfile {
	readonly name: TouchProfileName;
	readonly label: string;
	readonly engine: 'webkit' | 'chromium';
	readonly viewport: Viewport;
	readonly userAgent: string;
}

const device = (name: string) => devices[name]!;

export const TOUCH_PROFILES: readonly TouchProfile[] = [
	{ name: 'iphone', label: 'an iPhone (WebKit)', engine: 'webkit', viewport: { name: 'iphone', ...device('iPhone 13').viewport, isMobile: true }, userAgent: device('iPhone 13').userAgent },
	{ name: 'android', label: 'an Android phone (Chromium)', engine: 'chromium', viewport: { name: 'android', ...device('Pixel 7').viewport, isMobile: true }, userAgent: device('Pixel 7').userAgent },
];

export interface TouchOptions {
	/** Which phones tap; default both. */
	readonly profiles?: readonly TouchProfileName[];
}

/** What one tap did: where the page ended, what appeared and disappeared, and why it could not be tapped when it could not. */
export interface Tap {
	readonly url: string;
	readonly navigated: boolean;
	readonly added: readonly string[];
	readonly removed: readonly string[];
	readonly failed?: string;
}

/** The controls of one desktop journey of clicks, tapped in turn on a freshly loaded page. */
export interface TouchControl {
	readonly targets: readonly Target[];
	/** One run on OLD, and a second when the first and NEW's differ, so what OLD varies on its own is not the port's; each a tap per target. */
	readonly old: readonly (readonly Tap[])[];
	readonly new: readonly Tap[];
}

export interface TouchRow {
	readonly profiles: readonly { readonly profile: TouchProfileName; readonly controls: readonly TouchControl[] }[];
}

/** Every desktop journey made of clicks alone (a control, and what it revealed), as the controls to tap in turn, once each. */
export function tappedControls(journeys: readonly RecordedJourney[]): Target[][] {
	const seen = new Map<string, Target[]>();
	for (const j of journeys) {
		if (j.destructive || j.start || !j.steps.length || !j.steps.every((s) => s.action === 'click')) continue;
		const targets = j.steps.map((s) => s.target);
		const key = JSON.stringify(targets);
		if (!seen.has(key)) seen.set(key, targets);
	}
	return [...seen.values()];
}

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
		const env = (side: SideEnv): SideEnv => (side.userAgent ? side : { ...side, userAgent: profile.userAgent });
		const journeys = controls.map((targets) => ({ name: tapping(targets), steps: targets.map((target) => ({ action: 'click' as const, target })) }));
		const [olds, news] = await Promise.all([replayAll(browser, env(sides.old), route, profile.viewport, journeys, { touch: true }), replayAll(browser, env(sides.new), route, profile.viewport, journeys, { touch: true })]);
		const differing = journeys.filter((j, i) => !tapsOf(olds[i], j.steps.length).every((t, k) => alike(t, tapsOf(news[i], j.steps.length)[k]!)));
		const again = await replayAll(browser, env(sides.old), route, profile.viewport, differing, { touch: true });
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

const tapping = (targets: readonly Target[]) => targets.map((t) => `tap ${describeTarget(t)}`).join(', then ');
const answered = (t: Tap) => !t.failed && (t.navigated || t.added.length > 0 || t.removed.length > 0);
const alike = (a: Tap, b: Tap) => a.url === b.url && a.navigated === b.navigated && same(a.added, b.added) && same(a.removed, b.removed) && Boolean(a.failed) === Boolean(b.failed);
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function describe(t: Tap): string {
	if (t.failed) return t.failed;
	if (!answered(t)) return 'nothing changes';
	const parts = [...(t.navigated ? [`goes to ${t.url}`] : []), ...t.added.slice(0, 3).map((l) => `+ ${l}`), ...t.removed.slice(0, 3).map((l) => `- ${l}`)];
	const more = t.added.length + t.removed.length - Math.min(3, t.added.length) - Math.min(3, t.removed.length);
	return `${parts.join(' | ')}${more > 0 ? ` (and ${more} more)` : ''}`;
}

/** Red when a tap answered on OLD and NEW answers it otherwise: with nothing, or with other content or another page. Lines OLD's two taps disagree on are its own and not compared. */
export function judgeTouch(route: string, row: TouchRow): Failure[] {
	const failures: Failure[] = [];
	for (const { profile, controls } of row.profiles) {
		const p = TOUCH_PROFILES.find((x) => x.name === profile)!;
		for (const c of controls) {
			for (const [k, target] of c.targets.entries()) {
				const [a, b] = c.old.map((run) => run[k]);
				// A tap OLD itself could not make, or that changed nothing, holds the port to nothing; the taps after it are another state's.
				if (!a || !answered(a) || (b && !answered(b))) break;
				const steady = b ? { ...a, added: a.added.filter((l) => b.added.includes(l)), removed: a.removed.filter((l) => b.removed.includes(l)), navigated: a.navigated && b.navigated, url: a.url === b.url ? a.url : '' } : a;
				const n = c.new[k]!;
				const missing = [...steady.added.filter((l) => !n.added.includes(l)), ...steady.removed.filter((l) => !n.removed.includes(l))];
				const wrongPage = steady.url !== '' && steady.navigated && (n.url !== steady.url || !n.navigated);
				if (!n.failed && !missing.length && !wrongPage && answered(n)) continue;
				failures.push({ route, dimension: 'behaviour', check: `${tapping(c.targets.slice(0, k + 1))} on ${p.label}`, viewport: p.viewport.name, expected: describe(a), actual: n.failed ? `it could not be tapped: ${n.failed}` : !answered(n) ? `nothing changes: ${describeTarget(target)} answers a mouse click but not a tap` : describe(n), hint: HINTS.touch });
				break;
			}
		}
	}
	return failures;
}

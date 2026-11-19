// The port's prefetch setting, from how the original fetched pages ahead (facts.ts): at least as eager wherever the
// original prefetches, on the same networks; intent only where it prefetches nothing. Never more eager on its own.
import type { Condition, PrefetchFacts, Trigger } from './facts.ts';

/** Which networks a router trigger runs on: every one but Save-Data, only links judged fast, or none. */
export type Networks = 'all' | 'fast' | 'none';

export interface PrefetchSetting {
	readonly intent: Networks;
	readonly viewport: Networks;
	readonly idle: Networks;
	readonly concurrency: number;
}

/** One trigger's decision with its evidence, in words a site owner reads. */
export interface PrefetchReason {
	readonly trigger: keyof Omit<PrefetchSetting, 'concurrency'> | 'concurrency' | 'revisit' | 'per-link';
	readonly says: string;
}

export interface PrefetchDecision {
	readonly setting: PrefetchSetting;
	readonly reasons: readonly PrefetchReason[];
	/** Pages the decision read, and those whose recording failed. */
	readonly pages: number;
	readonly failed: readonly string[];
	/** The original's own triggers, earliest first, and whether each ran on slow networks. */
	readonly original: readonly { readonly trigger: Trigger; readonly pages: number; readonly of: number; readonly networks: Networks | 'untested' }[];
	/** Links the original fetched at load though most links were not: a per-link setting would follow them. */
	readonly loadLinks: readonly string[];
	/** The original answered a revisit without asking the network on every page tried. */
	readonly revisitFromMemory?: boolean;
	/** The most the original had in flight at once before any click, on any page. */
	readonly originalConcurrency: number;
	/** The next more eager setting, never applied by convert: the navigation timing check prices it in bytes before a click. */
	readonly next?: { readonly setting: PrefetchSetting; readonly says: string };
}

/** One step more eager than `s`: in-view fetching wider first, then idle. */
export function moreEager(s: PrefetchSetting): { readonly setting: PrefetchSetting; readonly says: string } | undefined {
	if (s.intent !== 'all') return { setting: { ...s, intent: 'all' }, says: 'fetch on hover, focus or press on every network' };
	if (s.viewport !== 'all') return { setting: { ...s, viewport: 'all' }, says: "fetch a link's page when it comes into view, on every network" };
	if (s.idle !== 'all') return { setting: { ...s, idle: 'all' }, says: 'also fetch the links on screen once the page is idle, on every network' };
	return undefined;
}

/** A trigger fires on a page when it fetched at least half the links it could tell about (load, visible), or any (the rest). */
function fires(facts: PrefetchFacts, trigger: Trigger): boolean | undefined {
	const e = facts.triggers[trigger];
	if (!e || e.tested === 0) return undefined;
	return trigger === 'load' || trigger === 'visible' ? e.fired * 2 >= e.tested : e.fired > 0;
}

const SLOW: readonly Condition[] = ['3g', '2g', 'slow-2g', 'slow-link'];
const FAST: readonly Condition[] = ['4g', 'no-info'];

/** The condition runs try load, one scroll and one hover: the reading each trigger is judged by. */
const CONDITION_KEY: Partial<Record<Trigger, 'load' | 'visible' | 'viewport' | 'hover'>> = { load: 'load', visible: 'visible', viewport: 'viewport', hover: 'hover', focus: 'hover', pointerdown: 'hover' };

/** Where the original still fired the trigger: on a slow network ('all'), only on fast ones ('fast'), or untested. */
function networksOf(pages: readonly PrefetchFacts[], trigger: Trigger): Networks | 'untested' {
	const key = CONDITION_KEY[trigger]!;
	const seen = pages.flatMap((p) => Object.entries(p.conditions ?? {}).flatMap(([c, r]) => (r && !r.error && r[key] !== undefined ? [[c as Condition, r[key]!] as const] : [])));
	if (seen.some(([c, fired]) => SLOW.includes(c) && fired)) return 'all';
	if (seen.some(([c, fired]) => FAST.includes(c) && fired)) return 'fast';
	return 'untested';
}

const WORDS: Record<Trigger, string> = {
	load: "fetches the pages its links go to as soon as it loads, including links off screen",
	visible: 'fetches the pages of the links on screen once it has loaded',
	viewport: "fetches a link's page when the link comes into view",
	hover: "fetches a link's page when the pointer rests on it",
	focus: "fetches a link's page when the link takes keyboard focus",
	pointerdown: "fetches a link's page when it is pressed, before the click",
};
const ON: Record<Networks | 'untested', string> = { all: 'on every network we tried, slow ones too', fast: 'only on fast connections', none: 'never', untested: 'on the networks we could try' };

/** The more eager of two network settings. */
function wider(a: Networks, b: Networks): Networks {
	return a === 'all' || b === 'all' ? 'all' : a === 'fast' || b === 'fast' ? 'fast' : 'none';
}

export function decidePrefetch(recorded: readonly PrefetchFacts[]): PrefetchDecision {
	const pages = recorded.filter((p) => !p.error);
	const failed = recorded.filter((p) => p.error).map((p) => p.route);
	const triggers: Trigger[] = ['load', 'visible', 'viewport', 'hover', 'focus', 'pointerdown'];
	const original = triggers.flatMap((trigger) => {
		const told = pages.map((p) => fires(p, trigger)).filter((f): f is boolean => f !== undefined);
		if (!told.length) return [];
		const on = told.filter(Boolean).length;
		// A trigger counts for the site when it fired on most pages that could tell.
		return on * 2 > told.length ? [{ trigger, pages: on, of: told.length, networks: networksOf(pages, trigger) }] : [{ trigger, pages: on, of: told.length, networks: 'none' as const }];
	});
	const firing = (t: Trigger) => original.find((o) => o.trigger === t && o.networks !== 'none');
	// Untested on other networks: as eager as the router allows, so the port is never the less eager side.
	const reach = (t: Trigger): Networks => {
		const o = firing(t);
		return !o ? 'none' : o.networks === 'untested' ? 'all' : o.networks;
	};
	const reasons: PrefetchReason[] = [];
	let viewport = reach('viewport');
	let idle = reach('visible');
	const load = reach('load');
	if (load !== 'none') {
		// Nothing in the router fetches links off screen at load: idle for those on screen and viewport for the rest come nearest.
		idle = wider(idle, load);
		viewport = wider(viewport, load);
	}
	// What comes into view is fetched by viewport, links on screen at load included: idle would add nothing.
	if (viewport !== 'none' && idle !== 'none' && (viewport === 'all' || idle === 'fast')) idle = 'none';
	const intentFrom = (['hover', 'focus', 'pointerdown'] as const).map(reach).reduce(wider, 'none' as Networks);
	const prefetchesAtAll = original.some((o) => o.networks !== 'none');
	// Where the original fetches nothing ahead, intent alone on every network; where its intent could not be told (a page it
	// had fetched already), intent stays on: the press on a link in view costs nothing more.
	const intent: Networks = !prefetchesAtAll ? 'all' : intentFrom !== 'none' ? intentFrom : 'all';
	const originalConcurrency = Math.max(0, ...pages.map((p) => p.concurrency));
	const concurrency = Math.max(1, originalConcurrency);

	for (const o of original.filter((x) => x.networks !== 'none')) reasons.push({ trigger: o.trigger === 'viewport' ? 'viewport' : o.trigger === 'load' || o.trigger === 'visible' ? 'idle' : 'intent', says: `The original ${WORDS[o.trigger]}, ${ON[o.networks]} (${o.pages} of ${o.of} pages).` });
	if (!prefetchesAtAll) reasons.push({ trigger: 'intent', says: 'The original fetches nothing before a click. The port fetches a page when its link is hovered, focused or pressed, on every network, and nothing else ahead.' });
	const set = (n: Networks) => (n === 'all' ? 'on every network but Save-Data' : n === 'fast' ? 'on fast connections only' : 'off');
	reasons.push({ trigger: 'viewport', says: `The port fetches a link's page when it comes into view: ${set(viewport)}.` });
	reasons.push({ trigger: 'idle', says: `The port fetches the links on screen once the page is idle: ${set(idle)}.` });
	reasons.push({ trigger: 'intent', says: `The port fetches a link's page on hover, focus or press: ${set(intent)}.` });
	if (load !== 'none') reasons.push({ trigger: 'idle', says: "The original also fetches links off screen at load; the router has no such setting, so the port fetches them as they come into view instead. That is later than the original for links far down the page." });
	const saveData = pages.some((p) => p.conditions?.['save-data'] && Object.entries(p.conditions['save-data']).some(([k, v]) => k !== 'error' && v === true));
	if (saveData) reasons.push({ trigger: 'viewport', says: 'The original still fetches ahead under Save-Data. The router never does, so there the port is less eager than the original.' });
	if (concurrency > 0) reasons.push({ trigger: 'concurrency', says: `At most ${concurrency} page fetches in flight at once, as many as the original had.` });
	const loadLinks = load === 'none' ? [...new Set(pages.flatMap((p) => p.triggers.load?.targets ?? []))].sort() : [];
	if (loadLinks.length) reasons.push({ trigger: 'per-link', says: `The original fetches ${loadLinks.length} particular link${loadLinks.length === 1 ? '' : 's'} at load (${loadLinks.slice(0, 4).join(', ')}${loadLinks.length > 4 ? ', ...' : ''}). The port does not mark those links yet.` });
	const revisits = pages.flatMap((p) => (p.revisit ? [p.revisit] : []));
	const revisitFromMemory = revisits.length ? revisits.every((r) => !r.refetched || r.fromCache) : undefined;
	if (revisitFromMemory !== undefined) reasons.push({ trigger: 'revisit', says: revisitFromMemory ? `The original shows a page it showed before without asking the network again (${revisits.length} of ${revisits.length} revisits). The port must do the same; the navigation timing check measures it.` : `The original asks the network again when a page is revisited (${revisits.filter((r) => r.refetched && !r.fromCache).length} of ${revisits.length} revisits).` });
	if (failed.length) reasons.push({ trigger: 'per-link', says: `${failed.length} page${failed.length === 1 ? '' : 's'} could not be recorded and were left out (${failed.slice(0, 3).join(', ')}).` });
	const setting = { intent, viewport, idle, concurrency };
	const next = moreEager(setting);
	return { setting, ...(next ? { next } : {}), reasons, pages: pages.length, failed, original, loadLinks, ...(revisitFromMemory !== undefined ? { revisitFromMemory } : {}), originalConcurrency };
}

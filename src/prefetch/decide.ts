// The port's prefetch setting, from how the original fetched pages ahead (facts.ts): at least as eager wherever the
// original prefetches, on the same networks; intent only where it prefetches nothing. Never more eager on its own.
import { CONDITIONS, targetOf, type Condition, type PrefetchFacts, type Trigger } from './facts.ts';

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
	/** The original's page data fetched ahead in one page view (at load, on a timer and while scrolling), the median over pages: a fact reported, not a budget. */
	readonly aheadBytes: number;
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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const listOf = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);

/** The page's own prefetch hints by the trigger they match, counting only hints that name one of its link targets. */
export function declaredTriggers(facts: Pick<PrefetchFacts, 'hints' | 'targets'>): Set<Trigger> {
	const out = new Set<Trigger>();
	const pages = new Set(facts.targets ?? []);
	const names = (href: string) => {
		try {
			const url = new URL(href, 'http://page.invalid');
			return pages.has(targetOf(url.pathname + url.search));
		} catch {
			return false;
		}
	};
	if (facts.hints.links.some((l) => /\b(prefetch|prerender)\b/.test(l.rel) && names(l.href))) out.add('visible');
	const rules = facts.hints.speculationRules.flatMap((r) => (isObject(r) ? [...listOf(r.prefetch), ...listOf(r.prerender)] : []));
	for (const rule of rules) {
		if (!isObject(rule)) continue;
		const fromDocument = rule.source === 'document' || (rule.source === undefined && rule.where !== undefined);
		// A list rule counts only for its URLs that are this page's links; a document rule applies to its links by definition.
		if (!fromDocument && !listOf(rule.urls).some((u) => typeof u === 'string' && names(u))) continue;
		const eagerness = typeof rule.eagerness === 'string' ? rule.eagerness : fromDocument ? 'conservative' : 'immediate';
		out.add(eagerness === 'moderate' ? 'hover' : eagerness === 'conservative' ? 'pointerdown' : 'visible');
	}
	return out;
}

/** Fired on a page: at least half the links it could tell about (load, visible, timer), else any; an unobserved page's hints stand for it. */
function fires(facts: PrefetchFacts, trigger: Trigger): boolean | undefined {
	if (facts.unobserved && declaredTriggers(facts).has(trigger)) return true;
	const e = facts.triggers[trigger];
	if (!e || e.tested === 0) return undefined;
	return trigger === 'load' || trigger === 'visible' || trigger === 'timer' ? e.fired * 2 >= e.tested : e.fired > 0;
}

/** A browser opens 6 connections to a host over HTTP/1.1, so a seventh speculative fetch waits anyway; over HTTP/2 more only share the bandwidth. */
export const MAX_CONCURRENCY = 6;

const AHEAD_TRIGGERS: readonly Trigger[] = ['load', 'visible', 'timer', 'viewport', 'scroll'];

const SLOW: readonly Condition[] = ['3g', '2g', 'slow-2g', 'slow-link'];
const FAST: readonly Condition[] = ['4g', 'no-info'];

/** The condition runs try load, one scroll and one hover: the reading each trigger is judged by. */
const CONDITION_KEY: Record<Trigger, 'load' | 'visible' | 'viewport' | 'hover'> = { load: 'load', visible: 'visible', timer: 'load', viewport: 'viewport', scroll: 'viewport', hover: 'hover', focus: 'hover', pointerdown: 'hover' };

const isCondition = (c: string): c is Condition => (CONDITIONS as readonly string[]).includes(c);

/** 'fast' only when the trigger was tried on a slow network and did not fire there; fired on a slow one, or never tried on one, is 'all'. */
function networksOf(pages: readonly PrefetchFacts[], trigger: Trigger): Networks | 'untested' {
	const key = CONDITION_KEY[trigger];
	const seen = pages.flatMap((p) =>
		Object.entries(p.conditions ?? {}).flatMap(([c, r]) => {
			const fired = r && !r.error ? r[key] : undefined;
			return isCondition(c) && fired !== undefined ? [{ condition: c, fired }] : [];
		}),
	);
	const slow = seen.filter((s) => SLOW.includes(s.condition));
	if (slow.some((s) => s.fired)) return 'all';
	if (slow.length) return seen.some((s) => FAST.includes(s.condition) && s.fired) ? 'fast' : 'all';
	return 'untested';
}

const WORDS: Record<Trigger, string> = {
	load: "fetches the pages its links go to as soon as it loads, including links off screen",
	visible: 'fetches the pages of the links on screen once it has loaded',
	timer: 'fetches the pages its links go to on a timer a moment after it loads, with nothing done to it',
	scroll: 'starts fetching the pages its links go to once the visitor scrolls, links still off screen included',
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
	const triggers: Trigger[] = ['load', 'visible', 'timer', 'viewport', 'scroll', 'hover', 'focus', 'pointerdown'];
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
	// Fetching once the visitor scrolls is nearest to fetching what comes into view; a timer after load, to fetching at load.
	let viewport = wider(reach('viewport'), reach('scroll'));
	let idle = reach('visible');
	const load = wider(reach('load'), reach('timer'));
	if (load !== 'none') {
		// Nothing in the router fetches links off screen at load: idle for those on screen and viewport for the rest come nearest.
		idle = wider(idle, load);
		viewport = wider(viewport, load);
	}
	// What comes into view is fetched by viewport, links on screen at load included: idle would add nothing.
	if (viewport !== 'none' && idle !== 'none' && (viewport === 'all' || idle === 'fast')) idle = 'none';
	const INTENT = ['hover', 'focus', 'pointerdown'] as const;
	const intentFrom = INTENT.map(reach).reduce(wider, 'none');
	const prefetchesAtAll = original.some((o) => o.networks !== 'none');
	// Tried and never fired: fast connections only, so a slow visitor pays nothing the original did not charge; never tried: every network.
	const intentTried = original.some((o) => (INTENT as readonly Trigger[]).includes(o.trigger));
	const intent: Networks = intentFrom !== 'none' ? intentFrom : intentTried ? 'fast' : 'all';
	const originalConcurrency = Math.max(0, ...pages.map((p) => p.concurrency));
	const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, originalConcurrency));

	for (const o of original.filter((x) => x.networks !== 'none')) reasons.push({ trigger: o.trigger === 'viewport' || o.trigger === 'scroll' ? 'viewport' : o.trigger === 'load' || o.trigger === 'visible' || o.trigger === 'timer' ? 'idle' : 'intent', says: `The original ${WORDS[o.trigger]}, ${ON[o.networks]} (${o.pages} of ${o.of} pages).` });
	if (!prefetchesAtAll) reasons.push({ trigger: 'intent', says: `The original fetches nothing before a click. The port fetches a page when its link is hovered, focused or pressed, ${intent === 'fast' ? 'on fast connections only' : 'on every network'}, and nothing else ahead.` });
	if (intentFrom === 'none' && prefetchesAtAll) reasons.push({ trigger: 'intent', says: intentTried ? 'Hover, focus and press were tried on the original and fetched nothing: the port fetches on them only on fast connections.' : 'Hover, focus and press could not be tried on the original (every link tried was fetched already): the port fetches on them on every network.' });
	const set = (n: Networks) => (n === 'all' ? 'on every network but Save-Data' : n === 'fast' ? 'on fast connections only' : 'off');
	reasons.push({ trigger: 'viewport', says: `The port fetches a link's page when it comes into view: ${set(viewport)}.` });
	reasons.push({ trigger: 'idle', says: `The port fetches the links on screen once the page is idle: ${set(idle)}.` });
	reasons.push({ trigger: 'intent', says: `The port fetches a link's page on hover, focus or press: ${set(intent)}.` });
	if (load !== 'none') reasons.push({ trigger: 'idle', says: "The original also fetches links off screen at load; the router has no such setting, so the port fetches them as they come into view instead. That is later than the original for links far down the page." });
	// Under Save-Data, by trigger: only those the original fires on most pages count (a few links at load do not).
	const SAVE_DATA_WORDS = { load: 'links off screen at load', visible: 'links on screen once loaded', viewport: 'links as they come into view', hover: 'links on hover' } as const;
	const underSaveData = (['load', 'visible', 'viewport', 'hover'] as const).filter((k) => firing(k as Trigger) && pages.some((p) => p.conditions?.['save-data']?.[k] === true));
	if (underSaveData.length) reasons.push({ trigger: 'viewport', says: `Under Save-Data the original still fetches ${underSaveData.map((k) => SAVE_DATA_WORDS[k]).join(', ')}. The router never fetches ahead under Save-Data, so there the port is less eager than the original.` });
	const disagreed = [...new Set(pages.flatMap((p) => Object.entries(p.conditions ?? {}).flatMap(([c, r]) => (r?.disagreed ?? []).map((k) => `${k} on ${c}`))))];
	if (disagreed.length) reasons.push({ trigger: 'viewport', says: `Repeated runs disagreed on ${disagreed.join(', ')}; the recording kept the majority of three runs (a tie counts as fired).` });
	const unobserved = pages.filter((p) => p.unobserved);
	if (unobserved.length) reasons.push({ trigger: 'idle', says: `${unobserved.length} page${unobserved.length === 1 ? '' : 's'} declare prefetch hints the recording could not see fetched; their hints are taken as what they do.` });
	reasons.push({ trigger: 'concurrency', says: originalConcurrency > MAX_CONCURRENCY ? `At most ${concurrency} page fetches in flight at once: the original had ${originalConcurrency}, but past ${MAX_CONCURRENCY} they only wait for a connection or share the same bandwidth.` : `At most ${concurrency} page fetches in flight at once, as many as the original had.` });
	const loadLinks = load === 'none' ? [...new Set(pages.flatMap((p) => p.triggers.load?.targets ?? []))].sort() : [];
	if (loadLinks.length) reasons.push({ trigger: 'per-link', says: `The original fetches ${loadLinks.length} particular link${loadLinks.length === 1 ? '' : 's'} at load (${loadLinks.slice(0, 4).join(', ')}${loadLinks.length > 4 ? ', ...' : ''}). The port does not mark those links yet.` });
	const revisits = pages.flatMap((p) => (p.revisit ? [p.revisit] : []));
	const revisitFromMemory = revisits.length ? revisits.every((r) => !r.refetched || r.fromCache) : undefined;
	if (revisitFromMemory !== undefined) reasons.push({ trigger: 'revisit', says: revisitFromMemory ? `The original shows a page it showed before without asking the network again (${revisits.length} of ${revisits.length} revisits). The port must do the same; the navigation timing check measures it.` : `The original asks the network again when a page is revisited (${revisits.filter((r) => r.refetched && !r.fromCache).length} of ${revisits.length} revisits).` });
	if (failed.length) reasons.push({ trigger: 'per-link', says: `${failed.length} page${failed.length === 1 ? '' : 's'} could not be recorded and were left out (${failed.slice(0, 3).join(', ')}).` });
	const ahead = pages.map((p) => AHEAD_TRIGGERS.reduce((sum, t) => sum + (p.triggers[t]?.bytes ?? 0), 0)).sort((a, b) => a - b);
	const aheadBytes = ahead[ahead.length >> 1] ?? 0;
	if (aheadBytes) reasons.push({ trigger: 'idle', says: `The original fetches about ${(aheadBytes / 1024 / 1024).toFixed(1)} MB of page data ahead in one page view. The port keeps its router's own budget for fetching ahead.` });
	const setting = { intent, viewport, idle, concurrency };
	const next = moreEager(setting);
	return { setting, ...(next ? { next } : {}), reasons, pages: pages.length, failed, original, loadLinks, aheadBytes, ...(revisitFromMemory !== undefined ? { revisitFromMemory } : {}), originalConcurrency };
}

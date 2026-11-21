// Convert's side of the prefetch recordings: which pages get the full experiment, and the site's facts kept in `.migrate`.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { urlPattern } from '../check/templates.ts';
import type { PrefetchFacts } from './facts.ts';
import type { RecordOptions } from './record.ts';

/** The router's own rules (whether a click or a revisit fetches again, which networks it prefetches on) are the same on every page: they are read on the first pages of the site's largest URL patterns, the clicks on this many, the network conditions on the first `CONDITION_PAGES` of those. */
export const FULL_PAGES = 4;
export const CONDITION_PAGES = 2;

/** Over the whole route list, the same on every shard whichever pages it converts. */
export function fullRecordings(allRoutes: readonly string[]): { readonly full: Set<string>; readonly conditions: Set<string> } {
	const byPattern = new Map<string, string[]>();
	for (const route of [...allRoutes].sort()) {
		const pattern = urlPattern(route);
		byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), route]);
	}
	const largest = [...byPattern].flatMap(([pattern, routes]) => (routes[0] ? [{ pattern, first: routes[0], size: routes.length }] : [])).sort((a, b) => b.size - a.size || (a.pattern < b.pattern ? -1 : 1));
	return { full: new Set(largest.slice(0, FULL_PAGES).map((g) => g.first)), conditions: new Set(largest.slice(0, CONDITION_PAGES).map((g) => g.first)) };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The pages a stored prefetch.json holds, only when this recorder version wrote it and each from the old page its route has now (`pages`, by page key). */
export function storedFacts(parsed: unknown, version: string, pages: ReadonlyMap<string, string>): Record<string, PrefetchFacts> {
	if (!isObject(parsed) || parsed.version !== version || !isObject(parsed.routes)) return {};
	const out: Record<string, PrefetchFacts> = {};
	for (const [route, facts] of Object.entries(parsed.routes)) {
		if (!isObject(facts) || facts.route !== route || !isObject(facts.triggers) || !isObject(facts.hints)) continue;
		if (typeof facts.page !== 'string' || facts.page !== pages.get(route)) continue;
		const { page: _, ...rest } = facts;
		out[route] = { ...(rest as unknown as Omit<PrefetchFacts, 'requests'>), requests: [] };
	}
	return out;
}

export interface PrefetchRecorder {
	/** What the recorder is handed for a route: whether it runs the full experiment, and under which conditions. */
	readonly options: (route: string) => RecordOptions;
	readonly kept: (facts: PrefetchFacts) => PrefetchFacts;
	/** A page whose recording could not finish (the browser died under it twice): unknown to the decision, recorded again next time. */
	readonly unknown: (route: string, why: string, browser?: string) => PrefetchFacts;
	/** Writes what was recorded to `.migrate/prefetch.json`, without the raw requests. */
	readonly save: () => Promise<void>;
	/** Every listed page's facts: this convert's, and the last convert's for pages it did not record. */
	readonly recorded: () => readonly PrefetchFacts[];
	/** The pages of those that came from the last convert. */
	readonly fromBefore: () => readonly string[];
	/** Listed pages whose last convert's facts are not read back and that this convert has not recorded, each with why. */
	readonly unread: () => readonly { readonly route: string; readonly why: string }[];
}

/** The recordings themselves are kept by convert's `record` under the prefetch kind's key (src/convert/record-key.ts); `version` is that kind's, `pageOf` a route's page key. */
export async function prefetchRecorder(state: string, allRoutes: readonly string[], version: string, pageOf: (route: string) => Promise<string>, log: (line: string) => void): Promise<PrefetchRecorder> {
	const { full, conditions } = fullRecordings(allRoutes);
	const recorded = new Map<string, PrefetchFacts>();
	const listed = new Set(allRoutes);
	// What the last convert recorded: a partial convert decides from it and its own pages together, never from its pages alone.
	const parsed = await readFile(join(state, 'prefetch.json'), 'utf8').then((t): unknown => JSON.parse(t), () => undefined);
	const storedRoutes = isObject(parsed) && isObject(parsed.routes) ? Object.keys(parsed.routes).filter((route) => listed.has(route)) : [];
	const pages = new Map(await Promise.all(storedRoutes.map(async (route) => [route, await pageOf(route)] as const)));
	const stored = storedFacts(parsed, version, pages);
	const stale = new Map<string, string>();
	for (const route of storedRoutes) {
		if (route in stored) continue;
		const facts = isObject(parsed) && isObject(parsed.routes) ? parsed.routes[route] : undefined;
		stale.set(route, isObject(parsed) && parsed.version !== version ? "its last convert's facts were recorded by another prefetch recorder version" : isObject(facts) && typeof facts.page === 'string' && facts.page !== pages.get(route) ? "its last convert's facts were recorded from an old page that has changed since" : "its last convert's facts cannot be read");
	}
	const merged = () => {
		const out = new Map<string, PrefetchFacts>(Object.entries(stored).filter(([route]) => listed.has(route)));
		for (const [route, facts] of recorded) out.set(route, facts);
		return out;
	};
	return {
		options: (route) => ({ full: full.has(route), ...(conditions.has(route) ? {} : { conditions: [] }) }),
		kept: (facts) => {
			recorded.set(facts.route, facts);
			return facts;
		},
		unknown: (route, why, browser = 'chromium') => {
			const facts: PrefetchFacts = { route, browser, shapes: [], fullLoads: false, links: 0, triggers: {}, concurrency: 0, bytesBeforeClick: 0, hints: { links: [], speculationRules: [] }, requests: [], error: why };
			log(`  prefetch recording of ${route} failed: ${why}`);
			recorded.set(route, facts);
			return facts;
		},
		recorded: () => [...merged().values()],
		fromBefore: () => [...merged().keys()].filter((r) => !recorded.has(r)).sort(),
		unread: () => [...stale].filter(([route]) => !recorded.has(route)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([route, why]) => ({ route, why })),
		save: async () => {
			const routes = Object.fromEntries(await Promise.all([...merged()].sort(([a], [b]) => (a < b ? -1 : 1)).map(async ([route, { requests: _, ...facts }]) => [route, { ...facts, page: await pageOf(route) }] as const)));
			await writeFile(join(state, 'prefetch.json'), JSON.stringify({ version, routes }, null, 1));
		},
	};
}

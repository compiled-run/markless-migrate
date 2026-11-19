// Convert's side of the prefetch recordings: which pages get the full experiment, and the site's facts kept in `.migrate`.
import { writeFile } from 'node:fs/promises';
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

export interface PrefetchRecorder {
	/** What the recorder is handed for a route: whether it runs the full experiment, and under which conditions. */
	readonly options: (route: string) => RecordOptions;
	readonly kept: (facts: PrefetchFacts) => PrefetchFacts;
	/** A page whose recording could not finish (the browser died under it twice): unknown to the decision, recorded again next time. */
	readonly unknown: (route: string, why: string, browser?: string) => PrefetchFacts;
	/** Writes what was recorded to `.migrate/prefetch.json`, without the raw requests. */
	readonly save: () => Promise<void>;
}

/** The recordings themselves are kept by convert's `record` under the prefetch kind's key (src/convert/record-key.ts). */
export function prefetchRecorder(state: string, allRoutes: readonly string[], log: (line: string) => void): PrefetchRecorder {
	const { full, conditions } = fullRecordings(allRoutes);
	const recorded = new Map<string, PrefetchFacts>();
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
		save: async () => {
			const routes = Object.fromEntries([...recorded].sort(([a], [b]) => (a < b ? -1 : 1)).map(([route, { requests: _, ...facts }]) => [route, facts]));
			await writeFile(join(state, 'prefetch.json'), JSON.stringify({ routes }, null, 1));
		},
	};
}

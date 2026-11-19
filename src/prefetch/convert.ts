// Convert's side of the prefetch recordings: which pages get the full experiment, and the site's facts kept in `.migrate`.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { urlPattern } from '../check/templates.ts';
import type { PrefetchFacts } from './facts.ts';
import { keepCurrent, prefetchDir, prefetchPageKey } from './key.ts';
import { recordPrefetch } from './record.ts';

/** The first page of each URL pattern in the whole route list: the same on every shard, whichever pages a shard converts. */
export function fullRecordings(allRoutes: readonly string[]): Set<string> {
	const first = new Map<string, string>();
	for (const route of [...allRoutes].sort()) if (!first.has(urlPattern(route))) first.set(urlPattern(route), route);
	return new Set(first.values());
}

export interface PrefetchRecorder {
	readonly record: (browser: Browser, route: string) => Promise<PrefetchFacts>;
	/** Writes what was recorded to `.migrate/prefetch.json`, without the raw requests. */
	readonly save: () => Promise<void>;
}

export async function prefetchRecorder(state: string, origin: string, allRoutes: readonly string[], log: (line: string) => void): Promise<PrefetchRecorder> {
	const store = join(state, 'convert');
	await keepCurrent(store);
	const dir = await prefetchDir(store);
	const full = fullRecordings(allRoutes);
	const recorded = new Map<string, PrefetchFacts>();
	return {
		record: async (browser, route) => {
			const page = await prefetchPageKey(origin, route);
			try {
				const facts = await recordPrefetch(browser, origin, route, dir, { full: full.has(route), page });
				recorded.set(route, facts);
				return facts;
			} catch (error) {
				// Not kept: the route is recorded again next time, and the decision reads it as unknown.
				const facts: PrefetchFacts = { route, browser: browser.version(), shapes: [], fullLoads: false, links: 0, triggers: {}, concurrency: 0, bytesBeforeClick: 0, hints: { links: [], speculationRules: [] }, requests: [], error: (error as Error).message.split('\n')[0]! };
				log(`  prefetch recording of ${route} failed: ${facts.error}`);
				recorded.set(route, facts);
				return facts;
			}
		},
		save: async () => {
			const routes = Object.fromEntries([...recorded].sort(([a], [b]) => (a < b ? -1 : 1)).map(([route, { requests: _, ...facts }]) => [route, facts]));
			await writeFile(join(state, 'prefetch.json'), JSON.stringify({ routes }, null, 1));
		},
	};
}

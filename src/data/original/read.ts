// The original's rows put back into the shapes a check's old half has, so the judges read a stored original as a live one.
import type { StoredAnswer } from '../../check/browser.ts';
import type { ElementCoverage, Exploration, Journey, RecordedJourney, Run } from '../../check/journeys.ts';
import type { RouteCapture, Viewport } from '../../check/types.ts';
import { keys, SAMPLES, type ReplayMode } from './dataset.ts';
import type { RouteRow } from './produce.ts';
import { readLock } from './lock.ts';
import { Dataset, DatasetError } from './store.ts';

export interface OriginalLoads {
	readonly olds: readonly RouteCapture[];
	readonly loads: readonly string[];
	readonly answers: readonly StoredAnswer[];
}

export interface OriginalJourneys {
	readonly explored: Exploration;
	readonly runs: readonly Run[];
	readonly oldRisky: Run;
	readonly oldRiskyAgain: Run;
	readonly dark?: readonly Run[];
	readonly arrival?: { readonly journeys: readonly Journey[]; readonly runs: readonly Run[] };
}

export function originalRoute(dataset: Dataset, route: string): RouteRow {
	const row = dataset.row<RouteRow | { readonly failed: string }>('routes', route, keys.route(route));
	if ('failed' in row) throw new DatasetError(`the original could not be observed on ${route} when its dataset was produced (${row.failed})`);
	return row;
}

/** The route's three loads; a light page's at its first viewport alone, as the check loads it. */
export function originalLoads(dataset: Dataset, route: string, viewports: readonly Viewport[]): OriginalLoads {
	const all = dataset.manifest.conditions.viewports.map((v) => v.name);
	const names = viewports.map((v) => v.name);
	if (names.some((n) => !all.includes(n))) throw new DatasetError(`the dataset was loaded at ${all.join(', ')}, not ${names.join(', ')}`);
	const olds = Array.from({ length: SAMPLES.loads }, (_, i) => {
		const sample = dataset.row<RouteCapture>('loads', route, keys.load(route, all, i));
		return names.length === all.length ? sample : { ...sample, pages: Object.fromEntries(names.map((n) => [n, sample.pages[n]!])) };
	});
	const { loads } = dataset.row<{ loads: string[] }>('loads', route, keys.load(route, all, -1));
	const answers = dataset.rows<StoredAnswer>('responses', route).map((r) => r.value);
	return { olds, loads, answers };
}

/** Every third-party answer the original's pages read, for the run to give both sides before any route is checked. */
export function originalAnswers(dataset: Dataset, routes: readonly string[]): StoredAnswer[] {
	const byUrl = new Map<string, StoredAnswer>();
	for (const route of routes) for (const r of dataset.rows<StoredAnswer>('responses', route)) if (!byUrl.has(r.value.url)) byUrl.set(r.value.url, r.value);
	return [...byUrl.values()];
}

type ExplorationRow = Omit<Exploration, 'journeys' | 'elements'> & { readonly journeys: number; readonly elements: number; readonly arrivalJourneys: readonly Journey[] };

/** The route's exploration and every replay of it. */
export function originalJourneys(dataset: Dataset, route: string): OriginalJourneys {
	const { journeys: count, elements: elementCount, arrivalJourneys, ...rest } = dataset.row<ExplorationRow>('journeys', route, keys.exploration(route));
	const replays = new Map(dataset.rows<Run[number]>('replays', route).map((r) => [r.key, r.value]));
	const runsOf = (mode: ReplayMode, journeys: number, samples: number): Run[] =>
		journeys
			? Array.from({ length: samples }, (_, sample) =>
					Array.from({ length: journeys }, (_, j) => {
						const steps = replays.get(keys.replay(route, mode, j, sample));
						if (!steps) throw new DatasetError(`the original's dataset has no ${mode} replay ${sample} of journey ${j} on ${route}`);
						return steps;
					}),
				)
			: [];
	const plain = runsOf('plain', count, SAMPLES.plain);
	const journeys: RecordedJourney[] = Array.from({ length: count }, (_, i) => ({ ...dataset.row<Omit<RecordedJourney, 'expected'>>('journeys', route, keys.journey(route, i)), expected: plain[0]![i]! }));
	const controls = dataset.rows<ElementCoverage>('controls', route);
	if (controls.length !== elementCount) throw new DatasetError(`the original's dataset holds ${controls.length} controls of ${route}, its exploration ${elementCount}`);
	const explored: Exploration = { ...rest, journeys, elements: controls.map((c) => c.value) };
	const risky = runsOf('risky', explored.deferred.length, SAMPLES.risky);
	const darkCount = new Set(dataset.rows('replays', route).filter((r) => r.key.startsWith(`${route}\u0000dark\u0000`)).map((r) => r.key.split('\u0000')[2])).size;
	const dark = runsOf('dark', darkCount, SAMPLES.dark);
	const arrival = runsOf('arrival', arrivalJourneys.length, SAMPLES.arrival);
	return {
		explored,
		runs: plain,
		oldRisky: risky[0] ?? [],
		oldRiskyAgain: risky[1] ?? [],
		...(dark.length ? { dark } : {}),
		...(arrival.length ? { arrival: { journeys: arrivalJourneys, runs: arrival } } : {}),
	};
}

/** The tables a check reads of the original. */
export const CHECK_READS = ['routes', 'responses', 'loads', 'controls', 'journeys', 'replays'] as const;

/** Opens the dataset a check names, refusing one of producer versions other than datasets.lock's. */
export async function openOriginal(dir: string): Promise<Dataset> {
	return Dataset.open(dir, { versions: (await readLock()).producers, tables: CHECK_READS });
}

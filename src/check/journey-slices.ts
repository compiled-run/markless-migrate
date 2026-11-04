// A route too long for one job is checked in three parts: one job explores the old page, slice jobs replay disjoint slices of
// its journeys, and a last job joins their rows by journey index and runs the rest of the route's check on the joined row.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decode, digest, encode, type Json } from '../data/codec.ts';
import { DirBlobs } from '../data/store.ts';
import type { Exploration, Run, StepResult } from './journeys.ts';
import type { RouteStages } from './route-judge.ts';

export type SliceMode = 'explore' | 'replay' | 'finish';

export interface Slicing {
	readonly mode: SliceMode;
	/** Holds plan.json, parts/ and blobs/: what every part of the route's check writes and reads. */
	readonly dir: string;
	/** The slice this job replays (from 1) and how many there are. */
	readonly slice?: { readonly at: number; readonly of: number };
}

/** What the exploring job hands on: the page loads the journeys were explored with, and the exploration. */
export interface SlicePlan {
	readonly route: string;
	/** The digest of the load request, so a later part loads the same viewports. */
	readonly loadReq: string;
	readonly load: RouteStages['load']['value'];
	readonly explored: Exploration;
}

/** One slice's replays of its journeys: the old page's second run, the new page's run, and a third old run where the first two differ. */
export interface SlicePart {
	readonly route: string;
	readonly at: number;
	readonly of: number;
	readonly journeys: readonly number[];
	readonly again: Run;
	readonly next: Run;
	readonly third: readonly (readonly [number, readonly StepResult[]])[];
}

/** The rounds of every journey, by index, as an unsliced check replays them. */
export interface Rounds {
	readonly again: Run;
	readonly next: Run;
	/** Present when any journey's two old runs differed: the third old run where they did, the second elsewhere. */
	readonly third?: Run;
}

/** Ended a part of a sliced route's check that is not its last: the route's result comes from the job that joins the parts. */
export class SliceDone extends Error {
	constructor(mode: SliceMode, route: string) {
		super(`${route}: the ${mode} part of a sliced check wrote its rows; the route's result comes from the joining job`);
		this.name = 'SliceDone';
	}
}

/** The journeys slice `at` of `of` replays: every `of`-th, so long and short journeys spread over the slices. */
export const sliceJourneys = (count: number, at: number, of: number): number[] => Array.from({ length: count }, (_, j) => j).filter((j) => j % of === at - 1);

/** Every slice's rounds as one, each journey's from the slice that replayed it; a journey no slice or two slices replayed is an error. */
export function joinRounds(count: number, parts: readonly SlicePart[]): Rounds {
	if (!parts.length) throw new Error('no slices of the journeys were replayed');
	const of = parts[0]!.of;
	const seen = new Set(parts.map((p) => p.at));
	if (parts.some((p) => p.of !== of) || seen.size !== parts.length || seen.size !== of) throw new Error(`the journeys' slices do not fit together: ${parts.map((p) => `${p.at} of ${p.of}`).join(', ')}`);
	const again: (readonly StepResult[])[] = new Array(count);
	const next: (readonly StepResult[])[] = new Array(count);
	const thirds = new Map<number, readonly StepResult[]>();
	for (const part of parts) {
		const want = sliceJourneys(count, part.at, part.of);
		if (JSON.stringify(want) !== JSON.stringify(part.journeys)) throw new Error(`slice ${part.at} of ${part.of} replayed journeys ${part.journeys.join(', ')}, not ${want.join(', ')}`);
		part.journeys.forEach((j, i) => {
			again[j] = part.again[i]!;
			next[j] = part.next[i]!;
		});
		for (const [j, run] of part.third) thirds.set(j, run);
	}
	return { again, next, ...(thirds.size ? { third: again.map((run, j) => thirds.get(j) ?? run) } : {}) };
}

/** A route's rounds cut into slices, as the slice jobs would have replayed them (tests, and what `joinRounds` undoes). */
export function sliceRounds(route: string, rounds: Rounds, of: number, differs: (j: number) => boolean): SlicePart[] {
	return Array.from({ length: of }, (_, k) => {
		const journeys = sliceJourneys(rounds.again.length, k + 1, of);
		return { route, at: k + 1, of, journeys, again: journeys.map((j) => rounds.again[j]!), next: journeys.map((j) => rounds.next[j]!), third: rounds.third ? journeys.filter(differs).map((j) => [j, rounds.third![j]!] as const) : [] };
	});
}

const blobsOf = async (dir: string) => {
	await mkdir(join(dir, 'blobs'), { recursive: true });
	return new DirBlobs(join(dir, 'blobs'));
};

async function put(dir: string, file: string, value: unknown): Promise<void> {
	const blobs = await blobsOf(dir);
	const json = encode(value, blobs);
	await blobs.flush();
	await mkdir(join(dir, file, '..'), { recursive: true });
	await writeFile(join(dir, file), `${JSON.stringify(json)}\n`);
}

async function take<T>(dir: string, file: string): Promise<T> {
	const path = join(dir, file);
	if (!existsSync(path)) throw new Error(`${path} is missing: the part of the sliced check that writes it did not finish`);
	return decode(JSON.parse(await readFile(path, 'utf8')) as Json, new DirBlobs(join(dir, 'blobs'))) as T;
}

export const writePlan = (dir: string, plan: SlicePlan) => put(dir, 'plan.json', plan);
export const readPlan = (dir: string) => take<SlicePlan>(dir, 'plan.json');
export const writePart = (dir: string, part: SlicePart) => put(dir, join('parts', `part-${part.at}-of-${part.of}.json`), part);

export async function readParts(dir: string): Promise<SlicePart[]> {
	const names = existsSync(join(dir, 'parts')) ? (await readdir(join(dir, 'parts'))).filter((n) => /^part-\d+-of-\d+\.json$/.test(n)).sort() : [];
	return Promise.all(names.map((n) => take<SlicePart>(dir, join('parts', n))));
}

/** The plan's loads, for the load request this part's judge makes. */
export function plannedLoad(plan: SlicePlan, request: RouteStages['load']['request']): RouteStages['load']['value'] {
	if (digest(request) !== plan.loadReq) throw new Error(`${plan.route}: this part of the sliced check asks for other page loads than the exploring part made`);
	return plan.load;
}

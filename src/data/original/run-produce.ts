// The `original produce` stage: one shard of the original's dataset, the routes of the buckets it owns, observed on the frozen
// old site alone and written as rows. Shared layout controls are dealt by the site's one layout survey, as a check deals them.
import { availableParallelism, hostname } from 'node:os';
import { chromium, type Browser } from 'playwright';
import { Relauncher } from '../../convert/relaunch.ts';
import { defaultEnv, LAUNCH } from '../../check/browser.ts';
import { layoutOwners, type SurveyRow } from '../../check/layout-survey.ts';
import { blocker } from '../../check/trackers.ts';
import { isSwitched } from '../../switch/state.ts';
import { bucketOf, BUCKETS, keys, type Conditions } from './dataset.ts';
import { drift, readLock } from './lock.ts';
import { observeOriginal, writeRoute, type RouteRow } from './produce.ts';
import { DatasetWriter, type Part } from './store.ts';

export interface ProduceOptions {
	readonly oldOrigin: string;
	readonly site: string;
	readonly originalId: string;
	/** Every page of the site, in site order. */
	readonly routes: readonly string[];
	readonly conditions: Conditions;
	/** The site's layout survey (check --write-layout-survey), its anonymous rows. */
	readonly survey: readonly SurveyRow[];
	readonly out: string;
	/** This shard's buckets: those whose number modulo `count` is `index`. */
	readonly shard?: { readonly index: number; readonly count: number };
	readonly concurrency?: number;
	readonly log?: (line: string) => void;
}

export const shardRoutes = (routes: readonly string[], shard: ProduceOptions['shard']): string[] => (shard ? routes.filter((r) => bucketOf(r) % shard.count === shard.index) : [...routes]);

/** A route the original could not be observed on is a row too: a check reports it not checked, never observes it live instead. */
export interface FailedRoute {
	readonly failed: string;
}

/** Why a route could not be observed: the error's first line and where in the checker it was thrown. */
function failure(error: Error): string {
	const at = error.stack?.split('\n').find((line) => /\/src\//.test(line))?.trim().replace(/^at /, '');
	return `${error.message.split('\n')[0]!}${at ? ` (at ${at.replace(/^.*\/src\//, 'src/').replace(/\)$/, '')})` : ''}`;
}

export async function produceOriginal(options: ProduceOptions): Promise<Part> {
	const lock = await readLock();
	const moved = await drift(lock);
	if (moved.length) throw new Error(`datasets.lock is behind the producers' code for ${moved.map((d) => d.table).join(', ')}: run \`node scripts/datasets-lint.ts --update\` (and bump a version if its rows are meant to change) before producing`);
	if (options.shard && (options.shard.count < 1 || options.shard.count > BUCKETS || options.shard.index < 0 || options.shard.index >= options.shard.count)) throw new Error(`a shard is 0 to count-1 of at most ${BUCKETS}`);
	const log = options.log ?? (() => {});
	const c = options.conditions;
	const env = defaultEnv(options.oldOrigin, { freeze: c.freeze, block: blocker(c.block), sendWrites: c.sendWrites, ...(c.serverClock ? { serverClock: true } : {}), ...(c.routing ? { routing: c.routing } : {}) });
	const owners = layoutOwners(options.survey);
	const writer = new DatasetWriter(options.out, { site: options.site, originalId: options.originalId, conditions: c, versions: lock.producers, routes: options.routes, runner: process.env.RUNNER_NAME ?? hostname(), shard: options.shard ? `${options.shard.index}-of-${options.shard.count}` : '0' });
	// The site-wide survey is written once, by the first shard.
	if (!options.shard?.index) for (const row of options.survey) await writer.add('layout_survey', keys.route(row.route), undefined, row);
	const relaunched = await new Relauncher<Browser>(() => chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] }), log).start();
	const mine = shardRoutes(options.routes, options.shard);
	let next = 0;
	const one = async (route: string) => {
		const started = Date.now();
		const explore = { ...c.journeys, owner: (signature: string) => owners.get(signature.split(' > ')[0]!), serves: (path: string) => isSwitched([route, ...c.switched], path) };
		const got = await relaunched.retried(route, (browser) => observeOriginal(browser, env, route, { viewports: c.viewports, explore }), async () => {}).catch((error: Error) => ({ failed: failure(error) }));
		let row: RouteRow | FailedRoute;
		if ('value' in got) row = await writeRoute(writer, route, got.value);
		else {
			row = { failed: got.failed };
			await writer.add('routes', keys.route(route), route, row);
		}
		log(`${route} ${'failed' in row ? `not observed: ${row.failed}` : `${row.kind}${row.live ? ` (live: ${Object.keys(row.live).join(', ')})` : ''}`} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
	};
	try {
		await Promise.all(
			Array.from({ length: Math.max(1, Math.min(options.concurrency ?? Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))), mine.length)) }, async () => {
				while (next < mine.length) await one(mine[next++]!);
			}),
		);
		return await writer.close();
	} finally {
		await relaunched.close();
	}
}

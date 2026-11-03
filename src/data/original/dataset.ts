// The original as data: tables of what the frozen old site shows and does, produced once per original version (originalId),
// producer version and conditions, and read by those identities. A row a check asks for and the dataset lacks is an error.
import { digest, sha256 } from '../codec.ts';
import type { FreezeOptions } from '../../check/freeze.ts';
import type { Viewport } from '../../check/types.ts';

/** The dataset's layout and row encoding: a reader of another version refuses it rather than misread it. */
export const DATASET_VERSION = 1;

/** The tables of the original (design §1.2) this version produces. */
export const TABLES = ['routes', 'served', 'responses', 'loads', 'layout_survey', 'controls', 'journeys', 'replays', 'forced_states'] as const;
export type Table = (typeof TABLES)[number];

/** Tables over the whole site, in one file each; every other table is split into buckets by route. */
export const SITE_TABLES: ReadonlySet<Table> = new Set(['layout_survey']);

export const BUCKETS = 64;

/** Which of the 64 buckets a route's rows are in: the first byte of sha256(route), modulo 64. */
export const bucketOf = (route: string): number => Number.parseInt(sha256(route).slice(0, 2), 16) % BUCKETS;

/** The browser setup the original was observed under; a check reads a dataset only under the same conditions. */
export interface Conditions {
	readonly viewports: readonly Viewport[];
	readonly freeze: FreezeOptions | false;
	/** The --block and --allow changes to the shipped tracker list. */
	readonly block: { readonly add: readonly string[]; readonly allow: readonly string[] };
	readonly sendWrites: boolean;
	readonly serverClock: boolean;
	readonly journeys: { readonly budgetMs?: number; readonly maxJourneys?: number; readonly maxDepth?: number };
	/** Routes served by the new app (switched.json), which exploring follows a stored mode to. */
	readonly switched: readonly string[];
	readonly routing?: 'hash';
	/** Signed in as this role, or anonymous (null). */
	readonly role: string | null;
}

export const conditionsId = (conditions: Conditions): string => digest(conditions);

/** Where a row came from. */
export interface Provenance {
	readonly originalId: string;
	readonly producerVersion: number;
	readonly conditions: string;
	readonly runner: string;
	readonly at: string;
}

/** One row as written: its table, identity within the table, route (absent for site-wide rows) and encoded value. */
export interface RowLine {
	readonly key: string;
	readonly route?: string;
	readonly prov: Provenance;
	readonly value: unknown;
}

export interface TableManifest {
	readonly producerVersion: number;
	/** The producer's code-closure digest the rows were produced with (datasets.lock). */
	readonly closure: string;
	readonly rows: number;
	/** Buckets holding rows of this table (empty for a site-wide table). */
	readonly buckets: readonly number[];
}

/** The commit point of a dataset: written last, after every bucket; a dataset without one is not readable. */
export interface Manifest {
	readonly v: typeof DATASET_VERSION;
	readonly site: string;
	readonly originalId: string;
	readonly conditionsId: string;
	readonly conditions: Conditions;
	readonly tables: Readonly<Record<Table, TableManifest>>;
	/** The routes produced, in site order. */
	readonly routes: readonly string[];
	readonly producedAt: string;
}

/** Row keys: each table's identity within one original, producer version and conditions. */
export const keys = {
	route: (route: string) => route,
	served: (route: string, role: string | null) => `${role ?? ''}\u0000${route}`,
	response: (url: string, method: string, side: 'browser' | 'server') => `${side}\u0000${method}\u0000${url}`,
	load: (route: string, viewports: readonly string[], sample: number) => `${route}\u0000${viewports.join(',')}\u0000${sample}`,
	control: (route: string, signature: string, n: number) => `${route}\u0000${signature}\u0000${n}`,
	journey: (route: string, index: number) => `${route}\u0000${index}`,
	exploration: (route: string) => `${route}\u0000exploration`,
	replay: (route: string, mode: ReplayMode, journey: number, sample: number) => `${route}\u0000${mode}\u0000${journey}\u0000${sample}`,
};

/**
 * What a replay row replays: `plain` the explored journeys (sample 0 is what exploring recorded), `risky` those that end the
 * session or delete, `dark` the theme cycles with the OS in dark mode, `arrival` the journeys after arriving from another page.
 */
export type ReplayMode = 'plain' | 'risky' | 'dark' | 'arrival';

/** Samples of the original each kind of observation keeps. */
export const SAMPLES = { loads: 3, plain: 3, risky: 2, dark: 2, arrival: 2 } as const;

// datasets.lock: each table's producer version, and the code-closure digest of the producer that version was proved with.
// A digest that moved with its version unchanged is a pull request's to settle: a canary re-production shows whether the
// rows changed (bump the version) or not (record the digest).
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { declarationKey } from '../../declaration-closure.ts';
import { TABLES, type Table } from './dataset.ts';
import type { ProducerVersions } from './store.ts';

export const LOCK_FILE = join(import.meta.dirname, '../../../datasets.lock');

const here = (file: string) => join(import.meta.dirname, file);
const check = (file: string) => join(import.meta.dirname, '../../check', file);

/** The code that produces each table, by its top-level names. */
export const PRODUCERS: Readonly<Record<Table, readonly { readonly file: string; readonly names: readonly string[] }[]>> = {
	routes: [{ file: here('produce.ts'), names: ['observeRoute', 'writeRoute', 'clientOnly'] }],
	served: [{ file: here('produce.ts'), names: ['observeRoute', 'writeRoute'] }],
	responses: [{ file: here('produce.ts'), names: ['observeLoads', 'writeRoute'] }],
	loads: [{ file: here('produce.ts'), names: ['observeLoads', 'writeRoute'] }],
	layout_survey: [{ file: check('journeys.ts'), names: ['survey'] }],
	controls: [{ file: here('produce.ts'), names: ['observeJourneys', 'writeRoute'] }],
	journeys: [{ file: here('produce.ts'), names: ['observeJourneys', 'writeRoute'] }],
	replays: [{ file: here('produce.ts'), names: ['observeJourneys', 'writeRoute'] }],
	forced_states: [],
};

// The old server runs the request recorder when its start command preloads it; what it records is part of every row.
const SERVER_RECORDER = check('record-server.cjs');

export async function producerClosures(): Promise<Record<Table, string>> {
	const recorder = await readFile(SERVER_RECORDER, 'utf8');
	const out = {} as Record<Table, string>;
	for (const t of TABLES) out[t] = PRODUCERS[t].length ? await declarationKey(PRODUCERS[t], { 'record-server.cjs': recorder }) : 'none';
	return out;
}

export interface Lock {
	readonly v: 1;
	readonly producers: ProducerVersions;
}

export async function readLock(file = LOCK_FILE): Promise<Lock> {
	const lock = JSON.parse(await readFile(file, 'utf8')) as Lock;
	if (lock.v !== 1) throw new Error(`${file} is of version ${lock.v}; this checker reads version 1`);
	for (const t of TABLES) if (!lock.producers[t] || !Number.isInteger(lock.producers[t].version)) throw new Error(`${file} names no producer version for ${t}`);
	return lock;
}

export async function writeLock(lock: Lock, file = LOCK_FILE): Promise<void> {
	await writeFile(file, `${JSON.stringify(lock, null, '\t')}\n`);
}

export interface LockDrift {
	readonly table: Table;
	readonly locked: { readonly version: number; readonly closure: string };
	readonly closure: string;
}

/** Tables whose producer code no longer has the digest the lock names. */
export async function drift(lock: Lock): Promise<LockDrift[]> {
	const now = await producerClosures();
	return TABLES.filter((t) => lock.producers[t].closure !== now[t]).map((t) => ({ table: t, locked: lock.producers[t], closure: now[t] }));
}

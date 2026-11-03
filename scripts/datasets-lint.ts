#!/usr/bin/env node
// datasets.lock against the producers' code: `node scripts/datasets-lint.ts` fails when a producer's code-closure digest
// moved and the lock was not settled; `--update` records the current digests, keeping every version;
// `--base <lock>` names the lock the change starts from, so a digest-only change is told from a version bump;
// `--canary <diff.json>` is the canary diff (scripts/original-dataset.ts canary) that proves a digest-only change left rows alike.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { CanaryResult } from '../src/data/original/canary.ts';
import { TABLES, type Table } from '../src/data/original/dataset.ts';
import { drift, LOCK_FILE, producerClosures, readLock, writeLock, type Lock } from '../src/data/original/lock.ts';

const { values } = parseArgs({ options: { update: { type: 'boolean' }, base: { type: 'string' }, canary: { type: 'string' }, json: { type: 'boolean' } } });

const now = await producerClosures();
if (values.update) {
	const old = await readLock().catch((): Lock => ({ v: 1, producers: {} as Lock['producers'] }));
	const producers = Object.fromEntries(TABLES.map((t) => [t, { version: old.producers[t]?.version ?? 1, closure: now[t] }])) as Lock['producers'];
	await writeLock({ v: 1, producers });
	process.stdout.write(`datasets.lock: digests recorded for ${TABLES.length} tables\n`);
	process.exit(0);
}

const lock = await readLock();
const moved = await drift(lock);
if (moved.length) {
	process.stderr.write(`datasets.lock is behind the producers' code for ${moved.map((d) => d.table).join(', ')}: run \`node scripts/datasets-lint.ts --update\`, bump a table's version if you mean its rows to change, and push; a canary re-production then decides whether a version that stayed must move.\n`);
	process.exit(1);
}
if (!values.base) {
	process.stdout.write(`datasets.lock matches the producers' code (${LOCK_FILE})\n`);
	process.exit(0);
}
const base = await readLock(values.base);
// A digest that moved with the version kept needs the canary's word; a bumped version schedules a re-production.
const unproved: Table[] = TABLES.filter((t) => base.producers[t].closure !== lock.producers[t].closure && base.producers[t].version === lock.producers[t].version);
const bumped = TABLES.filter((t) => lock.producers[t].version !== base.producers[t].version);
for (const t of bumped) if (lock.producers[t].version < base.producers[t].version) {
	process.stderr.write(`datasets.lock: ${t}'s version went back from ${base.producers[t].version} to ${lock.producers[t].version}\n`);
	process.exit(1);
}
if (!unproved.length) {
	process.stdout.write(`datasets.lock: ${bumped.length ? `re-produces ${bumped.join(', ')}` : 'no producer change'}\n`);
	process.exit(0);
}
if (!values.canary) {
	process.stdout.write(`${JSON.stringify({ canary: unproved })}\n`);
	process.stderr.write(`datasets.lock: ${unproved.join(', ')} changed code with the same version: the canary must show their rows alike (pass --canary <diff.json>)\n`);
	process.exit(2);
}
const canary = JSON.parse(await readFile(values.canary, 'utf8')) as CanaryResult;
if (canary.nondeterministic.length) {
	process.stderr.write(`datasets.lock: the canary cannot prove ${unproved.join(', ')} alike, because the producers are not deterministic in ${canary.nondeterministic.map((n) => `${n.table} ${n.family}`).join(', ')}: bump their versions, or make those families deterministic\n`);
	process.exit(1);
}
const differ = unproved.filter((t) => !canary.tables[t]?.same);
if (differ.length) {
	process.stderr.write(`datasets.lock: the canary's rows differ for ${differ.map((t) => `${t} (${canary.tables[t]?.summary ?? 'not produced'})`).join('; ')}: bump their versions in datasets.lock\n`);
	process.exit(1);
}
process.stdout.write(`datasets.lock: ${unproved.join(', ')} changed code but the canary's rows are alike; nothing is re-produced\n`);

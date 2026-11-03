// A dataset on disk, as a producer shard writes it and a check reads it:
//   manifest.json          the commit point, written last (dataset.ts Manifest)
//   part-<shard>.json      what one producer shard wrote: rows per table and the buckets it owns
//   <table>-<bb>.ndjson    one JSON line per row of the bucket's routes; <table>.ndjson for a site-wide table
//   blobs-<bb>/<sha256>    the bucket's screenshots, HTML and bodies, once each; blobs-site/ for site-wide tables
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decode, encode, spill, type Json } from '../codec.ts';
import { DirBlobs } from '../store.ts';
import { bucketOf, conditionsId, DATASET_VERSION, SITE_TABLES, TABLES, type Conditions, type Manifest, type Provenance, type RowLine, type Table, type TableManifest } from './dataset.ts';

export interface ProducerVersion {
	readonly version: number;
	readonly closure: string;
}

export type ProducerVersions = Readonly<Record<Table, ProducerVersion>>;

const pad = (b: number) => String(b).padStart(2, '0');
export const tableFile = (table: Table, bucket?: number) => (bucket === undefined ? `${table}.ndjson` : `${table}-${pad(bucket)}.ndjson`);
export const blobsDir = (bucket?: number) => (bucket === undefined ? 'blobs-site' : `blobs-${pad(bucket)}`);

/** What one producer shard wrote, and the dataset it wrote it for. */
export interface Part {
	readonly shard: string;
	readonly meta: DatasetMeta;
	readonly rows: Readonly<Partial<Record<Table, number>>>;
	readonly buckets: Readonly<Partial<Record<Table, readonly number[]>>>;
	/** Routes whose `routes` row was written: a producer writes it last, so these are whole. */
	readonly routes: readonly string[];
}

export interface DatasetMeta {
	readonly site: string;
	readonly originalId: string;
	readonly conditions: Conditions;
	readonly versions: ProducerVersions;
	/** Every route of the dataset, in site order. */
	readonly routes: readonly string[];
}

/** Writes one producer shard's rows into `dir`, each row encoded as it is added and appended in the order added. */
export class DatasetWriter {
	readonly #dir: string;
	readonly #prov: (table: Table) => Provenance;
	readonly #shard: string;
	readonly #blobs = new Map<string, DirBlobs>();
	readonly #rows: Partial<Record<Table, number>> = {};
	readonly #buckets: Partial<Record<Table, Set<number>>> = {};
	readonly #routes = new Set<string>();
	#queue: Promise<void> = Promise.resolve();
	readonly #ready: Promise<void>;
	readonly #meta: DatasetMeta;
	constructor(dir: string, meta: DatasetMeta & { readonly runner: string; readonly shard?: string }) {
		this.#dir = dir;
		this.#meta = { site: meta.site, originalId: meta.originalId, conditions: meta.conditions, versions: meta.versions, routes: meta.routes };
		this.#shard = meta.shard ?? '0';
		const conditions = conditionsId(meta.conditions);
		const at = new Date().toISOString();
		this.#prov = (table) => ({ originalId: meta.originalId, producerVersion: meta.versions[table].version, conditions, runner: meta.runner, at });
		this.#ready = mkdir(dir, { recursive: true }).then(() => {});
	}
	#blobsOf(bucket: number | undefined): DirBlobs {
		const name = blobsDir(bucket);
		let blobs = this.#blobs.get(name);
		if (!blobs) this.#blobs.set(name, (blobs = new DirBlobs(join(this.#dir, name), this.#ready.then(async () => void (await mkdir(join(this.#dir, name), { recursive: true }))))));
		return blobs;
	}
	add(table: Table, key: string, route: string | undefined, value: unknown): Promise<void> {
		const site = SITE_TABLES.has(table);
		if (!site && route === undefined) throw new Error(`a ${table} row needs its route`);
		const bucket = site ? undefined : bucketOf(route!);
		const blobs = this.#blobsOf(bucket);
		const line: RowLine = { key, ...(route !== undefined ? { route } : {}), prov: this.#prov(table), value: spill(encode(value, blobs), blobs) };
		const text = `${JSON.stringify(line)}\n`;
		this.#rows[table] = (this.#rows[table] ?? 0) + 1;
		if (bucket !== undefined) (this.#buckets[table] ??= new Set()).add(bucket);
		if (table === 'routes' && route !== undefined) this.#routes.add(route);
		const done = this.#queue.then(async () => {
			await this.#ready;
			await blobs.flush();
			await appendFile(join(this.#dir, tableFile(table, bucket)), text);
		});
		this.#queue = done.catch(() => {});
		return done;
	}
	async close(): Promise<Part> {
		await this.#queue;
		for (const blobs of this.#blobs.values()) await blobs.flush();
		const part: Part = { shard: this.#shard, meta: this.#meta, rows: { ...this.#rows }, buckets: Object.fromEntries(Object.entries(this.#buckets).map(([t, s]) => [t, [...s!].sort((a, b) => a - b)])), routes: [...this.#routes] };
		await writeFile(join(this.#dir, `part-${this.#shard}.json`), `${JSON.stringify(part)}\n`);
		return part;
	}
}

/** Writes the manifest over every shard's part in `dir`: the dataset is readable from here on. */
export async function commitDataset(dir: string): Promise<Manifest> {
	const parts: Part[] = [];
	for (const f of (await readdir(dir)).filter((f) => /^part-.+\.json$/.test(f)).sort()) parts.push(JSON.parse(await readFile(join(dir, f), 'utf8')) as Part);
	if (!parts.length) throw new Error(`${dir} holds no producer part: nothing was produced`);
	const meta = parts[0]!.meta;
	const other = parts.find((p) => JSON.stringify(p.meta) !== JSON.stringify(meta));
	if (other) throw new Error(`shard ${other.shard} produced for another dataset than shard ${parts[0]!.shard} (another original, conditions, producer versions or route list)`);
	const produced = new Set(parts.flatMap((p) => p.routes));
	const missing = meta.routes.filter((r) => !produced.has(r));
	if (missing.length) throw new Error(`${missing.length} route(s) were not produced, for example ${missing.slice(0, 3).join(', ')}: the dataset is not committed`);
	const tables = Object.fromEntries(
		TABLES.map((t): [Table, TableManifest] => [t, { producerVersion: meta.versions[t].version, closure: meta.versions[t].closure, rows: parts.reduce((n, p) => n + (p.rows[t] ?? 0), 0), buckets: [...new Set(parts.flatMap((p) => p.buckets[t] ?? []))].sort((a, b) => a - b) }]),
	) as Record<Table, TableManifest>;
	const manifest: Manifest = { v: DATASET_VERSION, site: meta.site, originalId: meta.originalId, conditionsId: conditionsId(meta.conditions), conditions: meta.conditions, tables, routes: meta.routes, producedAt: new Date().toISOString() };
	await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`);
	return manifest;
}

/** A row read back: its key, route and decoded value. */
export interface Row<T = unknown> {
	readonly key: string;
	readonly route?: string;
	readonly prov: Provenance;
	readonly value: T;
}

/** What a reader expects of a dataset: a check names the original, the conditions and the producer versions it reads. */
export interface Expect {
	readonly originalId?: string;
	/** Left out, the check compares the conditions itself once it knows them. */
	readonly conditions?: Conditions;
	readonly versions: ProducerVersions;
	readonly tables: readonly Table[];
}

/** A committed dataset, its bucket files read when a route of theirs is first asked for. */
export class Dataset {
	readonly dir: string;
	readonly manifest: Manifest;
	readonly #loaded = new Map<string, Map<string, Row[]>>();
	private constructor(dir: string, manifest: Manifest) {
		this.dir = dir;
		this.manifest = manifest;
	}

	/** Opens the dataset in `dir`, refusing one of another original, other conditions or other producer versions than expected. */
	static async open(dir: string, expect: Expect): Promise<Dataset> {
		const path = join(dir, 'manifest.json');
		if (!existsSync(path)) throw new Error(`${dir} holds no committed dataset (no manifest.json)`);
		const manifest = JSON.parse(await readFile(path, 'utf8')) as Manifest;
		if (manifest.v !== DATASET_VERSION) throw new Error(`${dir} is a dataset of version ${manifest.v}; this checker reads version ${DATASET_VERSION}`);
		if (expect.originalId && manifest.originalId !== expect.originalId) throw new Error(`${dir} is a dataset of the original ${manifest.originalId.slice(0, 12)}, not ${expect.originalId.slice(0, 12)}`);
		if (expect.conditions && manifest.conditionsId !== conditionsId(expect.conditions)) throw new Error(`${dir} was produced under other conditions than this check's (${differing(manifest.conditions, expect.conditions).join(', ') || manifest.conditionsId})`);
		for (const t of expect.tables) {
			const has = manifest.tables[t];
			const want = expect.versions[t];
			if (!has || has.producerVersion !== want.version) throw new Error(`${dir} holds ${t} of producer version ${has?.producerVersion ?? 'none'}; this checker reads version ${want.version} (datasets.lock)`);
		}
		return new Dataset(dir, manifest);
	}

	has(route: string): boolean {
		return this.manifest.routes.includes(route);
	}

	#file(table: Table, bucket: number | undefined): Map<string, Row[]> {
		const name = tableFile(table, bucket);
		let byRoute = this.#loaded.get(name);
		if (byRoute) return byRoute;
		byRoute = new Map();
		this.#loaded.set(name, byRoute);
		const path = join(this.dir, name);
		if (!existsSync(path)) return byRoute;
		const blobs = new DirBlobs(join(this.dir, blobsDir(bucket)));
		for (const text of readFileSync(path, 'utf8').split('\n')) {
			if (!text) continue;
			const line = JSON.parse(text) as RowLine;
			const row: Row = { key: line.key, ...(line.route !== undefined ? { route: line.route } : {}), prov: line.prov, value: decode(line.value as Json, blobs) };
			const at = line.route ?? '';
			(byRoute.get(at) ?? byRoute.set(at, []).get(at)!).push(row);
		}
		return byRoute;
	}

	/** The rows of one route in one table, in the order they were written. */
	rows<T>(table: Table, route: string): readonly Row<T>[] {
		return (this.#file(table, SITE_TABLES.has(table) ? undefined : bucketOf(route)).get(route) ?? []) as Row<T>[];
	}

	/** Every row of a site-wide table. */
	site<T>(table: Table): readonly Row<T>[] {
		return [...this.#file(table, undefined).values()].flat() as Row<T>[];
	}

	/** One row by its key; a missing row is an error, never a miss. */
	row<T>(table: Table, route: string, key: string): T {
		const found = this.rows<T>(table, route).find((r) => r.key === key);
		if (!found) throw new MissingRow(this.manifest.originalId, table, route, key);
		return found.value;
	}
}

/** The dataset lacks what a check asks of it, or holds it in another shape than its manifest says. */
export class DatasetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DatasetError';
	}
}

export class MissingRow extends DatasetError {
	constructor(originalId: string, table: Table, route: string, key: string) {
		super(`the original ${originalId.slice(0, 12)}'s dataset has no ${table} row ${JSON.stringify(key.split('\u0000').join(' | '))} for ${route}`);
		this.name = 'MissingRow';
	}
}

function differing(a: Conditions, b: Conditions): string[] {
	return (Object.keys({ ...a, ...b }) as (keyof Conditions)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** Which bucket files and blob folders hold these routes' rows, and the site-wide tables: what a shard downloads. */
export function filesFor(manifest: Manifest, routes: readonly string[]): string[] {
	const buckets = new Set(routes.map(bucketOf));
	const files: string[] = ['manifest.json'];
	for (const t of TABLES) {
		if (SITE_TABLES.has(t)) {
			if (manifest.tables[t].rows) files.push(tableFile(t));
			continue;
		}
		for (const b of manifest.tables[t].buckets) if (buckets.has(b)) files.push(tableFile(t, b));
	}
	files.push(blobsDir());
	for (const b of [...buckets].sort((x, y) => x - y)) files.push(blobsDir(b));
	return files;
}

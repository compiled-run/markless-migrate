// A check's observations on disk, as a run writes them and `check judge` reads them:
//   run.ndjson     the run's header, then its events, one JSON line each
//   routes.ndjson  one line per checked route: its key and every row its check made
//   blobs/<sha256> each screenshot, frame and response body, once
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { RunEvent, RunHeader } from '../check/report-judge.ts';
import { encode, sha256, type Blobs, type Json } from './codec.ts';
import { readObserved, routeKey, type Observations, type Observed, type RouteKey } from './observations.ts';
import type { Row } from './rows.ts';

/** The rows' layout and encoding: a reader of another version refuses them rather than misread them. */
export const OBSERVATIONS_VERSION = 1;

const json = z.custom<Json>((v) => v !== undefined);
const RunLine = z.discriminatedUnion('kind', [z.object({ kind: z.literal('header'), v: z.number(), header: json }), z.object({ kind: z.literal('event'), event: json })]);
const RouteLine = z.object({ key: z.object({ route: z.string(), role: z.string().optional(), kind: z.enum(['page', 'probes']) }), rows: z.array(json) });

/** Blobs in a folder by their sha256, each written once; writes are kept until `flush`. */
export class DirBlobs implements Blobs {
	readonly #dir: string;
	readonly #ready: Promise<void>;
	readonly #known = new Set<string>();
	#pending: Promise<void>[] = [];
	constructor(dir: string, ready: Promise<void> = Promise.resolve()) {
		this.#dir = dir;
		this.#ready = ready;
	}
	put(bytes: Buffer): string {
		const sha = sha256(bytes);
		if (this.#known.has(sha)) return sha;
		this.#known.add(sha);
		const copy = Buffer.from(bytes);
		this.#pending.push(
			this.#ready
				.then(() => writeFile(join(this.#dir, sha), copy, { flag: 'wx' }))
				.catch((error: NodeJS.ErrnoException) => {
					if (error.code !== 'EEXIST') throw error;
				}),
		);
		return sha;
	}
	get(sha: string): Buffer {
		const path = join(this.#dir, sha);
		if (!existsSync(path)) throw new Error(`no blob ${sha} in ${this.#dir}`);
		return readFileSync(path);
	}
	async flush(): Promise<void> {
		const pending = this.#pending;
		this.#pending = [];
		await Promise.all(pending);
	}
}

/** Writes a run's observations into `dir` as they are made, after emptying it. */
export class DirObservations implements Observations {
	readonly #dir: string;
	readonly #blobs: DirBlobs;
	#queue: Promise<void> = Promise.resolve();
	readonly #ready: Promise<void>;
	constructor(dir: string) {
		this.#dir = dir;
		this.#ready = rm(dir, { recursive: true, force: true }).then(async () => void (await mkdir(join(dir, 'blobs'), { recursive: true })));
		this.#blobs = new DirBlobs(join(dir, 'blobs'), this.#ready);
	}
	#append(file: string, line: unknown): Promise<void> {
		// Lines are written one at a time, in the order they are given, whatever finishes first.
		const text = `${JSON.stringify(line)}\n`;
		const done = this.#queue.then(async () => {
			await this.#ready;
			await this.#blobs.flush();
			await appendFile(join(this.#dir, file), text);
		});
		this.#queue = done.catch(() => {});
		return done;
	}
	header(header: RunHeader): Promise<void> {
		return this.#append('run.ndjson', { kind: 'header', v: OBSERVATIONS_VERSION, header: encode(header, this.#blobs) });
	}
	event(event: RunEvent): Promise<void> {
		return this.#append('run.ndjson', { kind: 'event', event: encode(event, this.#blobs) });
	}
	row(row: Row): Json {
		return encode(row, this.#blobs);
	}
	route(key: RouteKey, rows: readonly Json[]): Promise<void> {
		return this.#append('routes.ndjson', { key, rows });
	}
}

const lines = (text: string) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as unknown);

/** A run's observations as `DirObservations` wrote them. */
export async function readObservations(dir: string): Promise<Observed> {
	const run = lines(await readFile(join(dir, 'run.ndjson'), 'utf8')).map((line, i) => {
		const parsed = RunLine.safeParse(line);
		if (!parsed.success) throw new Error(`${join(dir, 'run.ndjson')} line ${i + 1}: ${parsed.error.issues[0]?.message ?? 'not a run line'}`);
		return parsed.data;
	});
	const [head, ...rest] = run;
	if (head?.kind !== 'header') throw new Error(`${join(dir, 'run.ndjson')} starts without the run's header`);
	if (head.v !== OBSERVATIONS_VERSION) throw new Error(`${dir} holds observations of version ${head.v}; this checker reads version ${OBSERVATIONS_VERSION}`);
	const events = rest.map((line) => (line.kind === 'event' ? line.event : undefined)).filter((e): e is Json => e !== undefined);
	const routes = new Map<string, readonly Json[]>();
	const routesFile = join(dir, 'routes.ndjson');
	for (const [i, line] of (existsSync(routesFile) ? lines(await readFile(routesFile, 'utf8')) : []).entries()) {
		const parsed = RouteLine.safeParse(line);
		if (!parsed.success) throw new Error(`${routesFile} line ${i + 1}: ${parsed.error.issues[0]?.message ?? 'not a route line'}`);
		routes.set(routeKey(parsed.data.key as RouteKey), parsed.data.rows);
	}
	return readObserved(head.header, events, routes, new DirBlobs(join(dir, 'blobs')));
}

// The rows of one route's check: each stage's request (by digest) and what its producer returned or threw. A live check records
// them as its producers answer; `check judge` answers the judge from them in the same order, so both reach the same verdicts.
import { BlockedError } from '../check/blocked.ts';
import { InfrastructureError } from '../check/infrastructure.ts';
import { Unobserved, type Observe, type RouteStages, type Stage } from '../check/route-judge.ts';
import type { Blocked, Infrastructure } from '../check/types.ts';
import { digest, encode, spill, type Blobs, type Json } from './codec.ts';

/** What a producer threw, as the judge's error handling reads it: its class, name, message and cause. */
export interface ErrorRow {
	readonly name: string;
	readonly message: string;
	readonly cause?: { readonly code?: string; readonly message?: string };
	readonly infrastructure?: Omit<Infrastructure, 'side'>;
	readonly blocked?: { readonly blocked: Omit<Blocked, 'side' | 'message'>; readonly origin: string };
}

export interface Row {
	readonly stage: string;
	/** The digest of the request: the judge asks for the same observation, or the rows are not this judge's. */
	readonly req: string;
	readonly value?: unknown;
	readonly error?: ErrorRow;
}

export function errorRow(error: unknown): ErrorRow {
	const e = error as Error & { cause?: { code?: unknown; message?: unknown } };
	const cause = e?.cause && typeof e.cause === 'object' ? { ...(typeof e.cause.code === 'string' ? { code: e.cause.code } : {}), ...(typeof e.cause.message === 'string' ? { message: e.cause.message } : {}) } : undefined;
	return {
		name: e instanceof Error ? e.name : 'Error',
		message: e instanceof Error ? e.message : String(error),
		...(cause && Object.keys(cause).length ? { cause } : {}),
		...(error instanceof InfrastructureError ? { infrastructure: error.infrastructure } : {}),
		...(error instanceof BlockedError ? { blocked: { blocked: error.blocked, origin: error.origin } } : {}),
	};
}

/** The error a producer threw, built again as the same class with the same name, message and cause. */
export function rebuilt(row: ErrorRow): Error {
	const error = row.infrastructure ? new InfrastructureError(row.infrastructure, row.cause ? { cause: row.cause } : undefined) : row.blocked ? new BlockedError(row.blocked.blocked, row.blocked.origin) : new Error(row.message, row.cause ? { cause: row.cause } : undefined);
	error.name = row.name;
	if (error.message !== row.message) error.message = row.message;
	return error;
}

export type Producers = { readonly [K in Stage]: (request: RouteStages[K]['request']) => Promise<RouteStages[K]['value']> };

/**
 * One route's rows, in the order the judge asked for them, each encoded as it arrives (so what a producer returned is not held
 * past its judging); with nothing to encode them for, none is kept. Sealed when its deadline passes, so what lands after is not the route's.
 */
export class RouteLog {
	readonly #encode: ((row: Row) => Json) | undefined;
	readonly #slots: (Json | undefined)[] = [];
	#sealed = false;
	constructor(encode?: (row: Row) => Json) {
		this.#encode = encode;
	}
	get rows(): Json[] {
		return this.#slots.filter((r): r is Json => r !== undefined);
	}
	seal(): void {
		this.#sealed = true;
	}
	/** A place for a row whose producer is still running, so rows keep the order they were asked for. */
	reserve(): number {
		return this.#slots.push(undefined) - 1;
	}
	/** `force` keeps a row past the seal: the deadline's own. */
	record(row: Row, force = false, at?: number): void {
		if ((this.#sealed && !force) || !this.#encode) return;
		const encoded = this.#encode(row);
		if (at === undefined) this.#slots.push(encoded);
		else this.#slots[at] = encoded;
	}
}

/** The judge's observations answered by the producers, each answer recorded. */
export function recording(produce: Producers, log: RouteLog): Observe {
	return (async (stage: Stage, request: unknown) => {
		const req = digest(request);
		const at = log.reserve();
		try {
			const value = await (produce[stage] as (r: unknown) => Promise<unknown>)(request);
			log.record({ stage, req, value }, false, at);
			return value;
		} catch (error) {
			log.record({ stage, req, error: errorRow(error) }, false, at);
			throw error;
		}
	}) as Observe;
}

/** The judge's observations answered from recorded rows, stage by stage in the order they were recorded. */
export function replaying(rows: readonly Row[]): Observe {
	const queues = new Map<string, Row[]>();
	for (const row of rows) (queues.get(row.stage) ?? queues.set(row.stage, []).get(row.stage)!).push(row);
	return (async (stage: Stage, request: unknown) => {
		const row = queues.get(stage)?.shift();
		if (!row) throw new Unobserved(stage);
		if (row.req !== digest(request)) throw new Error(`the judge asks for another ${stage} observation than the recorded run made (request ${digest(request)}, recorded ${row.req})`);
		if (row.error) throw rebuilt(row.error);
		return row.value;
	}) as Observe;
}

/** A row as written: its parts put away by `spill`, and a large row as one blob, so a route's line stays short. */
export function rowJson(row: Row, blobs: Blobs): Json {
	const json = spill(encode(row, blobs), blobs);
	const text = JSON.stringify(json);
	return text.length > 65_536 ? { $json: blobs.put(Buffer.from(text)) } : json;
}

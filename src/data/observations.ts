// Where a check's observations go as it makes them: the run's header and events, and each route's rows, encoded as they
// arrive (blobs put away by content) so what a producer returned is not held past its judging.
import type { RunEvent, RunHeader } from '../check/report-judge.ts';
import { decode, encode, MemoryBlobs, type Blobs, type Json } from './codec.ts';
import type { Row } from './rows.ts';

/** Which route's rows: a page checked as a role, or a page whose widget probes alone ran (`--only probes`). */
export interface RouteKey {
	readonly route: string;
	readonly role?: string;
	readonly kind: 'page' | 'probes';
}

export const routeKey = (key: RouteKey): string => `${key.kind}\u0000${key.role ?? ''}\u0000${key.route}`;

export interface Observations {
	header(header: RunHeader): Promise<void>;
	event(event: RunEvent): Promise<void>;
	/** One row as it will be written, its blobs put away: what a route's log keeps of it. */
	row(row: Row): Json;
	/** A route's rows, as `row` encoded them, in the order its check asked for them. */
	route(key: RouteKey, rows: readonly Json[]): Promise<void>;
}

/** A run's observations as they were recorded, read back. */
export interface Observed {
	readonly header: RunHeader;
	readonly events: readonly RunEvent[];
	readonly routes: ReadonlyMap<string, readonly Row[]>;
}

/** Observations encoded into memory: what a run's rows hold once written and read back, for a test or a judge run in-process. */
export class MemoryObservations implements Observations {
	readonly blobs = new MemoryBlobs();
	#header: Json | undefined;
	readonly #events: Json[] = [];
	readonly #routes = new Map<string, readonly Json[]>();
	async header(header: RunHeader): Promise<void> {
		this.#header = round(encode(header, this.blobs));
	}
	async event(event: RunEvent): Promise<void> {
		this.#events.push(round(encode(event, this.blobs)));
	}
	row(row: Row): Json {
		return round(encode(row, this.blobs));
	}
	async route(key: RouteKey, rows: readonly Json[]): Promise<void> {
		this.#routes.set(routeKey(key), rows);
	}
	read(): Observed {
		if (this.#header === undefined) throw new Error('no run header was observed');
		return readObserved(this.#header, this.#events, this.#routes, this.blobs);
	}
}

/** Through JSON text and back, as a row written to a file and read again is. */
const round = (json: Json): Json => JSON.parse(JSON.stringify(json)) as Json;

export function readObserved(header: Json, events: readonly Json[], routes: ReadonlyMap<string, readonly Json[]>, blobs: Blobs): Observed {
	return {
		header: decode(header, blobs) as RunHeader,
		events: events.map((e) => decode(e, blobs) as RunEvent),
		routes: new Map([...routes].map(([k, rows]) => [k, rows.map((r) => decode(r, blobs) as Row)])),
	};
}

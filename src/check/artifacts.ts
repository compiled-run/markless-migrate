import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slug } from './data.ts';
import type { Filmstrip } from './motion.ts';
import type { RouteResult, Shot } from './types.ts';

/** A screenshot written to disk once its route was checked: the file, and the size the report lays it out at. */
export interface StoredPng {
	readonly path: string;
	readonly width: number;
	readonly height: number;
}

/** A screenshot in memory, or on disk once its route's check finished. */
export type Png = Buffer | StoredPng;

export const SHOTS_DIR = 'shots';
export const JOURNEYS_DIR = 'journeys';

/** `journeys/<route slug>.json`, as `parity` reads them back. */
export function journeysFile(dir: string, route: string): string {
	return join(dir, JOURNEYS_DIR, `${slug(route)}.json`);
}

export function journeysJson(route: string, origin: string, journeys: RouteResult['journeys']): string {
	return `${JSON.stringify({ route, origin, viewport: 'desktop', journeys }, null, '\t')}\n`;
}

/** The names of the journeys a route recorded, in memory or written out. */
export function journeyNames(r: RouteResult): readonly string[] {
	return r.journeys?.map((j) => j.name) ?? r.storedJourneys?.names ?? [];
}

/** `shots/<first 16 hex of its sha256>.png`: the same image is stored once. */
export function shotName(png: Buffer): string {
	return `${SHOTS_DIR}/${createHash('sha256').update(png).digest('hex').slice(0, 16)}.png`;
}

export function pngSize(png: Png): { width: number; height: number } {
	if (!Buffer.isBuffer(png)) return { width: png.width, height: png.height };
	return png.length >= 24 ? { width: png.readUInt32BE(16), height: png.readUInt32BE(20) } : { width: 0, height: 0 };
}

export function pngBytes(png: Png): Buffer {
	return Buffer.isBuffer(png) ? png : readFileSync(png.path);
}

/** Writes each checked route's screenshots, diffs, motion frames and journeys into the report directory and keeps only their paths, so a run's memory does not grow with its routes. */
export class RouteArtifacts {
	readonly #dir: string;
	readonly #origin: string;
	readonly #written = new Map<string, Promise<void>>();
	#made: Promise<unknown> | undefined;

	/** `origin` is the old app's, which the journeys were recorded on. */
	constructor(dir: string, origin: string) {
		this.#dir = dir;
		this.#origin = origin;
	}

	async #store(png: Png): Promise<Png> {
		if (!Buffer.isBuffer(png)) return png;
		const name = shotName(png);
		const path = join(this.#dir, name);
		this.#made ??= mkdir(join(this.#dir, SHOTS_DIR), { recursive: true });
		await this.#made;
		let written = this.#written.get(name);
		if (!written) {
			written = writeFile(path, png);
			this.#written.set(name, written);
		}
		await written;
		return { path, ...pngSize(png) };
	}

	async #shot(s: Shot): Promise<Shot> {
		const [old, next, diff] = await Promise.all([this.#store(s.old), this.#store(s.new), s.diff ? this.#store(s.diff) : undefined]);
		return { ...s, old, new: next, ...(diff ? { diff } : {}) };
	}

	async #filmstrip(f: Filmstrip): Promise<Filmstrip> {
		const [old, next] = await Promise.all([Promise.all(f.old.map((p) => this.#store(p))), Promise.all(f.new.map((p) => this.#store(p)))]);
		return { ...f, old, new: next };
	}

	async #journeys(result: RouteResult): Promise<RouteResult> {
		const { journeys, ...rest } = result;
		if (!journeys?.length) return result;
		const path = journeysFile(this.#dir, result.route);
		await mkdir(join(this.#dir, JOURNEYS_DIR), { recursive: true });
		await writeFile(path, journeysJson(result.route, this.#origin, journeys));
		return { ...rest, storedJourneys: { path, names: journeys.map((j) => j.name) } };
	}

	/** The result with every image and journey it holds on disk. */
	async keep(result: RouteResult): Promise<RouteResult> {
		const held = (p: Png) => Buffer.isBuffer(p);
		const holds = result.visualDiffs.some((d) => held(d.png)) || result.shots.some((s) => held(s.old) || held(s.new) || (s.diff && held(s.diff))) || (result.filmstrips ?? []).some((f) => [...f.old, ...f.new].some(held));
		const kept = await this.#journeys(result);
		if (!holds) return kept;
		const [visualDiffs, shots, filmstrips] = await Promise.all([
			Promise.all(kept.visualDiffs.map(async (d) => ({ ...d, png: await this.#store(d.png) }))),
			Promise.all(kept.shots.map((s) => this.#shot(s))),
			kept.filmstrips ? Promise.all(kept.filmstrips.map((f) => this.#filmstrip(f))) : undefined,
		]);
		return { ...kept, visualDiffs, shots, ...(filmstrips ? { filmstrips } : {}) };
	}
}

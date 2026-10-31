import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';
import { appHeaders, sharedAnswer, type SideEnv } from './browser.ts';
import { request } from './http.ts';
import { IN_USE, TAG_LENGTH } from './cache-names.ts';

/** One response the old page loaded, as it was when the cache entry was written. */
export interface Fingerprint {
	readonly url: string;
	readonly status: number;
	readonly hash: string;
	readonly etag?: string;
	readonly lastModified?: string;
}

/** What the cache knows of one entry: hit, or why it was not used. */
export type CacheOutcome = 'hit' | 'miss' | 'changed' | 'stale-checker';

const CONCURRENCY = 8;
const VALIDATE_TIMEOUT_MS = 15_000;

// The checker's own source and its browser driver, hashed once per process: an entry another version wrote is not reused.
let version: Promise<string> | undefined;
function checkerVersion(): Promise<string> {
	version ??= (async () => {
		const dir = import.meta.dirname;
		const hash = createHash('sha256').update(String(createRequire(import.meta.url)('playwright/package.json').version));
		for (const file of (await readdir(dir)).filter((f) => f.endsWith('.ts') || f.endsWith('.mjs')).sort()) hash.update(file).update(await readFile(join(dir, file)));
		return hash.digest('hex').slice(0, 16);
	})();
	return version;
}

async function pool<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await task(items[i]!);
		}
	}));
	return out;
}

const own = (env: SideEnv, url: string) => new URL(url).origin === new URL(env.origin).origin;

async function fetchOne(env: SideEnv, url: string, previous?: Fingerprint): Promise<Fingerprint | 'unchanged' | undefined> {
	// Another origin's file is asked for once per run, by whichever comes first, the pages or this check: a third party's rate limit is not spent twice.
	if (!own(env, url)) {
		const got = await sharedAnswer(url, { origin: new URL(env.origin).origin });
		return got && { url, status: got.status, hash: createHash('sha256').update(got.body).digest('hex') };
	}
	try {
		const conditional = { ...(previous?.etag ? { 'if-none-match': previous.etag } : {}), ...(previous?.lastModified ? { 'if-modified-since': previous.lastModified } : {}) };
		const response = await request(url, { redirect: 'manual', headers: { ...(own(env, url) ? appHeaders(env) : {}), ...conditional }, signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS) });
		if (response.status === 304 && previous) {
			await response.body?.cancel();
			return 'unchanged';
		}
		const body = Buffer.from(await response.arrayBuffer());
		const etag = response.headers.get('etag') ?? undefined;
		const lastModified = response.headers.get('last-modified') ?? undefined;
		return { url, status: response.status, hash: createHash('sha256').update(body).digest('hex'), ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) };
	} catch {
		return undefined;
	}
}

/** The old app's responses for these URLs now, by content hash; undefined when one could not be fetched. */
export async function fingerprint(env: SideEnv, urls: readonly string[]): Promise<Fingerprint[] | undefined> {
	const got = await pool([...new Set(urls)].sort(), (url) => fetchOne(env, url));
	return got.every((g): g is Fingerprint => typeof g === 'object') ? got : undefined;
}

/** The recorded responses the old site no longer answers the same way. */
async function drifted(env: SideEnv, prints: readonly Fingerprint[]): Promise<string[]> {
	const now = await pool(prints, (p) => fetchOne(env, p.url, p));
	return prints.flatMap((p, i) => {
		const n = now[i];
		return n === 'unchanged' || (n !== undefined && n.status === p.status && n.hash === p.hash) ? [] : [p.url];
	});
}

/** Whether every response is as it was: a 304 to its validators, or the same status and content hash. */
export async function unchanged(env: SideEnv, prints: readonly Fingerprint[]): Promise<boolean> {
	return !(await drifted(env, prints)).length;
}

/**
 * The old side's captures and journeys between runs, in `.migrate/cache/old/`. An entry is reused only when the checker's own code
 * and browser, and the options that shape what it records (`key`), are unchanged, and the old site is too. With `build`, the
 * identity of a frozen old build, the entry is that build's reference recording: it holds for every run on the same build, with
 * no request to the old site. Without it, every response the old page loaded must be unchanged (ETag or Last-Modified
 * revalidation, else the same content hash), so a reused entry is what loading the old page again would record.
 */
export class OldCache {
	readonly counts: Record<CacheOutcome, number> = { hit: 0, miss: 0, changed: 0, 'stale-checker': 0 };
	readonly dir: string;
	/** The run's options that shape every entry (the block list). */
	readonly salt: unknown;
	/** The frozen old build's identity (its pinned source and build output), when the run serves one. */
	readonly build: string | undefined;
	/** With `drift`, a hit from a frozen build's recording is still revalidated, only to report which old responses no longer match it. */
	readonly drift: { readonly enabled: boolean; readonly urls: Set<string> };
	constructor(dir: string, salt: unknown, options: { readonly build?: string; readonly drift?: boolean } = {}) {
		this.dir = dir;
		this.salt = salt;
		this.build = options.build;
		this.drift = { enabled: Boolean(options.drift), urls: new Set() };
	}

	private tagged?: Promise<string>;
	/** The checker version and old build every entry of this run is written for, in each entry's name, so a joined cache can drop the rest. */
	private tag(): Promise<string> {
		this.tagged ??= (async () => {
			const tag = createHash('sha256').update(JSON.stringify([await checkerVersion(), this.build ?? null])).digest('hex').slice(0, TAG_LENGTH);
			await mkdir(this.dir, { recursive: true });
			await writeFile(join(this.dir, `${IN_USE}${tag}`), '');
			return tag;
		})();
		return this.tagged;
	}

	private async file(kind: string, env: SideEnv, key: unknown): Promise<string> {
		const side = { origin: env.origin, freeze: env.freeze, sendWrites: env.sendWrites, headers: env.headers, cookies: env.cookies, userAgent: env.userAgent, storageState: env.storageState, reducedMotion: env.reducedMotion, colorScheme: env.colorScheme };
		const digest = createHash('sha256').update(JSON.stringify([kind, this.salt, side, key, this.build ?? null])).digest('hex').slice(0, 32);
		return join(this.dir, `${kind}-${await this.tag()}-${digest}.bin`);
	}

	async read<T>(kind: string, env: SideEnv, key: unknown): Promise<T | undefined> {
		if (env.replay) return undefined;
		const path = await this.file(kind, env, key);
		let entry: { version: string; prints: Fingerprint[]; value: T };
		try {
			entry = deserialize(gunzipSync(await readFile(path))) as typeof entry;
		} catch {
			this.counts.miss++;
			return undefined;
		}
		if (entry.version !== (await checkerVersion())) {
			this.counts['stale-checker']++;
			return undefined;
		}
		if (this.build) {
			if (this.drift.enabled) for (const url of await drifted(env, entry.prints)) this.drift.urls.add(url);
		} else if (!(await unchanged(env, entry.prints))) {
			this.counts.changed++;
			return undefined;
		}
		this.counts.hit++;
		return entry.value;
	}

	/** A hit that could not be used after all (the run had already read another answer from a third party the entry relies on). */
	demote(): void {
		this.counts.hit--;
		this.counts.changed++;
	}

	async write(kind: string, env: SideEnv, key: unknown, urls: readonly string[], value: unknown): Promise<void> {
		if (env.replay || (!urls.length && !this.build)) return;
		const prints = (await fingerprint(env, urls)) ?? (this.build ? [] : undefined);
		if (!prints) return;
		const path = await this.file(kind, env, key);
		await mkdir(this.dir, { recursive: true });
		const temp = `${path}.${process.pid}.tmp`;
		await writeFile(temp, gzipSync(serialize({ version: await checkerVersion(), prints, value })));
		await rename(temp, path);
	}
}

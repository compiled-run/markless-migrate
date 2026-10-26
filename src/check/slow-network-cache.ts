import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NetworkBrowser, NetworkRun } from './slow-network.ts';

// The measuring code's own source: runs another version took are not reused.
let version: Promise<string> | undefined;
function measureVersion(): Promise<string> {
	version ??= Promise.all(['throttle.ts', 'slow-network.ts'].map((f) => readFile(join(import.meta.dirname, f), 'utf8'))).then((sources) => createHash('sha256').update(sources.join('\0')).digest('hex').slice(0, 16));
	return version;
}

/** The files a page loads, as its HTML names them (scripts, stylesheets, preloads, images): a new deploy fingerprints them anew. Without any, the HTML itself. */
export function deployFingerprint(html: string): string {
	const refs = [...html.matchAll(/\s(?:src|href)=["']([^"'#?]+\.(?:js|mjs|css|woff2?|png|jpe?g|webp|avif|svg)(?:\?[^"']*)?)["']/gi)].map((m) => m[1]!);
	const unique = [...new Set(refs)].sort();
	return createHash('sha256').update(unique.length ? unique.join('\n') : html).digest('hex').slice(0, 16);
}

/** The page's deploy fingerprint, fetched unthrottled; undefined when it cannot be fetched, and nothing is reused. */
export async function deployOf(url: string, fetcher: typeof fetch = fetch): Promise<string | undefined> {
	try {
		const response = await fetcher(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
		if (!response.ok) return undefined;
		return deployFingerprint(await response.text());
	} catch {
		return undefined;
	}
}

export interface CellKey {
	readonly url: string;
	readonly profile: string;
	readonly browser: NetworkBrowser;
	readonly runs: number;
	readonly control?: string;
	readonly deploy: string;
}

/** Old-page runs kept on disk between checks, one file per page, network, browser and deploy. */
export class NetworkCache {
	readonly #dir: string;
	constructor(dir: string) {
		this.#dir = dir;
	}

	async #file(key: CellKey): Promise<string> {
		const id = createHash('sha256').update(JSON.stringify([await measureVersion(), key.url, key.profile, key.browser, key.runs, key.control ?? '', key.deploy])).digest('hex').slice(0, 24);
		return join(this.#dir, `${id}.json`);
	}

	async get(key: CellKey): Promise<NetworkRun[] | undefined> {
		try {
			const stored = JSON.parse(await readFile(await this.#file(key), 'utf8')) as { runs: NetworkRun[] };
			return stored.runs.length >= key.runs ? stored.runs : undefined;
		} catch {
			return undefined;
		}
	}

	async put(key: CellKey, runs: readonly NetworkRun[]): Promise<void> {
		if (runs.some((r) => r.error && !/never answered/.test(r.error))) return;
		await mkdir(this.#dir, { recursive: true });
		await writeFile(await this.#file(key), `${JSON.stringify({ ...key, at: new Date().toISOString(), runs })}\n`);
	}
}

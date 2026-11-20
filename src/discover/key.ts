// Discovery recordings live apart from every other kind, as prefetch's do: a folder per recorder version, a file per route.
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeKey } from '../code-closure.ts';
import { fetchRecordKey } from '../convert/record-key.ts';

export const KIND = 'discover';

let version: Promise<string> | undefined;
export function discoverVersion(): Promise<string> {
	// convert.ts decides owners, spot checks and which counts stand: a change there is a change of what a kept recording means.
	version ??= codeKey([fileURLToPath(new URL('./record.ts', import.meta.url)), fileURLToPath(new URL('./convert.ts', import.meta.url))]);
	return version;
}

/** Where this recorder version's recordings go under `.migrate/convert`. */
export async function discoverDir(store: string): Promise<string> {
	return join(store, KIND, `v-${await discoverVersion()}`);
}

/** The old page's key, from one plain request (no browser). */
export async function discoverPageKey(origin: string, route: string): Promise<string> {
	return fetchRecordKey({ [KIND]: await discoverVersion() }, origin, route);
}

/** Removes the folders of other recorder versions; the last run's counts beside them stay. */
export async function keepCurrent(store: string): Promise<void> {
	const current = `v-${await discoverVersion()}`;
	for (const name of await readdir(join(store, KIND)).catch((): string[] => [])) if (name.startsWith('v-') && name !== current) await rm(join(store, KIND, name), { recursive: true, force: true });
}

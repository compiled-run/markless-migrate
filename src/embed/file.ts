import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmbedsFile } from './types.ts';

export const EMBEDS_FILE = 'embeds.json';
/** Per embed: its study (`study.json`, reference screenshots, settled markup) and the data fetched for it. */
export const EMBEDS_DIR = 'embeds';

export async function writeEmbeds(file: EmbedsFile, stateDir: string): Promise<string> {
	await mkdir(stateDir, { recursive: true });
	const path = join(stateDir, EMBEDS_FILE);
	await writeFile(path, `${JSON.stringify(file, null, '\t')}\n`);
	return path;
}

export async function readEmbeds(stateDir: string): Promise<EmbedsFile | undefined> {
	const text = await readFile(join(stateDir, EMBEDS_FILE), 'utf8').catch(() => undefined);
	return text ? (JSON.parse(text) as EmbedsFile) : undefined;
}

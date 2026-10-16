import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NetworkRecord } from './network.ts';

export const DATA_DIR = 'data';

/** Responses recorded from the OLD app for one route, served to both apps on replay. */
export interface Recording {
	readonly route: string;
	readonly recordedFrom: string;
	readonly at: string;
	readonly responses: readonly NetworkRecord[];
}

export function slug(route: string): string {
	return route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
}

export function dataFile(dir: string, route: string): string {
	return join(dir, `${slug(route)}.json`);
}

/** Answered requests only, once each; held-back writes and failed requests have nothing to replay. */
export function recordable(records: readonly NetworkRecord[]): NetworkRecord[] {
	const seen = new Set<string>();
	const out: NetworkRecord[] = [];
	for (const record of records) {
		if (record.intercepted || record.status === 0 || record.body === undefined) continue;
		const key = `${record.side} ${record.method} ${record.url} ${record.requestBody ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const { replayed: _, recordedUrl, ...kept } = record;
		out.push(recordedUrl ? { ...kept, url: recordedUrl } : kept);
	}
	return out;
}

export async function writeRecording(dir: string, recording: Recording): Promise<string> {
	await mkdir(dir, { recursive: true });
	const path = dataFile(dir, recording.route);
	await writeFile(path, `${JSON.stringify(recording, null, '\t')}\n`);
	return path;
}

export async function readRecording(dir: string, route: string): Promise<Recording | undefined> {
	try {
		return JSON.parse(await readFile(dataFile(dir, route), 'utf8')) as Recording;
	} catch {
		return undefined;
	}
}

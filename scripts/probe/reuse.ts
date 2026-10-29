// The original's side of each probe use, kept between runs: the original is a fixed build, so what a use does on it is
// recorded (twice, so its own variance is kept) and only the port is used again. Entries live where check keeps its reuse
// entries (a `.migrate/reuse` directory, joined by `check-shards.ts keep`) under the same key scheme.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reuseKey } from '../../src/check/ship-key.ts';

export interface OldItem {
	readonly engine: string;
	readonly route: string;
	readonly width: number;
	/** The use: its kind, the steps before it and the control, and the value typed or keys pressed. */
	readonly item: string;
}

export const oldKey = (versions: Readonly<Record<string, string>>, at: OldItem): string => reuseKey(versions, [`probe-old ${at.engine}\n`, `route ${at.route}\n`, `width ${at.width}\n`, `use ${at.item}\n`]);

export interface OldEntry {
	readonly checkedAt: string;
	readonly route: string;
	readonly item: string;
	readonly runs: readonly unknown[];
}

export async function readOld(dir: string, key: string): Promise<OldEntry | undefined> {
	try {
		return JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8')) as OldEntry;
	} catch {
		return undefined;
	}
}

export async function writeOld(dir: string, key: string, entry: Omit<OldEntry, 'checkedAt'>, checkedAt: string): Promise<void> {
	await mkdir(dir, { recursive: true });
	const path = join(dir, `${key}.json`);
	await writeFile(`${path}.tmp`, JSON.stringify({ checkedAt, ...entry }));
	await rename(`${path}.tmp`, path);
}

interface Finding {
	readonly kind: string;
	readonly control?: string;
	readonly width?: number;
}

/** The findings made against every recording of the old side, as the first recording words them. */
export function agreed<T extends Finding>(sets: readonly (readonly T[])[]): T[] {
	if (!sets.length) return [];
	const id = (f: Finding) => `${f.kind}|${f.control ?? ''}|${f.width ?? ''}`;
	const rest = sets.slice(1).map((s) => new Set(s.map(id)));
	return sets[0]!.filter((f) => rest.every((s) => s.has(id(f))));
}

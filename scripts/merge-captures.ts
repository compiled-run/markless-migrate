// The emit's merge of the capture shards' recordings: `merge-captures.ts <into> <shard dir>...` copies every shard's files
// into one store. A file two shards both wrote must be byte-identical; where they disagree, the merge fails and names them,
// rather than keeping whichever shard came last.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { treeFiles } from './pipeline.ts';

export interface Disagreement {
	readonly file: string;
	readonly shards: readonly string[];
}

export async function mergeCaptures(into: string, shards: readonly string[]): Promise<{ readonly files: number; readonly disagreements: readonly Disagreement[] }> {
	const seen = new Map<string, Map<string, string[]>>();
	for (const shard of shards) {
		for (const rel of await treeFiles(shard)) {
			const file = join(shard, rel);
			const hash = createHash('sha256').update(await readFile(file)).digest('hex');
			const by = seen.get(rel);
			if (by) by.set(hash, [...(by.get(hash) ?? []), shard]);
			else {
				seen.set(rel, new Map([[hash, [shard]]]));
				await mkdir(dirname(join(into, rel)), { recursive: true });
				await copyFile(file, join(into, rel));
			}
		}
	}
	const disagreements: Disagreement[] = [...seen].filter(([, by]) => by.size > 1).map(([file, by]) => ({ file, shards: [...by.values()].map((list) => list.join(',')) }));
	// A control's choices over the same options (choices/ or shared-choices/<page key>/<control>-<options>.shown.json) are every page's.
	const shown = new Map<string, Map<string, string>>();
	for (const [rel, by] of seen) {
		const m = /^(?:shared-)?choices\/[^/]+\/([^/]+\.shown\.json)$/.exec(rel);
		if (!m || by.size > 1) continue;
		const [[hash, [shard]]] = [...by] as [[string, string[]]];
		const at = shown.get(m[1]!) ?? new Map<string, string>();
		if (!at.has(hash)) at.set(hash, `${shard} (${rel})`);
		shown.set(m[1]!, at);
	}
	for (const [name, at] of shown) if (at.size > 1) disagreements.push({ file: `choices/*/${name}`, shards: [...at.values()] });
	return { files: seen.size, disagreements };
}

async function main(): Promise<void> {
	const [into, ...shards] = process.argv.slice(2);
	if (!into || !shards.length) {
		console.error('usage: merge-captures.ts <into> <shard dir>...');
		process.exit(2);
	}
	const { files, disagreements } = await mergeCaptures(into, shards);
	for (const d of disagreements) console.error(`::error::shards recorded ${d.file} differently: ${d.shards.join(' vs ')}`);
	if (disagreements.length) process.exit(1);
	console.log(`${files} files from ${shards.length} shards`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

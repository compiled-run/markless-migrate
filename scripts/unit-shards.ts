// The unit job's shards, by name in unit-shards.json: `run <k>/<n>` runs shard k's test files, longest first, LANES at a time,
// then prints each file's time; `pack <n>` deals every listed file afresh by its seconds and rewrites the list (it moves files:
// a deliberate rebalance only). A file's shard is its own entry, so adding, renaming or removing a file never moves another.
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

/** Files one shard runs at once: node's default on the 4-CPU ubuntu-24.04 runner (its CPUs less one), the times were measured at. */
export const LANES = 3;
const LIST = new URL('unit-shards.json', import.meta.url);

export interface Entry {
	readonly shard: number;
	/** The file's slowest measured time on a runner, in seconds, LANES files at once. */
	readonly seconds: number;
}

export interface ShardList {
	/** No shard's modelled time may pass this. */
	readonly budgetSeconds: number;
	readonly files: Readonly<Record<string, Entry>>;
}

export const unitTestFiles = (): string[] => globSync('test/*.test.ts', { cwd: new URL('..', import.meta.url) }).sort();
export const readList = (): ShardList => JSON.parse(readFileSync(LIST, 'utf8')) as ShardList;

/** How long files of these seconds take when run longest first, each starting as soon as one of `lanes` frees. */
export function modelled(seconds: readonly number[], lanes = LANES): number {
	const free = new Array<number>(lanes).fill(0);
	for (const s of [...seconds].sort((a, b) => b - a)) free[free.indexOf(Math.min(...free))]! += s;
	return Math.max(...free);
}

/** Each of `n` shards' files, longest first. A listed file goes to its entry's shard; a file the list lacks goes to the shard with the least modelled time, counted from the list alone. */
export function shards(list: ShardList, files: readonly string[], n: number): string[][] {
	const out = Array.from({ length: n }, () => [] as string[]);
	const listed = files.filter((f) => list.files[f]);
	for (const f of listed) out[list.files[f]!.shard - 1]!.push(f);
	const times = out.map((s) => modelled(s.map((f) => list.files[f]!.seconds)));
	const lightest = times.indexOf(Math.min(...times));
	for (const f of files) if (!list.files[f]) out[lightest]!.push(f);
	const seconds = (f: string) => list.files[f]?.seconds ?? 0;
	return out.map((s) => s.sort((a, b) => seconds(b) - seconds(a) || (a < b ? -1 : 1)));
}

/** A fresh deal: longest first, each file to the shard with the least seconds so far, so every shard carries about the same work. */
export function pack(seconds: Readonly<Record<string, number>>, n: number): Record<string, Entry> {
	const load = new Array<number>(n).fill(0);
	const out: Record<string, Entry> = {};
	for (const [f, s] of Object.entries(seconds).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))) {
		const at = load.indexOf(Math.min(...load));
		out[f] = { shard: at + 1, seconds: s };
		load[at]! += s;
	}
	return out;
}

const write = (list: ShardList) => {
	const rows = Object.keys(list.files).sort().map((f) => `\t\t${JSON.stringify(f)}: ${JSON.stringify(list.files[f])}`);
	writeFileSync(LIST, `{\n\t"budgetSeconds": ${list.budgetSeconds},\n\t"files": {\n${rows.join(',\n')}\n\t}\n}\n`);
};

async function main(): Promise<void> {
	const [command, arg] = process.argv.slice(2);
	const list = readList();
	const total = Math.max(...Object.values(list.files).map((e) => e.shard));
	if (command === 'run' && arg && /^\d+\/\d+$/.test(arg)) {
		const [k, n] = arg.split('/').map(Number) as [number, number];
		if (n !== total || k < 1 || k > n) throw new Error(`unit-shards.json deals ${total} shards; asked for ${arg}`);
		const files = shards(list, unitTestFiles(), n)[k - 1]!;
		const took = new Map<string, number>();
		const stream = run({ files, concurrency: LANES, timeout: 600_000 });
		stream.on('test:fail', (event) => {
			if (event.todo === undefined || event.todo === false) process.exitCode = 1;
		});
		for (const kind of ['test:pass', 'test:fail'] as const)
			stream.on(kind, (event) => {
				if (event.nesting === 0 && event.file) took.set(event.file, (took.get(event.file) ?? 0) + event.details.duration_ms);
			});
		stream.on('end', () => {
			const rows = files.map((f) => [f, Math.round((took.get(new URL(`../${f}`, import.meta.url).pathname) ?? 0) / 1000), list.files[f]?.seconds] as const);
			console.log(`\nshard ${arg}, each file's tests in seconds (listed seconds in brackets):`);
			for (const [f, s, listed] of rows) console.log(`  ${f} ${s} (${listed ?? 'not listed'})`);
		});
		stream.compose(spec).pipe(process.stdout);
		return;
	}
	if (command === 'pack' && arg && /^\d+$/.test(arg)) {
		const seconds = Object.fromEntries(unitTestFiles().map((f) => [f, list.files[f]?.seconds ?? 1]));
		write({ budgetSeconds: list.budgetSeconds, files: pack(seconds, Number(arg)) });
		return;
	}
	console.error('usage: unit-shards.ts run <k>/<n> | pack <n>');
	process.exit(2);
}

if (import.meta.main) await main();

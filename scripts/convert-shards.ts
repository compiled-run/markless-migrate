// The convert workflow's split: `split <inventory.json> <n> <dir>` deals the routes convert turns into pages (HTML
// answered 200, as convert picks them) into n files of one route a line, for `convert --capture-only --only`, and
// prints the matrix of the shards that got any.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Inventory {
	readonly routes: readonly { readonly route: string; readonly status: number }[];
	readonly allRoutes?: readonly { readonly route: string; readonly status?: number; readonly contentType?: string }[];
}

/** The routes convert writes a page for, in the inventory's order. */
export function pageRoutes(inventory: Inventory): string[] {
	const types = new Map((inventory.allRoutes ?? []).map((r) => [r.route, r.contentType]));
	const all = new Map<string, { status: number; contentType: string | undefined }>();
	for (const r of inventory.routes) all.set(r.route, { status: r.status, contentType: types.get(r.route) });
	for (const r of inventory.allRoutes ?? []) if (r.status !== undefined) all.set(r.route, { status: r.status, contentType: r.contentType });
	return [...all].filter(([, r]) => r.status === 200 && (r.contentType ?? 'text/html').includes('html')).map(([route]) => route);
}

/** Dealt in turn, so each section's pages (and their cost) spread over every runner; empty shards are left out. */
export function split(routes: readonly string[], n: number): string[][] {
	const shards = Array.from({ length: n }, () => [] as string[]);
	routes.forEach((r, i) => shards[i % n]!.push(r));
	return shards.filter((s) => s.length);
}

async function main(): Promise<void> {
	const [command, a, b, c] = process.argv.slice(2);
	if (command === 'split' && a && b && c) {
		const shards = split(pageRoutes(JSON.parse(await readFile(a, 'utf8')) as Inventory), Number(b));
		await mkdir(c, { recursive: true });
		for (const [i, shard] of shards.entries()) await writeFile(join(c, `shard-${i + 1}.txt`), `${shard.join('\n')}\n`);
		console.log(JSON.stringify(shards.map((_, i) => i + 1)));
		return;
	}
	console.error('usage: convert-shards.ts split <inventory.json> <n> <dir>');
	process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

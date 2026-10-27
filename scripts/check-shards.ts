// The check workflow's two ends: `split <targets.json> <n> <dir>` deals a --write-targets file into n shard files and
// prints the matrix; `merge <dir of report.json files> <out dir> [<shard files dir>]` joins the shards' reports into one
// report.json and a markdown summary (counts, leading causes, every route); `representatives <targets.json> <old origin>
// <out.json>` writes the pages check's template grouping measures page load on, one per group of the whole site.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Targets {
	readonly routes: string[];
	readonly endpoints?: string[];
	readonly redirects?: string[];
	readonly unchecked?: unknown[];
}

interface ReportRoute {
	readonly route: string;
	readonly role?: string;
	readonly ok: boolean;
	readonly blocked?: unknown;
	readonly infrastructure?: { readonly message?: string; readonly cause?: string };
	readonly notPorted?: unknown;
	readonly failures?: readonly { readonly dimension: string; readonly check: string; readonly accepted?: unknown }[];
}

export function split(targets: Targets, n: number): Targets[] {
	const shards = Array.from({ length: n }, () => ({ routes: [] as string[], endpoints: [] as string[], redirects: [] as string[], unchecked: [] as unknown[] }));
	// Dealt in turn, so pages from one section (and their cost) spread over every runner.
	targets.routes.forEach((r, i) => shards[i % n]!.routes.push(r));
	(targets.endpoints ?? []).forEach((r, i) => shards[i % n]!.endpoints.push(r));
	(targets.redirects ?? []).forEach((r, i) => shards[i % n]!.redirects.push(r));
	shards[0]!.unchecked.push(...(targets.unchecked ?? []));
	return shards;
}

/** Every target of a shard that wrote no report (its job timed out, was cancelled or failed), as not checked. */
export function unreported(shards: ReadonlyMap<number, Targets>, reported: ReadonlySet<number>): ReportRoute[] {
	return [...shards].filter(([n]) => !reported.has(n)).flatMap(([n, t]) => [...t.routes, ...(t.endpoints ?? []), ...(t.redirects ?? [])].map((route) => ({ route, ok: false, infrastructure: { cause: 'shard not finished', message: `shard ${n} wrote no report (its job timed out, was cancelled or failed), so this route was not checked` } })));
}

const state = (r: ReportRoute) => (r.blocked ? 'blocked' : r.infrastructure ? 'not checked' : r.ok ? 'green' : r.notPorted ? 'not ported' : 'red');
const cause = (f: { dimension: string; check: string }) => `${f.dimension}: ${f.check.replace(/ #\d+/g, '').replace(/\(main.*$/, '').replace(/"[^"]*"/g, '"…"').trim().slice(0, 90)}`;

export function summary(routes: readonly ReportRoute[]): string {
	const counts = new Map<string, number>();
	const causes = new Map<string, number>();
	const rows: string[] = [];
	for (const r of [...routes].sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0))) {
		const s = state(r);
		counts.set(s, (counts.get(s) ?? 0) + 1);
		const open = (r.failures ?? []).filter((f) => !f.accepted);
		const mine = new Map<string, number>();
		for (const f of open) mine.set(cause(f), (mine.get(cause(f)) ?? 0) + 1);
		for (const k of mine.keys()) causes.set(k, (causes.get(k) ?? 0) + 1);
		const leading = s === 'red' ? [...mine].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join('; ') : (r.infrastructure?.message ?? '');
		rows.push(`| \`${r.route}\`${r.role ? ` as ${r.role}` : ''} | ${s} | ${leading.replace(/\|/g, '/')} |`);
	}
	const order = ['green', 'red', 'not ported', 'blocked', 'not checked'];
	return [
		`${order.filter((s) => counts.get(s)).map((s) => `${counts.get(s)} ${s}`).join(', ')}, of ${routes.length}`,
		'',
		'| Routes | Cause |',
		'|---:|---|',
		...[...causes].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `| ${v} | ${k.replace(/\|/g, '/')} |`),
		'',
		'<details><summary>Every route</summary>',
		'',
		'| Route | Result | Leading causes |',
		'|---|---|---|',
		...rows,
		'',
		'</details>',
		'',
	].join('\n');
}

async function main(): Promise<void> {
	const [command, a, b, c] = process.argv.slice(2);
	if (command === 'split' && a && b && c) {
		const shards = split(JSON.parse(await readFile(a, 'utf8')) as Targets, Number(b));
		await mkdir(c, { recursive: true });
		for (const [i, shard] of shards.entries()) await writeFile(join(c, `shard-${i + 1}.json`), `${JSON.stringify(shard)}\n`);
		console.log(JSON.stringify(shards.map((_, i) => i + 1)));
		return;
	}
	if (command === 'merge' && a && b) {
		const routes: ReportRoute[] = [];
		const reported = new Set<number>();
		const walk = async (dir: string, shard?: number): Promise<void> => {
			for (const entry of await readdir(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) await walk(path, shard ?? (/^check-(\d+)$/.exec(entry.name) ? Number(entry.name.slice(6)) : undefined));
				else if (entry.name === 'report.json') {
					routes.push(...((JSON.parse(await readFile(path, 'utf8')) as { routes: ReportRoute[] }).routes ?? []));
					if (shard !== undefined) reported.add(shard);
				}
			}
		};
		await walk(a);
		if (c) {
			const shards = new Map<number, Targets>();
			for (const name of await readdir(c)) {
				const n = /^shard-(\d+)\.json$/.exec(name)?.[1];
				if (n) shards.set(Number(n), JSON.parse(await readFile(join(c, name), 'utf8')) as Targets);
			}
			routes.push(...unreported(shards, reported));
		}
		await mkdir(b, { recursive: true });
		await writeFile(join(b, 'report.json'), `${JSON.stringify({ routes }, null, '\t')}\n`);
		const text = summary(routes);
		await writeFile(join(b, 'summary.md'), text);
		console.log(text.split('\n')[0]);
		return;
	}
	if (command === 'representatives' && a && b && c) {
		const { groupTemplates } = await import('../src/check/templates.ts');
		const { defaultEnv } = await import('../src/check/browser.ts');
		const targets = JSON.parse(await readFile(a, 'utf8')) as Targets;
		const groups = await groupTemplates(defaultEnv(b), targets.routes);
		const chosen = new Set(groups.map((g) => g.representative));
		await writeFile(c, `${JSON.stringify({ routes: targets.routes.filter((r) => chosen.has(r)), endpoints: [], redirects: [], unchecked: [] }, null, '\t')}\n`);
		console.log(`${chosen.size} representatives of ${targets.routes.length} pages`);
		return;
	}
	console.error('usage: check-shards.ts split <targets.json> <n> <dir> | merge <reports dir> <out dir> [<shard files dir>] | representatives <targets.json> <old origin> <out.json>');
	process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

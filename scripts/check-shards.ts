// The check workflow's two ends: `split <targets.json> <n> <dir>` deals a --write-targets file into n shard files and
// prints the matrix; `merge <dir of report.json files> <out dir> [<shard files dir>]` joins the shards' reports into one
// report.json and a markdown summary (counts, leading causes, every route); `representatives <targets.json> <old origin>
// <out.json>` writes the pages check's template grouping measures page load on, one per group of the whole site;
// `combine <out dir> --part <targets.json> <dir>... [--part ...]` joins runs that each checked part of every route (the
// routes without page load, page load on the representatives) into one result per route.
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

const targetsOf = (t: Targets) => [...t.routes, ...(t.endpoints ?? []), ...(t.redirects ?? [])];

/** Every target of a shard that wrote no report (its job timed out, was cancelled or failed), or that its report leaves out, as not checked. */
export function unreported(shards: ReadonlyMap<number, Targets>, reported: ReadonlyMap<number, ReadonlySet<string>>): ReportRoute[] {
	return [...shards].flatMap(([n, t]) => {
		const got = reported.get(n);
		const message = got ? `shard ${n}'s report has no result for this route, so it was not checked` : `shard ${n} wrote no report (its job timed out, was cancelled or failed), so this route was not checked`;
		return targetsOf(t).filter((route) => !got?.has(route)).map((route) => ({ route, ok: false, infrastructure: { cause: 'shard not finished', message } }));
	});
}

/** One result per route from runs that each checked a part of it: green only when every part is, and a route a part's targets name but its reports lack is not checked. */
export function combine(parts: readonly { readonly name: string; readonly targets: Targets; readonly routes: readonly ReportRoute[] }[]): ReportRoute[] {
	const joined = new Map<string, ReportRoute>();
	const add = (r: ReportRoute) => {
		const key = `${r.route}\0${r.role ?? ''}`;
		const was = joined.get(key);
		joined.set(key, was ? { ...was, ok: was.ok && r.ok, blocked: was.blocked ?? r.blocked, infrastructure: was.infrastructure ?? r.infrastructure, notPorted: was.notPorted ?? r.notPorted, failures: [...(was.failures ?? []), ...(r.failures ?? [])] } : r);
	};
	for (const part of parts) {
		const got = new Set(part.routes.map((r) => r.route));
		for (const r of part.routes) add(r);
		for (const route of targetsOf(part.targets)) if (!got.has(route)) add({ route, ok: false, infrastructure: { cause: 'not measured', message: `${part.name} has no result for this route, so it was not checked` } });
	}
	return [...joined.values()];
}

/** Every report.json under a directory, leaving out a merged one. */
async function reports(dir: string): Promise<{ path: string; routes: ReportRoute[] }[]> {
	const out: { path: string; routes: ReportRoute[] }[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'check-merged') out.push(...(await reports(path)));
		} else if (entry.name === 'report.json') out.push({ path, routes: (JSON.parse(await readFile(path, 'utf8')) as { routes?: ReportRoute[] }).routes ?? [] });
	}
	return out;
}

async function write(dir: string, routes: readonly ReportRoute[]): Promise<void> {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'report.json'), `${JSON.stringify({ routes }, null, '\t')}\n`);
	const text = summary(routes);
	await writeFile(join(dir, 'summary.md'), text);
	console.log(text.split('\n')[0]);
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
		const reported = new Map<number, Set<string>>();
		for (const { path, routes: got } of await reports(a)) {
			routes.push(...got);
			const shard = /(?:^|\/)check-(\d+)\//.exec(path)?.[1];
			if (shard) reported.set(Number(shard), new Set([...(reported.get(Number(shard)) ?? []), ...got.map((r) => r.route)]));
		}
		if (c) {
			const shards = new Map<number, Targets>();
			for (const name of await readdir(c)) {
				const n = /^shard-(\d+)\.json$/.exec(name)?.[1];
				if (n) shards.set(Number(n), JSON.parse(await readFile(join(c, name), 'utf8')) as Targets);
			}
			routes.push(...unreported(shards, reported));
		}
		await write(b, routes);
		return;
	}
	if (command === 'combine' && a) {
		const parts: { name: string; targets: Targets; routes: ReportRoute[] }[] = [];
		const args = process.argv.slice(4);
		for (let i = 0; i < args.length; i++) {
			if (args[i] !== '--part' || !args[i + 1]) throw new Error(`combine: expected --part <targets.json> <dir>..., got ${args[i]}`);
			const targetsPath = args[++i]!;
			const part = { name: `the run(s) for ${targetsPath}`, targets: JSON.parse(await readFile(targetsPath, 'utf8')) as Targets, routes: [] as ReportRoute[] };
			while (args[i + 1] && args[i + 1] !== '--part') for (const r of await reports(args[++i]!)) part.routes.push(...r.routes);
			parts.push(part);
		}
		if (!parts.length) throw new Error('combine: no --part given');
		await write(a, combine(parts));
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
	console.error('usage: check-shards.ts split <targets.json> <n> <dir> | merge <reports dir> <out dir> [<shard files dir>] | representatives <targets.json> <old origin> <out.json> | combine <out dir> --part <targets.json> <reports dir>... [--part ...]');
	process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

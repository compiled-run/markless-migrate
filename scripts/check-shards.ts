// The check workflow's two ends: `split <targets.json> <n> <dir>` deals a --write-targets file into n shard files and
// prints the matrix; `merge <dir of report.json files> <out dir> [<shard files dir>]` joins the shards' reports into one
// report.json and a markdown summary (counts, leading causes, every route); `representatives <targets.json> <old origin>
// <out.json>` writes the pages check's template grouping measures page load on, one per group of the whole site;
// `combine <out dir> --part <targets.json> <dir>... [--part ...]` joins runs that each checked part of every route (the
// routes without page load, page load on the representatives) into one result per route; `keep <dir> <out dir>` joins the
// results the shards kept for reuse (check --reuse), dropping any checked more than 30 days ago.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { entryTag, IN_USE } from '../src/check/cache-names.ts';

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
	readonly reused?: { readonly checkedAt: string };
}

/**
 * The targets in `n` shards. With `costs` (each route's time in an earlier run), the longest route goes first to the shard with
 * the least time so far, so no runner is left with the slow pages; a route the earlier run did not time counts as its median.
 * Without, routes are dealt in turn, so pages from one section (and their cost) spread over every runner.
 */
export function split(targets: Targets, n: number, costs?: ReadonlyMap<string, number>): Targets[] {
	const shards = Array.from({ length: n }, () => ({ routes: [] as string[], endpoints: [] as string[], redirects: [] as string[], unchecked: [] as unknown[] }));
	const known = targets.routes.map((r) => costs?.get(r)).filter((ms): ms is number => ms !== undefined).sort((x, y) => x - y);
	// Times for under half the routes (another site's report, or a run of a few) would pack by guesses.
	if (known.length && known.length * 2 >= targets.routes.length) {
		const median = known[known.length >> 1]!;
		const cost = (r: string) => costs!.get(r) ?? median;
		const load = new Array<number>(n).fill(0);
		for (const r of [...targets.routes].sort((x, y) => cost(y) - cost(x) || (x < y ? -1 : 1))) {
			const at = load.indexOf(Math.min(...load));
			shards[at]!.routes.push(r);
			load[at]! += cost(r);
		}
	} else targets.routes.forEach((r, i) => shards[i % n]!.routes.push(r));
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

/** Routes the run did not check to the end: not checked at all, or stopped at --timeout part way. Any of them makes the run red. */
/** Each route's check time in a merged report, for `split`. */
export const costsOf = (routes: readonly (ReportRoute & { readonly timing?: { readonly ms: number } })[]): Map<string, number> => new Map(routes.flatMap((r) => (r.timing ? [[r.route, r.timing.ms] as const] : [])));

/** Every old-side cache entry under `from` (`.migrate/cache/old` and `.migrate/slow-network` of each shard, and earlier joined ones) copied into `to`. Entries are named by what they hold, so one name is one entry wherever it came from. */
export async function joinOld(from: string, to: string): Promise<number> {
	let n = 0;
	for (const entry of await readdir(from, { recursive: true, withFileTypes: true })) {
		const kind = /(^|\/)(cache\/old|slow-network)$/.exec(entry.parentPath)?.[2];
		if (!entry.isFile() || !kind || entry.name.endsWith('.tmp')) continue;
		await mkdir(join(to, kind), { recursive: true });
		await copyFile(join(entry.parentPath, entry.name), join(to, kind, entry.name));
		n++;
	}
	return n;
}

/**
 * Drops from a joined old-side cache the entries of checker versions and old builds no shard of this run used: they can
 * never be read again, and would otherwise grow the cache with every build. A run whose shards used none prunes nothing.
 */
export async function pruneOld(shards: string, joined: string): Promise<number> {
	const used = new Set<string>();
	for (const entry of await readdir(shards, { recursive: true, withFileTypes: true }).catch(() => [])) {
		if (entry.isFile() && /(^|\/)cache\/old$/.test(entry.parentPath) && entry.name.startsWith(IN_USE)) used.add(entryTag(entry.name)!);
	}
	if (!used.size) return 0;
	let dropped = 0;
	const dir = join(joined, 'cache/old');
	for (const name of await readdir(dir).catch(() => [])) {
		const tag = entryTag(name);
		if (used.has(tag ?? '')) continue;
		await rm(join(dir, name), { force: true });
		if (name.endsWith('.bin')) dropped++;
	}
	return dropped;
}

/**
 * What each shard said it kept against what its artifact holds: a shard whose log says it kept N results for later runs, or
 * recorded old pages not cached yet, but whose artifact has no such entries lost them on the way (an upload that left them out).
 */
export async function lostUploads(dir: string): Promise<string[]> {
	const lost: string[] = [];
	for (const shard of (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && /^check-\d+$/.test(e.name))) {
		const files = await readdir(join(dir, shard.name), { recursive: true, withFileTypes: true });
		const log = files.find((f) => f.isFile() && f.name === 'check.txt');
		if (!log) continue;
		const text = await readFile(join(log.parentPath, log.name), 'utf8');
		const count = (re: RegExp) => files.filter((f) => f.isFile() && re.test(f.parentPath)).length;
		const kept = Number(/--reuse: kept (\d+) results/.exec(text)?.[1] ?? 0);
		const cached = Number(/Old side from the cache[^\n]*?(\d+) not cached yet/.exec(text)?.[1] ?? 0);
		if (kept && !count(/\.migrate\/reuse$/)) lost.push(`${shard.name} kept ${kept} results for later runs, but its artifact has none`);
		if (cached && !count(/\.migrate\/cache\/old$/)) lost.push(`${shard.name} recorded ${cached} old pages not cached before, but its artifact has no old-side entries`);
	}
	return lost;
}

export const unfinished = (routes: readonly ReportRoute[]): ReportRoute[] => routes.filter((r) => (r.infrastructure && !r.blocked) || r.failures?.some((f) => f.check === 'the check of this route'));

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
		rows.push(`| \`${r.route}\`${r.role ? ` as ${r.role}` : ''} | ${s}${r.reused ? `, reused from ${r.reused.checkedAt.slice(0, 10)}` : ''} | ${leading.replace(/\|/g, '/')} |`);
	}
	const order = ['green', 'red', 'not ported', 'blocked', 'not checked'];
	const reused = routes.filter((r) => r.reused).length;
	const left = unfinished(routes).length;
	return [
		`${order.filter((s) => counts.get(s)).map((s) => `${counts.get(s)} ${s}`).join(', ')}, of ${routes.length}${reused ? `; ${reused} reused, their HTML and code unchanged since their last check` : ''}`,
		'',
		...(left ? [`**${left} of ${routes.length} routes were not checked to the end (not checked, or incomplete at --timeout), so this run is red.**`, ''] : []),
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

/** Copies every kept result under `from` (in a `.migrate/reuse` folder) into `to`, except those checked over `days` days before `now`. */
export async function joinKept(from: string, to: string, now: Date, days = 30): Promise<number> {
	await mkdir(to, { recursive: true });
	// An entry several folders keep (a shard recorded it again) is the one recorded last.
	const newest = new Map<string, { path: string; at: number }>();
	for (const entry of await readdir(from, { recursive: true, withFileTypes: true })) {
		const dir = entry.parentPath;
		if (!entry.isFile() || !entry.name.endsWith('.json') || !/(^|\/)\.migrate\/reuse$/.test(dir)) continue;
		const path = join(dir, entry.name);
		const { checkedAt } = JSON.parse(await readFile(path, 'utf8')) as { checkedAt?: string };
		const at = checkedAt ? Date.parse(checkedAt) : NaN;
		if (!(now.getTime() - at <= days * 86_400_000)) continue;
		if ((newest.get(entry.name)?.at ?? -Infinity) < at) newest.set(entry.name, { path, at });
	}
	for (const [name, { path }] of newest) await copyFile(path, join(to, name));
	return newest.size;
}

async function main(): Promise<void> {
	const [command, a, b, c, d] = process.argv.slice(2);
	if (command === 'split' && a && b && c) {
		const earlier = d ? await readFile(d, 'utf8').catch(() => undefined) : undefined;
		const costs = earlier ? costsOf((JSON.parse(earlier) as { routes?: ReportRoute[] }).routes ?? []) : undefined;
		const shards = split(JSON.parse(await readFile(a, 'utf8')) as Targets, Number(b), costs);
		if (costs?.size) console.error(`shards packed by ${costs.size} routes' times in ${d}`);
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
	if (command === 'uploaded' && a) {
		const lost = await lostUploads(a);
		for (const l of lost) console.log(l);
		if (lost.length) process.exit(1);
		console.log('every shard uploaded what it kept');
		return;
	}
	if (command === 'join-old' && a && b) {
		console.log(`${await joinOld(a, b)} old-side entries`);
		return;
	}
	if (command === 'prune-old' && a && b) {
		console.log(`${await pruneOld(a, b)} old-side entries of other checker versions or old builds dropped`);
		return;
	}
	if (command === 'gate' && a) {
		const { routes } = JSON.parse(await readFile(join(a, 'report.json'), 'utf8')) as { routes: ReportRoute[] };
		const left = unfinished(routes);
		for (const r of left) console.log(`${r.route}${r.role ? ` as ${r.role}` : ''}: ${r.infrastructure?.message ?? 'incomplete at --timeout'}`);
		console.log(`${left.length} of ${routes.length} routes not checked to the end`);
		if (left.length) process.exit(1);
		return;
	}
	if (command === 'keep' && a && b) {
		console.log(`${await joinKept(a, b, new Date())} kept results`);
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
	console.error('usage: check-shards.ts split <targets.json> <n> <dir> [<earlier report.json>] | merge <reports dir> <out dir> [<shard files dir>] | representatives <targets.json> <old origin> <out.json> | combine <out dir> --part <targets.json> <reports dir>... [--part ...] | keep <shards dir> <out dir> | gate <merged dir> | join-old <dir> <out dir> | prune-old <shards dir> <joined dir> | uploaded <shards dir>');
	process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

// The check workflow's two ends: `split <targets.json> <n> <dir>` deals a --write-targets file into n shard files and
// prints the matrix; `merge <dir of report.json files> <out dir> [<shard files dir>]` joins the shards' reports into one
// report.json and a markdown summary (counts, leading causes, every route); `representatives <targets.json> <old origin>
// <out.json>` writes the pages check's template grouping measures page load on, one per group of the whole site;
// `combine <out dir> --part <targets.json> <dir>... [--part ...]` joins runs that each checked part of every route (the
// routes without page load, page load on the representatives) into one result per route; `keep <dir> <out dir>` joins the
// results the shards kept for reuse (check --reuse), dropping any checked more than 30 days ago; `times <.migrate dir>
// <out.json>` writes a shard's route times, however it ended, for a later run's `split`. The merged summary also tells the
// original served, the old-side store's counts and the runner time of each part of the check.
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { routeState } from '../src/check/route-state.ts';

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
	// Times for under a quarter of the routes (another site's report, or a run of a few) would pack by guesses; full runs stopped
	// at the step cap time about half of shadcn's 605.
	if (known.length && known.length * 4 >= targets.routes.length) {
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
export async function reports(dir: string): Promise<{ path: string; routes: ReportRoute[] }[]> {
	const out: { path: string; routes: ReportRoute[] }[] = [];
	const entries = await readdir(dir, { withFileTypes: true });
	const hasReport = entries.some((e) => e.isFile() && e.name === 'report.json');
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			// A shard stopped before its report (its time ran out, it was cancelled) still has each finished route's result.
			if (entry.name === 'check-progress') {
				if (!hasReport) out.push(...(await finished(path)));
			} else if (entry.name !== 'check-merged') out.push(...(await reports(path)));
		} else if (entry.name === 'report.json') out.push({ path, routes: (JSON.parse(await readFile(path, 'utf8')) as { routes?: ReportRoute[] }).routes ?? [] });
	}
	return out;
}

/** The results a check wrote route by route as each finished (.migrate/check-progress), as one report. */
async function finished(dir: string): Promise<{ path: string; routes: ReportRoute[] }[]> {
	const routes: ReportRoute[] = [];
	for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
		const saved = JSON.parse(await readFile(join(entry.parentPath, entry.name), 'utf8')) as { result?: ReportRoute };
		if (saved.result) routes.push(saved.result);
	}
	return routes.length ? [{ path: join(dir, 'report.json'), routes }] : [];
}

async function write(dir: string, routes: readonly ReportRoute[], data?: Datasets): Promise<void> {
	await mkdir(dir, { recursive: true });
	const { phases: parts } = phases(routes);
	await writeFile(join(dir, 'report.json'), `${JSON.stringify({ routes, ...(data ? { datasets: data } : {}), ...(parts.length ? { phases: parts } : {}) }, null, '\t')}\n`);
	const text = summary(routes, data);
	await writeFile(join(dir, 'summary.md'), text);
	console.log(text.split('\n')[0]);
}

type Timed = ReportRoute & { readonly timing?: { readonly ms: number; readonly steps?: readonly { readonly name: string; readonly ms: number }[] } };

/** How long a route took: its timing, or for a route stopped at its deadline, the deadline (it took at least that). */
function routeMs(r: Timed): number | undefined {
	if (r.timing) return r.timing.ms;
	const said = [r.infrastructure?.message, ...(r.failures ?? []).filter((f) => f.check === 'the check of this route').map((f) => (f as { actual?: string }).actual)];
	const s = said.map((m) => /timed out after (\d+) s/.exec(m ?? '')?.[1]).find(Boolean);
	return s ? Number(s) * 1000 : undefined;
}

/** Each route's check time in earlier runs' reports, newest run first: a route's newest time stands, however its run ended. */
export function costsOf(...newestFirst: readonly (readonly Timed[])[]): Map<string, number> {
	const costs = new Map<string, number>();
	for (const routes of newestFirst)
		for (const r of routes) {
			const ms = costs.has(r.route) ? undefined : routeMs(r);
			if (ms !== undefined) costs.set(r.route, ms);
		}
	return costs;
}

/** Each route's time in a shard's .migrate folder (its report, or the progress files of a shard stopped before one), as a report of routes and timings only. */
export async function routeTimes(dir: string): Promise<{ route: string; timing?: { ms: number }; infrastructure?: { message?: string } }[]> {
	const out: { route: string; timing?: { ms: number }; infrastructure?: { message?: string } }[] = [];
	for (const { routes } of await reports(dir)) {
		for (const r of routes as Timed[]) {
			const ms = routeMs(r);
			if (ms === undefined) continue;
			out.push(r.timing ? { route: r.route, timing: { ms } } : { route: r.route, infrastructure: { message: `timed out after ${ms / 1000} s` } });
		}
	}
	return out;
}

export interface Phase {
	readonly name: string;
	readonly ms: number;
	readonly routes: number;
}

/** Every route's time per part of its check, summed over the routes that finished. Parts can run at once, so shares can add up past 100%. */
export function phases(routes: readonly ReportRoute[]): { phases: Phase[]; routeMs: number; timed: number } {
	const by = new Map<string, { ms: number; routes: Set<string> }>();
	let routeMs = 0;
	let timed = 0;
	for (const r of routes as Timed[]) {
		if (!r.timing) continue;
		timed++;
		routeMs += r.timing.ms;
		for (const step of r.timing.steps ?? []) {
			const p = by.get(step.name) ?? by.set(step.name, { ms: 0, routes: new Set() }).get(step.name)!;
			p.ms += step.ms;
			p.routes.add(`${r.route}\0${r.role ?? ''}`);
		}
	}
	return { phases: [...by].map(([name, p]) => ({ name, ms: p.ms, routes: p.routes.size })).sort((a, b) => b.ms - a.ms || (a.name < b.name ? -1 : 1)), routeMs, timed };
}

export type StoreCounts = Record<'hit' | 'miss' | 'changed' | 'stale-checker', number>;

export interface Datasets {
	/** The original every shard served, by its originalId. */
	readonly original?: string;
	readonly shards: { readonly reported: number; readonly progressOnly: number };
	/** The old-side store's entries over the shards that wrote a report (a shard stopped before its report has no counts). */
	readonly store?: StoreCounts & { readonly shards: number };
}

/** What each shard's report says it read: the old-side store's counts, and how many shards wrote a report or only progress files. */
export async function datasets(dir: string, original?: string): Promise<Datasets> {
	const store: StoreCounts = { hit: 0, miss: 0, changed: 0, 'stale-checker': 0 };
	let counted = 0;
	let reported = 0;
	let progressOnly = 0;
	for (const shard of (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && /^check-\d+$/.test(e.name))) {
		const files = await readdir(join(dir, shard.name), { recursive: true, withFileTypes: true });
		const report = files.find((f) => f.isFile() && f.name === 'report.json');
		if (!report) {
			if (files.some((f) => f.isDirectory() && f.name === 'check-progress')) progressOnly++;
			continue;
		}
		reported++;
		const cache = (JSON.parse(await readFile(join(report.parentPath, report.name), 'utf8')) as { cache?: Partial<StoreCounts> }).cache;
		if (!cache) continue;
		counted++;
		for (const k of Object.keys(store) as (keyof StoreCounts)[]) store[k] += cache[k] ?? 0;
	}
	return { ...(original ? { original } : {}), shards: { reported, progressOnly }, ...(counted ? { store: { ...store, shards: counted } } : {}) };
}

const hours = (ms: number) => (ms / 3_600_000).toFixed(1);

/** The merged summary's account of where the runner time went and what data the run read. */
export function accounts(routes: readonly ReportRoute[], data?: Datasets): string[] {
	const { phases: parts, routeMs, timed } = phases(routes);
	const lines: string[] = [];
	if (data) {
		const store = data.store;
		const asked = store ? store.hit + store.miss + store.changed + store['stale-checker'] : 0;
		lines.push(
			'| Data | Count |',
			'|---|---:|',
			...(data.original ? [`| Original (originalId) | \`${data.original.slice(0, 12)}\` |`] : []),
			`| Shards that wrote a report | ${data.shards.reported} |`,
			`| Shards stopped before their report (results from progress files) | ${data.shards.progressOnly} |`,
			`| Routes with a time | ${timed} of ${routes.length} |`,
			...(store ? [`| Old-side store entries reused (hit) | ${store.hit} of ${asked}, over ${store.shards} shards |`, `| Old-side store entries recorded again: not stored, changed, other checker | ${store.miss}, ${store.changed}, ${store['stale-checker']} |`] : []),
			'',
		);
	}
	if (parts.length)
		lines.push(
			`<details><summary>Time per part of the check: ${hours(routeMs)} runner-hours over ${timed} routes</summary>`,
			'',
			'| Part | Runner-hours | Of route time | Routes |',
			'|---|---:|---:|---:|',
			...parts.map((p) => `| ${p.name.replace(/\|/g, '/')} | ${hours(p.ms)} | ${routeMs ? Math.round((p.ms / routeMs) * 100) : 0}% | ${p.routes} |`),
			'',
			'Parts that run at once (forced states beside journeys) each count their own time, so the shares can add up past 100%.',
			'',
			'</details>',
			'',
		);
	return lines;
}

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

/** Routes the run did not check to the end: not checked at all, or stopped at --timeout part way. Any of them makes the run red. */
export const unfinished = (routes: readonly ReportRoute[]): ReportRoute[] => routes.filter((r) => (r.infrastructure && !r.blocked) || r.failures?.some((f) => f.check === 'the check of this route'));

const state = (r: ReportRoute) => (r.blocked ? 'blocked' : r.infrastructure ? 'not checked' : r.ok ? 'green' : r.notPorted ? 'not ported' : routeState(r) === 'incomplete' ? 'incomplete' : 'red');
const cause = (f: { dimension: string; check: string }) => `${f.dimension}: ${f.check.replace(/ #\d+/g, '').replace(/\(main.*$/, '').replace(/"[^"]*"/g, '"…"').trim().slice(0, 90)}`;

export function summary(routes: readonly ReportRoute[], data?: Datasets): string {
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
	const order = ['green', 'red', 'incomplete', 'not ported', 'blocked', 'not checked'];
	const reused = routes.filter((r) => r.reused).length;
	const left = unfinished(routes).length;
	return [
		`${order.filter((s) => counts.get(s)).map((s) => `${counts.get(s)} ${s}`).join(', ')}, of ${routes.length}${reused ? `; ${reused} reused, their HTML and code unchanged since their last check` : ''}`,
		'',
		...accounts(routes, data),
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
	const [command, a, b, c] = process.argv.slice(2);
	if (command === 'split' && a && b && c) {
		const earlier = (await Promise.all(process.argv.slice(6).map((f) => readFile(f, 'utf8').then((t) => (JSON.parse(t) as { routes?: ReportRoute[] }).routes ?? [], () => [] as ReportRoute[])))).filter((r) => r.length);
		const costs = earlier.length ? costsOf(...earlier) : undefined;
		const shards = split(JSON.parse(await readFile(a, 'utf8')) as Targets, Number(b), costs);
		if (costs?.size) console.error(`shards packed by ${costs.size} routes' times in ${earlier.length} earlier runs`);
		await mkdir(c, { recursive: true });
		for (const [i, shard] of shards.entries()) await writeFile(join(c, `shard-${i + 1}.json`), `${JSON.stringify(shard)}\n`);
		console.log(JSON.stringify(shards.map((_, i) => i + 1)));
		return;
	}
	if (command === 'times' && a && b) {
		const routes = await routeTimes(a);
		await writeFile(b, `${JSON.stringify({ routes })}\n`);
		console.log(`${routes.length} route times`);
		return;
	}
	if (command === 'merge' && a && b) {
		const at = process.argv.indexOf('--original');
		const original = at > 0 ? process.argv[at + 1] : undefined;
		const routes: ReportRoute[] = [];
		const reported = new Map<number, Set<string>>();
		for (const { path, routes: got } of await reports(a)) {
			routes.push(...got);
			const shard = /(?:^|\/)check-(\d+)\//.exec(path)?.[1];
			if (shard) reported.set(Number(shard), new Set([...(reported.get(Number(shard)) ?? []), ...got.map((r) => r.route)]));
		}
		if (c && c !== '--original') {
			const shards = new Map<number, Targets>();
			for (const name of await readdir(c)) {
				const n = /^shard-(\d+)\.json$/.exec(name)?.[1];
				if (n) shards.set(Number(n), JSON.parse(await readFile(join(c, name), 'utf8')) as Targets);
			}
			routes.push(...unreported(shards, reported));
		}
		await write(b, routes, await datasets(a, original || undefined));
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
	console.error('usage: check-shards.ts split <targets.json> <n> <dir> [<earlier report.json>, newest run first...] | times <.migrate dir> <out.json> | merge <reports dir> <out dir> [<shard files dir>] [--original <originalId>] | representatives <targets.json> <old origin> <out.json> | combine <out dir> --part <targets.json> <reports dir>... [--part ...] | keep <shards dir> <out dir> | gate <merged dir> | join-old <dir> <out dir> | uploaded <shards dir>');
	process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

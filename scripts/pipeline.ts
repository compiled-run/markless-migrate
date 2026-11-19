// The pipeline workflow's keys and caches (.github/workflows/pipeline.yml). Every stage keys its work by content, so a
// stage whose inputs are unchanged is read back from the run that made it instead of done again:
//   key plan|emit|emit-base|build ...   one stage's key (see stageKey)
//   record-split <pages.txt> <origin> <store> <n> <out dir> <app> [<captures>]   each page's key; shards of the pages the store lacks a kind of
//   prune <store> <record-keys.json> <app>   drops recordings no current page's visit names at its kind's version
//   copied-parts <app>                  the app's lib/parts files that are copies of parts/ (written beside the converted app)
//   refresh-parts <app> <list>          copies those files from parts/ again (an emit whose only change is in copied parts)
//   receipt <file> <stage> k=v...       appends a stage's receipt (seconds, cache hit, counts)
//   report <receipts dir> <jobs.json>   the run's table: per stage wall time and cache hits, and end to end
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { packByCost } from './probe/pack.ts';

const ROOT = resolve(import.meta.dirname, '..');

// Relative specifiers a module loads: static and dynamic imports, re-exports, and files it opens through import.meta.url.
const SPECIFIERS = /(?:\bimport|\bexport)\s[^'"]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|\bimport\s+['"](\.{1,2}\/[^'"]+)['"]|new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

export function importsOf(source: string): string[] {
	return [...source.matchAll(SPECIFIERS)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]!);
}

/** Every file the entries load through relative specifiers, themselves included. A directory URL (parts/) is the stage's to key. */
export async function codeClosure(entries: readonly string[]): Promise<string[]> {
	const seen = new Set<string>();
	const visit = async (file: string): Promise<void> => {
		if (seen.has(file) || !(await stat(file).then((s) => s.isFile(), () => false))) return;
		seen.add(file);
		if (!/\.[cm]?[jt]sx?$/.test(file)) return;
		for (const spec of importsOf(await readFile(file, 'utf8'))) await visit(resolve(dirname(file), spec));
	};
	for (const entry of entries) await visit(resolve(entry));
	return [...seen].sort();
}

/** Files under a directory, relative and sorted, leaving out what `skip` names (a relative path, or a directory's). */
export async function treeFiles(dir: string, skip: (rel: string) => boolean = () => false): Promise<string[]> {
	const out: string[] = [];
	const walk = async (rel: string): Promise<void> => {
		for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
			const path = rel ? `${rel}/${entry.name}` : entry.name;
			if (skip(path)) continue;
			if (entry.isDirectory()) await walk(path);
			else if (entry.isFile()) out.push(path);
		}
	};
	await walk('');
	return out.sort();
}

export type KeyPart = readonly [name: string, value: string | Uint8Array];

/** One key from named parts, in the order given: a part's name and length go in with it, so no two lists collide. */
export function digest(parts: Iterable<KeyPart>): string {
	const hash = createHash('sha256');
	for (const [name, value] of parts) {
		const bytes = typeof value === 'string' ? Buffer.from(value) : value;
		hash.update(`${name}\0${bytes.length}\0`).update(bytes);
	}
	return hash.digest('hex');
}

/** Each file by its path from `root` and its bytes. */
export async function fileParts(root: string, files: readonly string[], prefix = 'file'): Promise<KeyPart[]> {
	return Promise.all(files.map(async (f) => [`${prefix} ${relative(root, resolve(root, f))}`, await readFile(resolve(root, f))] as const));
}

// A copied part's registry entry depends on this one fact of its source (convert/parts.ts lists only ports that mount).
const MOUNTS = /^export function mount\b/m;

/**
 * parts/ as emit reads it. `full` is every file's bytes. `base` is what emit reads of a file it only copies (its path, and
 * whether it exports mount); a part the converter imports is in the converter's own closure, bytes and all. Two emits with
 * the same base key differ only in the bytes of copied files, which `refresh-parts` copies again.
 */
export async function partsKeys(partsDir: string, converter: ReadonlySet<string>): Promise<{ readonly full: string; readonly base: string }> {
	const files = await treeFiles(partsDir);
	const full: KeyPart[] = [];
	const base: KeyPart[] = [];
	for (const f of files) {
		const bytes = await readFile(join(partsDir, f));
		full.push([`part ${f}`, bytes]);
		base.push([`part ${f}`, converter.has(join(partsDir, f)) ? bytes : MOUNTS.test(bytes.toString('utf8')) ? 'mounts' : 'copied']);
	}
	return { full: digest(full), base: digest(base) };
}

/** The app's lib/parts files with the bytes of the same path under parts/: the ones emit copied. */
export async function copiedParts(app: string, partsDir: string): Promise<string[]> {
	const dir = join(app, 'lib', 'parts');
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const f of await treeFiles(dir)) {
		const from = join(partsDir, f);
		if (existsSync(from) && (await readFile(from)).equals(await readFile(join(dir, f)))) out.push(f);
	}
	return out;
}

/** Copies each listed file from parts/ into the app's lib/parts again; returns how many changed. */
export async function refreshParts(app: string, partsDir: string, list: readonly string[]): Promise<number> {
	let changed = 0;
	for (const f of list) {
		const from = join(partsDir, f);
		const to = join(app, 'lib', 'parts', f);
		if (!existsSync(from)) throw new Error(`refresh-parts: parts/${f} is gone; this change needs a full emit`);
		const bytes = await readFile(from);
		if (existsSync(to) && (await readFile(to)).equals(bytes)) continue;
		await mkdir(dirname(to), { recursive: true });
		await copyFile(from, to);
		changed++;
	}
	return changed;
}

type Visit = { readonly route: string; readonly page: string; readonly kinds: Readonly<Record<string, { readonly version: string; readonly dirs: readonly string[] }>> };

/**
 * A page is in the store when it was last recorded from the page it is now, and every kind it was recorded for is there
 * under that kind's current version. A kind it needs only now, or data a recorder is handed that changed with a kind
 * recorded again, is recorded by whichever convert reads the page next.
 */
export async function recordHits(pages: ReadonlyMap<string, string>, store: string, versions: Readonly<Record<string, string>>, visits: readonly Visit[]): Promise<{ readonly hits: string[]; readonly misses: string[] }> {
	const last = new Map(visits.map((v) => [v.route, v]));
	const hits: string[] = [];
	const misses: string[] = [];
	for (const [route, page] of pages) {
		const visit = last.get(route);
		const kinds = Object.entries(visit?.kinds ?? {});
		const held = !page.startsWith('unreachable-') && visit?.page === page && kinds.length > 0 && kinds.every(([kind, v]) => versions[kind] === v.version && v.dirs.every((d) => existsSync(join(store, kind, d))));
		(held ? hits : misses).push(route);
	}
	return { hits, misses };
}

/** The recording directories the current pages' visits name, at each kind's current version (`<kind>/<key>`): what prune keeps. */
export function storeKeeps(pages: ReadonlyMap<string, string>, versions: Readonly<Record<string, string>>, visits: readonly Visit[]): Set<string> {
	const keep = new Set<string>();
	for (const v of visits) if (pages.get(v.route) === v.page) for (const [kind, k] of Object.entries(v.kinds)) if (versions[kind] === k.version) for (const d of k.dirs) keep.add(`${kind}/${d}`);
	return keep;
}

/** Drops every recording under a kind's folder that `keep` does not name, and the visits of routes not in `pages`. */
export async function pruneStore(store: string, kinds: readonly string[], keep: ReadonlySet<string>, pages: ReadonlyMap<string, string>, visitFile: (route: string) => string): Promise<{ readonly kept: number; readonly dropped: number }> {
	let kept = 0;
	let dropped = 0;
	if (!existsSync(store)) return { kept, dropped };
	for (const kind of kinds) {
		for (const entry of await readdir(join(store, kind)).catch(() => [] as string[])) {
			if (keep.has(`${kind}/${entry}`)) kept++;
			else {
				await rm(join(store, kind, entry), { recursive: true, force: true });
				dropped++;
			}
		}
	}
	const current = new Set([...pages.keys()].map(visitFile));
	for (const name of await readdir(join(store, 'visits')).catch(() => [] as string[])) if (!current.has(name)) await rm(join(store, 'visits', name), { force: true });
	return { kept, dropped };
}

/**
 * Pages packed into at most n shards, none of them empty: longest first onto the least loaded shard, by what each page's
 * capture last cost (one not measured counts as the median; with none measured, dealt in turn).
 */
export function deal(items: readonly string[], n: number, costs: ReadonlyMap<string, number> = new Map()): string[][] {
	return items.length ? packByCost(items, costs, Math.max(1, Math.min(n, items.length))).filter((s) => s.length) : [];
}

/** What each page's capture cost on the run that last captured it: the files convert --capture-only writes under costs/. */
export async function captureCosts(store: string): Promise<Map<string, number>> {
	const costs = new Map<string, number>();
	for (const name of await readdir(join(store, 'costs')).catch(() => [] as string[])) {
		const cost = await readFile(join(store, 'costs', name), 'utf8').then((t) => JSON.parse(t) as { route?: unknown; seconds?: unknown }).catch(() => undefined);
		if (typeof cost?.route === 'string' && typeof cost.seconds === 'number') costs.set(cost.route, cost.seconds);
	}
	return costs;
}

export interface Receipt {
	readonly stage: string;
	readonly seconds?: number;
	readonly hit?: string;
	readonly [k: string]: string | number | undefined;
}

export interface Job {
	readonly name: string;
	readonly conclusion: string | null;
	readonly started_at: string | null;
	readonly completed_at: string | null;
}

// The workflow's jobs in stage order, by the name each matrix job starts with.
export const STAGES: readonly (readonly [stage: string, prefix: string])[] = [
	['keys and plan', 'prepare'],
	['capture', 'capture'],
	['emit', 'emit'],
	['build', 'build'],
	['check select', 'check-select'],
	['check', 'check /'],
	['deploy', 'deploy'],
];

const at = (s: string | null) => (s ? Date.parse(s) : NaN);
const mmss = (ms: number) => (Number.isFinite(ms) ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '–');

/** Per stage: its jobs' wall time (first start to last end), runner time, and what its receipts say; then end to end. */
export function report(receipts: readonly Receipt[], jobs: readonly Job[]): string {
	const rows: string[] = [];
	let first = Infinity;
	let last = -Infinity;
	for (const [stage, prefix] of STAGES) {
		const mine = jobs.filter((j) => j.name === prefix || j.name.startsWith(`${prefix} `) || j.name.startsWith(`${prefix} (`) || (prefix.endsWith('/') && j.name.startsWith(prefix)));
		const ran = mine.filter((j) => j.conclusion !== 'skipped' && j.started_at && j.completed_at);
		const start = Math.min(...ran.map((j) => at(j.started_at)));
		const end = Math.max(...ran.map((j) => at(j.completed_at)));
		if (ran.length) {
			first = Math.min(first, start);
			last = Math.max(last, end);
		}
		const runner = ran.reduce((sum, j) => sum + at(j.completed_at) - at(j.started_at), 0);
		const notes = receipts
			.filter((r) => r.stage === stage)
			.map((r) =>
				Object.entries(r)
					.filter(([k, v]) => k !== 'stage' && v !== undefined && v !== '')
					.map(([k, v]) => `${k} ${v}`)
					.join(', '),
			)
			.filter(Boolean);
		const state = !mine.length ? 'not in this run' : !ran.length ? 'skipped' : [...new Set(ran.map((j) => j.conclusion ?? 'running'))].join('/');
		rows.push(`| ${stage} | ${ran.length ? mmss(end - start) : '–'} | ${ran.length > 1 ? `${ran.length} jobs, ${mmss(runner)}` : ran.length ? mmss(runner) : '–'} | ${state} | ${notes.join('; ').replace(/\|/g, '/')} |`);
	}
	return [`End to end: ${Number.isFinite(first) ? mmss(last - first) : '–'} (first job start to last job end)`, '', '| Stage | Wall | Runner time | Result | Receipts |', '|---|---:|---:|---|---|', ...rows, ''].join('\n');
}

/** What `plan` runs: the command (src/cli.ts only hands it its arguments) and the usage scan convert.sh runs when plan wrote none. */
export const PLAN_ENTRIES = ['src/plan/command.ts', 'src/usage/index.ts'];

const STAGE_KEYS = ['plan', 'emit', 'emit-base', 'build'] as const;
type Stage = (typeof STAGE_KEYS)[number];

/**
 * A stage's key from the files and values it reads. The app's checked-in files, the pinned old site (fetch-old.sh, its old-fixtures.json and samples.json) and
 * the code of the commands each stage runs (their import closures, cli.ts itself included) go into every key that reads them.
 */
export async function stageKey(stage: Stage, o: { readonly site: string; readonly app: string; readonly values: Readonly<Record<string, string>>; readonly files?: readonly string[] }): Promise<string> {
	const parts: KeyPart[] = [['stage', stage], ...Object.entries(o.values).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [`value ${k}`, v] as const)];
	const add = async (files: readonly string[], prefix: string) => parts.push(...(await fileParts(ROOT, files, prefix)));
	const pinned = [join(ROOT, 'deploy', o.site, 'fetch-old.sh'), join(ROOT, 'deploy', o.site, 'old-fixtures.json'), join(ROOT, o.app, 'scripts', 'convert.sh'), join(ROOT, 'src', 'cli.ts')].filter((f) => existsSync(f));
	if (stage === 'plan') {
		await add(pinned.slice(0, 2), 'pinned');
		await add([join(ROOT, 'deploy', o.site, 'samples.json')].filter((f) => existsSync(f)), 'pinned');
		await add(await codeClosure(PLAN_ENTRIES.map((f) => join(ROOT, f))), 'code');
	} else if (stage === 'emit' || stage === 'emit-base') {
		await add(pinned, 'pinned');
		// What convert.sh runs into the app: the convert, the handler ledger it writes after the pages, and the cache rules.
		const converter = await codeClosure([join(ROOT, 'src/convert/index.ts'), join(ROOT, 'src/ledger/index.ts'), join(ROOT, 'src/cache/cli.ts')]);
		await add(converter, 'code');
		const keys = await partsKeys(join(ROOT, 'parts'), new Set(converter));
		parts.push(['parts', stage === 'emit' ? keys.full : keys.base]);
		const tracked = (o.files ?? []).map((f) => join(ROOT, f));
		await add(tracked, 'app');
	} else {
		// The converted app as built: everything but what the install, the recordings and the build itself write.
		const app = join(ROOT, o.app);
		const skip = (rel: string) => /^(node_modules|\.vercel|\.output|\.nitro|dist|\.migrate\/(convert|reuse|cache|slow-network|check-progress)|\.migrate\/shots)(\/|$)/.test(rel) || /(^|\/)node_modules(\/|$)/.test(rel);
		parts.push(...(await fileParts(app, await treeFiles(app, skip), 'app')));
		await add([join(ROOT, o.app, 'scripts', 'link-markless.sh'), join(ROOT, o.app, 'scripts', 'link-markless.mjs')].filter((f) => existsSync(f)), 'pinned');
		await add(await codeClosure([join(ROOT, 'src/cache/cli.ts')]), 'code');
	}
	return digest(parts);
}

function args(list: readonly string[]): { readonly positional: string[]; readonly values: Record<string, string> } {
	const positional: string[] = [];
	const values: Record<string, string> = {};
	for (const a of list) {
		const m = /^([\w-]+)=(.*)$/s.exec(a);
		if (m) values[m[1]!] = m[2]!;
		else positional.push(a);
	}
	return { positional, values };
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);
	if (command === 'key') {
		// key <stage> <site> <app> [<file of app files>] [name=value ...]
		const { positional, values } = args(rest);
		const [stage, site, app, list] = positional;
		if (!STAGE_KEYS.includes(stage as Stage) || !site || !app) throw new Error(`usage: pipeline.ts key ${STAGE_KEYS.join('|')} <site> <app> [<file list>] [name=value...]`);
		const files = list ? (await readFile(list, 'utf8')).split('\n').filter(Boolean) : undefined;
		console.log((await stageKey(stage as Stage, { site, app, values, ...(files ? { files } : {}) })).slice(0, 32));
		return;
	}
	if (command === 'record-split') {
		const [pages, origin, store, n, out, app, from] = rest;
		if (!pages || !origin || !store || !n || !out || !app) throw new Error('usage: pipeline.ts record-split <pages.txt> <origin> <store> <n> <out dir> <app> [<captures of an earlier run>]');
		const routes = (await readFile(pages, 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean);
		const keys = new Map<string, string>();
		let keyed = false;
		let versions: Record<string, string> = {};
		let readVisits: (store: string) => Promise<Visit[]> = async () => [];
		try {
			const recording = (await import('../src/convert/record-key.ts' as string)) as { fetchPageKey: (origin: string, route: string) => Promise<string>; recordingVersions: (app: string) => Promise<Record<string, { version: string; problems: readonly string[] }>>; readVisits: (store: string) => Promise<Visit[]> };
			const found = await recording.recordingVersions(app);
			for (const [kind, v] of Object.entries(found)) if (v.problems.length) console.error(`record-split: the ${kind} recordings are never read back: ${v.problems.join('; ')}`);
			versions = Object.fromEntries(Object.entries(found).map(([kind, v]) => [kind, v.version]));
			readVisits = recording.readVisits;
			const queue = [...routes];
			await Promise.all(
				Array.from({ length: 8 }, async () => {
					for (let r = queue.shift(); r !== undefined; r = queue.shift()) keys.set(r, await recording.fetchPageKey(origin, r));
				}),
			);
			keyed = true;
		} catch (error) {
			if ((error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw error;
			for (const r of routes) keys.set(r, `unreachable-${createHash('sha256').update(r).digest('hex').slice(0, 8)}`);
		}
		// A run's own captures, made by its shards before this run took them over: each route keeps the page it was recorded from.
		let taken = 0;
		if (from) for (const v of await readVisits(from)) if (keys.has(v.route) && keys.get(v.route) !== v.page) (keys.set(v.route, v.page), taken++);
		const ordered = new Map(routes.map((r) => [r, keys.get(r)!]));
		const visits = await readVisits(store);
		const { hits, misses } = await recordHits(ordered, store, versions, visits);
		// Of the pages to record, why: a page never recorded or changed records every kind; otherwise the kinds whose code changed.
		const last = new Map(visits.map((v) => [v.route, v]));
		const why: Record<string, number> = {};
		for (const route of misses) {
			const v = last.get(route);
			const stale = v && v.page === ordered.get(route) ? Object.entries(v.kinds).filter(([kind, k]) => versions[kind] !== k.version || !k.dirs.every((d) => existsSync(join(store, kind, d)))).map(([kind]) => kind) : ['page'];
			for (const kind of stale) why[kind] = (why[kind] ?? 0) + 1;
		}
		const shards = deal(misses, Number(n), await captureCosts(store));
		await mkdir(join(out, 'shards'), { recursive: true });
		for (const [i, shard] of shards.entries()) await writeFile(join(out, 'shards', `shard-${i + 1}.txt`), `${shard.join('\n')}\n`);
		await writeFile(join(out, 'record-keys.json'), `${JSON.stringify(Object.fromEntries(ordered), null, 1)}\n`);
		await writeFile(join(out, 'misses.txt'), misses.length ? `${misses.join('\n')}\n` : '');
		console.log(JSON.stringify({ matrix: shards.map((_, i) => i + 1), pages: routes.length, hits: hits.length, misses: misses.length, stale: why, keyed, ...(from ? { recordedKeys: taken } : {}), keys: digest([...[...ordered].map(([r, k]) => [r, k] as const), ...Object.entries(versions).map(([kind, v]) => [`recorder ${kind}`, v] as const)]).slice(0, 32) }));
		return;
	}
	if (command === 'prune') {
		const [store, keysFile, app] = rest;
		if (!store || !keysFile || !app) throw new Error('usage: pipeline.ts prune <store> <record-keys.json> <app>');
		const recording = (await import('../src/convert/record-key.ts' as string)) as { recorderVersions: (app: string) => Promise<Record<string, string>>; readVisits: (store: string) => Promise<Visit[]>; visitFile: (route: string) => string };
		const versions = await recording.recorderVersions(app);
		const pages = new Map(Object.entries(JSON.parse(await readFile(keysFile, 'utf8')) as Record<string, string>));
		const keep = storeKeeps(pages, versions, await recording.readVisits(store));
		console.log(JSON.stringify(await pruneStore(store, Object.keys(versions), keep, pages, recording.visitFile)));
		return;
	}
	if (command === 'copied-parts') {
		const [app] = rest;
		if (!app) throw new Error('usage: pipeline.ts copied-parts <app>');
		console.log((await copiedParts(app, join(ROOT, 'parts'))).join('\n'));
		return;
	}
	if (command === 'refresh-parts') {
		const [app, list] = rest;
		if (!app || !list) throw new Error('usage: pipeline.ts refresh-parts <app> <list>');
		console.log(await refreshParts(app, join(ROOT, 'parts'), (await readFile(list, 'utf8')).split('\n').filter(Boolean)));
		return;
	}
	if (command === 'receipt') {
		const [file, stage, ...kv] = rest;
		if (!file || !stage) throw new Error('usage: pipeline.ts receipt <file> <stage> name=value...');
		const { values } = args(kv);
		const receipt: Record<string, string | number> = { stage };
		for (const [k, v] of Object.entries(values)) receipt[k] = /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
		await mkdir(dirname(resolve(file)), { recursive: true });
		await appendFile(file, `${JSON.stringify(receipt)}\n`);
		return;
	}
	if (command === 'report') {
		const [dir, jobsFile] = rest;
		if (!dir || !jobsFile) throw new Error('usage: pipeline.ts report <receipts dir> <jobs.json>');
		const receipts: Receipt[] = [];
		if (existsSync(dir)) for (const f of await treeFiles(dir)) if (f.endsWith('.jsonl')) receipts.push(...(await readFile(join(dir, f), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as Receipt));
		const jobs = (JSON.parse(await readFile(jobsFile, 'utf8')) as { jobs: Job[] }).jobs;
		console.log(report(receipts, jobs));
		return;
	}
	console.error('usage: pipeline.ts key | record-split | prune | copied-parts | refresh-parts | receipt | report');
	process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

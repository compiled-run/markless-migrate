// A convert's peak memory and its own CPU time on a fixed multi-route site (ci.yml's "Convert budget" job):
//   node scripts/convert-budget.ts judge <reference> <tree> [limits.json] [fixture.ts]  converts one fixture with the reference tree and
//        <tree> on this runner and exits 1 when <tree> is over the limits (CI passes main's limits and fixture, not the change's)
//   node scripts/convert-budget.ts measure <out>             writes this tree's measure as JSON without judging it
// The fixture is scripts/convert-budget-fixture.ts's, written once per run and converted by every tree compared.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { body, parseDocument } from '../src/convert/dom.ts';
import { ReactStatePlan } from '../src/convert/react-state.ts';
import type { StateComponent } from '../src/library/types.ts';
import { fixtureDigest } from './convert-budget-fixture.ts';

export interface Limits {
	/** The yardstick cpuSeconds is held to: #656's tree, which read `cpuSeconds` on the runner the bound was set on. */
	readonly reference: { readonly commit: string; readonly cpuSeconds: number };
	readonly budget: { readonly liveMb: number; readonly heapMb: number; readonly cpuSeconds: number; readonly matchMs: number };
}

const isLimits = (x: unknown): x is Limits => {
	if (typeof x !== 'object' || x === null || !('reference' in x) || !('budget' in x)) return false;
	const { reference, budget } = x;
	const nums = (o: unknown, keys: readonly string[]) => typeof o === 'object' && o !== null && keys.every((k) => k in o && typeof Reflect.get(o, k) === 'number');
	return nums(reference, ['cpuSeconds']) && typeof reference === 'object' && reference !== null && 'commit' in reference && typeof reference.commit === 'string' && nums(budget, ['liveMb', 'heapMb', 'cpuSeconds', 'matchMs']);
};

/** The limits in a convert-budget.json: this tree's by default; CI reads main's. */
export function readLimits(file: string = join(import.meta.dirname, 'convert-budget.json')): Limits {
	const got: unknown = JSON.parse(readFileSync(file, 'utf8'));
	if (!isLimits(got)) throw new Error(`${file}: not a convert budget's limits`);
	return got;
}

/**
 * convert-budget.json's budget, the most the fixture's convert may hold: live heap (after a full collection, forced every half second) and heap used at
 * any 100 ms sample (what a burst between collections needs). Measured on a Mac, each tree run once or more:
 *   b46d038b (before #601)                    live 208 MB, heap used 612 MB  (#600 built every page's class oracle at once)
 *   315d4e99 (#601)                           live 144 MB, heap used 507 MB  (#526 parsed every page's layers at once)
 *   2a4820cd (#602) and this tree             live 144 / 144 / 144 MB, heap used 249 / 250 / 251 MB
 * Each bound is about 1.3 times the fixed tree's figure: both regressions are over one of them.
 * And the most it may take: the convert process's own CPU time, and matchMs. Measured on a Mac, each tree run 5 times:
 *   6ac0281a (#636 gave ui.shadcn.com 75 such components)  matching 3816-3858 ms (each component walked every page again)
 *   this tree                                               matching 19-24 ms; convert CPU 29-33 s
 * and on ubuntu-latest (#656's run) this tree's matching took 82 ms and its convert 92 s of CPU. matchMs is about five times
 * that figure (the regression is about forty times over it), cpuSeconds about 1.3 times. That run's speed is the bound's: the
 * same tree reads 79 s to 125 s across GitHub's runners, so cpuSeconds is judged beside the reference tree on one runner.
 */
const LIMITS = readLimits();
export const BUDGET = LIMITS.budget;
export const REFERENCE = LIMITS.reference;

export interface PairedVerdict {
	/** The lower of the reference's readings on this runner: noise only adds CPU time, and a lower reference only makes the change's figure larger. */
	readonly reference: number;
	readonly head: number;
	readonly ratio: number;
	/** head over reference times the reference's cpuSeconds: the change's CPU time on the runner the bound was set on. */
	readonly atBoundSpeed: number;
	readonly over?: string;
	/** One head reading over the bound is read again; the lower of the two is judged. */
	readonly readHeadAgain: boolean;
}

/** The change's CPU time at the reference's speed, from the reference's and the change's readings on one runner. */
export function judgePaired(references: readonly number[], heads: readonly number[], reference: number = REFERENCE.cpuSeconds, budget: number = BUDGET.cpuSeconds): PairedVerdict {
	const ref = Math.min(...references);
	const head = Math.min(...heads);
	const ratio = Math.round((head / ref) * 1000) / 1000;
	const atBoundSpeed = Math.round((head / ref) * reference);
	const over = atBoundSpeed > budget ? `convert CPU time at the reference's speed: ${atBoundSpeed} s, over ${budget} s` : undefined;
	return { reference: ref, head, ratio, atBoundSpeed, ...(over ? { over } : {}), readHeadAgain: heads.length < 2 && over !== undefined };
}

const OWN_FIXTURE = join(import.meta.dirname, 'convert-budget-fixture.ts');

/** Serves a written fixture's site/ as the old site. */
function serve(fixture: string): Promise<{ origin: string; server: Server }> {
	const files = JSON.parse(readFileSync(join(fixture, 'site', 'routes.json'), 'utf8')) as Record<string, string>;
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const file = files[path];
		if (file === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(readFileSync(join(fixture, 'site', file)));
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server })));
}

/** Writes the fixture a fixture module defines into `dir`. */
async function writeFixtureOf(module: string, dir: string): Promise<void> {
	const mod: unknown = await import(pathToFileURL(module).href);
	const write = typeof mod === 'object' && mod !== null ? Reflect.get(mod, 'writeFixture') : undefined;
	if (typeof write !== 'function') throw new Error(`${module} has no writeFixture`);
	await Reflect.apply(write, undefined, [dir]);
}

// Live heap is read right after a full collection forced every half second; heapUsed between collections also holds garbage.
const SAMPLER = `import { writeFileSync } from 'node:fs';
let live = 0, heap = 0, rss = 0;
const tick = () => { const m = process.memoryUsage(); heap = Math.max(heap, m.heapUsed); rss = Math.max(rss, m.rss); };
setInterval(tick, 100).unref();
setInterval(() => { globalThis.gc(); live = Math.max(live, process.memoryUsage().heapUsed); }, 500).unref();
process.on('exit', () => { tick(); const u = process.resourceUsage(); writeFileSync(process.env.BUDGET_PEAK_FILE, JSON.stringify({ live, heap, rss, cpu: (u.userCPUTime + u.systemCPUTime) / 1e6 })); });
`;

/** Each way the measure is over BUDGET, in words, but CPU time, which judgePaired judges; none is within it. */
export function overBudget(m: Measure, budget: typeof BUDGET = BUDGET): string[] {
	const out: string[] = [];
	if (m.peakLiveMb > budget.liveMb) out.push(`peak live heap: ${m.peakLiveMb} MB, over ${budget.liveMb} MB`);
	if (m.peakHeapMb > budget.heapMb) out.push(`peak heap used: ${m.peakHeapMb} MB, over ${budget.heapMb} MB`);
	if (m.matchMs > budget.matchMs) out.push(`React-state matching: ${m.matchMs} ms, over ${budget.matchMs} ms`);
	return out;
}

export interface Measure {
	readonly routes: number;
	readonly seconds: number;
	/** The convert process's own CPU time (its threads, not the browser's): what its code costs, steadier than the wall clock. */
	readonly cpuSeconds: number;
	/** STATE_COMPONENTS matched on the fixture's pages, each with a ui.shadcn.com-sized sidebar, in this process. */
	readonly matchMs: number;
	readonly peakLiveMb: number;
	readonly peakHeapMb: number;
	readonly peakRssMb: number;
}

/** The fixture's pages, each with the sidebar, read once; the time ReactStatePlan takes to look for every component on them. */
export function matchMs(fixture: string): number {
	const pages = (JSON.parse(readFileSync(join(fixture, 'match.json'), 'utf8')) as string[]).map((html) => body(parseDocument(html)));
	const { stateComponents } = JSON.parse(readFileSync(join(fixture, 'app', '.migrate', 'libraries.json'), 'utf8')) as { stateComponents: StateComponent[] };
	const plan = new ReactStatePlan(stateComponents);
	const began = performance.now();
	for (const page of pages) plan.add(page);
	return Math.round(performance.now() - began);
}

/** One tree's convert of a written fixture served at `origin`, in that tree's own convert, measured from outside; why, when it does not convert. */
async function convertTree(tree: string, fixture: string, origin: string, matched: number): Promise<Measure | string> {
	const dir = await mkdtemp(join(tmpdir(), 'convert-budget-'));
	const app = join(dir, 'app');
	const sampler = join(dir, 'peak.mjs');
	const peakFile = join(dir, 'peak.json');
	try {
		await cp(join(fixture, 'app'), app, { recursive: true });
		await writeFile(sampler, SAMPLER);
		const began = Date.now();
		const code = await new Promise<number>((done) => spawn(process.execPath, [join(tree, 'scripts/convert-budget.ts'), 'convert', app, origin], { cwd: tree, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, NODE_OPTIONS: `--expose-gc --import ${sampler}`, BUDGET_PEAK_FILE: peakFile } }).on('close', (c) => done(c ?? 1)));
		if (code !== 0) return `its convert exited ${code}`;
		const peak = JSON.parse(await readFile(peakFile, 'utf8')) as { live: number; heap: number; rss: number; cpu: number };
		const mb = (b: number) => Math.round(b / 2 ** 20);
		const { routes } = JSON.parse(await readFile(join(fixture, 'app', '.migrate', 'inventory.json'), 'utf8')) as { routes: unknown[] };
		return { routes: routes.length, seconds: Math.round((Date.now() - began) / 1000), cpuSeconds: Math.round(peak.cpu), matchMs: matched, peakLiveMb: mb(peak.live), peakHeapMb: mb(peak.heap), peakRssMb: mb(peak.rss) };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** This tree's convert of its own fixture. */
export async function measure(): Promise<Measure> {
	const fixture = await mkdtemp(join(tmpdir(), 'convert-budget-fixture-'));
	try {
		await writeFixtureOf(OWN_FIXTURE, fixture);
		const { origin, server } = await serve(fixture);
		try {
			const got = await convertTree(resolve(import.meta.dirname, '..'), fixture, origin, matchMs(fixture));
			if (typeof got === 'string') throw new Error(`this tree did not convert: ${got}`);
			return got;
		} finally {
			server.closeAllConnections();
			server.close();
		}
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
}

/**
 * The job: one fixture, from `fixtureModule` (CI passes main's); then the reference, the tree, the reference again on this runner,
 * the tree read again when it is over. Memory and matching are judged on the tree whatever the reference does. Returns the exit code.
 */
export async function judge(referenceTree: string, tree: string, limits: Limits = LIMITS, fixtureModule: string = OWN_FIXTURE, write: (text: string) => void = (t) => void process.stdout.write(t)): Promise<number> {
	const dir = await mkdtemp(join(tmpdir(), 'convert-budget-judge-'));
	const fixture = join(dir, 'fixture');
	try {
		await writeFixtureOf(fixtureModule, fixture);
		const notes: string[] = [];
		if (resolve(fixtureModule) !== OWN_FIXTURE) {
			await writeFixtureOf(OWN_FIXTURE, join(dir, 'own'));
			const [judged, own] = await Promise.all([fixtureDigest(fixture), fixtureDigest(join(dir, 'own'))]);
			if (judged !== own) notes.push(`This change's fixture (scripts/convert-budget-fixture.ts) differs from main's; both trees convert main's.`);
		}
		const own = limits === LIMITS ? [] : (['commit', 'cpuSeconds'] as const).filter((k) => LIMITS.reference[k] !== limits.reference[k]).map((k) => `reference ${k}`).concat((['liveMb', 'heapMb', 'cpuSeconds', 'matchMs'] as const).filter((k) => LIMITS.budget[k] !== limits.budget[k]).map((k) => `budget ${k}`));
		if (own.length) notes.push(`This change sets its own ${own.join(', ')} in convert-budget.json; it is judged by main's.`);
		const { origin, server } = await serve(fixture);
		try {
			const matched = matchMs(fixture);
			const read = (at: string) => convertTree(at, fixture, origin, matched);
			const refs: Measure[] = [];
			const heads: Measure[] = [];
			const first = await read(referenceTree);
			if (typeof first !== 'string') refs.push(first);
			const head = await read(tree);
			if (typeof head === 'string') throw new Error(`this tree did not convert the fixture: ${head}`);
			heads.push(head);
			const failures = [...overBudget(head, limits.budget)];
			const list = (ms: readonly Measure[], f: (m: Measure) => number) => ms.map((x) => `${f(x)} s`).join(', ');
			const table = (rows: string) => `| | measured | budget |\n|---|---|---|\n| runner CPU | ${cpus()[0]?.model ?? 'unknown'} × ${cpus().length} | |\n| reference | ${limits.reference.commit.slice(0, 8)}, ${limits.reference.cpuSeconds} s at the bound's speed | |\n| routes | ${head.routes} | |\n${rows}| React-state matching | ${head.matchMs} ms | ${limits.budget.matchMs} ms |\n| peak live heap | ${head.peakLiveMb} MB | ${limits.budget.liveMb} MB |\n| peak heap used | ${head.peakHeapMb} MB | ${limits.budget.heapMb} MB |\n| peak RSS | ${head.peakRssMb} MB | |\n`;
			let summary: string;
			if (typeof first === 'string') {
				failures.push(`the reference tree (${limits.reference.commit.slice(0, 8)}) did not convert the fixture: ${first}. The change is not the cause: pin a reference that converts on today's toolchain in scripts/convert-budget.json, in a pull request of its own, with its CPU at the bound's speed measured`);
				summary = table(`| convert CPU time, this tree | ${head.cpuSeconds} s | not judged without the reference |\n`);
			} else {
				const second = await read(referenceTree);
				if (typeof second !== 'string') refs.push(second);
				const verdict = () => judgePaired(refs.map((m) => m.cpuSeconds), heads.map((m) => m.cpuSeconds), limits.reference.cpuSeconds, limits.budget.cpuSeconds);
				if (verdict().readHeadAgain) {
					const again = await read(tree);
					if (typeof again !== 'string') heads.push(again);
				}
				const v = verdict();
				if (v.over) failures.push(v.over);
				summary = table(`| convert time, reference / this tree | ${list(refs, (x) => x.seconds)} / ${list(heads, (x) => x.seconds)} | |\n| convert CPU time, reference | ${list(refs, (x) => x.cpuSeconds)} (lower: ${v.reference} s) | |\n| convert CPU time, this tree | ${list(heads, (x) => x.cpuSeconds)} (lower: ${v.head} s) | |\n| this tree over the reference | ${v.ratio} | |\n| convert CPU time at the reference's speed | ${v.atBoundSpeed} s | ${limits.budget.cpuSeconds} s |\n`);
			}
			const text = `${summary}${notes.length ? `\n${notes.join('\n')}\n` : ''}\n${failures.length ? `Over budget:\n${failures.map((o) => `- ${o}`).join('\n')}` : 'Within budget.'}\n`;
			write(text);
			if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Convert budget\n\n${text}`, { flag: 'a' });
			return failures.length ? 1 : 0;
		} finally {
			server.closeAllConnections();
			server.close();
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const [what, a, b] = process.argv.slice(2);
	if (what === 'convert' && a && b) {
		const { convert } = await import('../src/convert/index.ts');
		const report = await convert({ old: b, app: a, concurrency: 4, log: (line) => process.stdout.write(`${line}\n`) });
		const { routes } = JSON.parse(await readFile(join(a, '.migrate', 'inventory.json'), 'utf8')) as { routes: unknown[] };
		if (report.routes.length < routes.length) throw new Error(`convert wrote ${report.routes.length} of ${routes.length} routes`);
	} else if (what === 'measure' && a) {
		await writeFile(a, `${JSON.stringify(await measure(), null, 1)}\n`);
	} else if (what === 'judge' && a && b) {
		const [file, fixture] = process.argv.slice(5);
		process.exit(await judge(resolve(a), resolve(b), file ? readLimits(resolve(file)) : LIMITS, fixture ? resolve(fixture) : OWN_FIXTURE));
	} else {
		process.stderr.write('usage: convert-budget.ts judge <reference tree> <tree> [limits.json] [fixture.ts] | measure <out.json>\n');
		process.exit(2);
	}
}

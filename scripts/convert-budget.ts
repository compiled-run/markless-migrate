// A convert's peak memory and its own CPU time on a fixed multi-route site (ci.yml's "Convert budget" job):
//   node scripts/convert-budget.ts judge <reference> <tree> [limits.json]  converts the fixture with the reference tree and <tree> on
//        this runner and exits 1 when <tree> is over the limits (CI passes main's convert-budget.json, so a change does not set its own)
//   node scripts/convert-budget.ts measure <out>             writes this tree's measure as JSON without judging it
// The fixture is the corpus micro-site at COPIES paths each, every page carrying the same large search dialog in its header and
// one site stylesheet, as the ui.shadcn.com pages do: memory a convert holds per page grows with the routes here as it does there.
// It has no old source, so what the source resolvers keep is not measured here; libraries.json carries STATE_COMPONENTS
// React-state components the page does not show, as many as the ui.shadcn.com source gives, so matching them on each page is measured.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { body, parseDocument } from '../src/convert/dom.ts';
import { ReactStatePlan } from '../src/convert/react-state.ts';
import type { StateComponent } from '../src/library/types.ts';
import { ORIGINAL } from '../test/corpus/site.ts';

export const COPIES = 2;
const PALETTE_ITEMS = 1500;
const SHEET_RULES = 3000;
const STATE_COMPONENTS = 75;
const SIDEBAR_LINKS = 400;

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

// Shaped as shadcn's SliderControlled: a div around a label and the value's text, beside a slider.
const stateComponents = Array.from({ length: STATE_COMPONENTS }, (_, i): StateComponent => ({
	file: `components/stateful-${i}.tsx`,
	line: 1,
	component: `Stateful${i}`,
	slots: [{ name: 'value', kind: 'state', init: [String(i)] }],
	nodes: [{ kind: 'element', tag: 'div', attrs: {}, children: [{ kind: 'element', tag: 'div', attrs: {}, children: [{ kind: 'element', attrs: {}, slots: ['label'] }, { kind: 'element', tag: 'span', attrs: {}, text: { code: [0], initial: String(i) } }] }, { kind: 'element', attrs: { 'aria-label': `Value ${i}` }, slots: ['slider'] }] }],
}));

const routes = Object.keys(ORIGINAL).flatMap((route) => Array.from({ length: COPIES }, (_, i) => (i === 0 ? route : `${route.replace(/\/$/, '')}/copy-${i}`)));

const items = Array.from({ length: PALETTE_ITEMS }, (_, i) => `<div role="option" class="item item-${i % 40}" data-value="page ${i}"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg><span>Page ${i}</span></div>`).join('');
// A Radix-style dialog portalled to the end of the body by a header button: convert reveals it on every page.
const SEARCH = `<button type="button" id="mm-search" aria-haspopup="dialog" aria-expanded="false" class="search">Search documentation</button><script>
(() => { const t = document.getElementById('mm-search'); let d;
t.addEventListener('click', () => {
	if (d) { d.remove(); d = undefined; t.setAttribute('aria-expanded', 'false'); return; }
	d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.className = 'palette';
	d.innerHTML = '<input placeholder="Search" class="palette-input"><div role="listbox" class="palette-list">${items}</div>';
	document.body.append(d); t.setAttribute('aria-expanded', 'true');
}); })();</script>`;
const SHEET = Array.from({ length: SHEET_RULES }, (_, i) => `.item-${i % 40}.u${i}{padding:${i % 9}px;color:#${(i * 2654435761).toString(16).slice(-6).padStart(6, '0')}}`).join('\n');

// The docs sidebar each ui.shadcn.com page carries (its pages average 1250 elements, the micro-site's 24), for matchMs.
const SIDEBAR = `<nav class="sidebar"><ul>${Array.from({ length: SIDEBAR_LINKS }, (_, i) => `<li class="sidebar-item"><a href="/docs/page-${i}">Page ${i}</a></li>`).join('')}</ul></nav>`;

const pageOf = (route: string) => ORIGINAL[route.replace(/\/copy-\d+$/, '') || '/'] ?? ORIGINAL[route]!;
const withSearch = (html: string) => html.replace('</title>', '</title><link rel="stylesheet" href="/site.css">').replace('</header>', `${SEARCH}</header>`);

function serve(): Promise<{ origin: string; server: Server }> {
	const pages = new Map(routes.map((route) => [route, withSearch(pageOf(route))]));
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/site.css') return void res.writeHead(200, { 'content-type': 'text/css' }).end(SHEET);
		const body = pages.get(path);
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server })));
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
export function matchMs(): number {
	const pages = routes.map((route) => body(parseDocument(withSearch(pageOf(route)).replace('<main>', `<main>${SIDEBAR}`))));
	const plan = new ReactStatePlan(stateComponents);
	const began = performance.now();
	for (const page of pages) plan.add(page);
	return Math.round(performance.now() - began);
}

export async function measure(): Promise<Measure> {
	const { origin, server } = await serve();
	const dir = await mkdtemp(join(tmpdir(), 'convert-budget-'));
	const app = join(dir, 'app');
	const sampler = join(dir, 'peak.mjs');
	const peakFile = join(dir, 'peak.json');
	await mkdir(join(app, '.migrate'), { recursive: true });
	await writeFile(sampler, SAMPLER);
	await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ routes: routes.map((route) => ({ route, status: 200 })) }));
	await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [], stateComponents }));
	await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'converted', private: true, type: 'module', dependencies: {}, 'markless-migrate': { stylesheetImports: true } }));
	const began = Date.now();
	try {
		await new Promise<void>((done, fail) => {
			const child = spawn(process.execPath, [import.meta.filename, 'convert', app, origin], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, NODE_OPTIONS: `--expose-gc --import ${sampler}`, BUDGET_PEAK_FILE: peakFile } });
			child.on('close', (code) => (code === 0 ? done() : fail(new Error(`convert exited ${code}`))));
		});
		const peak = JSON.parse(await readFile(peakFile, 'utf8')) as { live: number; heap: number; rss: number; cpu: number };
		const mb = (b: number) => Math.round(b / 2 ** 20);
		return { routes: routes.length, seconds: Math.round((Date.now() - began) / 1000), cpuSeconds: Math.round(peak.cpu), matchMs: matchMs(), peakLiveMb: mb(peak.live), peakHeapMb: mb(peak.heap), peakRssMb: mb(peak.rss) };
	} finally {
		server.closeAllConnections();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
}

/** One tree's measure, by that tree's own script; undefined with why when it does not measure. */
async function readTree(tree: string, out: string): Promise<Measure | string> {
	const code = await new Promise<number>((done) => spawn(process.execPath, [join(tree, 'scripts/convert-budget.ts'), 'measure', out], { cwd: tree, stdio: 'inherit' }).on('close', (c) => done(c ?? 1)));
	if (code !== 0) return `its measure exited ${code}`;
	return JSON.parse(await readFile(out, 'utf8')) as Measure;
}

/** The job: the reference, the tree, the reference again on this runner; the tree is read again when it is over. Returns the exit code. */
export async function judge(referenceTree: string, tree: string, limits: Limits = LIMITS, write: (text: string) => void = (t) => void process.stdout.write(t)): Promise<number> {
	const dir = await mkdtemp(join(tmpdir(), 'convert-budget-judge-'));
	let n = 0;
	const read = (at: string) => readTree(at, join(dir, `${n++}.json`));
	try {
		const refs: Measure[] = [];
		const heads: Measure[] = [];
		const first = await read(referenceTree);
		if (typeof first === 'string') {
			write(`${process.env.GITHUB_ACTIONS ? '::warning title=Convert budget::' : ''}The reference tree (${limits.reference.commit.slice(0, 8)}) did not measure: ${first}. This change's convert CPU time is not judged on this run; that is the job's failure, not the change's.\n`);
			return 0;
		}
		refs.push(first);
		const head = await read(tree);
		if (typeof head === 'string') throw new Error(`this tree did not measure: ${head}`);
		heads.push(head);
		const second = await read(referenceTree);
		if (typeof second !== 'string') refs.push(second);
		const verdict = () => judgePaired(refs.map((m) => m.cpuSeconds), heads.map((m) => m.cpuSeconds), limits.reference.cpuSeconds, limits.budget.cpuSeconds);
		if (verdict().readHeadAgain) {
			const again = await read(tree);
			if (typeof again !== 'string') heads.push(again);
		}
		const v = verdict();
		const own = limits === LIMITS ? [] : (['commit', 'cpuSeconds'] as const).filter((k) => LIMITS.reference[k] !== limits.reference[k]).map((k) => `reference ${k}`).concat((['liveMb', 'heapMb', 'cpuSeconds', 'matchMs'] as const).filter((k) => LIMITS.budget[k] !== limits.budget[k]).map((k) => `budget ${k}`));
		const over = [...overBudget(head, limits.budget), ...(v.over ? [v.over] : [])];
		const list = (ms: readonly Measure[], f: (m: Measure) => number) => ms.map((x) => `${f(x)} s`).join(', ');
		const summary = `| | measured | budget |\n|---|---|---|\n| runner CPU | ${cpus()[0]?.model ?? 'unknown'} × ${cpus().length} | |\n| reference | ${limits.reference.commit.slice(0, 8)}, ${limits.reference.cpuSeconds} s at the bound's speed | |\n| routes | ${head.routes} | |\n| convert time, reference / this tree | ${list(refs, (x) => x.seconds)} / ${list(heads, (x) => x.seconds)} | |\n| convert CPU time, reference | ${list(refs, (x) => x.cpuSeconds)} (lower: ${v.reference} s) | |\n| convert CPU time, this tree | ${list(heads, (x) => x.cpuSeconds)} (lower: ${v.head} s) | |\n| this tree over the reference | ${v.ratio} | |\n| convert CPU time at the reference's speed | ${v.atBoundSpeed} s | ${limits.budget.cpuSeconds} s |\n| React-state matching | ${head.matchMs} ms | ${limits.budget.matchMs} ms |\n| peak live heap | ${head.peakLiveMb} MB | ${limits.budget.liveMb} MB |\n| peak heap used | ${head.peakHeapMb} MB | ${limits.budget.heapMb} MB |\n| peak RSS | ${head.peakRssMb} MB | |\n${own.length ? `\nThis change sets its own ${own.join(', ')} in convert-budget.json; it is judged by main's.\n` : ''}\n${over.length ? `Over budget:\n${over.map((o) => `- ${o}`).join('\n')}` : 'Within budget.'}\n`;
		write(summary);
		if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Convert budget\n\n${summary}`, { flag: 'a' });
		return over.length ? 1 : 0;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const [what, a, b] = process.argv.slice(2);
	if (what === 'convert' && a && b) {
		const { convert } = await import('../src/convert/index.ts');
		const report = await convert({ old: b, app: a, concurrency: 4, log: (line) => process.stdout.write(`${line}\n`) });
		if (report.routes.length < routes.length) throw new Error(`convert wrote ${report.routes.length} of ${routes.length} routes`);
	} else if (what === 'measure' && a) {
		await writeFile(a, `${JSON.stringify(await measure(), null, 1)}\n`);
	} else if (what === 'judge' && a && b) {
		const [file] = process.argv.slice(5);
		process.exit(await judge(resolve(a), resolve(b), file ? readLimits(resolve(file)) : LIMITS));
	} else {
		process.stderr.write('usage: convert-budget.ts judge <reference tree> <tree> [limits.json] | measure <out.json>\n');
		process.exit(2);
	}
}

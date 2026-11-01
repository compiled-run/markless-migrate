// The checker's own cost on a fixed small page, base against head on one runner (ci.yml's "Check budget" job):
//   measure <checker dir> <out.json>   runs that checker's CLI on BUDGET_ROUTES, both sides this tree's corpus micro-site, and
//                                      writes the route's check time by step, the whole run's time and the check process's peak memory
//   compare <base.json> <head.json>    exits 1 when head is slower or heavier than base beyond BUDGET
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ORIGINAL } from '../test/corpus/site.ts';

/** One page, so every dimension runs on it: journeys, probes, control parity, busy CPU, motion, responsiveness and page load. */
export const BUDGET_ROUTES = ['/docs/components/combobox'] as const;
/** A fixed amount of work, small enough for a pull request: the bounds are on its cost, not on what it finds. */
const WORK = ['--max-journeys', '15', '--load-runs', '4', '--no-slow-network', '--no-waste', '--no-psi'] as const;

// Script work at load for Lighthouse alone, so its traces carry call stacks and forced layouts the way a real docs page's do.
const BUSY = `<script>(function () { const rows = []; for (let i = 0; i < 3000; i++) { const p = document.createElement('p'); p.textContent = 'row ' + i; p.hidden = true; rows.push(p); } document.body.append(...rows); const deep = (n) => (n ? deep(n - 1) + Math.sqrt(n) : 0); for (let i = 0; i < 60; i++) { document.body.style.paddingBottom = (i % 7) + 'px'; void document.body.offsetHeight; deep(2000); } })();</script>`;

/**
 * How much slower or heavier head may be than base. Measured on a Mac under other jobs' load (load average 7 to 44), each
 * checker twice in the order A B C C B A: one checker's two runs differed by up to 15% in the route's check time (214 s and
 * 247 s), 15% in the whole run (264 s and 304 s) and 16% in peak memory (642 MB and 553 MB); the bounds sit above that.
 * The regression they are for, #501 (lab Lighthouse throttled for real, in the check's own thread), took the whole run from
 * 264 to 304 s to 458 to 470 s (1.5x to 1.8x) and its page-load stage from 50 to 58 s to 243 s.
 */
export const BUDGET = {
	routeRatio: 1.35,
	routeSlackMs: 20_000,
	totalRatio: 1.3,
	totalSlackMs: 30_000,
	memoryRatio: 1.3,
	memorySlackMb: 200,
} as const;

export interface Measure {
	readonly checker: string;
	readonly totalMs: number;
	readonly peakRssMb: number;
	readonly peakHeapMb: number;
	readonly routes: Readonly<Record<string, number>>;
	readonly steps: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

const SAMPLER = `import { writeFileSync } from 'node:fs';
let rss = 0, heap = 0;
const tick = () => { const m = process.memoryUsage(); rss = Math.max(rss, m.rss); heap = Math.max(heap, m.heapUsed); };
setInterval(tick, 200).unref();
process.on('exit', () => { tick(); writeFileSync(process.env.BUDGET_PEAK_FILE, JSON.stringify({ rss, heap })); });
`;

function serve(pages: Record<string, string>): Promise<{ origin: string; server: Server }> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const body = path === '/' ? pages['/docs'] : pages[path];
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(/Chrome-Lighthouse/.test(req.headers['user-agent'] ?? '') ? body.replace('</body>', `${BUSY}</body>`) : body);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server })));
}

export async function measure(checker: string): Promise<Measure> {
	const sides = await Promise.all([serve(ORIGINAL), serve(ORIGINAL)]);
	const cwd = await mkdtemp(join(tmpdir(), 'check-budget-'));
	const sampler = join(cwd, 'peak.mjs');
	const peakFile = join(cwd, 'peak.json');
	await writeFile(sampler, SAMPLER);
	const began = Date.now();
	try {
		const out = await new Promise<string>((done, fail) => {
			const args = [join(checker, 'src/cli.ts'), 'check', '--old', sides[0].origin, '--new', sides[1].origin, ...BUDGET_ROUTES.flatMap((r) => ['--route', r]), '--control-webkit', '--busy-cpu', ...WORK, '--no-navigation', '--no-cache', '--json'];
			const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: `--import ${sampler}`, BUDGET_PEAK_FILE: peakFile, MARKLESS_MIGRATE_PROFILE: '1' } });
			let stdout = '', stderr = '';
			child.stdout.on('data', (d: Buffer) => (stdout += d));
			child.stderr.on('data', (d: Buffer) => {
				stderr += d;
				process.stderr.write(d);
			});
			child.on('close', (code) => (code === 0 || code === 1 || code === 4 ? done(stdout) : fail(new Error(`check exited ${code}:\n${stderr.slice(-2000)}`))));
		});
		const totalMs = Date.now() - began;
		const report = JSON.parse(out) as { routes: { route: string; timing?: { ms: number; steps: { name: string; ms: number }[] } }[] };
		const peak = JSON.parse(await readFile(peakFile, 'utf8')) as { rss: number; heap: number };
		const timed = report.routes.filter((r) => r.timing);
		return {
			checker,
			totalMs,
			peakRssMb: Math.round(peak.rss / 2 ** 20),
			peakHeapMb: Math.round(peak.heap / 2 ** 20),
			routes: Object.fromEntries(timed.map((r) => [r.route, r.timing!.ms])),
			steps: Object.fromEntries(timed.map((r) => [r.route, Object.fromEntries(r.timing!.steps.map((s) => [s.name, s.ms]))])),
		};
	} finally {
		for (const s of sides) {
			s.server.closeAllConnections();
			s.server.close();
		}
		await rm(cwd, { recursive: true, force: true });
	}
}

/** Each way head is over its budget against base, in words; none is within budget. */
export function overBudget(base: Measure, head: Measure, budget: typeof BUDGET = BUDGET): string[] {
	const out: string[] = [];
	const s = (ms: number) => `${(ms / 1000).toFixed(0)} s`;
	for (const route of BUDGET_ROUTES) {
		const [b, h] = [base.routes[route], head.routes[route]];
		if (b === undefined || h === undefined) {
			out.push(`${route}: no check time on ${b === undefined ? 'base' : 'head'}`);
			continue;
		}
		if (h > b * budget.routeRatio + budget.routeSlackMs) out.push(`${route}: ${s(h)} against base's ${s(b)} (${(h / b).toFixed(2)}x; budget ${budget.routeRatio}x + ${s(budget.routeSlackMs)})`);
	}
	if (head.totalMs > base.totalMs * budget.totalRatio + budget.totalSlackMs) out.push(`whole run: ${s(head.totalMs)} against base's ${s(base.totalMs)} (${(head.totalMs / base.totalMs).toFixed(2)}x; budget ${budget.totalRatio}x + ${s(budget.totalSlackMs)})`);
	if (head.peakRssMb > base.peakRssMb * budget.memoryRatio + budget.memorySlackMb) out.push(`peak memory: ${head.peakRssMb} MB against base's ${base.peakRssMb} MB (${(head.peakRssMb / base.peakRssMb).toFixed(2)}x; budget ${budget.memoryRatio}x + ${budget.memorySlackMb} MB)`);
	return out;
}

function table(base: Measure, head: Measure): string {
	const row = (name: string, b: number | undefined, h: number | undefined, unit: string) => `| ${name} | ${b ?? '-'} ${unit} | ${h ?? '-'} ${unit} | ${b && h ? (h / b).toFixed(2) : '-'}x |`;
	const sec = (ms: number | undefined) => (ms === undefined ? undefined : Math.round(ms / 1000));
	const names = [...new Set(BUDGET_ROUTES.flatMap((r) => [...Object.keys(base.steps[r] ?? {}), ...Object.keys(head.steps[r] ?? {})]))];
	return [
		'| | base | head | head/base |',
		'|---|---|---|---|',
		row('whole run', sec(base.totalMs), sec(head.totalMs), 's'),
		row('after the route (page load)', sec(base.totalMs - Object.values(base.routes).reduce((t, ms) => t + ms, 0)), sec(head.totalMs - Object.values(head.routes).reduce((t, ms) => t + ms, 0)), 's'),
		row('peak memory (check process)', base.peakRssMb, head.peakRssMb, 'MB'),
		row('peak heap (main thread)', base.peakHeapMb, head.peakHeapMb, 'MB'),
		...BUDGET_ROUTES.flatMap((r) => [row(r, sec(base.routes[r]), sec(head.routes[r]), 's'), ...names.map((n) => row(`&nbsp;&nbsp;${n}`, sec(base.steps[r]?.[n]), sec(head.steps[r]?.[n]), 's'))]),
	].join('\n');
}

if (import.meta.main) {
	const [what, a, b] = process.argv.slice(2);
	if (what === 'measure' && a && b) {
		await writeFile(b, JSON.stringify(await measure(resolve(a)), null, 1));
	} else if (what === 'compare' && a && b) {
		const [base, head] = await Promise.all([a, b].map(async (f) => JSON.parse(await readFile(f, 'utf8')) as Measure));
		const over = overBudget(base!, head!);
		const summary = `${table(base!, head!)}\n\n${over.length ? `Over budget:\n${over.map((o) => `- ${o}`).join('\n')}` : 'Within budget.'}\n`;
		process.stdout.write(summary);
		if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Check budget\n\n${summary}`, { flag: 'a' });
		process.exit(over.length ? 1 : 0);
	} else {
		process.stderr.write('usage: check-budget.ts measure <checker dir> <out.json> | compare <base.json> <head.json>\n');
		process.exit(2);
	}
}

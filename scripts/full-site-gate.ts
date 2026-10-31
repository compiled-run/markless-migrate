// Holds a full-site run (convert, check, pipeline, probes) until fewer than SLOTS older full-site runs are still going,
// oldest first, so dispatches queue instead of all taking the org's 60 runners at once (docs/ci-process.md "Runners"):
//   size <spec>   prints full=true|false; spec is '' (every page), count:<n>, words:<routes...>, a .json targets file or a routes file
//   wait          returns once fewer than SLOTS full-site runs are ahead of this one; past MAX_WAIT_MINUTES it fails, and
//                 `gh run rerun <id> --failed` waits again in the same place (a run keeps its creation time)
import { readFileSync } from 'node:fs';

export const SLOTS = 2;
export const SUBSET = 50;
export const GATED = ['convert.yml', 'check.yml', 'pipeline.yml', 'probe-dead-controls.yml', 'probe-measure.yml'].map((f) => `.github/workflows/${f}`);
export const STEP = 'Wait for a full-site slot';

export function routeCount(spec: string, read: (path: string) => string = (p) => readFileSync(p, 'utf8')): number {
	const s = spec.trim();
	if (!s) return Infinity;
	if (s.startsWith('count:')) return Number(s.slice(6));
	if (s.startsWith('words:')) return s.slice(6).split(/\s+/).filter(Boolean).length;
	const text = read(s);
	if (s.endsWith('.json')) return (JSON.parse(text) as { routes?: unknown[] }).routes?.length ?? 0;
	return text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
}

export interface GateRun {
	readonly id: number;
	readonly created: string;
	readonly step: 'waiting' | 'admitted' | 'none';
}

/** Runs ahead of this one: every admitted full-site run, and every older one still waiting. This run starts below SLOTS. */
export function ahead(self: GateRun, runs: readonly GateRun[]): number {
	const older = (r: GateRun) => r.created < self.created || (r.created === self.created && r.id < self.id);
	return runs.filter((r) => r.id !== self.id && (r.step === 'admitted' || (r.step === 'waiting' && older(r)))).length;
}

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY ?? '';
async function gh<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API}/repos/${REPO}${path}`, { ...init, headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', ...(init?.headers ?? {}) } });
	if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
	return (res.status === 204 ? undefined : await res.json()) as T;
}

interface ApiRun { id: number; path: string; created_at: string }
interface ApiJob { steps?: { name: string; status: string; conclusion: string | null }[] }

// A gate step that finished never changes: admitted stays admitted, and a skipped or failed one never holds a slot.
const settled = new Map<number, GateRun['step']>();
async function survey(self: number): Promise<GateRun[]> {
	const runs: ApiRun[] = [];
	for (const status of ['in_progress', 'queued']) runs.push(...(await gh<{ workflow_runs: ApiRun[] }>(`/actions/runs?status=${status}&per_page=100`)).workflow_runs);
	const out: GateRun[] = [];
	for (const run of runs.filter((r) => GATED.includes(r.path.replace(/@.*$/, '')))) {
		if (run.id === self) {
			out.push({ id: run.id, created: run.created_at, step: 'waiting' });
			continue;
		}
		const known = settled.get(run.id);
		if (known) {
			out.push({ id: run.id, created: run.created_at, step: known });
			continue;
		}
		const { jobs } = await gh<{ jobs: ApiJob[] }>(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
		const step = jobs.flatMap((j) => j.steps ?? []).find((s) => s.name === STEP);
		const state = !step ? 'none' : step.status === 'completed' ? (step.conclusion === 'success' ? 'admitted' : 'none') : 'waiting';
		if (step?.status === 'completed') settled.set(run.id, state);
		out.push({ id: run.id, created: run.created_at, step: state });
	}
	return out;
}

async function wait(): Promise<void> {
	const self = Number(process.env.GITHUB_RUN_ID);
	const limit = Number(process.env.MAX_WAIT_MINUTES ?? '330') * 60_000;
	const start = Date.now();
	for (;;) {
		const runs = await survey(self);
		const me = runs.find((r) => r.id === self) ?? { id: self, created: new Date().toISOString(), step: 'waiting' as const };
		const at = ahead(me, runs);
		const going = runs.filter((r) => r.step === 'admitted').map((r) => r.id);
		if (at < SLOTS) {
			console.log(`Admitted after ${Math.round((Date.now() - start) / 60000)} min (running full-site: ${going.join(', ') || 'none'}).`);
			return;
		}
		if (Date.now() - start > limit) break;
		console.log(`${new Date().toISOString()} ${at} ahead, ${SLOTS} at once; running full-site: ${going.join(', ')}`);
		await new Promise((r) => setTimeout(r, 120_000));
	}
	console.log(`::error::No full-site slot within ${limit / 60000} min. gh run rerun ${self} --failed waits again in the same place.`);
	process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [command, spec = ''] = process.argv.slice(2);
	if (command === 'size') {
		const n = routeCount(spec);
		console.error(n >= SUBSET ? `full site (${n === Infinity ? 'every page' : `${n} routes`}): waits for one of ${SLOTS} slots` : `subset (${n} routes): not capped`);
		console.log(`full=${n >= SUBSET}`);
	} else if (command === 'wait') await wait();
	else {
		console.error('usage: full-site-gate.ts size <spec> | wait');
		process.exit(1);
	}
}

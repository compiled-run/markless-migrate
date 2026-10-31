// Holds a full-site run (convert, check, pipeline, probes) until fewer than SLOTS older full-site runs are still going,
// oldest first, so dispatches queue instead of all taking the org's 60 runners at once (docs/ci-process.md "Runners"):
//   size <spec>   prints full=true|false; spec is '' (every page), count:<n>, words:<routes...>, a .json targets file or a routes file,
//                 or priority:deploy (a deploy run tonight's critical path dispatched with priority=deploy: never waits, never counts)
//   wait          returns once fewer than SLOTS full-site runs are ahead of this one and SHARE leaves it room, printing
//                 parallel=<n> to GITHUB_OUTPUT: the shards it may run at once for its whole life (at most WANT); past MAX_WAIT_MINUTES it fails,
//                 and `gh run rerun <id> --failed` waits again in the same place (a run keeps its creation time)
import { appendFileSync, readFileSync } from 'node:fs';

export const SLOTS = 2;
export const SUBSET = 50;
export const GATED = ['convert.yml', 'check.yml', 'pipeline.yml', 'probe-dead-controls.yml', 'probe-measure.yml'].map((f) => `.github/workflows/${f}`);
export const STEP = 'Wait for a full-site slot';
// This repository's jobs hold at most SHARE of the org's 60 runners while a full-site run starts, leaving the rest to Markless.
export const SHARE = 40;
export const RESERVATION = /^full-site-share-(\d+)$/;

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

/**
 * Shards a full-site run may run at once: SHARE less every job running here outside admitted full-site runs, and less what
 * each admitted run holds (its reservation, or its running jobs if more); at most want, and none below min(want, 4).
 */
export function share(want: number, others: number, admitted: readonly { readonly reserved: number; readonly running: number }[]): number {
	const room = SHARE - others - admitted.reduce((sum, r) => sum + Math.max(r.reserved, r.running), 0);
	return room >= Math.min(want, 4) ? Math.min(want, room) : 0;
}

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY ?? '';
async function gh<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API}/repos/${REPO}${path}`, { ...init, headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', ...(init?.headers ?? {}) } });
	if ((res.status === 403 || res.status === 429) && !init?.method) {
		await new Promise((r) => setTimeout(r, 60_000));
		return gh(path, init);
	}
	if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
	return (res.status === 204 ? undefined : await res.json()) as T;
}

interface ApiRun { id: number; path: string; created_at: string }
interface ApiJob { status: string; steps?: { name: string; status: string; conclusion: string | null }[] }

async function activeRuns(): Promise<ApiRun[]> {
	const runs: ApiRun[] = [];
	for (const status of ['in_progress', 'queued']) runs.push(...(await gh<{ workflow_runs: ApiRun[] }>(`/actions/runs?status=${status}&per_page=100`)).workflow_runs);
	return runs;
}

const reserved = new Map<number, number>();
/** Jobs running here now outside admitted full-site runs, and each admitted run's reservation and running jobs. */
async function load(self: number, admittedIds: ReadonlySet<number>): Promise<{ others: number; admitted: { reserved: number; running: number }[] }> {
	let others = 0;
	const admitted: { reserved: number; running: number }[] = [];
	for (const run of await activeRuns()) {
		if (run.id === self) continue;
		const { jobs } = await gh<{ jobs: ApiJob[] }>(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
		const running = jobs.filter((j) => j.status === 'in_progress').length;
		if (!admittedIds.has(run.id)) {
			others += running;
			continue;
		}
		if (!reserved.has(run.id)) {
			const { artifacts } = await gh<{ artifacts: { name: string }[] }>(`/actions/runs/${run.id}/artifacts?per_page=100`);
			const n = artifacts.map((a) => RESERVATION.exec(a.name)).find(Boolean);
			if (n) reserved.set(run.id, Number(n[1]));
		}
		admitted.push({ reserved: reserved.get(run.id) ?? 0, running });
	}
	return { others, admitted };
}

// A gate step that finished never changes: admitted stays admitted, and a skipped or failed one never holds a slot.
const settled = new Map<number, GateRun['step']>();
async function survey(self: number): Promise<GateRun[]> {
	const runs = await activeRuns();
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
		let note = `${at} ahead, ${SLOTS} at once; running full-site: ${going.join(', ') || 'none'}`;
		if (at < SLOTS) {
			const want = Number(process.env.WANT ?? '10');
			const { others, admitted } = await load(self, new Set(going));
			const n = share(want, others, admitted);
			if (n > 0) {
				console.log(`Admitted after ${Math.round((Date.now() - start) / 60000)} min with ${n} shards at once (want ${want}; ${others} jobs running outside full-site runs; running full-site: ${going.join(', ') || 'none'}).`);
				if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `parallel=${n}\n`);
				return;
			}
			note = `first in line, but this repository already holds ${others} jobs outside full-site runs and ${admitted.reduce((a, r) => a + Math.max(r.reserved, r.running), 0)} in them, of ${SHARE}`;
		}
		console.log(`${new Date().toISOString()} ${note}`);
		if (Date.now() - start > limit) break;
		await new Promise((r) => setTimeout(r, 180_000));
	}
	console.log(`::error::No full-site slot within ${limit / 60000} min. gh run rerun ${self} --failed waits again in the same place.`);
	process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [command, spec = ''] = process.argv.slice(2);
	if (command === 'size' && spec === 'priority:deploy') {
		console.error('priority=deploy: not capped and not counted');
		console.log('full=false');
	} else if (command === 'size') {
		const n = routeCount(spec);
		console.error(n >= SUBSET ? `full site (${n === Infinity ? 'every page' : `${n} routes`}): waits for one of ${SLOTS} slots` : `subset (${n} routes): not capped`);
		console.log(`full=${n >= SUBSET}`);
	} else if (command === 'wait') await wait();
	else {
		console.error('usage: full-site-gate.ts size <spec> | wait');
		process.exit(1);
	}
}

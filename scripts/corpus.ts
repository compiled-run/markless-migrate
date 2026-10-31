// The regression corpus of the shadcn port's hand-found bugs (deploy/shadcn-ui/corpus/bugs.json):
//   matrix <bugs.json>                       one entry per kept build and route to check, for a workflow matrix
//   targets <bugs.json> <build> <out.json>   the routes to check on that build, as a --targets file
//   verify <bugs.json> <reports dir>         every bug on a kept build must be named by a finding of its route; the
//                                            dir holds <build>/**/report.json (check-shards merge output or shard reports)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Bug {
	readonly id: string;
	readonly report: string;
	readonly build: string | null;
	readonly route: string;
	readonly caught: string;
	readonly fixture: string;
}

interface Corpus {
	readonly builds: Record<string, string>;
	readonly bugs: readonly Bug[];
}

interface Finding {
	readonly dimension: string;
	readonly check: string;
	readonly expected: string;
	readonly actual: string;
	readonly accepted?: unknown;
}

interface RouteReport {
	readonly route: string;
	readonly ok: boolean;
	readonly infrastructure?: { readonly message?: string };
	readonly blocked?: unknown;
	readonly failures?: readonly Finding[];
}

export const findingText = (f: Finding) => `${f.dimension}: ${f.check} | ${f.expected} | ${f.actual}`;

/** A finding that names the bug: not accepted, not a control the run never used (a coverage gap names nothing it does). */
export function names(bug: Pick<Bug, 'caught'>, f: Finding): boolean {
	return !f.accepted && !f.check.startsWith('not exercised') && new RegExp(bug.caught).test(findingText(f));
}

export type Verdict = { readonly bug: Bug; readonly state: 'caught' | 'missed' | 'not checked'; readonly detail: string };

export function verdicts(corpus: Corpus, reports: ReadonlyMap<string, readonly RouteReport[]>): Verdict[] {
	return corpus.bugs.filter((b) => b.build).map((bug) => {
		const routes = (reports.get(bug.build!) ?? []).filter((r) => r.route === bug.route);
		if (!routes.length) return { bug, state: 'not checked', detail: `no report of ${bug.route} on build ${bug.build}` };
		const unchecked = routes.find((r) => r.infrastructure || r.blocked);
		const hit = routes.flatMap((r) => r.failures ?? []).find((f) => names(bug, f));
		if (hit) return { bug, state: 'caught', detail: findingText(hit).slice(0, 240) };
		if (unchecked) return { bug, state: 'not checked', detail: unchecked.infrastructure?.message?.slice(0, 240) ?? 'blocked' };
		return { bug, state: 'missed', detail: `${routes.flatMap((r) => r.failures ?? []).filter((f) => !f.accepted).length} other findings on ${bug.route}` };
	});
}

async function reportsUnder(dir: string): Promise<RouteReport[]> {
	const out: RouteReport[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
		const path = join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== 'check-progress') out.push(...(await reportsUnder(path)));
		else if (entry.name === 'report.json') out.push(...((JSON.parse(await readFile(path, 'utf8')) as { routes: RouteReport[] }).routes ?? []));
	}
	return out;
}

const [command, file, a, b] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` && command && file) {
	const corpus = JSON.parse(await readFile(file, 'utf8')) as Corpus;
	if (command === 'matrix') {
		const seen = new Set<string>();
		const out = corpus.bugs.filter((x) => x.build && !seen.has(`${x.build} ${x.route}`) && seen.add(`${x.build} ${x.route}`)).map((x, i) => ({ build: x.build!, url: corpus.builds[x.build!]!, route: x.route, key: `${x.build}-${i}` }));
		console.log(JSON.stringify(out));
		process.exit(0);
	}
	if (command === 'targets' && a && b) {
		const routes = [...new Set(corpus.bugs.filter((x) => x.build === a).map((x) => x.route))];
		await writeFile(b, `${JSON.stringify({ routes, endpoints: [], redirects: [], unchecked: [] }, null, '\t')}\n`);
		console.log(JSON.stringify(routes));
		process.exit(0);
	}
	if (command === 'verify' && a) {
		const reports = new Map<string, RouteReport[]>();
		for (const build of Object.keys(corpus.builds)) reports.set(build, await reportsUnder(join(a, build)));
		const all = verdicts(corpus, reports);
		const lines = ['| bug | build | route | verdict | finding |', '| --- | --- | --- | --- | --- |', ...all.map((v) => `| ${v.bug.id} | ${v.bug.build} | ${v.bug.route} | ${v.state} | ${v.detail.replace(/\|/g, '\\|')} |`)];
		console.log(lines.join('\n'));
		const bad = all.filter((v) => v.state !== 'caught');
		if (bad.length) {
			console.error(`\n${bad.length} of ${all.length} corpus bugs are not reported by check: ${bad.map((v) => `${v.bug.id} (${v.state})`).join(', ')}`);
			process.exit(1);
		}
		process.exit(0);
	}
}
if (import.meta.url === `file://${process.argv[1]}`) {
	console.error('usage: corpus.ts matrix <bugs.json> | targets <bugs.json> <build> <out.json> | verify <bugs.json> <reports dir>');
	process.exit(2);
}

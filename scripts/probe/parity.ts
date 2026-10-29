// Replays a full dead-controls run against a plan: for every real finding, is it still made when each control is tried on
// one or two routes of its group? Usage: node scripts/probe/parity.ts <dir of PHASE=load .jsonl files> <full run dir> [seed];
// node scripts/probe/parity.ts compare <full run dir> <dir of a planned run's joined .jsonl> compares two runs of one build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildPlan, readLoadPhase, rootKey, trialKind, unplannedTrials, type Finding, type ListedControl, type Plan } from './plan.ts';

export interface Listed extends ListedControl {
	readonly template: string;
	readonly type?: string;
	readonly hint?: string;
	readonly options?: readonly string[];
}

export interface InventoryRow {
	readonly route: string;
	readonly engine: string;
	readonly findings: readonly Finding[];
}

const DAY = /(?:Today, )?(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, )?(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:st|nd|rd|th)?,? \d{4}/g;
const counts = (t: string) => t.replace(DAY, 'a day').replace(/\d[\d.,]*[kKmM]?/g, '#');

/** Findings a later probe rule no longer makes (the inventory reports' filters): not real findings. */
export function artifact(f: Finding): string | undefined {
	const { kind: k, control: c } = f;
	const e = String(f.expected ?? ''), a = String(f.actual ?? '');
	if (k === 'route-error') return 'route error';
	if (k === 'hit-region') {
		const m = /reaches (.*)$/.exec(e);
		if (m && a.replace(/^reaches /, '').split(' / ').some((x) => counts(x) === counts(m[1]!))) return 'live count';
		if (/^(navigation|complementary|aside|nav)/.test(c)) return 'sidebar scroll';
	}
	if (/^(dead|key-dead|input-dead)$/.test(k) && e.split(';')[0]!.trim() === 'changes banner') return 'banner (scroll)';
	if (k === 'region' && c.startsWith('link "')) return 'link to the page itself';
	if (k === 'key-focus' && counts(e) === counts(`focus ends on ${a.replace(/^on /, '')}`)) return 'calendar today';
	if (k === 'key-focus' && e.includes('textbox') && a.includes('textbox')) return 'textarea named by its text';
	if (/^(dead|key-dead|region|key-region)$/.test(k) && /^(radio|switch|checkbox) /.test(c.split(' > ').at(-1)!)) return 'native input checked by attribute';
	if ((k === 'box' || k === 'box-container') && f.route.startsWith('/docs/directory')) return 'slow /r/registries.json';
	return undefined;
}

const LOAD_PASS = new Set(['box', 'box-container', 'missing-at-width', 'hit-region']);
/** What a finding says, apart from where: its kind, width, and the path below its first control. */
const findingClass = (f: Finding) => `${f.kind}|${f.width ?? ''}|${counts(f.control.slice(rootKey(f.control).length).replace(/ #\d+/g, ''))}`;

const CAPS: Record<string, { use: number; key: number; input: number }> = { chromium: { use: 30, key: 24, input: 24 }, webkit: { use: 15, key: 8, input: 8 } };

/**
 * Which controls the full run used, per kind of use, rebuilt from the listing the way the unplanned probe picks them: routes
 * dealt to 10 shards x 4 workers, layout controls once per worker, at most 2 per name, then the per-route caps.
 */
export function usedByFullRun(routes: readonly string[], listing: ReadonlyMap<string, readonly Listed[]>, engine: string, shards = 10, workers = 4) {
	const caps = { ...CAPS[engine]!, keysPerControl: 4 };
	const used = { use: new Set<string>(), key: new Set<string>(), input: new Set<string>() };
	for (let s = 0; s < shards; s++)
		for (let w = 0; w < workers; w++) {
			const done = { layout: new Set<string>(), keyed: new Set<string>() };
			for (const route of routes.filter((_, i) => i % shards === s).filter((_, i) => i % workers === w)) {
				const trials = unplannedTrials(listing.get(route) ?? [], caps, done);
				for (const c of trials.use) used.use.add(`${route}\u0000${c.key}`);
				for (const c of trials.keyed) used.key.add(`${route}\u0000${c.key}`);
				for (const c of trials.typed) used.input.add(`${route}\u0000${c.key}`);
			}
		}
	return used;
}

export interface Verdict {
	readonly route: string;
	readonly engine: string;
	readonly finding: Finding;
	/** load-pass: every route still runs it. alone: the control's group is this one use. shared: every other route of the group the full run used made it too. differs: some did not. unknown: no other route of the group was used. unlisted: the plan does not know the control. */
	readonly verdict: 'load-pass' | 'alone' | 'shared' | 'differs' | 'unknown' | 'unlisted';
	readonly without?: string[];
	readonly planned?: 'here' | 'elsewhere-same' | 'elsewhere-differs' | 'elsewhere-unused';
}

/** One defect: a kind of finding on one group of controls, with how many of the group's routes the full run used and how many of those made it. */
export interface Defect {
	readonly engine: string;
	readonly kind: string;
	readonly trial: 'use' | 'keyed' | 'typed';
	readonly finding: string;
	readonly used: number;
	readonly made: number;
	/** Up to five routes and keys of the group that made it, and five the full run used that did not. */
	readonly sample: { readonly made: readonly string[]; readonly not: readonly string[] };
}

export function parity(rows: readonly InventoryRow[], listing: ReadonlyMap<string, readonly Listed[]>, plans: Readonly<Record<string, Plan>>, routeOrder: readonly string[]) {
	const verdicts: Verdict[] = [];
	const defects = new Map<string, Defect>();
	for (const engine of [...new Set(rows.map((r) => r.engine))]) {
		const plan = plans[engine]!;
		const used = usedByFullRun(routeOrder, listing, engine);
		const real = rows.filter((r) => r.engine === engine).flatMap((r) => r.findings.filter((f) => !artifact(f)).map((f) => ({ ...f, route: r.route })));
		const has = new Map<string, Set<string>>();
		for (const f of real) {
			const at = `${f.route}\u0000${rootKey(f.control)}`;
			(has.get(at) ?? has.set(at, new Set()).get(at)!).add(findingClass(f));
		}
		for (const f of real) {
			if (LOAD_PASS.has(f.kind)) { verdicts.push({ route: f.route, engine, finding: f, verdict: 'load-pass' }); continue; }
			const root = rootKey(f.control);
			const kind = f.control.includes(' > ') ? 'use' : trialKind(f.kind);
			const rp = plan.routes[f.route];
			const id = kind === 'use' ? rp?.group[root] : kind === 'keyed' ? rp?.keyGroup[root] : rp?.typeGroup[root];
			const g = id ? plan.groups[kind][id] : undefined;
			if (!g) { verdicts.push({ route: f.route, engine, finding: f, verdict: 'unlisted' }); continue; }
			const cls = findingClass(f), set = used[kind === 'keyed' ? 'key' : kind === 'typed' ? 'input' : 'use'];
			const same = (m: { route: string; key: string }) => has.get(`${m.route}\u0000${m.key}`)?.has(cls) ?? false;
			const others = g.members.filter((m) => !(m.route === f.route && m.key === root) && set.has(`${m.route}\u0000${m.key}`));
			const without = others.filter((m) => !same(m)).map((m) => `${m.route} ${m.key}`);
			const planned = g.by.some((u) => u.route === f.route && u.key === root) ? 'here' : g.by.some((u) => set.has(`${u.route}\u0000${u.key}`) && same(u)) ? 'elsewhere-same' : g.by.every((u) => !set.has(`${u.route}\u0000${u.key}`)) ? 'elsewhere-unused' : 'elsewhere-differs';
			const verdict = g.members.length === 1 ? 'alone' : !others.length ? 'unknown' : without.length ? 'differs' : 'shared';
			const dk = `${engine}|${kind}|${id}|${cls}`;
			if (!defects.has(dk)) {
				const usedMembers = g.members.filter((m) => set.has(`${m.route}\u0000${m.key}`) || same(m));
				const id = (m: { route: string; key: string }) => `${m.route} ${m.key}${f.control.slice(root.length)}`;
				defects.set(dk, { engine, kind: f.kind, trial: kind, finding: `${root} ${cls}`, used: usedMembers.length, made: usedMembers.filter(same).length, sample: { made: usedMembers.filter(same).slice(0, 5).map(id), not: usedMembers.filter((m) => !same(m)).slice(0, 5).map(id) } });
			}
			verdicts.push({ route: f.route, engine, finding: f, verdict, planned, ...(without.length ? { without } : {}) });
		}
	}
	return { verdicts, defects: [...defects.values()] };
}

/**
 * A planned run's joined rows against a full run of the same build: each real finding of the full run is made by the planned
 * run (on its route, or copied there from its group), or it is not. Findings only the planned run made are counted too.
 */
export function compareRuns(full: readonly InventoryRow[], planned: readonly InventoryRow[]) {
	const at = (route: string, f: Finding) => `${route}|${f.kind}|${f.width ?? ''}|${counts(f.control)}`;
	const made = new Set(planned.flatMap((r) => r.findings.filter((f) => !artifact(f)).map((f) => at(r.route, f))));
	const wanted = new Set(full.flatMap((r) => r.findings.filter((f) => !artifact(f)).map((f) => at(r.route, f))));
	const missed = full.flatMap((r) => r.findings.filter((f) => !artifact(f) && !made.has(at(r.route, f))).map((f) => ({ ...f, route: r.route, engine: r.engine })));
	const gained = planned.flatMap((r) => r.findings.filter((f) => !artifact(f) && !wanted.has(at(r.route, f))).map((f) => ({ ...f, route: r.route, engine: r.engine })));
	return { real: wanted.size, missed, gained };
}

function readInventory(dir: string): InventoryRow[] {
	const rows: InventoryRow[] = [];
	const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.jsonl')) for (const l of readFileSync(p, 'utf8').split('\n')) if (l.trim()) rows.push(JSON.parse(l)); } };
	walk(dir);
	return rows;
}

if (import.meta.main && process.argv[2] === 'compare') {
	const [, , , fullDir, plannedDir] = process.argv;
	const engines = (rows: InventoryRow[]) => [...new Set(rows.map((r) => r.engine))];
	const full = readInventory(fullDir!).filter((r) => !('phase' in r));
	const planned = readInventory(plannedDir!);
	for (const engine of engines(full)) {
		const { real, missed, gained } = compareRuns(full.filter((r) => r.engine === engine), planned.filter((r) => r.engine === engine));
		console.log(`${engine}: ${real} real findings in the full run, ${real - new Set(missed.map((f) => `${f.route}|${f.kind}|${f.control}`)).size} made by the planned run, ${missed.length} not; ${gained.length} made only by the planned run`);
		const kinds = new Map<string, number>();
		for (const f of missed) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
		console.log(`  not made, by kind: ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
		if (process.env.DUMP) for (const f of missed) console.log(JSON.stringify(f));
	}
} else if (import.meta.main) {
	const [listingDir, inventoryDir, seed = 'parity'] = process.argv.slice(2);
	if (!listingDir || !inventoryDir) {
		console.error('usage: parity.ts <dir of PHASE=load .jsonl files> <dir of a full run\'s .jsonl files> [seed]');
		process.exit(2);
	}
	const loaded = readLoadPhase(listingDir);
	const listing = new Map(loaded.map((r) => [r.route, r.controls as Listed[]]));
	const plans = Object.fromEntries(Object.entries(CAPS).map(([engine, c]) => [engine, buildPlan(loaded, { seed, caps: { ...c, keysPerControl: 4 } })]));
	const targets = JSON.parse(readFileSync(new URL('../../deploy/shadcn-ui/check-targets.json', import.meta.url), 'utf8'));
	const order = (Array.isArray(targets) ? targets : Array.isArray(targets.routes) ? targets.routes : Object.keys(targets.routes ?? targets)).filter((r: unknown) => typeof r === 'string' && r.startsWith('/')) as string[];
	const { verdicts, defects } = parity(readInventory(inventoryDir), listing, plans, order);
	for (const engine of ['chromium', 'webkit']) {
		const mine = defects.filter((d) => d.engine === engine);
		const rate = (d: Defect) => d.made / d.used;
		const sum = (f: (d: Defect) => number) => Math.round(mine.reduce((n, d) => n + f(d), 0));
		console.log(`${engine}: ${mine.length} defects (a kind of finding on one group); ${mine.filter((d) => d.made === d.used).length} made on every route of the group the full run used; a planned run makes on average ${sum((d) => 1 - (1 - rate(d)) ** (d.used <= 4 ? d.used : 2))} of them (${sum(rate)} if each group were clicked on one route only)`);
	}
	const tally = new Map<string, number>();
	for (const v of verdicts) {
		const k = `${v.engine} ${v.verdict}${v.planned ? ` / ${v.planned}` : ''}`;
		tally.set(k, (tally.get(k) ?? 0) + 1);
	}
	for (const [k, n] of [...tally].sort()) console.log(`${n}\t${k}`);
	for (const [engine, plan] of Object.entries(plans)) console.log(JSON.stringify({ engine, groups: Object.keys(plan.groups.use).length, ...plan.work }));
	if (process.env.DEFECTS) for (const d of defects) console.log(JSON.stringify(d));
	if (process.env.DUMP) for (const v of verdicts) if (v.verdict === 'differs' || v.verdict === 'unlisted' || v.verdict === 'unknown') console.log(JSON.stringify(v));
}

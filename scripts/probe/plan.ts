// Site-wide plan for the dead-controls probe. Every route gets its load-and-render pass (PHASE=load); each distinct control,
// by what it is on both sides, is then clicked, keyed and typed into on one route of the routes that have it (PLAN=), and
// what that use finds is reported on every route of its group. Usage:
//   node scripts/probe/plan.ts build <dir of PHASE=load .jsonl files> <plan.json> [seed]
//   node scripts/probe/plan.ts join <plan.json> <dir of the run's .jsonl files> <out.jsonl>
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the page says a control is: element, slot, classes, data and ARIA attributes, slot ancestry, own and controlled subtrees. */
export interface ControlSig {
	readonly tag: string;
	readonly type: string;
	readonly slot: string;
	readonly cls: string;
	readonly data: string;
	readonly aria: string;
	readonly chain: string;
	readonly href: string;
	readonly own: string;
	readonly target?: string;
	/** The subtree of the example frame (preview, figure, section, dialog or main) the control sits in. */
	readonly frame?: string;
}

export interface ListedControl {
	readonly key: string;
	readonly role: string;
	readonly name: string;
	readonly layout: boolean;
	readonly leaves: boolean;
	readonly template?: string;
	readonly type?: string;
	readonly hint?: string;
	readonly options?: readonly string[];
	readonly popup?: boolean;
	readonly sig?: ControlSig;
	/** The port's control paired with this one by place, when there is one. */
	readonly port?: { readonly key: string; readonly sig?: ControlSig };
}

export interface RouteControls {
	readonly route: string;
	readonly controls: readonly ListedControl[];
}

type Planned = Omit<ListedControl, 'sig' | 'port'> & { readonly film?: boolean };
type Member = { readonly route: string; readonly key: string };

export interface Plan {
	readonly version: 1;
	readonly seed: string;
	/** Per route: the controls it clicks (use), keys (keyed) and types into (typed), every key it lists, and each key's group for each kind of trial. */
	readonly routes: Record<string, { readonly use: Planned[]; readonly keyed: Planned[]; readonly typed: Planned[]; readonly keys: string[]; readonly group: Record<string, string>; readonly keyGroup: Record<string, string>; readonly typeGroup: Record<string, string>; readonly nested: number }>;
	/** Per kind of trial and group: the route and key it runs on, and every route and key the group stands for. */
	readonly groups: Record<'use' | 'keyed' | 'typed', Record<string, { readonly by: Member[]; readonly members: Member[] }>>;
	readonly work: { readonly uses: number; readonly keyTrials: number; readonly inputTrials: number; readonly overBudget: number };
}

export interface Caps {
	readonly use: number;
	readonly key: number;
	readonly input: number;
	readonly keysPerControl: number;
	/** Routes each larger group is tried on: a finding the probe makes only some of the time is then missed less often. */
	readonly useRoutes?: number;
	/** A group with at most this many members is tried on every one of them. */
	readonly everyRouteUpTo?: number;
}

const DAY = /(?:Today, )?(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, )?(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:st|nd|rd|th)?,? \d{4}/g;
const hash = (text: string) => createHash('sha256').update(text).digest('base64url').slice(0, 16);
const sigText = (s: ControlSig) => [s.tag, s.type, s.slot, s.cls, s.data, s.aria, s.chain, s.href, s.own, s.target ?? ''].join('\u0001');

/**
 * A control's identity across the site: what it is on both sides. A click's identity takes everything the page says the
 * control is plus its name (a menu's "Copy" and "Delete" do different things), and for a control that reveals content the
 * frame it sits in, since what it reveals is the page's own. An input's takes the same without the name but with the frame,
 * since what typing changes (a filtered list) is the page's own too. A key trial's takes what decides how it answers the
 * keyboard: element, role, slot, which data attributes it has, ARIA attributes, slot ancestry. A control with no signature, or no paired
 * control on the port, is its own identity: nothing is known that makes it the same as another page's.
 */
export function identity(route: string, c: ListedControl, kind: TrialKind = 'use'): string {
	if (!c.sig || !c.port?.sig) return `only:${hash(`${route}\u0000${c.key}`)}`;
	const text = kind === 'keyed' ? keyText : sigText;
	const framed = kind === 'typed' || (kind === 'use' && (c.popup || c.role === 'tab' || Boolean(c.sig.target)));
	return hash([c.role, kind === 'use' ? c.name.replace(DAY, 'a day') : '', c.layout ? 'layout' : 'content', text(c.sig), text(c.port.sig), framed ? `${c.sig.frame ?? ''}|${c.port.sig.frame ?? ''}` : ''].join('\u0000'));
}
// Which data attributes a control has, not their values: a React Aria part's data-rac, not an item's data-active.
const keyText = (s: ControlSig) => [s.tag, s.type, s.slot, s.data.replace(/=[^|]*/g, ''), s.aria, s.chain, s.href ? 'link' : ''].join('\u0001');

// The probe's own rules for what a control is keyed and typed with, and how many trials that takes.
export const keyTrials = (c: ListedControl, perControl: number) => Math.min(perControl, c.role === 'link' ? 2 : /^(checkbox|switch|menuitemcheckbox)$/.test(c.role) ? 3 : 8);
export const isInput = (c: ListedControl) => /^(textbox|searchbox|spinbutton|combobox)$/.test(c.role) && !c.options && /^(text|search|date|number|email|tel|url|textarea|)$/.test(c.type ?? '');
const inputKind = (c: ListedControl) => (c.type === 'date' ? 'nativeDate' : /date|day|month|year|birth|calendar|dd|mm\/|yyyy|\d{1,2}\/\d{1,2}/i.test(`${c.hint} ${c.name}`) ? 'date' : c.type === 'number' || /numeric|decimal|amount|price|quantity|count|age/i.test(c.hint ?? '') || c.role === 'spinbutton' ? 'number' : 'text');
const INPUT_VALUES: Record<string, number> = { date: 9, nativeDate: 3, number: 8, text: 5 };
export const inputTrials = (c: ListedControl) => INPUT_VALUES[inputKind(c)]!;

const strip = ({ sig: _, port: __, ...c }: ListedControl): Planned => c;

/**
 * What the unplanned probe tries on one route, by its own rules: clicks on the first `use` controls that do not leave the
 * page (at most 2 per name), key trials on one control of each template (content first) up to `key` trials, input trials
 * on one input of each template and kind (3 for dates) up to `input` trials. `done` carries a worker's layout and keyed
 * controls from route to route, as the unplanned probe does; the plan leaves it out and groups them instead.
 */
export function unplannedTrials(controls: readonly ListedControl[], caps: Pick<Caps, 'use' | 'key' | 'input' | 'keysPerControl'>, done?: { readonly layout: Set<string>; readonly keyed: Set<string> }) {
	const staying = controls.filter((c) => !c.leaves);
	const perName = new Map<string, number>();
	const use = staying
		.filter((c) => !(done && c.layout && done.layout.has(c.key)))
		.filter((c) => {
			const n = (perName.get(`${c.role}|${c.name}`) ?? 0) + 1;
			perName.set(`${c.role}|${c.name}`, n);
			return n <= 2;
		})
		.slice(0, caps.use);
	if (done) for (const c of staying) if (c.layout) done.layout.add(c.key);
	const typed: ListedControl[] = [];
	const inputTemplates = new Map<string, number>();
	let inputs = 0;
	for (const c of staying.filter((c) => !c.layout && isInput(c))) {
		const kind = inputKind(c);
		const seen = (inputTemplates.get(`${c.template}|${kind}`) ?? 0) + 1;
		inputTemplates.set(`${c.template}|${kind}`, seen);
		if (seen > (kind === 'date' ? 3 : 1) || inputs >= caps.input) continue;
		typed.push(c);
		inputs += inputTrials(c);
	}
	const rank = (c: ListedControl) => (c.layout ? 2 : c.role === 'link' ? 1 : 0);
	const keyed: ListedControl[] = [];
	const templates = new Set<string>();
	let keys = 0;
	for (const c of [...staying].sort((a, b) => rank(a) - rank(b))) {
		if (keys >= caps.key) break;
		if ((done && c.layout && done.keyed.has(c.key)) || templates.has(c.template ?? '')) continue;
		templates.add(c.template ?? '');
		if (done && c.layout) done.keyed.add(c.key);
		keyed.push(c);
		keys += keyTrials(c, caps.keysPerControl);
	}
	return { use, keyed, typed };
}

export type TrialKind = 'use' | 'keyed' | 'typed';

/**
 * For each kind of trial, among the controls the unplanned probe would try, every route of a group of up to four and two
 * routes of a larger one: a seeded choice (so coverage rotates between runs), moved to the next route in that order while
 * the chosen one has no room left under its cap. Groups with fewest routes choose first, so a control only one page has
 * is tried there.
 */
export function buildPlan(routes: readonly RouteControls[], options: { readonly seed: string; readonly caps: Caps }): Plan {
	const { caps } = options;
	const kinds: Record<TrialKind, { cap: number; cost: (c: ListedControl) => number; eligible: (c: ListedControl) => boolean }> = {
		use: { cap: caps.use, cost: () => 1, eligible: () => true },
		keyed: { cap: caps.key, cost: (c) => keyTrials(c, caps.keysPerControl), eligible: () => true },
		typed: { cap: caps.input, cost: inputTrials, eligible: (c) => !c.layout && isInput(c) },
	};
	// What a use reveals is used within the room the unplanned probe's own controls leave under the cap, as it is today.
	const plan: Plan['routes'] = Object.fromEntries(routes.map((r) => [r.route, { use: [], keyed: [], typed: [], keys: r.controls.map((c) => c.key), group: {}, keyGroup: {}, typeGroup: {}, nested: Math.max(0, caps.use - unplannedTrials(r.controls, caps).use.length) }]));
	const groups: Plan['groups'] = { use: {}, keyed: {}, typed: {} };
	const work = { uses: 0, keyTrials: 0, inputTrials: 0, overBudget: 0 };
	const films = new Set<string>();
	for (const kind of ['use', 'keyed', 'typed'] as const) {
		const { cap, cost, eligible } = kinds[kind];
		const members = new Map<string, Member[]>();
		const candidates = new Map<string, Member[]>();
		const byKey = new Map<string, ListedControl>();
		for (const { route, controls } of routes) {
			// Only what the unplanned probe would try is tried; every control of a group still hears what its group's trials find.
			const tried = new Set(unplannedTrials(controls, caps)[kind].map((c) => c.key));
			for (const c of controls) {
				if (c.leaves || !eligible(c)) continue;
				const id = identity(route, c, kind);
				const field = kind === 'use' ? 'group' : kind === 'keyed' ? 'keyGroup' : 'typeGroup';
				plan[route]![field][c.key] = id;
				byKey.set(`${route}\u0000${c.key}`, c);
				(members.get(id) ?? members.set(id, []).get(id)!).push({ route, key: c.key });
				if (tried.has(c.key)) (candidates.get(id) ?? candidates.set(id, []).get(id)!).push({ route, key: c.key });
			}
		}
		const room = new Map<string, number>();
		for (const [id, list] of [...candidates].sort(([a, x], [b, y]) => x.length - y.length || (a < b ? -1 : a > b ? 1 : 0))) {
			const rank = (m: Member) => hash(`${options.seed}\u0000${kind}\u0000${id}\u0000${m.route}\u0000${m.key}`);
			// A control that reveals more goes first to routes with room to use what it reveals.
			const reveals = (m: Member) => { const c = byKey.get(`${m.route}\u0000${m.key}`)!; return kind === 'use' && (c.popup || c.role === 'tab' || Boolean(c.sig?.target)) && plan[m.route]!.nested > 0 ? 0 : 1; };
			let left = [...list].sort((a, b) => reveals(a) - reveals(b) || (rank(a) < rank(b) ? -1 : 1));
			const n = cost(byKey.get(`${left[0]!.route}\u0000${left[0]!.key}`)!);
			const by: Member[] = [];
			// A group only a few routes have is tried on all of them: it is more often one page family's own example than shared chrome.
			const tries = list.length <= (caps.everyRouteUpTo ?? 4) ? list.length : (caps.useRoutes ?? 2);
			for (let i = 0; i < tries && left.length; i++) {
				const fits = left.find((m) => (room.get(m.route) ?? 0) + n <= cap);
				if (!fits) work.overBudget++;
				const chosen = fits ?? left.reduce((a, b) => ((room.get(b.route) ?? 0) < (room.get(a.route) ?? 0) ? b : a));
				room.set(chosen.route, (room.get(chosen.route) ?? 0) + n);
				const control = strip(byKey.get(`${chosen.route}\u0000${chosen.key}`)!);
				if (kind === 'use') {
					const template = control.template ?? `${control.role}|`;
					plan[chosen.route]!.use.push({ ...control, film: !films.has(template) });
					films.add(template);
					work.uses++;
				} else {
					plan[chosen.route]![kind].push(control);
					if (kind === 'keyed') work.keyTrials += n;
					else work.inputTrials += n;
				}
				by.push(chosen);
				// A second use goes to another route where there is one: a page-wide cause shows on one page, not on its namesakes.
				left = left.filter((m) => m !== chosen && (m.route !== chosen.route || left.every((o) => o.route === chosen.route)));
			}
			groups[kind][id] = { by, members: members.get(id)! };
		}
	}
	return { version: 1, seed: options.seed, routes: plan, groups, work };
}

/** The first control of a finding's control path: `a > b`, `a + Enter`, `a <- "42"` all start at `a`. */
export function rootKey(control: string): string {
	return control.split(' > ')[0]!.replace(/ <- ".*"$/, '').replace(/ \+ [^"]*$/, '');
}

export interface Finding {
	readonly route: string;
	readonly control: string;
	readonly kind: string;
	readonly [field: string]: unknown;
}

/**
 * Each finding a planned trial made, reported again on every other route and key of its group, marked with the route it was
 * seen on. Findings of the load-and-render pass, and of controls the plan does not know, stay as they are.
 */
export function fanOut(findings: readonly Finding[], plan: Plan): (Finding & { via?: string })[] {
	const out: (Finding & { via?: string })[] = [];
	// The same finding from both routes a group was used on is reported once on each other route.
	const seen = new Set<string>();
	for (const f of findings) {
		out.push(f);
		const root = rootKey(f.control);
		// A finding behind another control (`a > b`) came from using `a`, whatever kind it is.
		const kind = f.control.includes(' > ') ? ('use' as const) : trialKind(f.kind);
		const routePlan = plan.routes[f.route];
		const id = kind === 'use' ? routePlan?.group[root] : kind === 'keyed' ? routePlan?.keyGroup[root] : routePlan?.typeGroup[root];
		const g = id ? plan.groups[kind][id] : undefined;
		if (!g || !g.by.some((b) => b.route === f.route && b.key === root)) continue;
		for (const m of g.members) {
			if (g.by.some((b) => b.route === m.route && b.key === m.key)) continue;
			const copy = { ...f, route: m.route, control: m.key + f.control.slice(root.length), via: f.route };
			const same = `${copy.route}\u0000${copy.control}\u0000${copy.kind}\u0000${String(f.width ?? '')}`;
			if (seen.has(same)) continue;
			seen.add(same);
			out.push(copy);
		}
	}
	return out;
}

/** Which kind of trial made a finding: a key-* finding a keyed one, an input-* finding a typed one, any other a use. */
export const trialKind = (kind: string): TrialKind => (kind.startsWith('key-') ? 'keyed' : kind.startsWith('input-') ? 'typed' : 'use');

export function readLoadPhase(dir: string): RouteControls[] {
	const routes = new Map<string, RouteControls>();
	const walk = (d: string) => {
		for (const name of readdirSync(d)) {
			const path = join(d, name);
			if (statSync(path).isDirectory()) walk(path);
			else if (name.endsWith('.jsonl'))
				for (const line of readFileSync(path, 'utf8').split('\n')) {
					if (!line.trim()) continue;
					const row = JSON.parse(line) as { route: string; phase?: string; controls?: ListedControl[] };
					if (row.phase === 'load' && row.controls) routes.set(row.route, { route: row.route, controls: row.controls });
				}
		}
	};
	walk(dir);
	return [...routes.values()].sort((a, b) => (a.route < b.route ? -1 : 1));
}

/** Every route's rows of a planned run as one row per route: its load-pass findings and every finding its group's trials made. */
export function joinRun(rows: readonly { route: string; engine: string; phase?: string; tried: number; ms: number; findings: Finding[] }[], plan: Plan): { route: string; engine: string; tried: number; ms: number; findings: (Finding & { via?: string })[] }[] {
	const byRoute = new Map<string, { route: string; engine: string; tried: number; ms: number; findings: (Finding & { via?: string })[] }>();
	const at = (route: string, engine: string) => byRoute.get(route) ?? byRoute.set(route, { route, engine, tried: 0, ms: 0, findings: [] }).get(route)!;
	for (const row of rows) {
		const r = at(row.route, row.engine);
		r.tried += row.tried;
		r.ms += row.ms;
		if (row.phase === 'load') r.findings.push(...row.findings);
	}
	const engine = rows[0]?.engine ?? '';
	for (const f of fanOut(rows.filter((row) => row.phase !== 'load').flatMap((row) => row.findings.map((f) => ({ ...f, route: row.route }))), plan)) at(f.route, engine).findings.push(f);
	return [...byRoute.values()].sort((a, b) => (a.route < b.route ? -1 : 1));
}

function readRows(dir: string) {
	const rows: { route: string; engine: string; phase?: string; tried: number; ms: number; findings: Finding[] }[] = [];
	const walk = (d: string) => {
		for (const name of readdirSync(d)) {
			const path = join(d, name);
			if (statSync(path).isDirectory()) walk(path);
			else if (name.endsWith('.jsonl')) for (const line of readFileSync(path, 'utf8').split('\n')) if (line.trim()) rows.push(JSON.parse(line));
		}
	};
	walk(dir);
	return rows;
}

if (import.meta.main) {
	const [command, a, b, c] = process.argv.slice(2);
	if (command === 'build' && a && b) {
		const seed = c ?? new Date().toISOString().slice(0, 10);
		const caps = { use: Number(process.env.MAX_ACTIONS ?? 30), key: Number(process.env.KEY_MAX ?? 24), input: Number(process.env.INPUT_MAX ?? 24), keysPerControl: Number(process.env.KEYS_PER_CONTROL ?? 4) };
		const plan = buildPlan(readLoadPhase(a), { seed, caps });
		writeFileSync(b, JSON.stringify(plan));
		console.log(`${Object.keys(plan.routes).length} routes, ${Object.keys(plan.groups.use).length} distinct controls: ${plan.work.uses} uses, ${plan.work.keyTrials} key trials, ${plan.work.inputTrials} input trials${plan.work.overBudget ? `; ${plan.work.overBudget} placed over a route's cap` : ''} (seed ${seed})`);
	} else if (command === 'join' && a && b && c) {
		const joined = joinRun(readRows(b), JSON.parse(readFileSync(a, 'utf8')) as Plan);
		writeFileSync(c, joined.map((r) => JSON.stringify(r)).join('\n') + '\n');
		console.log(`${joined.length} routes, ${joined.reduce((n, r) => n + r.findings.length, 0)} findings (${joined.reduce((n, r) => n + r.findings.filter((f) => f.via).length, 0)} reported from another route of their group)`);
	} else {
		console.error('usage: plan.ts build <dir of PHASE=load .jsonl files> <plan.json> [seed] | join <plan.json> <dir of the run\'s .jsonl files> <out.jsonl>');
		process.exit(2);
	}
}

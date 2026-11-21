// Convert's side of the discovery recordings: which pressed controls no recording ported, per route, against the last run.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { discoverDir, discoverPageKey, keepCurrent, KIND } from './key.ts';
import { assertLocal, recordDiscovery, type Claimed, type DiscoverFacts, type PressedControl, type Shared } from './record.ts';
import { deadCount, type DeadControl, type DiscoveryReport, type RouteDiscovery } from './report.ts';
import { sharedControls, UNSHARED } from './shared.ts';

export { discoveryMarkdown, summarizeDiscovery, type DeadControl, type DiscoveryReport, type RouteDiscovery } from './report.ts';

/** What the other recordings of a route already port, by the signatures they key controls by. */
export interface Claims {
	/** Controls a recording uses: sig#nth. */
	readonly controls: ReadonlySet<string>;
	/** Widgets a recording ports whole (a carousel, a table, a chart): every control inside is theirs. sig#nth. */
	readonly holders: ReadonlySet<string>;
	/** Each recorded demo's container and the label signatures of the controls its uses were recorded for. */
	readonly scenes: readonly { readonly holder: string; readonly labels: ReadonlySet<string> }[];
	/** Controls the site names in controls.json by their name (a theme toggle). */
	readonly names: ReadonlySet<string>;
}

const STATEFUL = new Set<PressedControl['shape']>(['transient', 'toggle', 'one-way', 'cycle', 'sequence']);
const STOPPED = new Set<PressedControl['shape']>(['blocked', 'navigates', 'window', 'download', 'dialog']);

const line = (c: PressedControl): string => {
	const how = c.shape === 'transient' ? 'changes the page and puts it back by itself' : c.shape === 'toggle' ? 'switches the page between two states' : c.shape === 'one-way' ? 'changes the page once' : c.shape === 'cycle' ? `cycles the page through ${c.states} states` : `takes the page through ${c.states}+ states`;
	const what = (c.changes ?? []).slice(0, 3).map((x) => (x.what === 'text' || x.what === 'attribute' || x.what === 'scroll' ? `${x.what === 'attribute' ? `${x.name} of` : x.what === 'scroll' ? 'scroll of' : 'text of'} ${x.at}: ${JSON.stringify(x.before ?? '')} -> ${JSON.stringify(x.after ?? '')}` : x.what === 'focus' ? `moves focus to ${x.at}` : x.what === 'announced' ? `announces ${JSON.stringify(x.after)} in ${x.at}` : `${x.what} ${x.at}`));
	return `${how}${what.length ? `: ${what.join('; ')}` : ''}`;
};

/** `control` when a recording (or a scene's uses) takes the control itself; `holder` when it only sits in a widget a recording ports whole. */
export function claimed(c: PressedControl, claims: Claims): 'control' | 'holder' | undefined {
	if (claims.controls.has(`${c.sig}#${c.nth}`) || claims.names.has(c.name)) return 'control';
	if (claims.scenes.some((s) => c.ancestors.includes(s.holder) && s.labels.has(c.labelSig))) return 'control';
	return c.ancestors.some((a) => claims.holders.has(a)) ? 'holder' : undefined;
}

/** One route's discovery: the stateful controls no recording ports, and what was pressed but not read. */
export function routeDiscovery(facts: DiscoverFacts, claims: Claims): RouteDiscovery {
	const mine = facts.controls.filter((c) => claimed(c, claims) !== 'control');
	const held = (c: PressedControl) => claimed(c, claims) === 'holder';
	const sameAs: Record<string, number> = {};
	for (const c of facts.controls) if (c.sameAs) sameAs[c.sameAs.route] = (sameAs[c.sameAs.route] ?? 0) + 1;
	const like = facts.repeats ?? {};
	const likeOf = facts.repeatsOf ?? {};
	const named = new Map(facts.controls.map((c) => [`${c.sig}#${c.nth}`, c.name]));
	// A control left to the reveals or the toggles by their selector that they recorded nothing for: no one looked at it.
	const unlooked = (facts.left ?? []).filter((l) => l.to !== 'grids' && !claims.controls.has(`${l.sig}#${l.nth}`) && !claims.names.has(l.name));
	// A grid no recording holds (no day picker, no table) had its cells left unpressed for nothing: named, never dropped.
	const loose = (facts.left ?? []).filter((l) => l.to === 'grids' && !(l.ancestors ?? []).some((a) => claims.holders.has(a)) && !claims.holders.has(`${l.sig}#${l.nth}`));
	const pressedAt = new Map(facts.controls.map((c) => [`${c.sig}#${c.nth}`, c]));
	const deadAt = new Set(mine.filter((c) => STATEFUL.has(c.shape)).map((c) => `${c.sig}#${c.nth}`));
	// A recording that takes a control takes none of its repeats: each one no recording takes is asked of the port.
	const orphans = Object.entries(likeOf).flatMap(([at, xs]): DeadControl[] => {
		const c = pressedAt.get(at);
		if (deadAt.has(at) || (c ? claimed(c, claims) !== 'control' || !STATEFUL.has(c.shape) : !claims.controls.has(at))) return [];
		return xs.filter((x) => !claims.controls.has(`${x.sig}#${x.nth}`) && !claims.names.has(x.name)).map((x) => ({ name: x.name, sig: x.sig, nth: x.nth, labelSig: x.labelSig, pair: x.pair, found: x.found, shape: c?.shape ?? 'not pressed', ...(c?.states ? { states: c.states } : {}), what: c ? `${line(c)} (a repeat of one a recording ports, not pressed)` : 'a repeat of a control a recording ports, not pressed' }));
	});
	return {
		candidates: facts.candidates,
		found: { role: facts.controls.filter((c) => c.found === 'role').length, cursor: facts.controls.filter((c) => c.found === 'cursor').length },
		pressed: facts.controls.length,
		claimed: (facts.claimedSkipped ?? 0) + facts.controls.length - mine.length + mine.filter((c) => held(c) && !STATEFUL.has(c.shape)).length,
		inert: mine.filter((c) => c.shape === 'inert' && !held(c)).length,
		dead: [...mine.filter((c) => STATEFUL.has(c.shape)).map((c): DeadControl => ({ name: c.name, sig: c.sig, nth: c.nth, labelSig: c.labelSig, ...(c.pair !== undefined ? { pair: c.pair } : {}), found: c.found, shape: c.shape, ...(c.states ? { states: c.states } : {}), ...(held(c) ? { held: true } : {}), what: `${line(c)}${c.sameAs ? ` (same as ${c.sameAs.route})` : ''}`, ...(like[`${c.sig}#${c.nth}`] ? { repeated: like[`${c.sig}#${c.nth}`] } : {}), ...(likeOf[`${c.sig}#${c.nth}`]?.length ? { repeatsOf: likeOf[`${c.sig}#${c.nth}`] } : {}) })), ...orphans],
		unknown: [...mine.filter((c) => (STOPPED.has(c.shape) || c.shape === 'unpressable') && !held(c)).map((c) => ({ name: c.name, shape: c.shape, ...(c.why ? { why: c.why } : {}) })), ...unlooked.map((l) => ({ name: l.name, shape: 'unpressable' as const, left: l.to, why: `left to the ${l.to}, which recorded nothing for it` })), ...loose.map((l) => ({ name: l.name, shape: 'unpressable' as const, left: 'grids' as const, why: `a grid of ${l.cells ?? 0} cells no recording holds, its cells not pressed` }))],
		excluded: facts.excluded,
		...(Object.keys(like).length ? { repeats: Object.fromEntries(Object.entries(like).map(([at, n]) => [`"${named.get(at) ?? ''}" (${at})`, n])) } : {}),
		...(Object.keys(sameAs).length ? { sameAs } : {}),
		...(facts.spotMismatch?.length ? { spotMismatch: facts.spotMismatch.map(({ name, owner }) => ({ name, owner })) } : {}),
		seconds: Math.round(facts.ms / 100) / 10,
		...(facts.cut ? { cut: true } : {}),
		...(facts.error ? { error: facts.error } : {}),
	};
}

const LAST = 'last.json';

const incompleteOf = (routes: Readonly<Record<string, RouteDiscovery>>) => Object.entries(routes).filter(([, r]) => r.error || r.cut || r.untrusted || r.spotMismatch?.length).map(([route]) => route).sort();
const sum = (routes: Readonly<Record<string, RouteDiscovery>>) => ({
	count: Object.values(routes).reduce((n, r) => n + deadCount(r), 0),
	deadRoutes: Object.values(routes).filter((r) => r.dead.length).length,
	handled: Object.values(routes).reduce((n, r) => n + (r.handled ?? []).reduce((k, h) => k + 1 + (h.repeated ?? 0), 0), 0),
	incomplete: incompleteOf(routes),
});
const totals = (routes: Readonly<Record<string, RouteDiscovery>>) => {
	const { count, deadRoutes, handled, incomplete } = sum(routes);
	return { count, deadRoutes, ...(handled ? { handled } : {}), ...(incomplete.length ? { incomplete } : {}) };
};

/** The report as convert leaves it: dead by the recordings alone, before the written port is asked (`finishDiscovery`). */
export function draftReport(routes: Readonly<Record<string, RouteDiscovery>>, notRun?: string): DiscoveryReport {
	return { routes, ...totals(routes), ...(notRun ? { notRun } : {}) };
}

/** Asks the written port about each control left dead: a handler there moves it to `handled` (effect not compared), one that throws stays dead. */
export async function finishDiscovery(app: string, draft: DiscoveryReport): Promise<DiscoveryReport> {
	if (draft.notRun) return draft;
	// Every repeat is asked too: the same control elsewhere on the page may be wired where the one pressed is not, or the other way.
	const each = (r: RouteDiscovery): { d: DeadControl; ask: boolean }[] =>
		r.dead.flatMap(({ repeated, repeatsOf, ...d }) => {
			// A repeat kept with no place cannot be asked: dead on a line of its own, whatever the one pressed answers.
			const unasked = (repeated ?? 0) - (repeatsOf?.length ?? 0);
			return [{ d, ask: true }, ...(repeatsOf ?? []).map((x) => ({ d: { ...d, ...x, what: `${d.what} (a repeat of the one pressed, read from its press)` }, ask: true })), ...(unasked > 0 ? [{ d: { ...d, ...(unasked > 1 ? { repeated: unasked - 1 } : {}), what: `${d.what} (${unasked} repeats of the one pressed, kept with no place, not asked of the port)` }, ask: false }] : [])];
		});
	const wanted = new Map(Object.entries(draft.routes).filter(([, r]) => r.dead.length).map(([route, r]) => [route, each(r).filter((x) => x.ask).map((x) => x.d)] as const));
	// The sandbox (happy-dom) is loaded only here, after convert: convert itself never holds it.
	const { portAnswers } = await import('./ported.ts');
	const thrown: string[] = [];
	const answers = await portAnswers(app, wanted, (line) => thrown.push(line));
	const routes = Object.fromEntries(
		Object.entries(draft.routes).map(([route, r]) => {
			const got = answers.get(route);
			if (!got) return [route, r];
			const by = (d: DeadControl) => got.get(`${d.sig}#${d.nth}`) ?? { by: 'none' };
			const all = each(r);
			const handled = all.filter((x) => x.ask && by(x.d).by === 'handler').map((x) => x.d);
			const note = (d: DeadControl) => {
				const a = by(d);
				if (a.by === 'missing') return { ...d, what: `${d.what} (not found on the port by its signature)` };
				if (a.by === 'threw') return { ...d, what: `${d.what} (its handler on the port, ${a.where}, threw)` };
				return d.held ? { ...d, what: `${d.what} (inside a widget a recording ports, which does not answer this press)` } : d;
			};
			const dead = all.filter((x) => !x.ask || by(x.d).by !== 'handler').map((x) => (x.ask ? note(x.d) : x.d));
			return [route, { ...r, dead, ...(handled.length ? { handled: handled.map((d) => ({ name: d.name, by: by(d).where ?? '', ...(d.repeated ? { repeated: d.repeated } : {}) })) } : {}) }];
		}),
	);
	const report = await discoveryReport(join(app, '.migrate', 'convert'), routes);
	return thrown.length ? { ...report, thrown } : report;
}

/** The report against the store's last run (dead controls by route, the count derived); a route not looked at in full clears nothing. */
export async function discoveryReport(store: string, routes: Readonly<Record<string, RouteDiscovery>>, notRun?: string): Promise<DiscoveryReport> {
	const names = (r: Readonly<Record<string, readonly string[]>>) => new Set(Object.entries(r).flatMap(([route, dead]) => dead.map((d) => `${route} "${d}"`)));
	const counted = (r: Readonly<Record<string, readonly string[]>>) => Object.values(r).reduce((n, d) => n + d.length, 0);
	const incomplete = new Set(incompleteOf(routes));
	const now = Object.fromEntries(Object.entries(routes).filter(([route]) => !incomplete.has(route)).map(([route, r]) => [route, r.dead.flatMap((d) => Array.from({ length: 1 + (d.repeated ?? 0) }, () => d.name))]));
	const read: unknown = await readFile(join(store, KIND, LAST), 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);
	const last = isLast(read) ? read : undefined;
	let before: DiscoveryReport['before'];
	if (last && !notRun) {
		const was = names(last.dead);
		const is = names(now);
		before = { count: counted(last.dead), added: [...is].filter((n) => !was.has(n)).sort(), cleared: [...was].filter((n) => !is.has(n) && now[n.slice(0, n.indexOf(' '))]).sort() };
	}
	if (!notRun) {
		await mkdir(join(store, KIND), { recursive: true });
		await writeFile(join(store, KIND, LAST), JSON.stringify({ dead: { ...last?.dead, ...now } }));
	}
	return { routes, ...totals(routes), ...(before ? { before } : {}), ...(notRun ? { notRun } : {}) };
}

const isLast = (x: unknown): x is { dead: Record<string, string[]> } =>
	typeof x === 'object' && x !== null && typeof (x as { dead?: unknown }).dead === 'object' && (x as { dead: object | null }).dead !== null && Object.values((x as { dead: object }).dead).every((d) => Array.isArray(d) && d.every((n) => typeof n === 'string'));

export interface DiscoverRecorder {
	/** Why discovery does not run at all, if it does not. */
	readonly notRun?: string;
	/** What the other recorders' control lists claim on the route: not pressed. */
	readonly record: (browser: Browser, route: string, claimed?: Claimed) => Promise<DiscoverFacts>;
	readonly unknown: (route: string, why: string) => void;
	/** A route discovery does not look at: it owns no group. */
	readonly skip: (route: string) => void;
	/** Keeps the groups a spot check found counted wrongly, so the next run presses them on every route. */
	readonly save: () => Promise<void>;
	readonly recorded: ReadonlyMap<string, DiscoverFacts>;
}

export async function discoverRecorder(state: string, origin: string, log: (line: string) => void, order: readonly string[] = []): Promise<DiscoverRecorder> {
	const store = join(state, 'convert');
	const recorded = new Map<string, DiscoverFacts>();
	try {
		assertLocal(origin);
	} catch (error) {
		const notRun = error instanceof Error ? error.message : String(error);
		log(`  dead controls not looked for: ${notRun}`);
		return { notRun, record: async () => Promise.reject(new Error(notRun)), unknown: () => {}, skip: () => {}, save: async () => {}, recorded };
	}
	await keepCurrent(store);
	const dir = await discoverDir(store);
	// One file per run that found any, so the shards' files are kept side by side and read as one list.
	const files = await readdir(dir).catch((): string[] => []);
	const kept = await Promise.all(files.filter((f) => f.startsWith(`${UNSHARED}-`)).map((f) => readFile(join(dir, f), 'utf8').then((t) => JSON.parse(t) as unknown, (): unknown => [])));
	const unshared = new Set(kept.flatMap((k) => (Array.isArray(k) ? k.filter((g): g is string => typeof g === 'string') : [])));
	const sharedFor = sharedControls(order, unshared);
	const failed = (route: string, why: string): DiscoverFacts => {
		const facts: DiscoverFacts = { route, browser: 'chromium', candidates: 0, excluded: {}, controls: [], drift: 0, reloads: 0, ms: 0, error: why };
		log(`  discovery of ${route} failed: ${why}`);
		recorded.set(route, facts);
		sharedFor(route).done();
		return facts;
	};
	return {
		record: async (browser, route, claimed) => {
			const page = await discoverPageKey(origin, route);
			try {
				const facts = await recordDiscovery(browser, origin, route, dir, { page, ...(claimed ? { claimed } : {}), ...(order.length ? { shared: sharedFor(route) } : {}) });
				if (facts.error) log(`  discovery of ${route} stopped: ${facts.error}`);
				recorded.set(route, facts);
				return facts;
			} catch (error) {
				return failed(route, (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '');
			}
		},
		unknown: (route, why) => void failed(route, why),
		skip: (route) => sharedFor(route).done(),
		save: async () => {
			const wrong = [...recorded.values()].flatMap((f) => (f.spotMismatch ?? []).map((m) => m.group));
			if (!wrong.length) return;
			const list = [...new Set(wrong)].sort();
			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, `${UNSHARED}-${createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0, 12)}.json`), JSON.stringify(list));
		},
		recorded,
	};
}

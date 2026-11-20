// Convert's side of the discovery recordings: which pressed controls no recording ported, per route, against the last run.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { discoverDir, discoverPageKey, keepCurrent, KIND } from './key.ts';
import { assertLocal, recordDiscovery, type DiscoverFacts, type PressedControl } from './record.ts';
import { deadCount, type DeadControl, type DiscoveryReport, type RouteDiscovery } from './report.ts';

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
	const like = facts.repeats ?? {};
	const named = new Map(facts.controls.map((c) => [`${c.sig}#${c.nth}`, c.name]));
	// A control left to the reveals or the toggles by their selector that they recorded nothing for: no one looked at it.
	const unlooked = (facts.left ?? []).filter((l) => !claims.controls.has(`${l.sig}#${l.nth}`) && !claims.names.has(l.name));
	return {
		candidates: facts.candidates,
		found: { role: facts.controls.filter((c) => c.found === 'role').length, cursor: facts.controls.filter((c) => c.found === 'cursor').length },
		pressed: facts.controls.length,
		claimed: facts.controls.length - mine.length + mine.filter((c) => held(c) && !STATEFUL.has(c.shape)).length,
		inert: mine.filter((c) => c.shape === 'inert' && !held(c)).length,
		dead: mine.filter((c) => STATEFUL.has(c.shape)).map((c) => ({ name: c.name, sig: c.sig, nth: c.nth, labelSig: c.labelSig, ...(c.pair !== undefined ? { pair: c.pair } : {}), found: c.found, shape: c.shape, ...(c.states ? { states: c.states } : {}), ...(held(c) ? { held: true } : {}), what: line(c), ...(like[`${c.sig}#${c.nth}`] ? { repeated: like[`${c.sig}#${c.nth}`] } : {}) })),
		unknown: [...mine.filter((c) => (STOPPED.has(c.shape) || c.shape === 'unpressable') && !held(c)).map((c) => ({ name: c.name, shape: c.shape, ...(c.why ? { why: c.why } : {}) })), ...unlooked.map((l) => ({ name: l.name, shape: 'unpressable' as const, why: `left to the ${l.to}, which recorded nothing for it` }))],
		excluded: facts.excluded,
		...(Object.keys(like).length ? { repeats: Object.fromEntries(Object.entries(like).map(([at, n]) => [`"${named.get(at) ?? ''}" (${at})`, n])) } : {}),
		seconds: Math.round(facts.ms / 100) / 10,
		...(facts.cut ? { cut: true } : {}),
		...(facts.error ? { error: facts.error } : {}),
	};
}

const LAST = 'last.json';

const incompleteOf = (routes: Readonly<Record<string, RouteDiscovery>>) => Object.entries(routes).filter(([, r]) => r.error || r.cut).map(([route]) => route).sort();
const sum = (routes: Readonly<Record<string, RouteDiscovery>>) => ({
	count: Object.values(routes).reduce((n, r) => n + deadCount(r), 0),
	deadRoutes: Object.values(routes).filter((r) => r.dead.length).length,
	handled: Object.values(routes).reduce((n, r) => n + (r.handled?.length ?? 0), 0),
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
	const wanted = new Map(Object.entries(draft.routes).filter(([, r]) => r.dead.length).map(([route, r]) => [route, r.dead] as const));
	// The sandbox (happy-dom) is loaded only here, after convert: convert itself never holds it.
	const { portAnswers } = await import('./ported.ts');
	const answers = await portAnswers(app, wanted);
	const routes = Object.fromEntries(
		Object.entries(draft.routes).map(([route, r]) => {
			const got = answers.get(route);
			if (!got) return [route, r];
			const by = (d: DeadControl) => got.get(`${d.sig}#${d.nth}`) ?? { by: 'none' };
			const handled = r.dead.filter((d) => by(d).by === 'handler');
			const note = (d: DeadControl) => {
				const a = by(d);
				if (a.by === 'missing') return { ...d, what: `${d.what} (not found on the port by its signature)` };
				if (a.by === 'threw') return { ...d, what: `${d.what} (its handler on the port, ${a.where}, threw)` };
				return d.held ? { ...d, what: `${d.what} (inside a widget a recording ports, which does not answer this press)` } : d;
			};
			const dead = r.dead.filter((d) => by(d).by !== 'handler').map(note);
			return [route, { ...r, dead, ...(handled.length ? { handled: handled.map((d) => ({ name: d.name, by: by(d).where ?? '' })) } : {}) }];
		}),
	);
	return discoveryReport(join(app, '.migrate', 'convert'), routes);
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
	readonly record: (browser: Browser, route: string) => Promise<DiscoverFacts>;
	readonly unknown: (route: string, why: string) => void;
	readonly recorded: ReadonlyMap<string, DiscoverFacts>;
}

export async function discoverRecorder(state: string, origin: string, log: (line: string) => void): Promise<DiscoverRecorder> {
	const store = join(state, 'convert');
	const recorded = new Map<string, DiscoverFacts>();
	try {
		assertLocal(origin);
	} catch (error) {
		const notRun = error instanceof Error ? error.message : String(error);
		log(`  dead controls not looked for: ${notRun}`);
		return { notRun, record: async () => Promise.reject(new Error(notRun)), unknown: () => {}, recorded };
	}
	await keepCurrent(store);
	const dir = await discoverDir(store);
	const failed = (route: string, why: string): DiscoverFacts => {
		const facts: DiscoverFacts = { route, browser: 'chromium', candidates: 0, excluded: {}, controls: [], drift: 0, reloads: 0, ms: 0, error: why };
		log(`  discovery of ${route} failed: ${why}`);
		recorded.set(route, facts);
		return facts;
	};
	return {
		record: async (browser, route) => {
			const page = await discoverPageKey(origin, route);
			try {
				const facts = await recordDiscovery(browser, origin, route, dir, { page });
				if (facts.error) log(`  discovery of ${route} stopped: ${facts.error}`);
				recorded.set(route, facts);
				return facts;
			} catch (error) {
				return failed(route, (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '');
			}
		},
		unknown: (route, why) => void failed(route, why),
		recorded,
	};
}


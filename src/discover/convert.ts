// Convert's side of the discovery recordings: which pressed controls no recording ported, per route, against the last run.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { discoverDir, discoverPageKey, keepCurrent, KIND } from './key.ts';
import { assertLocal, recordDiscovery, type DiscoverFacts, type PressedControl } from './record.ts';
import type { DeadControl, DiscoveryReport, RouteDiscovery } from './report.ts';

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

/** A pressed control the other recordings already port. */
export function claimed(c: PressedControl, claims: Claims): boolean {
	if (claims.controls.has(`${c.sig}#${c.nth}`) || claims.names.has(c.name)) return true;
	if (c.ancestors.some((a) => claims.holders.has(a))) return true;
	return claims.scenes.some((s) => c.ancestors.includes(s.holder) && s.labels.has(c.labelSig));
}

/** One route's discovery: the stateful controls no recording ports, and what was pressed but not read. */
export function routeDiscovery(facts: DiscoverFacts, claims: Claims): RouteDiscovery {
	const mine = facts.controls.filter((c) => !claimed(c, claims));
	return {
		candidates: facts.candidates,
		found: { role: facts.controls.filter((c) => c.found === 'role').length, cursor: facts.controls.filter((c) => c.found === 'cursor').length },
		pressed: facts.controls.length,
		claimed: facts.controls.length - mine.length,
		inert: mine.filter((c) => c.shape === 'inert').length,
		dead: mine.filter((c) => STATEFUL.has(c.shape)).map((c) => ({ name: c.name, sig: c.sig, nth: c.nth, found: c.found, shape: c.shape, ...(c.states ? { states: c.states } : {}), what: line(c) })),
		unknown: mine.filter((c) => STOPPED.has(c.shape) || c.shape === 'unpressable').map((c) => ({ name: c.name, shape: c.shape, ...(c.why ? { why: c.why } : {}) })),
		excluded: facts.excluded,
		seconds: Math.round(facts.ms / 100) / 10,
		...(facts.error ? { error: facts.error } : {}),
	};
}

const LAST = 'last.json';

/** The report over every route, with the last run's dead controls (kept in the store) compared and this run's kept for the next. */
export async function discoveryReport(store: string, routes: Readonly<Record<string, RouteDiscovery>>, notRun?: string): Promise<DiscoveryReport> {
	const names = (r: Readonly<Record<string, readonly { name: string }[]>>) => new Set(Object.entries(r).flatMap(([route, dead]) => dead.map((d) => `${route} "${d.name}"`)));
	const now = Object.fromEntries(Object.entries(routes).map(([route, r]) => [route, r.dead.map((d) => ({ name: d.name }))]));
	const count = Object.values(routes).reduce((n, r) => n + r.dead.length, 0);
	const last = await readFile(join(store, KIND, LAST), 'utf8').then((t) => JSON.parse(t) as { count: number; dead: Record<string, { name: string }[]> }, () => undefined);
	let before: DiscoveryReport['before'];
	if (last && !notRun) {
		const was = names(last.dead);
		const is = names(now);
		before = { count: last.count, added: [...is].filter((n) => !was.has(n)).sort(), cleared: [...was].filter((n) => !is.has(n) && routes[n.slice(0, n.indexOf(' '))]).sort() };
	}
	if (!notRun) {
		await mkdir(join(store, KIND), { recursive: true });
		await writeFile(join(store, KIND, LAST), JSON.stringify({ count, dead: { ...last?.dead, ...now } }));
	}
	return { routes, count, deadRoutes: Object.values(routes).filter((r) => r.dead.length).length, ...(before ? { before } : {}), ...(notRun ? { notRun } : {}) };
}

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
		const notRun = (error as Error).message;
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
				return failed(route, (error as Error).message.split('\n')[0]!);
			}
		},
		unknown: (route, why) => void failed(route, why),
		recorded,
	};
}


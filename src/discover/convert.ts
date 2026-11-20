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
	/** Each recorded demo's container, the selector its controls were listed by, and the label signatures of those its uses were recorded for. */
	readonly scenes: readonly { readonly holder: string; readonly listed: string; readonly labels: ReadonlySet<string> }[];
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

/**
 * A pressed control the other recordings already port: `control` when a recording uses it itself (or a scene's uses
 * include it), `holder` when it only sits inside a widget a recording ports whole, which says nothing of this control
 * (a table's drag handle), so the written port is asked about it.
 */
export function claimed(c: PressedControl, claims: Claims): 'control' | 'holder' | undefined {
	if (claims.controls.has(`${c.sig}#${c.nth}`) || claims.names.has(c.name)) return 'control';
	if (claims.scenes.some((s) => c.ancestors.includes(s.holder) && s.labels.has(c.labelSig))) return 'control';
	return c.ancestors.some((a) => claims.holders.has(a)) ? 'holder' : undefined;
}

/** One route's discovery: the stateful controls no recording ports, and what was pressed but not read. */
/** The controls a scene of a page-level demo records: what a visitor presses, less what a reveal or a toggle uses by ARIA. */
export const SCENE_CONTROLS = ':is(button, [role="button"], summary, [role="treeitem"]):not([aria-expanded], [aria-haspopup]:not([aria-haspopup="false"]), [role="checkbox"], [role="switch"], [role="radio"], [aria-pressed], [type="submit"], :disabled)';

export interface SceneHolder {
	/** Path from the body (`body>div2>main1`) and the CSS selector that finds it again on the page as loaded. */
	readonly path: string;
	readonly selector: string;
	readonly at: string;
	readonly canvas: boolean;
	/** The controls the scene records. */
	readonly listed: string;
	/** A recorded demo whose listing left these controls out: recorded again with them, in its place. */
	readonly replaces?: string;
	/** How many of its controls discovery found dead: each may lead to a state of its own, which the recording makes room for. */
	readonly controls: number;
}

/** `body>div2>main1` as `body > div:nth-of-type(2) > main:nth-of-type(1)`. */
export const pathSelector = (path: string): string =>
	path
		.split('>')
		.map((step, i) => {
			if (i === 0) return step;
			const [, tag, n] = /^([a-z0-9-]+?)(\d+)$/.exec(step) ?? [];
			return `${tag}:nth-of-type(${n})`;
		})
		.join(' > ');

// A press that only moves focus or the scroll (and the rings that focus draws) changes no markup a scene could replay: a part's job.
const markupChanged = (c: PressedControl) => {
	const focus = (c.changes ?? []).some((x) => x.what === 'focus');
	return (c.changes ?? []).some((x) => x.what !== 'focus' && x.what !== 'scroll' && !(focus && x.what === 'look'));
};

// What a scene of a page-level demo is recorded for: a dead control whose press changed markup and stayed changed. A
// transient one (a "Copied" mark, a spinner) is most often a part's, which the written port is asked about afterwards.
const sceneWorthy = (c: PressedControl, claims: Claims) => STATEFUL.has(c.shape) && c.shape !== 'transient' && !claimed(c, claims) && markupChanged(c);

/**
 * The elements whose controls a scene should record: a recorded demo the controls sit in (its listing left them out), or the
 * element around each unclaimed stateful control and all it changed; outermost first, none inside another.
 */
export function sceneHolders(facts: DiscoverFacts, claims: Claims): SceneHolder[] {
	const out: SceneHolder[] = [];
	const holders = facts.controls.filter((c) => sceneWorthy(c, claims)).flatMap((c): SceneHolder[] => {
		const i = c.path ? c.ancestors.findIndex((a) => claims.scenes.some((s) => s.holder === a)) : -1;
		if (i >= 0) {
			const scene = claims.scenes.find((s) => s.holder === c.ancestors[i])!;
			const path = c.path!.split('>').slice(0, -(i + 1)).join('>');
			return [{ path, selector: pathSelector(path), at: scene.holder, canvas: Boolean(c.holder?.canvas), listed: `${scene.listed}, ${SCENE_CONTROLS}`, replaces: scene.holder, controls: 1 }];
		}
		if (!c.holder || c.holder.path === 'body') return [];
		return [{ path: c.holder.path, selector: pathSelector(c.holder.path), at: c.holder.at, canvas: Boolean(c.holder.canvas), listed: SCENE_CONTROLS, controls: 1 }];
	});
	for (const h of holders.sort((a, b) => a.path.split('>').length - b.path.split('>').length)) {
		const outer = out.findIndex((o) => h.path === o.path || h.path.startsWith(`${o.path}>`));
		if (outer < 0) out.push(h);
		else out[outer] = { ...out[outer]!, controls: out[outer]!.controls + 1 };
	}
	return out;
}

export function routeDiscovery(facts: DiscoverFacts, claims: Claims, demos: readonly SceneHolder[] = []): RouteDiscovery {
	const mine = facts.controls.filter((c) => claimed(c, claims) !== 'control');
	const held = (c: PressedControl) => claimed(c, claims) === 'holder';
	const notes = [
		...demos.filter((d) => d.canvas).map((d) => `a canvas in ${d.at.split('#')[0]!.split('|').slice(0, 2).join('|')} draws from the page's own script, which the port does not keep: its drawing is not ported, only its markup's states`),
		...mine.filter((c) => STATEFUL.has(c.shape) && !markupChanged(c)).map((c) => `"${c.name}" only moves focus or the scroll: no scene ports that, a part must`),
		...(demos.length ? mine.filter((c) => sceneWorthy(c, claims) && !demos.some((d) => c.path?.startsWith(`${d.path}>`))).map((c) => `"${c.name}" got no scene: what its press changed reaches across the page`) : []),
	];
	return {
		...(notes.length ? { notes } : {}),
		candidates: facts.candidates,
		found: { role: facts.controls.filter((c) => c.found === 'role').length, cursor: facts.controls.filter((c) => c.found === 'cursor').length },
		pressed: facts.controls.length,
		claimed: facts.controls.length - mine.length + mine.filter((c) => held(c) && !STATEFUL.has(c.shape)).length,
		inert: mine.filter((c) => c.shape === 'inert' && !held(c)).length,
		dead: mine.filter((c) => STATEFUL.has(c.shape)).map((c) => ({ name: c.name, sig: c.sig, nth: c.nth, labelSig: c.labelSig, ...(c.pair !== undefined ? { pair: c.pair } : {}), found: c.found, shape: c.shape, ...(c.states ? { states: c.states } : {}), ...(held(c) ? { held: true } : {}), what: line(c) })),
		unknown: mine.filter((c) => (STOPPED.has(c.shape) || c.shape === 'unpressable') && !held(c)).map((c) => ({ name: c.name, shape: c.shape, ...(c.why ? { why: c.why } : {}) })),
		excluded: facts.excluded,
		...(facts.repeats ? { repeats: facts.repeats } : {}),
		seconds: Math.round(facts.ms / 100) / 10,
		...(facts.error ? { error: facts.error } : {}),
	};
}

const LAST = 'last.json';

/** The report as convert leaves it: dead by the recordings alone, before the written port is asked (`finishDiscovery`). */
export function draftReport(routes: Readonly<Record<string, RouteDiscovery>>, notRun?: string): DiscoveryReport {
	return { routes, count: Object.values(routes).reduce((n, r) => n + r.dead.length, 0), deadRoutes: Object.values(routes).filter((r) => r.dead.length).length, ...(notRun ? { notRun } : {}) };
}

const UNANSWERED = new Set(['none', 'not on the port']);

/**
 * The written port asked about each control the recordings left dead: one its own Markless handler or a part answers is
 * ported. The rest are the dead controls, compared with the last run of the same store.
 */
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
			const by = (d: DeadControl) => got.get(`${d.sig}#${d.nth}`) ?? 'none';
			const answered = r.dead.filter((d) => !UNANSWERED.has(by(d)));
			const dead = r.dead.filter((d) => UNANSWERED.has(by(d))).map((d) => (by(d) === 'not on the port' ? { ...d, what: `${d.what} (not found on the port by its signature)` } : d.held ? { ...d, what: `${d.what} (inside a widget a recording ports, which does not answer this press)` } : d));
			return [route, { ...r, claimed: r.claimed + answered.length, dead, ...(answered.length ? { answered: answered.map((d) => ({ name: d.name, by: by(d) })) } : {}) }];
		}),
	);
	return discoveryReport(join(app, '.migrate', 'convert'), routes);
}

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


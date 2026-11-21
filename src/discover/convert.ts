// Convert's side of the discovery recordings: which pressed controls no recording ported, per route, against the last run.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { discoverDir, discoverPageKey, keepCurrent, KIND } from './key.ts';
import { REVEAL_CLICKS } from '../convert/reveal.ts';
import { edgeLabel, type Scene } from '../convert/scenes.ts';
import { SELECTOR as TOGGLE_CONTROLS } from '../convert/toggles.ts';
import { assertLocal, MAX_DEMO_ELEMENTS, MAX_DEMO_USES, recordDiscovery, shortKey, type Claimed, type DiscoverFacts, type PressedControl, type Shared } from './record.ts';
import { deadCount, type DeadControl, type DiscoveryReport, type RouteDiscovery } from './report.ts';
import { sharedControls, UNSHARED } from './shared.ts';

export { shortKey };
export { discoveryMarkdown, summarizeDiscovery, type DeadControl, type DiscoveryReport, type RouteDiscovery } from './report.ts';

/** What the other recordings of a route already port, by the signatures they key controls by. */
export interface Claims {
	/** Controls a recording uses: sig#nth. */
	readonly controls: ReadonlySet<string>;
	/** Widgets a recording ports whole (a carousel, a table, a chart): every control inside is theirs. sig#nth. */
	readonly holders: ReadonlySet<string>;
	/** Each recorded demo's container, the selector its controls were listed by, and the label signatures of those its uses were recorded for. */
	readonly scenes: readonly {
		readonly holder: string;
		readonly listed: string;
		readonly labels: ReadonlySet<string>;
		/** Per label signature: the uses recorded and those not (a bound, a use that failed). */
		readonly uses?: ReadonlyMap<string, { readonly recorded: number; readonly skipped: number; readonly why: string }>;
		/** A discovered demo's place on the page (its path from the body), and per control place in it the uses recorded and not. */
		readonly root?: string;
		readonly usesAt?: ReadonlyMap<string, { readonly recorded: number; readonly skipped: number; readonly why: string; readonly back: boolean }>;
	}[];
	/** Controls the site names in controls.json by their name (a theme toggle). */
	readonly names: ReadonlySet<string>;
	/** Every element another recording owns (its controls, widgets, demos), by `shortKey` of its sig#nth, with what it is. */
	readonly owned: ReadonlyMap<string, string>;
}

const STATEFUL = new Set<PressedControl['shape']>(['transient', 'toggle', 'one-way', 'cycle', 'sequence']);
const STOPPED = new Set<PressedControl['shape']>(['blocked', 'navigates', 'window', 'download', 'dialog']);

const line = (c: PressedControl): string => {
	const how = c.shape === 'transient' ? 'changes the page and puts it back by itself' : c.shape === 'toggle' ? 'switches the page between two states' : c.shape === 'one-way' ? 'changes the page once' : c.shape === 'cycle' ? `cycles the page through ${c.states} states` : `takes the page through ${c.states}+ states`;
	const what = (c.changes ?? []).slice(0, 3).map((x) => (x.what === 'text' || x.what === 'attribute' || x.what === 'scroll' ? `${x.what === 'attribute' ? `${x.name} of` : x.what === 'scroll' ? 'scroll of' : 'text of'} ${x.at}: ${JSON.stringify(x.before ?? '')} -> ${JSON.stringify(x.after ?? '')}` : x.what === 'focus' ? `moves focus to ${x.at}` : x.what === 'announced' ? `announces ${JSON.stringify(x.after)} in ${x.at}` : `${x.what} ${x.at}`));
	return `${how}${what.length ? `: ${what.join('; ')}` : ''}`;
};

/** The name a holder is told by in a note: its tag and data-slot, from its sig#nth. */
export const holderName = (at: string): string => at.split('|').slice(0, 2).join('|');

/**
 * A pressed control the other recordings already port: `control` when a recording uses it itself, or a recorded demo's
 * uses include it and the demo holds everything its presses change; `holder` when it only sits inside a widget a
 * recording ports whole, which says nothing of this control (a table's drag handle), so the written port is asked about it.
 */
/** A control's place in a discovered demo's scene, when the scene recorded uses of it there. */
const placeIn = (c: Pick<PressedControl, 'path'>, s: Claims['scenes'][number]): string | undefined => {
	if (s.root === undefined || !c.path?.startsWith(`${s.root}>`)) return undefined;
	const at = c.path.slice(s.root.length + 1);
	return s.usesAt?.has(at) ? at : undefined;
};

export function claimed(c: PressedControl, claims: Claims): 'control' | 'holder' | undefined {
	if (claims.controls.has(`${c.sig}#${c.nth}`) || claims.names.has(c.name)) return 'control';
	const within = (scene: string) => (c.holder ? c.holder.at === scene || (c.holder.ancestors ?? []).includes(scene) : c.ancestors.includes(scene));
	if (claims.scenes.some((s) => (s.labels.has(c.labelSig) && within(s.holder)) || placeIn(c, s) !== undefined)) return 'control';
	return c.ancestors.some((a) => claims.holders.has(a)) ? 'holder' : undefined;
}

/** The controls a scene of a page-level demo records: what a visitor presses, less what the reveals or the toggles take by their own selectors. */
export const SCENE_CONTROLS = `:is(button, [role="button"], summary, [role="treeitem"]):not(${REVEAL_CLICKS}, ${TOGGLE_CONTROLS}, [aria-expanded], [type="submit"], :disabled)`;

export interface SceneHolder {
	/** Path from the body as the page loaded, and the sig#nth convert finds it again by. */
	readonly path: string;
	readonly at: string;
	readonly canvas: boolean;
	/** The controls the scene records. */
	readonly listed: string;
	/** A recorded demo whose listing left these controls out: recorded again with them and its own, in its place. */
	readonly replaces?: string;
	/** How many of its controls discovery found dead: each may lead to a state of its own, which the recording makes room for. */
	readonly controls: number;
	/** The labels the scene uses a recorded demo's own controls by. */
	readonly labels: readonly string[];
	/** The dead controls' paths from the body: each is followed by its place in the holder, whatever its label. */
	readonly members: readonly string[];
}

export { MAX_DEMO_ELEMENTS, MAX_DEMO_USES };

/** Per control label (tag|data-slot|label): the uses a scene recorded and those it did not, with why. */
export function sceneUses(scene: Pick<Scene, 'edges' | 'skippedUses'>): Map<string, { recorded: number; skipped: number; why: string }> {
	const out = new Map<string, { recorded: number; skipped: number; why: string }>();
	const at = (control: string) => out.get(edgeLabel(control)) ?? out.set(edgeLabel(control), { recorded: 0, skipped: 0, why: '' }).get(edgeLabel(control)) ?? { recorded: 0, skipped: 0, why: '' };
	for (const e of scene.edges) at(e.control).recorded++;
	for (const u of scene.skippedUses ?? []) {
		const got = at(u.control);
		got.skipped++;
		got.why ||= u.why;
	}
	return out;
}

/** Per control place in a discovered demo: the uses recorded and not, and whether a use of it leads back to the state the demo loads in. */
export function sceneUsesAt(scene: Pick<Scene, 'edges' | 'skippedUses'>): Map<string, { recorded: number; skipped: number; why: string; back: boolean }> {
	const out = new Map<string, { recorded: number; skipped: number; why: string; back: boolean }>();
	const of = (at: string) => out.get(at) ?? out.set(at, { recorded: 0, skipped: 0, why: '', back: false }).get(at) ?? { recorded: 0, skipped: 0, why: '', back: false };
	for (const e of scene.edges) {
		if (e.at === undefined) continue;
		const got = of(e.at);
		got.recorded++;
		if (e.to === 0 && e.from !== 0) got.back = true;
	}
	for (const u of scene.skippedUses ?? []) {
		if (u.at === undefined) continue;
		const got = of(u.at);
		got.skipped++;
		got.why ||= u.why;
	}
	return out;
}

/** The uses an old recording of a demo had that none of the new ones has: by control and the use made of it. */
export function lostUses(old: Pick<Scene, 'edges'>, fresh: readonly Pick<Scene, 'edges'>[]): string[] {
	const now = new Set(fresh.flatMap((s) => s.edges.map((e) => e.control)));
	return [...new Set(old.edges.map((e) => e.control))].filter((c) => !now.has(c));
}

/**
 * A control a scene ports only in part: some of its uses were not recorded, or it is not a native button, so its keyboard
 * activation (Enter, Space) is not replayed. Reported apart, and the job fails on it as on a dead control.
 */
export function partly(c: PressedControl, claims: Claims): string | undefined {
	if (claims.controls.has(`${c.sig}#${c.nth}`) || claims.names.has(c.name)) return undefined;
	const tag = c.sig.slice(0, c.sig.indexOf('|'));
	const clickOnly = tag !== 'button' && tag !== 'summary' ? 'ported for its click only: a scene does not replay its keyboard activation (Enter, Space)' : undefined;
	// A discovered demo's control, followed by its place: every use of it whatever its label, and its way back.
	for (const s of claims.scenes) {
		const at = placeIn(c, s);
		const uses = at === undefined ? undefined : s.usesAt?.get(at);
		if (!uses) continue;
		if (uses.skipped) return `ported for ${uses.recorded} of ${uses.recorded + uses.skipped} uses: ${uses.skipped} not recorded (${uses.why})`;
		if ((c.shape === 'toggle' || c.shape === 'cycle') && !uses.back) return 'ported only on its way from the first state: no use of it back to the state the demo loads in was recorded';
		return clickOnly;
	}
	const within = (scene: string) => (c.holder ? c.holder.at === scene || (c.holder.ancestors ?? []).includes(scene) : c.ancestors.includes(scene));
	const scene = claims.scenes.find((s) => s.labels.has(c.labelSig) && within(s.holder));
	if (!scene) return undefined;
	const uses = scene.uses?.get(c.labelSig);
	if (uses?.skipped) return `ported for ${uses.recorded} of ${uses.recorded + uses.skipped} uses: ${uses.skipped} not recorded (${uses.why})`;
	return clickOnly;
}

const focusMoved = (c: PressedControl) => (c.changes ?? []).some((x) => x.what === 'focus');

// A press that only moves focus or the scroll (and the rings that focus draws) changes no markup a scene could replay: a part's job.
const markupChanged = (c: PressedControl) => (c.changes ?? []).some((x) => x.what !== 'focus' && x.what !== 'scroll' && !(focusMoved(c) && x.what === 'look'));

// A scene is recorded for a lasting markup change; a transient one (a "Copied" mark) is left to the port check.
const sceneWorthy = (c: PressedControl, claims: Claims) => STATEFUL.has(c.shape) && c.shape !== 'transient' && !claimed(c, claims) && markupChanged(c);

// The label part of a scene's label signature (tag|data-slot|label).
const labelOfSig = (sig: string) => sig.split('|').slice(2).join('|');

/** The text filter a scene's uses take: the labels, whole, as captureScenes matches a control's label; none, no filter. */
export const labelFilter = (labels: readonly string[]): string => (labels.length ? `^(${[...new Set(labels)].map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$` : '');

/** The holder's dead controls by their place in it, as captureScenes follows them. */
export const membersIn = (holder: Pick<SceneHolder, 'path' | 'members'>): string[] => holder.members.filter((p) => p.startsWith(`${holder.path}>`)).map((p) => p.slice(holder.path.length + 1));

/** Why a scene-worthy control gets no scene, or none: its holder is the page, too large, drives a widget, overlaps what another recording owns, or its press is not repeatable. */
export function noScene(c: PressedControl, claims: Claims, scene?: Claims['scenes'][number]): string | undefined {
	if (c.unsteady) return 'pressed again from a fresh load it left another page (a time or a random value), which a scene would replay as one';
	const h = c.holder;
	if (!h || h.path === 'body') return 'what its presses change reaches across the page';
	if (h.landmark) return `what its presses change sits in ${holderName(h.at)}, a page landmark, which is never a demo`;
	if ((h.size ?? 0) > MAX_DEMO_ELEMENTS) return `what its presses change sits in ${holderName(h.at)} of ${h.size} elements, over the ${MAX_DEMO_ELEMENTS} a demo holds`;
	if (h.widget) return `its presses change the inside of a ${h.widget}, which a part drives`;
	if (scene && !(h.at === scene.holder || (h.ancestors ?? []).includes(scene.holder))) return `what its presses change reaches outside the recorded demo ${holderName(scene.holder)}`;
	const inside = new Set(h.inside ?? []);
	const owner = [...claims.owned].find(([key, what]) => inside.has(key) && (!scene || what !== `the recorded demo ${holderName(scene.holder)}`));
	return owner ? `what holds it, ${holderName(scene?.holder ?? h.at)}, holds ${owner[1]}, which another recording ports` : undefined;
}

/**
 * The elements whose controls a scene should record: a recorded demo the controls sit in (its listing left them out),
 * recorded again with its own controls and them; or the element around each unclaimed stateful control and everything its
 * presses change. Outermost first, none inside another; one that overlaps what another recording owns gets none.
 */
export function sceneHolders(facts: DiscoverFacts, claims: Claims): SceneHolder[] {
	const out: SceneHolder[] = [];
	const holders = facts.controls.filter((c) => sceneWorthy(c, claims)).flatMap((c): SceneHolder[] => {
		const h = c.holder;
		if (!h) return [];
		const scene = claims.scenes.find((s) => c.ancestors.includes(s.holder));
		if (noScene(c, claims, scene)) return [];
		if (scene) {
			const i = c.ancestors.indexOf(scene.holder);
			const path = c.path ? c.path.split('>').slice(0, -(i + 1)).join('>') : '';
			if (!path) return [];
			return [{ path, at: scene.holder, canvas: Boolean(h.canvas), listed: `${scene.listed}, ${SCENE_CONTROLS}`, replaces: scene.holder, controls: 1, labels: [...scene.labels].map(labelOfSig), members: c.path ? [c.path] : [] }];
		}
		return [{ path: h.path, at: h.at, canvas: Boolean(h.canvas), listed: SCENE_CONTROLS, controls: 1, labels: [], members: c.path ? [c.path] : [] }];
	});
	for (const h of holders.sort((a, b) => a.path.split('>').length - b.path.split('>').length)) {
		const outer = out.findIndex((o) => h.path === o.path || h.path.startsWith(`${o.path}>`));
		const o = outer < 0 ? undefined : out[outer];
		if (!o) out.push(h);
		// Two holders nest only for the same recorded demo or for none: what an existing demo holds is never inside a new one (noScene).
		else out[outer] = { ...o, ...(o.replaces ?? h.replaces ? { replaces: o.replaces ?? h.replaces } : {}), controls: o.controls + 1, labels: [...o.labels, ...h.labels], members: [...o.members, ...h.members] };
	}
	return out;
}

/** One route's discovery: the stateful controls no recording ports, what was pressed but not read, and what scenes could not port. */
export function routeDiscovery(facts: DiscoverFacts, claims: Claims, demos: readonly SceneHolder[] = [], skipped: readonly string[] = []): RouteDiscovery {
	const mine = facts.controls.filter((c) => claimed(c, claims) !== 'control');
	const inPart = facts.controls.flatMap((c) => {
		const why = STATEFUL.has(c.shape) ? partly(c, claims) : undefined;
		return why ? [{ name: c.name, why }] : [];
	});
	const held = (c: PressedControl) => claimed(c, claims) === 'holder';
	const sameAs: Record<string, number> = {};
	for (const c of facts.controls) if (c.sameAs) sameAs[c.sameAs.route] = (sameAs[c.sameAs.route] ?? 0) + 1;
	const notes = [
		...demos.filter((d) => d.canvas).map((d) => `a canvas in ${holderName(d.at)} draws from the page's own script, which the port does not keep: its drawing is not ported, only its markup's states`),
		...mine.filter((c) => STATEFUL.has(c.shape) && !markupChanged(c)).map((c) => `"${c.name}" only moves focus or the scroll: no scene ports that, a part must`),
		...mine.filter((c) => sceneWorthy(c, claims)).map((c) => `"${c.name}" got no scene: ${noScene(c, claims, claims.scenes.find((s) => c.ancestors.includes(s.holder))) ?? (demos.some((d) => c.path?.startsWith(`${d.path}>`)) ? 'its demo was recorded, but not this control\'s uses (see the demo\'s skipped uses)' : 'none was recorded')}`),
		...facts.controls.filter((c) => claimed(c, claims) === 'control' && claims.scenes.some((s) => s.labels.has(c.labelSig)) && focusMoved(c) && markupChanged(c)).map((c) => `"${c.name}" is ported by its demo's scene except where its press moves focus, which a scene does not replay`),
		...skipped,
	];

	const like = facts.repeats ?? {};
	const likeOf = facts.repeatsOf ?? {};
	const named = new Map(facts.controls.map((c) => [`${c.sig}#${c.nth}`, c.name]));
	// A control left to the reveals or the toggles by their selector that they recorded nothing for: no one looked at it.
	const unlooked = (facts.left ?? []).filter((l) => l.to !== 'grids' && !claims.controls.has(`${l.sig}#${l.nth}`) && !claims.names.has(l.name));
	// A grid no recording holds (no day picker, no table) had its cells left unpressed for nothing: named, never dropped.
	const loose = (facts.left ?? []).filter((l) => l.to === 'grids' && !(l.ancestors ?? []).some((a) => claims.holders.has(a)) && !claims.holders.has(`${l.sig}#${l.nth}`));
	return {
		...(notes.length ? { notes } : {}),
		candidates: facts.candidates,
		found: { role: facts.controls.filter((c) => c.found === 'role').length, cursor: facts.controls.filter((c) => c.found === 'cursor').length },
		pressed: facts.controls.length,
		claimed: (facts.claimedSkipped ?? 0) + facts.controls.length - mine.length + mine.filter((c) => held(c) && !STATEFUL.has(c.shape)).length,
		inert: mine.filter((c) => c.shape === 'inert' && !held(c)).length,
		dead: mine.filter((c) => STATEFUL.has(c.shape)).map((c) => ({ name: c.name, sig: c.sig, nth: c.nth, labelSig: c.labelSig, ...(c.pair !== undefined ? { pair: c.pair } : {}), found: c.found, shape: c.shape, ...(c.states ? { states: c.states } : {}), ...(held(c) ? { held: true } : {}), what: `${line(c)}${c.sameAs ? ` (same as ${c.sameAs.route})` : ''}`, ...(like[`${c.sig}#${c.nth}`] ? { repeated: like[`${c.sig}#${c.nth}`] } : {}), ...(likeOf[`${c.sig}#${c.nth}`]?.length ? { repeatsOf: likeOf[`${c.sig}#${c.nth}`] } : {}) })),
		unknown: [...mine.filter((c) => (STOPPED.has(c.shape) || c.shape === 'unpressable') && !held(c)).map((c) => ({ name: c.name, shape: c.shape, ...(c.why ? { why: c.why } : {}) })), ...unlooked.map((l) => ({ name: l.name, shape: 'unpressable' as const, left: l.to, why: `left to the ${l.to}, which recorded nothing for it` })), ...loose.map((l) => ({ name: l.name, shape: 'unpressable' as const, left: 'grids' as const, why: `a grid of ${l.cells ?? 0} cells no recording holds, its cells not pressed` }))],
		excluded: facts.excluded,
		...(Object.keys(like).length ? { repeats: Object.fromEntries(Object.entries(like).map(([at, n]) => [`"${named.get(at) ?? ''}" (${at})`, n])) } : {}),
		...(Object.keys(sameAs).length ? { sameAs } : {}),
		...(facts.spotMismatch?.length ? { spotMismatch: facts.spotMismatch.map(({ name, owner }) => ({ name, owner })) } : {}),
		seconds: Math.round(facts.ms / 100) / 10,
		...(facts.cut ? { cut: true } : {}),
		...(inPart.length ? { partly: inPart } : {}),
		...(facts.error ? { error: facts.error } : {}),
	};
}

const LAST = 'last.json';

const incompleteOf = (routes: Readonly<Record<string, RouteDiscovery>>) => Object.entries(routes).filter(([, r]) => r.error || r.cut || r.untrusted || r.spotMismatch?.length).map(([route]) => route).sort();
const sum = (routes: Readonly<Record<string, RouteDiscovery>>) => ({
	count: Object.values(routes).reduce((n, r) => n + deadCount(r), 0),
	deadRoutes: Object.values(routes).filter((r) => r.dead.length).length,
	handled: Object.values(routes).reduce((n, r) => n + (r.handled ?? []).reduce((k, h) => k + 1 + (h.repeated ?? 0), 0), 0),
	partly: Object.values(routes).reduce((n, r) => n + (r.partly?.length ?? 0), 0),
	incomplete: incompleteOf(routes),
});
const totals = (routes: Readonly<Record<string, RouteDiscovery>>) => {
	const { count, deadRoutes, handled, partly, incomplete } = sum(routes);
	return { count, deadRoutes, ...(handled ? { handled } : {}), ...(partly ? { partly } : {}), ...(incomplete.length ? { incomplete } : {}) };
};

/** The report as convert leaves it: dead by the recordings alone, before the written port is asked (`finishDiscovery`). */
export function draftReport(routes: Readonly<Record<string, RouteDiscovery>>, notRun?: string): DiscoveryReport {
	return { routes, ...totals(routes), ...(notRun ? { notRun } : {}) };
}

/** Asks the written port about each control left dead: a handler there moves it to `handled` (effect not compared), one that throws stays dead. */
export async function finishDiscovery(app: string, draft: DiscoveryReport): Promise<DiscoveryReport> {
	if (draft.notRun) return draft;
	// Every repeat is asked too: the same control elsewhere on the page may be wired where the one pressed is not, or the other way.
	const each = (r: RouteDiscovery): DeadControl[] =>
		r.dead.flatMap(({ repeated, repeatsOf, ...d }) => {
			// A repeat with no identity (a recording from before they were kept) still counts with the one pressed.
			const unasked = (repeated ?? 0) - (repeatsOf?.length ?? 0);
			return [{ ...d, ...(unasked > 0 ? { repeated: unasked } : {}) }, ...(repeatsOf ?? []).map((x): DeadControl => ({ ...d, ...x, what: `${d.what} (a repeat of the one pressed, read from its press)` }))];
		});
	const wanted = new Map(Object.entries(draft.routes).filter(([, r]) => r.dead.length).map(([route, r]) => [route, each(r)] as const));
	// The sandbox (happy-dom) is loaded only here, after convert: convert itself never holds it.
	const { portAnswers } = await import('./ported.ts');
	const thrown: string[] = [];
	const answers = await portAnswers(app, wanted, (line) => thrown.push(line));
	const routes = Object.fromEntries(
		Object.entries(draft.routes).map(([route, r]) => {
			const got = answers.get(route);
			if (!got) return [route, r];
			const by = (d: DeadControl) => got.get(`${d.sig}#${d.nth}`) ?? { by: 'none' };
			const asked = each(r);
			const handled = asked.filter((d) => by(d).by === 'handler');
			const note = (d: DeadControl) => {
				const a = by(d);
				if (a.by === 'missing') return { ...d, what: `${d.what} (not found on the port by its signature)` };
				if (a.by === 'threw') return { ...d, what: `${d.what} (its handler on the port, ${a.where}, threw)` };
				return d.held ? { ...d, what: `${d.what} (inside a widget a recording ports, which does not answer this press)` } : d;
			};
			const dead = asked.filter((d) => by(d).by !== 'handler').map(note);
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

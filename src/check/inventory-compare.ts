// The behaviour inventory, judged: every handler, animation, scroll behaviour, :hover and :focus rule and media element of the old page, ported or red, and each one the old app's source holds accounted for by a live run. No browser here (judges-pure.test.ts).
import { HINTS } from './hints.ts';
import type { Coverage, Failure } from './types.ts';

export type BehaviourKind = 'handler' | 'animation' | 'scroll' | 'hover-rule' | 'focus-rule' | 'media';

/** One behaviour as a live page shows it: its kind, the key a source item is matched by, and what to call it. */
export interface LiveBehaviour {
	readonly kind: BehaviourKind;
	readonly key: string;
	readonly what: string;
}

export interface LiveRow {
	readonly viewport: string;
	/** Two loads of the old page: a behaviour only one of them shows is its own variation, not held against the port. */
	readonly olds: readonly (readonly LiveBehaviour[])[];
	readonly next: readonly LiveBehaviour[];
}

/** One behaviour of the old page and whether the port has it: `ported`, or `missing` (red unless accepted). */
export interface Accounted {
	readonly kind: BehaviourKind;
	readonly key: string;
	readonly what: string;
	readonly status: 'ported' | 'missing';
}

/** One behaviour the old app's source holds: where, and the key it is found live by; `kind` alone when the source gives nothing to find it by. */
export interface SourceBehaviour {
	readonly kind: BehaviourKind;
	readonly key?: string;
	readonly what: string;
	readonly file: string;
	readonly line: number;
}

const LABEL: Readonly<Record<BehaviourKind, string>> = { handler: 'handler', animation: 'animation', scroll: 'scroll behaviour', 'hover-rule': ':hover rule', 'focus-rule': ':focus rule', media: 'media element' };

/** A handler's key from the element a journey names (`button "Save"`): its name, lower case, as the source scan keys a handler by its text. */
export function handlerKey(element: string): string {
	const name = /"([^"]*)"/.exec(element)?.[1];
	return `handler|${(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60) || element.split(' ')[0]}`;
}

/**
 * Every behaviour of the old page and whether the port has it. The handlers are the controls the journeys found on the
 * old page: one a journey used is ported unless that journey failed (its failure says how); one none used is the
 * journeys' own red. The rest are read live: one both old loads show must be on the new page under the same key.
 */
export function judgeBehaviours(route: string, row: LiveRow, coverage: Coverage | undefined, failures: readonly Failure[]): { readonly account: readonly Accounted[]; readonly failures: readonly Failure[] } {
	const account: Accounted[] = [];
	const red: Failure[] = [];
	const failedJourneys = new Set(failures.filter((f) => f.dimension === 'behaviour' || f.dimension === 'a11y').map((f) => f.check.replace(/ \((step|use|then|after) .*$/, '')));
	for (const e of coverage?.elements ?? []) {
		const used = e.by ?? (e.shared ? `on ${e.shared}` : undefined);
		const ok = Boolean(used) && !(e.journeys ?? []).some((j) => failedJourneys.has(j));
		account.push({ kind: 'handler', key: handlerKey(e.element), what: e.element, status: ok ? 'ported' : 'missing' });
	}
	const [a, b] = row.olds;
	const steady = new Map((a ?? []).filter((x) => !b || b.some((y) => y.key === x.key)).map((x) => [x.key, x]));
	const theirs = new Set(row.next.map((x) => x.key));
	for (const x of steady.values()) {
		const ok = theirs.has(x.key);
		account.push({ kind: x.kind, key: x.key, what: x.what, status: ok ? 'ported' : 'missing' });
		if (!ok) red.push({ route, dimension: 'behaviour', check: `behaviour inventory: ${LABEL[x.kind]} ${x.what}`, viewport: row.viewport, expected: `the new page has this ${LABEL[x.kind]}, as the old page has on both of its loads`, actual: `the new page has no ${LABEL[x.kind]} like it`, hint: HINTS.behaviourInventory });
	}
	return { account, failures: red };
}

/** What became of one source item over the whole run: `ported` or `missing` by the live behaviour it was found as, or `unseen` when no checked page showed it. */
export interface SourceAccount extends SourceBehaviour {
	readonly status: 'ported' | 'missing' | 'unseen';
	/** The route it was seen on, when it was. */
	readonly route?: string;
}

/**
 * Each source item against what the checked pages showed live. One with a key is the live behaviour of that key on any
 * route (ported where any route ported it); one with no key (a scroll hook, a component with no static text) is
 * accounted for by its kind: ported when a checked page showed that kind and ported every one of it. An item no
 * checked page showed is `unseen`: nothing proves the port has it, so it is red until a person accepts it.
 */
export function accountSource(items: readonly SourceBehaviour[], routes: readonly { readonly route: string; readonly behaviours?: readonly Accounted[] }[]): { readonly items: readonly SourceAccount[]; readonly failures: readonly Failure[] } {
	const byKey = new Map<string, { route: string; status: Accounted['status'] }[]>();
	const byKind = new Map<BehaviourKind, { route: string; status: Accounted['status'] }[]>();
	for (const r of routes) for (const b of r.behaviours ?? []) {
		(byKey.get(b.key) ?? byKey.set(b.key, []).get(b.key)!).push({ route: r.route, status: b.status });
		(byKind.get(b.kind) ?? byKind.set(b.kind, []).get(b.kind)!).push({ route: r.route, status: b.status });
	}
	const out: SourceAccount[] = [];
	const failures: Failure[] = [];
	for (const item of items) {
		const seen = item.key ? byKey.get(item.key) : byKind.get(item.kind);
		const ported = seen?.find((s) => s.status === 'ported');
		const status: SourceAccount['status'] = !seen?.length ? 'unseen' : item.key ? (ported ? 'ported' : 'missing') : seen.every((s) => s.status === 'ported') ? 'ported' : 'missing';
		const route = status === 'ported' ? ported?.route : seen?.[0]?.route;
		out.push({ ...item, status, ...(route ? { route } : {}) });
		if (status === 'ported') continue;
		failures.push({ route: item.file, dimension: 'behaviour', check: `behaviour inventory (source): ${LABEL[item.kind]} ${item.what} at ${item.file}:${item.line}`, expected: item.key ? `a checked page shows it live and the port has it` : `a checked page shows a ${LABEL[item.kind]} live and the port has every one`, actual: status === 'unseen' ? 'no checked page showed it live, so nothing proves the port has it' : `seen on ${route}, where the port does not have it`, hint: HINTS.behaviourSource });
	}
	return { items: out, failures };
}

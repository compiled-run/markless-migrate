import type { Overrides } from '../overrides.ts';
import type { LibrariesFile, LibraryDecision, LibraryUsage } from './types.ts';

/** Above this many used names a faithful port is a rewrite of the library; AG Grid in Devtron's panel uses 74. */
export const MAX_PORT_SURFACE = 120;
/** A generous allowance of port code per used name, to compare a port with the library it replaces. */
export const PORT_BYTES_PER_NAME = 1024;

/** Every name the app uses: exports, props, options, data keys, members and fields read back. */
export function surfaceSize(lib: LibraryUsage): number {
	const names = new Set<string>();
	for (const e of lib.exports) {
		if (e.kind === 'type') continue;
		names.add(`export ${e.name}`);
		for (const k of Object.keys(e.props)) names.add(`prop ${e.name}.${k}`);
		for (const k of Object.keys(e.options)) names.add(`option ${e.name}.${k}`);
		for (const k of Object.keys(e.data ?? {})) names.add(`data ${e.name}.${k}`);
		for (const [path, list] of Object.entries(e.members)) for (const m of list) names.add(`member ${e.name}.${path}.${m}`);
		for (const r of e.reads) names.add(`read ${e.name}.${r}`);
	}
	return names.size;
}

const kb = (bytes: number) => `${bytes < 10_240 ? (bytes / 1024).toFixed(1) : Math.round(bytes / 1024)} KB`;

function decide(engine: string, group: readonly LibraryUsage[], overrides: Overrides): LibraryDecision {
	const surface = group.reduce((n, l) => n + surfaceSize(l), 0);
	const facts = group.find((l) => l.name === engine)?.engine ?? group[0]!.engine ?? { name: engine };
	const made = (choice: LibraryDecision['choice'], rule: string, reason: string): LibraryDecision => ({ choice, rule, reason, surface, engine });
	const forced = group.map((l) => overrides.libraries?.[l.name]).find((c) => c) ?? overrides.libraries?.[engine];
	if (forced) return made(forced, 'override', `set to ${forced === 'port' ? 'port' : 'use directly'} in .migrate/overrides.json`);
	if (facts.draws) return made('direct', 'draws-pixels', `it draws into ${facts.draws === 'webgl' ? 'WebGL' : 'a canvas'}, so check would see only its pixels and could not prove a port behaves the same`);
	if (facts.needs) return made('direct', 'unchecked-behaviour', `its behaviour is ${facts.needs}, which check's journeys do not perform, so a port could not be proven`);
	if (surface > MAX_PORT_SURFACE) return made('direct', 'large-surface', `the app uses ${surface} of its names, more than the ${MAX_PORT_SURFACE} a faithful port can cover`);
	const port = surface * PORT_BYTES_PER_NAME;
	if (facts.bytes !== undefined && facts.bytes <= port) return made('direct', 'engine-smaller', `it is ${kb(facts.bytes)}, no more than a port of the ${surface} names the app uses (about ${kb(port)}), so a port would not run less code`);
	const size = facts.bytes !== undefined ? `; it is ${kb(facts.bytes)} and a port of what the app uses is about ${kb(port)}` : '';
	return made('port', 'small-surface', `the app uses ${surface} of its names (limit ${MAX_PORT_SURFACE}), drawn as page elements check compares${size}`);
}

/** Decides every `dom` library: a wrapper and the library it drives are decided together, from their combined used surface. */
export function decideLibraries(file: LibrariesFile, overrides: Overrides = {}): LibrariesFile {
	const groups = new Map<string, LibraryUsage[]>();
	for (const lib of file.libraries) {
		if (lib.class !== 'dom') continue;
		const engine = lib.engine?.name ?? lib.name;
		groups.set(engine, [...(groups.get(engine) ?? []), lib]);
	}
	const decided = new Map<LibraryUsage, LibraryDecision>();
	for (const [engine, group] of groups) {
		const decision = decide(engine, group, overrides);
		for (const lib of group) decided.set(lib, decision);
	}
	return { ...file, libraries: file.libraries.map((l) => (decided.has(l) ? { ...l, decision: decided.get(l)! } : l)) };
}

/** One line for reports: what happens to the library and why. */
export function decisionLine(lib: LibraryUsage): string | undefined {
	const d = lib.decision;
	if (!d) return undefined;
	const what = d.choice === 'port' ? `ports the parts of ${d.engine} this app uses` : `uses ${d.engine} directly, loaded only when its element is needed`;
	return `${lib.name !== d.engine ? `${lib.name} is replaced by a Markless port of what this app uses, which ` : ''}${what}, because ${d.reason}`;
}

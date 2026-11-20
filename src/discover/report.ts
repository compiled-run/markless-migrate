// The dead-controls report: what convert writes and the pipeline's job reads, with no runtime imports so that job needs no install.
import type { PressedControl } from './record.ts';

export interface DeadControl {
	readonly name: string;
	readonly sig: string;
	readonly nth: number;
	/** The label signature and the occurrence among elements with both: how the written port is searched for it. */
	readonly labelSig?: string;
	readonly pair?: number;
	readonly found: PressedControl['found'];
	readonly shape: PressedControl['shape'];
	readonly states?: number;
	/** It sits inside a widget a recording ports whole (a table, a carousel): dead only if the written port does not answer it. */
	readonly held?: boolean;
	/** What the press changed on the original, in a line. */
	readonly what: string;
}

export interface RouteDiscovery {
	readonly candidates: number;
	readonly found: { readonly role: number; readonly cursor: number };
	readonly pressed: number;
	readonly claimed: number;
	readonly inert: number;
	/** Stateful on the original, ported by no recording: static markup on the port. */
	readonly dead: readonly DeadControl[];
	/** Pressed, but what the press did was not read: it wrote to a server (blocked), left the page, opened a window or a dialog. */
	readonly unknown: readonly { readonly name: string; readonly shape: PressedControl['shape']; readonly why?: string }[];
	readonly excluded: Readonly<Record<string, number>>;
	/** Controls the recordings left out that the written port answers anyway, and what answers each (a site part, a handler). */
	readonly answered?: readonly { readonly name: string; readonly by: string }[];
	/** Repeats not pressed, by the pressed control they are like. */
	readonly repeats?: Readonly<Record<string, number>>;
	readonly seconds: number;
	readonly error?: string;
}

export interface DiscoveryReport {
	/** Every route looked at, by route. */
	readonly routes: Readonly<Record<string, RouteDiscovery>>;
	readonly count: number;
	readonly deadRoutes: number;
	/** Against the last run of the same store, when there is one. */
	readonly before?: { readonly count: number; readonly added: readonly string[]; readonly cleared: readonly string[] };
	/** Why no route was looked at (the original is not a local copy). */
	readonly notRun?: string;
}

/** What a route's presses left out on purpose, said in full: the time stop, grids, repeats (by the control pressed in their place). */
export function cutsOf(r: Pick<RouteDiscovery, 'excluded' | 'repeats'>): string {
	const parts: string[] = [];
	for (const [why, n] of Object.entries(r.excluded)) if (why.startsWith('past ')) parts.push(`${n} not reached (${why})`);
	if (r.excluded['in a grid']) parts.push(`${r.excluded['in a grid']} in grids, left to their recorders`);
	const repeats = Object.entries(r.repeats ?? {});
	if (repeats.length) parts.push(`${repeats.reduce((n, [, k]) => n + k, 0)} same as a control pressed: ${repeats.map(([like, k]) => `${k} like ${like}`).join(', ')}`);
	return parts.join('; ');
}

/** The few lines a person reads: the count against the last run, then every dead control by route. */
export function summarizeDiscovery(report: DiscoveryReport): string[] {
	if (report.notRun) return [`Dead controls: not looked for (${report.notRun}).`];
	const before = report.before ? ` (last run: ${report.before.count}; ${report.before.added.length} new, ${report.before.cleared.length} cleared)` : '';
	const stopped = Object.entries(report.routes).filter(([, r]) => Object.keys(r.excluded).some((why) => why.startsWith('past '))).map(([route]) => route);
	const lines = [`Ported with dead controls: ${report.count} controls on ${report.deadRoutes} of ${Object.keys(report.routes).length} routes${before}.`];
	if (stopped.length) lines.push(`Routes whose presses stopped before every control: ${stopped.join(', ')}.`);
	for (const [route, r] of Object.entries(report.routes).sort(([a], [b]) => (a < b ? -1 : 1))) {
		for (const d of r.dead) lines.push(`  dead control on ${route}: "${d.name}" ${d.what}`);
		for (const u of r.unknown) lines.push(`  not read on ${route}: "${u.name}" ${u.shape === 'blocked' ? 'writes to a server (blocked), state after press unknown' : u.shape}${u.why ? ` (${u.why})` : ''}`);
		if (r.error) lines.push(`  discovery on ${route} stopped: ${r.error}`);
		const cut = cutsOf(r);
		if (cut) lines.push(`  cut on ${route}: ${cut}`);
	}
	for (const n of report.before?.added ?? []) lines.push(`  new since the last run: ${n}`);
	for (const n of report.before?.cleared ?? []) lines.push(`  cleared since the last run: ${n}`);
	return lines;
}

/** The pipeline job's summary: the count against the last run, then a row per route with dead controls. */
export function discoveryMarkdown(report: DiscoveryReport | undefined): { readonly text: string; readonly failed: boolean } {
	if (!report) return { text: '### Dead controls: unknown\n\nThe convert report has no dead-controls section: this convert did not look for them.\n', failed: true };
	if (report.notRun) return { text: `### Dead controls: not looked for\n\n${report.notRun}\n`, failed: true };
	const routes = Object.entries(report.routes).filter(([, r]) => r.dead.length || r.unknown.length || r.error || cutsOf(r)).sort(([a], [b]) => (a < b ? -1 : 1));
	const lines = [`### Ported with dead controls: ${report.count} controls on ${report.deadRoutes} of ${Object.keys(report.routes).length} routes`, ''];
	const stopped = Object.entries(report.routes).filter(([, r]) => Object.keys(r.excluded).some((why) => why.startsWith('past '))).map(([route]) => route);
	if (stopped.length) lines.push(`Presses stopped before every control on: ${stopped.join(', ')}.`, '');
	if (report.before) lines.push(`Last run of this store: ${report.before.count}. New: ${report.before.added.length}. Cleared: ${report.before.cleared.length}.`, '', ...report.before.added.map((n) => `- new: ${n}`), ...report.before.cleared.map((n) => `- cleared: ${n}`), '');
	else lines.push('No earlier run of this store to compare with.', '');
	if (routes.length) lines.push('| Route | Dead | Not read | Controls | Cut |', '|---|---|---|---|---|', ...routes.map(([route, r]) => `| ${route} | ${r.dead.length} | ${r.unknown.length}${r.error ? ' (stopped)' : ''} | ${[...r.dead.map((d) => `"${d.name}" ${d.shape}`), ...r.unknown.map((u) => `"${u.name}" ${u.shape}`)].join('; ').replace(/\|/g, '\\|')} | ${cutsOf(r).replace(/\|/g, '\\|')} |`));
	return { text: `${lines.join('\n')}\n`, failed: report.count > 0 };
}

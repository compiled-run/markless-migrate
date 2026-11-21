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
	/** `not pressed`: a repeat of a control a recording takes, which was not pressed for that. */
	readonly shape: PressedControl['shape'] | 'not pressed';
	readonly states?: number;
	/** It sits inside a widget a recording ports whole (a table, a carousel): dead only if the written port does not answer it. */
	readonly held?: boolean;
	/** What the press changed on the original, in a line. */
	readonly what: string;
	/** Controls like it that were not pressed (repeats), dead with it until the written port is asked about each. */
	readonly repeated?: number;
	/** Each of those repeats, as the written port is searched for it. */
	readonly repeatsOf?: readonly { readonly sig: string; readonly nth: number; readonly labelSig?: string; readonly pair?: number }[];
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
	readonly unknown: readonly { readonly name: string; readonly shape: PressedControl['shape']; readonly why?: string; /** Not pressed: the recorder that takes it by its own selector, which recorded nothing for it. */ readonly left?: 'reveals' | 'toggles' | 'grids' }[];
	readonly excluded: Readonly<Record<string, number>>;
	/** Stateful controls no recording ports but the written port has a handler for (a site part, its own): the effect is not compared. */
	readonly handled?: readonly { readonly name: string; readonly by: string; /** Repeats of it, not pressed and not asked of the port: not compared either. */ readonly repeated?: number }[];
	/** Repeats not pressed, by the pressed control they are like (`"name" (sig#nth)`). */
	readonly repeats?: Readonly<Record<string, number>>;
	readonly seconds: number;
	/** The press budget ended the presses before every control: the route's last findings stand. */
	readonly cut?: boolean;
	/** Controls counted from the route that owns their group, by that route. */
	readonly sameAs?: Readonly<Record<string, number>>;
	/** Spot checks here that did another thing than the owner: that group is pressed on every route next run. */
	readonly spotMismatch?: readonly { readonly name: string; readonly owner: string }[];
	/** Controls counted from a group a spot check found wrong this run: the route is not looked at in full. */
	readonly untrusted?: number;
	readonly error?: string;
}

export interface DiscoveryReport {
	/** Every route looked at, by route. */
	readonly routes: Readonly<Record<string, RouteDiscovery>>;
	/** Dead controls, repeats of a dead one included. */
	readonly count: number;
	readonly deadRoutes: number;
	/** Controls with a handler on the port whose effect is not compared. */
	readonly handled?: number;
	/** Routes whose discovery failed or stopped before every control: their last findings stand, and a port run fails. */
	readonly incomplete?: readonly string[];
	/** Against the last run of the same store, when there is one. */
	readonly before?: { readonly count: number; readonly added: readonly string[]; readonly cleared: readonly string[] };
	/** Why no route was looked at (the original is not a local copy). */
	readonly notRun?: string;
	/** What the port's scripts threw outside a browser while the port was asked (the first 20). */
	readonly thrown?: readonly string[];
	/** Where the report was made, when the run reads one an earlier run left (a kept emit). */
	readonly from?: string;
}

/** Repeats of a control with a handler on the port: counted with it, never asked themselves. */
const notAsked = (report: DiscoveryReport): number => Object.values(report.routes).reduce((n, r) => n + (r.handled ?? []).reduce((k, h) => k + (h.repeated ?? 0), 0), 0);

/** Dead controls on a route, each repeat of a dead one included. */
export const deadCount = (r: Pick<RouteDiscovery, 'dead'>): number => r.dead.reduce((n, d) => n + 1 + (d.repeated ?? 0), 0);

/** What a route's presses left out on purpose, said in full: the time stop, grids, repeats (by the control pressed in their place). */
export function cutsOf(r: Pick<RouteDiscovery, 'excluded' | 'repeats' | 'sameAs'>): string {
	const parts: string[] = [];
	for (const [why, n] of Object.entries(r.excluded)) if (why.startsWith('past ')) parts.push(`${n} not reached (${why})`);
	if (r.excluded['in a grid']) parts.push(`${r.excluded['in a grid']} in grids, left to the recording that holds each`);
	const counted = Object.entries(r.sameAs ?? {});
	if (counted.length) parts.push(`${counted.reduce((n, [, k]) => n + k, 0)} counted from the route that owns them: ${counted.map(([route, k]) => `${k} same as ${route}`).join(', ')}`);
	const repeats = Object.entries(r.repeats ?? {});
	if (repeats.length) parts.push(`${repeats.reduce((n, [, k]) => n + k, 0)} same as a control pressed: ${repeats.map(([like, k]) => `${k} like ${like}`).join(', ')}`);
	return parts.join('; ');
}

/** The few lines a person reads: the count against the last run, then every dead control by route. */
export function summarizeDiscovery(report: DiscoveryReport): string[] {
	if (report.notRun) return [`Dead controls: not looked for (${report.notRun}).`];
	const before = report.before ? ` (last run: ${report.before.count}; ${report.before.added.length} new, ${report.before.cleared.length} cleared)` : '';
	const lines = [`Ported with dead controls: ${report.count} controls on ${report.deadRoutes} of ${Object.keys(report.routes).length} routes${before}.`];
	if (report.handled) lines.push(`Has a handler on the port, effect not compared: ${report.handled} controls${notAsked(report) ? `, ${notAsked(report)} of them repeats of one, not asked of the port` : ''}.`);
	if (report.incomplete?.length) lines.push(`Routes not looked at in full (their last findings stand): ${report.incomplete.join(', ')}.`);
	for (const [route, r] of Object.entries(report.routes).sort(([a], [b]) => (a < b ? -1 : 1))) {
		for (const d of r.dead) lines.push(`  dead control on ${route}: "${d.name}" ${d.what}${d.repeated ? ` (and ${d.repeated} like it)` : ''}`);
		for (const h of r.handled ?? []) lines.push(`  has a handler, effect not compared, on ${route}: "${h.name}" (${h.by})${h.repeated ? `, and ${h.repeated} like it not asked of the port` : ''}`);
		for (const u of r.unknown) lines.push(`  not read on ${route}: "${u.name}" ${unknownLine(u)}`);
		for (const m of r.spotMismatch ?? []) lines.push(`  spot check on ${route}: "${m.name}" did another thing than on ${m.owner}; it is pressed on every route next run`);
		if (r.untrusted) lines.push(`  not looked at in full on ${route}: ${r.untrusted} counted from a group a spot check found wrong`);
		if (r.error) lines.push(`  discovery on ${route} stopped: ${r.error}`);
		const cut = cutsOf(r);
		if (cut) lines.push(`  cut on ${route}: ${cut}`);
	}
	for (const t of report.thrown ?? []) lines.push(`  the port threw outside a browser while asked: ${t}`);
	for (const n of report.before?.added ?? []) lines.push(`  new since the last run: ${n}`);
	for (const n of report.before?.cleared ?? []) lines.push(`  cleared since the last run: ${n}`);
	return lines;
}

const unknownLine = (u: RouteDiscovery['unknown'][number]): string =>
	u.left === 'grids' ? `not ported and not pressed: ${u.why ?? ''}` : u.left ? `not ported and not pressed: the ${u.left} take it by their own selector (an ARIA state such as aria-expanded or aria-pressed) and recorded nothing for it` : `${u.shape === 'blocked' ? 'writes to a server (blocked), state after press unknown' : u.shape}${u.why ? ` (${u.why})` : ''}`;

/** The pipeline job's summary: the count against the last run, then a row per route with dead controls. */
export function discoveryMarkdown(report: DiscoveryReport | undefined): { readonly text: string; readonly failed: boolean; readonly missing: boolean } {
	if (!report) return { text: '### Dead controls: unknown\n\nThe convert report has no dead-controls section: this convert did not look for them.\n', failed: true, missing: true };
	if (report.notRun) return { text: `### Dead controls: not looked for\n\n${report.notRun}\n`, failed: true, missing: true };
	const routes = Object.entries(report.routes).filter(([, r]) => r.dead.length || r.handled?.length || r.unknown.length || r.error || r.cut || cutsOf(r)).sort(([a], [b]) => (a < b ? -1 : 1));
	const lines = [`### Ported with dead controls: ${report.count} controls on ${report.deadRoutes} of ${Object.keys(report.routes).length} routes`, ''];
	if (report.from) lines.push(`This report is the one ${report.from} made: the emit was kept from it.`, '');
	if (report.handled) lines.push(`Has a handler on the port, effect not compared: ${report.handled} controls${notAsked(report) ? `, ${notAsked(report)} of them repeats of one, not asked of the port` : ''}.`, '');
	if (report.incomplete?.length) lines.push(`Not looked at in full (failed or stopped; their last findings stand): ${report.incomplete.join(', ')}.`, '');
	if (report.before) lines.push(`Last run of this store: ${report.before.count}. New: ${report.before.added.length}. Cleared: ${report.before.cleared.length}.`, '', ...report.before.added.map((n) => `- new: ${n}`), ...report.before.cleared.map((n) => `- cleared: ${n}`), '');
	else lines.push('No earlier run of this store to compare with.', '');
	const cell = (s: string) => s.replace(/\|/g, '\\|');
	if (routes.length)
		lines.push(
			'| Route | Dead | Handler, not compared | Not read | Controls | Cut |',
			'|---|---|---|---|---|---|',
			...routes.map(([route, r]) => `| ${route} | ${deadCount(r)} | ${r.handled?.length ?? 0} | ${r.unknown.length}${r.error ? ` (failed: ${cell(r.error)})` : ''} | ${cell([...r.dead.map((d) => `"${d.name}" ${d.shape}${d.repeated ? ` +${d.repeated} like it` : ''}`), ...(r.handled ?? []).map((h) => `"${h.name}" handler`), ...r.unknown.map((u) => `"${u.name}" ${u.left ? `not pressed (${u.left})` : u.shape}`)].join('; '))} | ${cell(cutsOf(r))} |`),
		);
	return { text: `${lines.join('\n')}\n`, failed: report.count > 0 || Boolean(report.incomplete?.length), missing: false };
}

import { acceptedLabel } from './check/automatic.ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Inventory } from './plan/inventory.ts';
import { readSamples, routeTargets } from './plan/routes.ts';
import { stepRoutes } from './plan/source.ts';
import { matchRoute } from './source/pattern.ts';
import type { Dimension, Failure, Report } from './check/types.ts';
import { isSwitched, readSwitched } from './switch/state.ts';
import { timingHeadlines, type RouteTiming } from './check/responsiveness.ts';

export const STATE_DIR = '.migrate';

export interface RouteState {
	readonly route: string;
	readonly ok: boolean;
	readonly checkedAt: string;
	readonly old: string;
	readonly new: string;
	readonly red: readonly Dimension[];
	readonly failures: readonly Failure[];
	/** Why nothing was compared: a bot wall answered instead of the app. */
	readonly blocked?: string;
	/** Why nothing was compared: an app could not be reached or did not answer in time. */
	readonly infrastructure?: string;
	/** What a non-page route was compared as (feed, json, robots...). */
	readonly endpoint?: string;
	/** The new app's commit when it was checked, and the files the route is rendered from, for check --changed. */
	readonly commit?: string;
	readonly files?: readonly string[];
	/** The old app serves the route and the new one answers 404: it has not been ported. */
	readonly notPorted?: boolean;
	readonly coverage?: { readonly exercised: number; readonly total: number };
	/** Its slowest first interaction and navigation, old and new, per speed. */
	readonly timing?: RouteTiming;
}

async function readJson<T>(path: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

export async function readResults(cwd: string): Promise<Record<string, RouteState> | undefined> {
	return readJson<Record<string, RouteState>>(join(cwd, STATE_DIR, 'results.json'));
}

export async function readInventory(cwd: string): Promise<Inventory | undefined> {
	return readJson<Inventory>(join(cwd, STATE_DIR, 'inventory.json'));
}

export async function recordResults(cwd: string, report: Report, extra: { readonly commit?: string } = {}): Promise<void> {
	const path = join(cwd, STATE_DIR, 'results.json');
	const results = (await readJson<Record<string, RouteState>>(path)) ?? {};
	for (const route of report.routes) {
		results[route.role && route.role !== 'anonymous' ? `${route.route} as ${route.role}` : route.route] = {
			route: route.route,
			...(route.blocked ? { blocked: route.blocked.message } : {}),
			...(route.infrastructure ? { infrastructure: route.infrastructure.message } : {}),
			...(route.endpoint ? { endpoint: route.endpoint } : {}),
			ok: route.ok,
			checkedAt: report.startedAt,
			old: report.old,
			new: report.new,
			red: Object.entries(route.dimensions).filter(([, s]) => s === 'fail').map(([d]) => d as Dimension),
			failures: route.failures,
			...(extra.commit ? { commit: extra.commit } : {}),
			...(route.newFiles ? { files: route.newFiles } : {}),
			...(route.notPorted ? { notPorted: true } : {}),
			...(route.coverage ? { coverage: { exercised: route.coverage.exercised, total: route.coverage.total } } : {}),
			...(route.responsiveness ? { timing: { cpu: route.responsiveness.cpu, ...route.responsiveness.worst } } : {}),
		};
	}
	await mkdir(join(cwd, STATE_DIR), { recursive: true });
	await writeFile(path, `${JSON.stringify(results, null, '\t')}\n`);
}

export type RouteStatus = 'green' | 'red' | 'not ported' | 'blocked' | 'unreachable' | 'unchecked' | 'needs a sample';

export interface Status {
	readonly planned: boolean;
	/** Every planned route is green and switched, none of them forced. */
	readonly done: boolean;
	/** In migration order when the inventory has the source's plan, alphabetical otherwise. */
	readonly routes: readonly { route: string; state: RouteStatus; red: readonly Dimension[]; checkedAt?: string; switched?: boolean; forced?: { readonly reason: string; readonly by?: string }; accepted?: readonly string[]; coverage?: { readonly exercised: number; readonly total: number }; timing?: RouteTiming }[];
	/** Each step of the migration order with how far the routes it is part of have come. */
	readonly order?: readonly { readonly kind: string; readonly name: string; readonly file: string; readonly routes: readonly string[]; readonly green: number; readonly state: 'green' | 'red' | 'started' | 'unchecked' }[];
}

export async function status(cwd: string): Promise<Status> {
	const inventory = await readInventory(cwd);
	const results = (await readJson<Record<string, RouteState>>(join(cwd, STATE_DIR, 'results.json'))) ?? {};
	const targets = inventory ? routeTargets(inventory, await readSamples(join(cwd, STATE_DIR))) : undefined;
	const names = [...new Set([...(inventory?.routes.map((r) => r.route) ?? []), ...(targets?.pages ?? []), ...(targets?.endpoints ?? []), ...Object.keys(results)])].sort();
	const source = inventory?.source;
	const steps = (source?.order ?? []).map((step) => ({ step, patterns: stepRoutes(source!, step) }));
	const endpoints = new Set([...(targets?.endpoints ?? []), ...Object.values(results).flatMap((r) => (r.endpoint ? [r.route] : []))]);
	const page = (route: string) => !endpoints.has(route.replace(/ as .*$/, ''));
	const rank = (route: string) => {
		const path = route.replace(/ as .*$/, '');
		if (!page(route)) return steps.length;
		const at = steps.findIndex((s) => s.step.kind === 'route' && s.patterns.some((p) => matchRoute(p, path)));
		return at >= 0 ? at : steps.length;
	};
	const stateOf = (route: string): Status['routes'][number] => {
		const r = results[route];
		if (!r) return { route, state: 'unchecked', red: [] };
		const accepted = (r.failures ?? []).flatMap((f) => (f.accepted ? [`${f.accepted.automatic ? `${acceptedLabel(f.accepted)}: ` : ''}${f.dimension}: ${f.check}: ${f.accepted.reason}`] : []));
		return { route, state: r.blocked ? 'blocked' : r.infrastructure ? 'unreachable' : r.ok ? 'green' : r.notPorted ? 'not ported' : 'red', red: r.red, checkedAt: r.checkedAt, ...(accepted.length ? { accepted } : {}), ...(r.coverage ? { coverage: r.coverage } : {}), ...(r.timing ? { timing: r.timing } : {}) };
	};
	const routes = names.map(stateOf).sort((a, b) => rank(a.route) - rank(b.route) || a.route.localeCompare(b.route));
	for (const n of targets?.needsSample ?? []) routes.push({ route: n.route, state: 'needs a sample', red: [] });
	const entries = (await readSwitched(cwd)).routes;
	for (const [i, r] of routes.entries()) {
		const path = r.route.replace(/ as .*$/, '');
		const by = entries.filter((e) => isSwitched([e.route], path));
		if (!by.length) continue;
		const forced = by.find((e) => e.forced)?.forced;
		routes[i] = { ...r, switched: true, ...(forced ? { forced } : {}) };
	}
	const order = steps.map(({ step, patterns }) => {
		const mine = routes.filter((r) => r.state !== 'needs a sample' && page(r.route) && patterns.some((p) => matchRoute(p, r.route.replace(/ as .*$/, ''))));
		const green = mine.filter((r) => r.state === 'green').length;
		const state = mine.some((r) => r.state === 'red') ? 'red' : mine.length && green === mine.length ? 'green' : green ? 'started' : 'unchecked';
		return { kind: step.kind, name: step.name, file: step.file, routes: mine.map((r) => r.route), green, state } as const;
	});
	const done = Boolean(inventory) && routes.length > 0 && routes.every((r) => !page(r.route) || (r.state === 'green' && r.switched && !r.forced));
	return { planned: Boolean(inventory), done, routes, ...(order.length ? { order } : {}) };
}

export function summarizeStatus(s: Status): string {
	if (!s.planned && !s.routes.length) return 'No inventory yet. Run plan against the old app first.\n';
	const count = (state: string) => s.routes.filter((r) => r.state === state).length;
	const lines = [`${count('green')} green, ${count('red')} red, ${count('not ported') ? `${count('not ported')} not ported, ` : ''}${count('blocked') ? `${count('blocked')} blocked by bot protection, ` : ''}${count('unreachable') ? `${count('unreachable')} not checked for an infrastructure failure, ` : ''}${count('unchecked')} not checked${s.planned ? '' : ' (no inventory: only checked routes are listed)'}`];
	if (count('needs a sample')) lines[0] += `, ${count('needs a sample')} need a sample value (.migrate/samples.json)`;
	if (s.order?.length) {
		lines.push('Migration order:');
		s.order.forEach((o, i) => lines.push(`  ${String(i + 1).padStart(2)}. ${o.state.padEnd(9)} ${o.kind} ${o.name}  ${o.file}${o.routes.length ? `  ${o.green} of ${o.routes.length} routes green` : ''}`));
		lines.push('Routes, in that order:');
	}
	if (s.routes.some((r) => r.switched)) lines[0] += `, ${s.routes.filter((r) => r.switched).length} switched to Markless`;
	lines.push(...timingHeadlines(s.routes));
	const forced = s.routes.filter((r) => r.forced);
	if (forced.length) lines[0] += `, ${forced.length} FORCED (not proven)`;
	for (const r of s.routes) {
		lines.push(`  ${r.state.padEnd(10)} ${r.route}${r.red.length ? `  [${r.red.join(', ')}]` : ''}${r.coverage ? `  (${r.coverage.exercised} of ${r.coverage.total} interactions exercised)` : ''}${r.accepted ? `  (${r.accepted.length} accepted)` : ''}${r.forced ? `  (FORCED, not proven: ${r.forced.reason}${r.forced.by ? `, by ${r.forced.by}` : ''})` : r.switched ? '  (switched)' : ''}`);
		for (const a of r.accepted ?? []) lines.push(`              ${a.startsWith('accepted automatically') ? a : `accepted ${a}`}`);
	}
	if (s.planned) lines.push(s.done ? 'Migration done: every planned route is green and switched.' : `Migration not done: ${remaining(s)}.`);
	return `${lines.join('\n')}\n`;
}

export function remaining(s: Status): string {
	const left = s.routes.filter((r) => !(r.state === 'green' && r.switched && !r.forced));
	const by = (test: (r: Status['routes'][number]) => boolean, label: string) => {
		const n = left.filter(test).length;
		return n ? [`${n} ${label}`] : [];
	};
	return [
		...by((r) => r.state === 'not ported', 'not ported'),
		...by((r) => r.state === 'unchecked' || r.state === 'needs a sample' || r.state === 'unreachable', 'not checked'),
		...by((r) => r.state === 'red' || r.state === 'blocked', 'red'),
		...by((r) => Boolean(r.forced), 'forced without proof'),
		...by((r) => r.state === 'green' && !r.switched, 'green but not switched'),
	].join(', ') || 'nothing left';
}

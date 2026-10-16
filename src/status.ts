import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Inventory } from './plan/inventory.ts';
import { readSamples, routeTargets } from './plan/routes.ts';
import { stepRoutes } from './plan/source.ts';
import { matchRoute } from './source/pattern.ts';
import type { Dimension, Failure, Report } from './check/types.ts';
import { isSwitched, readSwitched } from './switch/state.ts';

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
	/** What a non-page route was compared as (feed, json, robots...). */
	readonly endpoint?: string;
}

async function readJson<T>(path: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

export async function readInventory(cwd: string): Promise<Inventory | undefined> {
	return readJson<Inventory>(join(cwd, STATE_DIR, 'inventory.json'));
}

export async function recordResults(cwd: string, report: Report): Promise<void> {
	const path = join(cwd, STATE_DIR, 'results.json');
	const results = (await readJson<Record<string, RouteState>>(path)) ?? {};
	for (const route of report.routes) {
		results[route.role && route.role !== 'anonymous' ? `${route.route} as ${route.role}` : route.route] = {
			route: route.route,
			...(route.blocked ? { blocked: route.blocked.message } : {}),
			...(route.endpoint ? { endpoint: route.endpoint } : {}),
			ok: route.ok,
			checkedAt: report.startedAt,
			old: report.old,
			new: report.new,
			red: Object.entries(route.dimensions).filter(([, s]) => s === 'fail').map(([d]) => d as Dimension),
			failures: route.failures,
		};
	}
	await mkdir(join(cwd, STATE_DIR), { recursive: true });
	await writeFile(path, `${JSON.stringify(results, null, '\t')}\n`);
}

export interface Status {
	readonly planned: boolean;
	/** In migration order when the inventory has the source's plan, alphabetical otherwise. */
	readonly routes: readonly { route: string; state: 'green' | 'red' | 'blocked' | 'unchecked' | 'needs a sample'; red: readonly Dimension[]; checkedAt?: string; switched?: boolean }[];
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
		return r ? { route, state: r.blocked ? 'blocked' : r.ok ? 'green' : 'red', red: r.red, checkedAt: r.checkedAt } : { route, state: 'unchecked', red: [] };
	};
	const routes = names.map(stateOf).sort((a, b) => rank(a.route) - rank(b.route) || a.route.localeCompare(b.route));
	for (const n of targets?.needsSample ?? []) routes.push({ route: n.route, state: 'needs a sample', red: [] });
	const switched = (await readSwitched(cwd)).routes.map((r) => r.route);
	for (const [i, r] of routes.entries()) if (isSwitched(switched, r.route.replace(/ as .*$/, ''))) routes[i] = { ...r, switched: true };
	const order = steps.map(({ step, patterns }) => {
		const mine = routes.filter((r) => r.state !== 'needs a sample' && page(r.route) && patterns.some((p) => matchRoute(p, r.route.replace(/ as .*$/, ''))));
		const green = mine.filter((r) => r.state === 'green').length;
		const state = mine.some((r) => r.state === 'red') ? 'red' : mine.length && green === mine.length ? 'green' : green ? 'started' : 'unchecked';
		return { kind: step.kind, name: step.name, file: step.file, routes: mine.map((r) => r.route), green, state } as const;
	});
	return { planned: Boolean(inventory), routes, ...(order.length ? { order } : {}) };
}

export function summarizeStatus(s: Status): string {
	if (!s.planned && !s.routes.length) return 'No inventory yet. Run plan against the old app first.\n';
	const count = (state: string) => s.routes.filter((r) => r.state === state).length;
	const lines = [`${count('green')} green, ${count('red')} red, ${count('blocked') ? `${count('blocked')} blocked by bot protection, ` : ''}${count('unchecked')} not checked${s.planned ? '' : ' (no inventory: only checked routes are listed)'}`];
	if (count('needs a sample')) lines[0] += `, ${count('needs a sample')} need a sample value (.migrate/samples.json)`;
	if (s.order?.length) {
		lines.push('Migration order:');
		s.order.forEach((o, i) => lines.push(`  ${String(i + 1).padStart(2)}. ${o.state.padEnd(9)} ${o.kind} ${o.name}  ${o.file}${o.routes.length ? `  ${o.green} of ${o.routes.length} routes green` : ''}`));
		lines.push('Routes, in that order:');
	}
	if (s.routes.some((r) => r.switched)) lines[0] += `, ${s.routes.filter((r) => r.switched).length} switched to Markless`;
	for (const r of s.routes) lines.push(`  ${r.state.padEnd(9)} ${r.route}${r.red.length ? `  [${r.red.join(', ')}]` : ''}${r.switched ? '  (switched)' : ''}`);
	return `${lines.join('\n')}\n`;
}

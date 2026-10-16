import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Inventory } from './plan/inventory.ts';
import type { Dimension, Failure, Report } from './check/types.ts';

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
	readonly routes: readonly { route: string; state: 'green' | 'red' | 'blocked' | 'unchecked'; red: readonly Dimension[]; checkedAt?: string }[];
}

export async function status(cwd: string): Promise<Status> {
	const inventory = await readInventory(cwd);
	const results = (await readJson<Record<string, RouteState>>(join(cwd, STATE_DIR, 'results.json'))) ?? {};
	const names = [...new Set([...(inventory?.routes.map((r) => r.route) ?? []), ...Object.keys(results)])].sort();
	return {
		planned: Boolean(inventory),
		routes: names.map((route) => {
			const r = results[route];
			return r ? { route, state: r.blocked ? 'blocked' : r.ok ? 'green' : 'red', red: r.red, checkedAt: r.checkedAt } : { route, state: 'unchecked', red: [] };
		}),
	};
}

export function summarizeStatus(s: Status): string {
	if (!s.planned && !s.routes.length) return 'No inventory yet. Run plan against the old app first.\n';
	const count = (state: string) => s.routes.filter((r) => r.state === state).length;
	const lines = [`${count('green')} green, ${count('red')} red, ${count('blocked') ? `${count('blocked')} blocked by bot protection, ` : ''}${count('unchecked')} not checked${s.planned ? '' : ' (no inventory: only checked routes are listed)'}`];
	for (const r of s.routes) lines.push(`  ${r.state.padEnd(9)} ${r.route}${r.red.length ? `  [${r.red.join(', ')}]` : ''}`);
	return `${lines.join('\n')}\n`;
}

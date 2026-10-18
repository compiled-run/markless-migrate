import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { matchRoute } from '../source/pattern.ts';
import type { RouteState } from '../status.ts';

export const SWITCHED_FILE = 'switched.json';

export interface SwitchedRoute {
	/** A path (`/about/`) or a pattern (`/blog/:slug`, `/docs/*rest`). */
	readonly route: string;
	readonly at: string;
	/** The check results the switch was decided on: `route as role: green|red [dims]|blocked`. */
	readonly checks: readonly string[];
	/** Set when a person forced a route whose last check was not green: it is served, but nothing proves it. */
	readonly forced?: { readonly reason: string; readonly by?: string };
}

export interface Switched {
	readonly routes: readonly SwitchedRoute[];
}

const stateDir = (cwd: string) => join(cwd, '.migrate');

export async function readSwitched(cwd: string): Promise<Switched> {
	try {
		const parsed = JSON.parse(await readFile(join(stateDir(cwd), SWITCHED_FILE), 'utf8')) as Switched;
		return { routes: parsed.routes ?? [] };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { routes: [] };
		throw error;
	}
}

async function writeSwitched(cwd: string, switched: Switched): Promise<string> {
	await mkdir(stateDir(cwd), { recursive: true });
	const path = join(stateDir(cwd), SWITCHED_FILE);
	await writeFile(path, `${JSON.stringify(switched, null, '\t')}\n`);
	return path;
}

/** Why a route cannot be switched as written: the switch list takes paths and the `:param` / `*rest` patterns of the source scan. */
export function routeProblem(route: string): string | undefined {
	if (!route.startsWith('/')) return `a route starts with "/": ${route}`;
	const vercel = /:\w+[*+]|\(|\)/.exec(route);
	if (vercel) return `${route} uses Vercel or path-to-regexp syntax (${vercel[0]}), which the switch list does not read: write /docs/*rest for every path under /docs/, or /blog/:slug for one segment`;
	for (const segment of route.split('/').slice(1)) {
		if (segment.includes('*') && !/^\*([A-Za-z_]\w*)?\??$/.test(segment)) return `${route}: a * stands for the rest of the path and fills a whole segment (/docs/*rest), not part of one (${segment})`;
		if (segment.includes(':') && !/^:[A-Za-z_]\w*\??$/.test(segment)) return `${route}: a :param fills a whole segment (/blog/:slug), not part of one (${segment})`;
	}
	return undefined;
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

/** Whether a request path is served by the new app: it matches a switched route (trailing slash ignored). */
export function isSwitched(routes: readonly string[], path: string): boolean {
	return routes.some((route) => (/[:*]/.test(route) ? matchRoute(route, path) : samePath(route, path.split(/[?#]/)[0]!)));
}

function checksFor(route: string, results: Readonly<Record<string, RouteState>>): { key: string; state: RouteState }[] {
	return Object.entries(results)
		.filter(([, r]) => (/[:*]/.test(route) ? matchRoute(route, r.route) : samePath(route, r.route)))
		.map(([key, state]) => ({ key, state }));
}

const describe = (key: string, r: RouteState) => `${key}: ${r.blocked ? 'blocked' : r.infrastructure ? 'not checked (infrastructure)' : r.ok ? 'green' : `red [${r.red.join(', ')}]`}`;

export type SwitchOutcome = { readonly ok: true; readonly path: string; readonly entry: SwitchedRoute; readonly already: boolean } | { readonly ok: false; readonly reason: string };

/** Set in the environment of every agent `run` drives: forcing a switch and accepting a difference are expert overrides it refuses. */
export const AGENT_ENV = 'MARKLESS_MIGRATE_AGENT';

/** Moves a route to the new app when every last check of it (each role) is green; a person's `force` records who sent it anyway and why. */
export async function switchRoute(cwd: string, route: string, options: { force?: { readonly reason: string; readonly by: string } } = {}): Promise<SwitchOutcome> {
	const invalid = routeProblem(route);
	if (invalid) return { ok: false, reason: invalid };
	const results = JSON.parse(await readFile(join(stateDir(cwd), 'results.json'), 'utf8').catch(() => '{}')) as Record<string, RouteState>;
	const checks = checksFor(route, results);
	const checked = checks.map(({ key, state }) => describe(key, state));
	const green = checks.length > 0 && checks.every(({ state }) => state.ok && !state.blocked && !state.infrastructure);
	if (!green && options.force === undefined) {
		const why = checks.length ? `its last check is not green (${checked.join('; ')})` : 'it has not been checked yet';
		return { ok: false, reason: `not switching ${route}: ${why}. Run check until it is green; until then the route stays on the old app (an expert override exists: switch --force --by <name> --reason <why>).` };
	}
	const current = await readSwitched(cwd);
	const existing = current.routes.find((r) => r.route === route);
	const entry: SwitchedRoute = { route, at: new Date().toISOString(), checks: checked, ...(!green && options.force ? { forced: { reason: options.force.reason, by: options.force.by } } : {}) };
	const path = await writeSwitched(cwd, { routes: [...current.routes.filter((r) => r.route !== route), entry] });
	return { ok: true, path, entry, already: Boolean(existing) };
}

export async function unswitchRoute(cwd: string, route: string): Promise<{ removed: boolean; path: string }> {
	const current = await readSwitched(cwd);
	const routes = current.routes.filter((r) => r.route !== route);
	const path = await writeSwitched(cwd, { routes });
	return { removed: routes.length !== current.routes.length, path };
}

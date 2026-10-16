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
	/** Set when `--force` switched a route whose last check was not green. */
	readonly forced?: { readonly reason: string };
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

const describe = (key: string, r: RouteState) => `${key}: ${r.blocked ? 'blocked' : r.ok ? 'green' : `red [${r.red.join(', ')}]`}`;

export type SwitchOutcome = { readonly ok: true; readonly path: string; readonly entry: SwitchedRoute; readonly already: boolean } | { readonly ok: false; readonly reason: string };

/** Moves a route to the new app when every last check of it (each role) is green; `force` records why it went anyway. */
export async function switchRoute(cwd: string, route: string, options: { force?: string } = {}): Promise<SwitchOutcome> {
	if (!route.startsWith('/')) return { ok: false, reason: `a route starts with "/": ${route}` };
	const results = JSON.parse(await readFile(join(stateDir(cwd), 'results.json'), 'utf8').catch(() => '{}')) as Record<string, RouteState>;
	const checks = checksFor(route, results);
	const checked = checks.map(({ key, state }) => describe(key, state));
	const green = checks.length > 0 && checks.every(({ state }) => state.ok && !state.blocked);
	if (!green && options.force === undefined) {
		const why = checks.length ? `its last check is not green (${checked.join('; ')})` : 'it has not been checked yet';
		return { ok: false, reason: `not switching ${route}: ${why}. Run check until it is green, or pass --force with a reason.` };
	}
	const current = await readSwitched(cwd);
	const existing = current.routes.find((r) => r.route === route);
	const entry: SwitchedRoute = { route, at: new Date().toISOString(), checks: checked, ...(!green ? { forced: { reason: options.force || 'no reason given' } } : {}) };
	const path = await writeSwitched(cwd, { routes: [...current.routes.filter((r) => r.route !== route), entry] });
	return { ok: true, path, entry, already: Boolean(existing) };
}

export async function unswitchRoute(cwd: string, route: string): Promise<{ removed: boolean; path: string }> {
	const current = await readSwitched(cwd);
	const routes = current.routes.filter((r) => r.route !== route);
	const path = await writeSwitched(cwd, { routes });
	return { removed: routes.length !== current.routes.length, path };
}

// The one place the port's prefetch decision becomes Markless router options: the router's config shape lives here only,
// and the triggers and network values it takes are read from the app's installed router, never restated.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrefetchSetting } from '../prefetch/decide.ts';

/** What the app's router says it takes (`PREFETCH_TRIGGERS`, `PREFETCH_NETWORKS` from `@markless/router/vite`). */
export interface RouterPrefetchSupport {
	readonly triggers: readonly string[];
	readonly networks: readonly string[];
	/** `PREFETCH_DEFAULTS.budget`: the router caps the bytes it fetches ahead per page shown at this by default; absent on a router without the setting. */
	readonly defaultBudget?: number;
}

const strings = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((t) => typeof t === 'string');

/** Why the setting cannot be written: the app's router is not installed, or is older than the prefetch setting. */
export type RouterPrefetchRefusal = { readonly refused: 'not installed' | 'too old'; readonly says: string };

/** What the app's installed router takes, or why it takes nothing: it then keeps its own defaults. */
export async function routerPrefetchSupport(app: string): Promise<RouterPrefetchSupport | RouterPrefetchRefusal> {
	let loaded: { PREFETCH_TRIGGERS?: unknown; PREFETCH_NETWORKS?: unknown; PREFETCH_DEFAULTS?: { budget?: unknown } };
	let entry: string;
	try {
		entry = createRequire(join(app, 'package.json')).resolve('@markless/router/vite');
	} catch {
		return { refused: 'not installed', says: "the app's @markless/router is not installed, so convert cannot read which prefetch triggers it takes: install the app's dependencies and convert again" };
	}
	loaded = (await import(pathToFileURL(entry).href)) as typeof loaded;
	if (!('PREFETCH_TRIGGERS' in loaded)) return { refused: 'too old', says: "the app's @markless/router has no prefetch setting (it exports no PREFETCH_TRIGGERS): update it to take the setting" };
	if (!strings(loaded.PREFETCH_TRIGGERS) || !strings(loaded.PREFETCH_NETWORKS)) throw new Error("@markless/router/vite exports PREFETCH_TRIGGERS but not as a list of names beside PREFETCH_NETWORKS: convert cannot write the port's prefetch setting");
	const budget = loaded.PREFETCH_DEFAULTS?.budget;
	return { triggers: loaded.PREFETCH_TRIGGERS, networks: loaded.PREFETCH_NETWORKS, ...(typeof budget === 'number' ? { defaultBudget: budget } : {}) };
}

/** The argument `router(...)` gets in vite.config.ts: empty when the router takes no prefetch setting, so its defaults stand. */
/**
 * The budget written: the original's page data ahead per page view times the factor, never above the router's own
 * default; none when the router has no budget or the port fetches nothing ahead but on intent (which it does not budget).
 */
export function budgetOf(setting: PrefetchSetting, cap: number, support: RouterPrefetchSupport): number | undefined {
	if (support.defaultBudget === undefined || (setting.viewport === 'none' && setting.idle === 'none')) return undefined;
	return Math.min(support.defaultBudget, cap);
}

export function routerOptions(setting: PrefetchSetting | undefined, support: RouterPrefetchSupport | RouterPrefetchRefusal | undefined, budgetCap?: number): string {
	if (!setting || !support || 'refused' in support) return '';
	const entries: [string, string | number][] = [];
	for (const trigger of ['intent', 'viewport', 'idle'] as const) {
		if (!support.triggers.includes(trigger)) continue;
		if (!support.networks.includes(setting[trigger])) throw new Error(`the router takes ${support.networks.join(', ')} for ${trigger}, not ${setting[trigger]}`);
		entries.push([trigger, setting[trigger]]);
	}
	entries.push(['concurrency', setting.concurrency]);
	const budget = budgetCap === undefined ? undefined : budgetOf(setting, budgetCap, support);
	if (budget !== undefined) entries.push(['budget', budget]);
	return `{ prefetch: { ${entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`).join(', ')} } }`;
}

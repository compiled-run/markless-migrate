// The one place the port's prefetch decision becomes Markless router options; the triggers and networks are read from the app's router.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrefetchSetting } from '../prefetch/decide.ts';

/** What the app's router says it takes (`PREFETCH_TRIGGERS`, `PREFETCH_NETWORKS` from `@markless/router/vite`). */
export interface RouterPrefetchSupport {
	readonly triggers: readonly string[];
	readonly networks: readonly string[];
}

/** Why the setting cannot be written; the app then keeps its router's defaults. */
export interface RouterPrefetchRefusal {
	readonly refused: 'not installed' | 'unloadable' | 'too old' | 'unreadable';
	readonly says: string;
}

const strings = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((t) => typeof t === 'string');
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export async function routerPrefetchSupport(app: string): Promise<RouterPrefetchSupport | RouterPrefetchRefusal> {
	let entry: string;
	try {
		entry = createRequire(join(app, 'package.json')).resolve('@markless/router/vite');
	} catch {
		return { refused: 'not installed', says: "the app's @markless/router is not installed, so convert cannot read which prefetch triggers it takes: install the app's dependencies and convert again" };
	}
	let loaded: unknown;
	try {
		loaded = await import(pathToFileURL(entry).href);
	} catch (error) {
		return { refused: 'unloadable', says: `the app's @markless/router/vite could not be loaded (${(error as Error).message.split('\n')[0]}), so convert cannot read which prefetch triggers it takes` };
	}
	if (!isObject(loaded) || !('PREFETCH_TRIGGERS' in loaded)) return { refused: 'too old', says: "the app's @markless/router has no prefetch setting (it exports no PREFETCH_TRIGGERS): update it to take the setting" };
	if (!strings(loaded.PREFETCH_TRIGGERS) || !strings(loaded.PREFETCH_NETWORKS)) return { refused: 'unreadable', says: "the app's @markless/router exports PREFETCH_TRIGGERS and PREFETCH_NETWORKS in a shape convert does not read (lists of names)" };
	return { triggers: loaded.PREFETCH_TRIGGERS, networks: loaded.PREFETCH_NETWORKS };
}

/** The argument `router(...)` gets in vite.config.ts, or why there is none (the router's defaults then stand). */
export function routerOptions(setting: PrefetchSetting, support: RouterPrefetchSupport | RouterPrefetchRefusal): { readonly args: string; readonly missing: readonly string[] } | { readonly notApplied: string } {
	if ('refused' in support) return { notApplied: support.says };
	const prefetch: Record<string, string | number> = {};
	const missing: string[] = [];
	for (const trigger of ['intent', 'viewport', 'idle'] as const) {
		if (!support.triggers.includes(trigger)) {
			if (setting[trigger] !== 'none') missing.push(trigger);
			continue;
		}
		if (!support.networks.includes(setting[trigger])) return { notApplied: `the app's router takes ${support.networks.join(', ')} for ${trigger}, not ${setting[trigger]}` };
		prefetch[trigger] = setting[trigger];
	}
	prefetch.concurrency = setting.concurrency;
	return { args: JSON.stringify({ prefetch }), missing };
}

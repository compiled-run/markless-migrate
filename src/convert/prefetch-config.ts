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
}

const strings = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((t) => typeof t === 'string');

/** Undefined when the app's router has no prefetch setting: it then keeps its own defaults. */
export async function routerPrefetchSupport(app: string): Promise<RouterPrefetchSupport | undefined> {
	let loaded: { PREFETCH_TRIGGERS?: unknown; PREFETCH_NETWORKS?: unknown };
	try {
		const entry = createRequire(join(app, 'package.json')).resolve('@markless/router/vite');
		loaded = (await import(pathToFileURL(entry).href)) as typeof loaded;
	} catch {
		return undefined;
	}
	if (!('PREFETCH_TRIGGERS' in loaded)) return undefined;
	if (!strings(loaded.PREFETCH_TRIGGERS) || !strings(loaded.PREFETCH_NETWORKS)) throw new Error("@markless/router/vite exports PREFETCH_TRIGGERS but not as a list of names beside PREFETCH_NETWORKS: convert cannot write the port's prefetch setting");
	return { triggers: loaded.PREFETCH_TRIGGERS, networks: loaded.PREFETCH_NETWORKS };
}

/** The argument `router(...)` gets in vite.config.ts: empty when the router takes no prefetch setting, so its defaults stand. */
export function routerOptions(setting: PrefetchSetting | undefined, support: RouterPrefetchSupport | undefined): string {
	if (!setting || !support) return '';
	const entries: [string, string | number][] = [];
	for (const trigger of ['intent', 'viewport', 'idle'] as const) {
		if (!support.triggers.includes(trigger)) continue;
		if (!support.networks.includes(setting[trigger])) throw new Error(`the router takes ${support.networks.join(', ')} for ${trigger}, not ${setting[trigger]}`);
		entries.push([trigger, setting[trigger]]);
	}
	entries.push(['concurrency', setting.concurrency]);
	return `{ prefetch: { ${entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`).join(', ')} } }`;
}

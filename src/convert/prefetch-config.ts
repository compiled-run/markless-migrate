// The one place the port's prefetch decision becomes Markless router options: the router's config shape lives here only.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrefetchSetting } from '../prefetch/decide.ts';

/** What the router's own package says it takes, read from the app's installed router; undefined when it has no prefetch setting. */
export interface RouterPrefetchSupport {
	readonly triggers: readonly string[];
}

/** The app's router declares its prefetch triggers (`PREFETCH_TRIGGERS` from `@markless/router/vite`) when it takes the setting. */
export async function routerPrefetchSupport(app: string): Promise<RouterPrefetchSupport | undefined> {
	try {
		const entry = createRequire(join(app, 'package.json')).resolve('@markless/router/vite');
		const loaded = (await import(pathToFileURL(entry).href)) as { PREFETCH_TRIGGERS?: unknown };
		const triggers = loaded.PREFETCH_TRIGGERS;
		return Array.isArray(triggers) && triggers.every((t) => typeof t === 'string') ? { triggers } : undefined;
	} catch {
		return undefined;
	}
}

/** The argument `router(...)` gets in vite.config.ts: empty when the router takes no prefetch setting, so its defaults stand. */
export function routerOptions(setting: PrefetchSetting | undefined, support: RouterPrefetchSupport | undefined): string {
	if (!setting || !support) return '';
	const known = new Set(support.triggers);
	const entries: [string, string | number][] = [];
	for (const trigger of ['intent', 'viewport', 'idle'] as const) if (known.has(trigger)) entries.push([trigger, setting[trigger]]);
	entries.push(['concurrency', setting.concurrency]);
	return `{ prefetch: { ${entries.map(([k, v]) => `${k}: ${JSON.stringify(v).replaceAll('"', "'")}`).join(', ')} } }`;
}

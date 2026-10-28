import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { NitroRule } from './rules.ts';

const exists = (path: string) => access(path).then(() => true, () => false);

// Nitro's Vercel preset names a route's ISR function this way (normalizeRouteDest).
const routeDest = (path: string) => path.split('/').slice(1).map((s) => s.replace(/[^a-zA-Z0-9_.[\]/]/g, '-')).join('/') || 'index';

/** The cached paths of these routeRules that a built Vercel output serves from neither an ISR function nor a static file: each runs the server function on every request. */
export async function missingIsrFunctions(outputDir: string, routeRules: Readonly<Record<string, NitroRule>>): Promise<string[]> {
	const missing: string[] = [];
	for (const [path, rule] of Object.entries(routeRules)) {
		if (/[:*]/.test(path)) continue;
		const isr = rule.isr !== undefined && rule.isr !== false;
		if (!isr && !rule.prerender) continue;
		const dest = routeDest(path);
		const served = isr ? await exists(join(outputDir, 'functions', `${dest}-isr.func`)) : (await exists(join(outputDir, 'static', path, 'index.html'))) || (await exists(join(outputDir, 'static', `${path}.html`)));
		if (!served) missing.push(path);
	}
	return missing;
}

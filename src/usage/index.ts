import { routesToPort } from '../plan/enumerate.ts';
import type { Inventory } from '../plan/inventory.ts';
import type { LibrariesFile } from '../library/types.ts';
import { implementations, readUsageMap } from './implement.ts';
import { scanUsage, writeUsage } from './scan.ts';
import { summarizeUsage } from './summary.ts';
import type { Implementation, UsageInventory } from './types.ts';

export type * from './types.ts';
export { implementations, readUsageMap, USAGE_MAP_FILE } from './implement.ts';
export { MECHANISMS } from './obligations.ts';
export { OBLIGATIONS_FILE, readUsage, scanUsage, USAGE_FILE, writeUsage } from './scan.ts';
export { coverage, routeBrief, summarizeUsage } from './summary.ts';

/** The pages of an inventory whose markup the usage scan reads: every route to port that answered with HTML, or was never fetched. */
export function usagePages(inventory: Pick<Inventory, 'routes' | 'allRoutes'>): string[] {
	if (!inventory.allRoutes) return inventory.routes.map((r) => r.route);
	return routesToPort(inventory.allRoutes)
		.filter((r) => !r.redirectsTo && (r.contentType === undefined ? !/\.[a-z0-9]{2,5}$/i.test(r.route) : /html/.test(r.contentType)))
		.map((r) => r.route);
}

export interface PlanUsageOptions {
	readonly inventory: Inventory;
	readonly stateDir: string;
	readonly newSource?: string;
	readonly built?: string;
	readonly libraries?: LibrariesFile;
	readonly headers?: Readonly<Record<string, string>>;
}

/** plan's usage step: scan, write usage.json and obligations.json, and say what is used, implemented and checked. */
export async function planUsage(options: PlanUsageOptions): Promise<{ inventory: UsageInventory; implemented: Implementation[]; text: string; paths: { usage: string; obligations: string } }> {
	const inventory = await scanUsage({
		origin: options.inventory.origin,
		routes: usagePages(options.inventory),
		...(options.built ? { built: options.built } : {}),
		...(options.inventory.source ? { source: options.inventory.source.path } : {}),
		...(options.libraries ? { libraries: options.libraries } : {}),
		...(options.headers ? { headers: options.headers } : {}),
	});
	const paths = await writeUsage(inventory, options.stateDir);
	const implemented = await implementations(inventory.behaviours, await readUsageMap(options.stateDir), options.newSource);
	return { inventory, implemented, text: summarizeUsage(inventory, implemented), paths };
}

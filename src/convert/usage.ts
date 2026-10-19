import { readFile } from 'node:fs/promises';

/** One place in the old source where a library export renders an element the page carries. */
export interface PartUsage {
	readonly library: string;
	/** The export as the source names it off the package: `Tabs.Trigger`, `Popover`, `Command.Input`. */
	readonly export: string;
	readonly file: string;
	readonly line: number;
}

/**
 * Which library part renders an element of the old page, as the old source says. The converter asks only this; the
 * semantic usage inventory replaces the interim resolver below behind the same interface.
 */
export interface PartResolver {
	readonly name: string;
	/** The library exports the source renders with this `data-slot`, from every file that renders one. */
	candidates(slot: string): readonly PartUsage[];
	/** Every library the source renders parts of, with how many slots each renders. */
	libraries(): ReadonlyMap<string, number>;
}

interface LibrariesFile {
	readonly libraries: readonly {
		readonly name: string;
		readonly class: string;
		readonly exports: readonly { readonly name: string; readonly sites?: readonly { readonly file: string; readonly line: number; readonly kind?: string; readonly props?: Readonly<Record<string, string>> }[] }[];
	}[];
}

// Libraries whose components put their own parts in the page; a library that renders nothing has no slots to resolve.
const RENDERING = new Set(['parity', 'markless-ui', 'dom']);

/** A prop the inventory recorded as written, when it is a plain string literal. */
function literal(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const m = /^"((?:[^"\\]|\\.)*)"$/.exec(value);
	return m ? JSON.parse(`"${m[1]}"`) : undefined;
}

/**
 * Interim resolver until the semantic usage inventory lands: reads `plan --source`'s libraries.json, where every element
 * a library export renders in the old source is a site with the props written on it, and records which export each
 * literal `data-slot` is written on (`<TabsPrimitive.Trigger data-slot="tabs-trigger">` is radix-ui's `Tabs.Trigger`).
 */
export async function sourceSlotResolver(librariesPath: string): Promise<PartResolver> {
	const file = JSON.parse(await readFile(librariesPath, 'utf8')) as LibrariesFile;
	const bySlot = new Map<string, PartUsage[]>();
	const counts = new Map<string, number>();
	for (const lib of file.libraries) {
		if (!RENDERING.has(lib.class)) continue;
		for (const e of lib.exports) {
			for (const site of e.sites ?? []) {
				const slot = literal(site.props?.['data-slot']);
				if (!slot) continue;
				const list = bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!;
				if (list.some((u) => u.library === lib.name && u.export === e.name)) continue;
				list.push({ library: lib.name, export: e.name, file: site.file, line: site.line });
				counts.set(lib.name, (counts.get(lib.name) ?? 0) + 1);
			}
		}
	}
	return { name: 'libraries.json data-slot sites (interim, until the semantic usage inventory lands)', candidates: (slot) => bySlot.get(slot) ?? [], libraries: () => counts };
}

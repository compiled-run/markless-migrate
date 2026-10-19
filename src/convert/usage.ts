import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseModule, walk, type Module, type N } from '../source/js.ts';

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
	/**
	 * The value the source gives a prop of a library export where it renders it: the literal written on the element, or
	 * the default of the component parameter passed through (`sideOffset = 4`), the most common one across sites.
	 */
	prop(library: string, exportName: string, prop: string): string | undefined;
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
export async function sourceSlotResolver(librariesPath: string, source?: string): Promise<PartResolver> {
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
	const modules = new Map<string, Module | undefined>();
	const moduleOf = async (rel: string) => {
		if (!modules.has(rel)) modules.set(rel, source ? await readFile(join(source, rel), 'utf8').then((text) => parseModule(rel, text), () => undefined) : undefined);
		return modules.get(rel);
	};
	const props = new Map<string, string | undefined>();
	for (const lib of file.libraries) {
		if (!RENDERING.has(lib.class)) continue;
		for (const e of lib.exports) {
			const seen = new Map<string, Map<string, number>>();
			for (const site of e.sites ?? []) {
				for (const [name, written] of Object.entries(site.props ?? {})) {
					let value = literal(written) ?? (/^\{-?\d+(\.\d+)?\}$/.test(written) ? written.slice(1, -1) : undefined);
					const param = /^\{([A-Za-z_$][\w$]*)\}$/.exec(written)?.[1];
					if (value === undefined && param) {
						const mod = await moduleOf(site.file);
						if (mod) value = paramDefault(mod, site.line, param);
					}
					if (value === undefined) continue;
					const votes = seen.get(name) ?? seen.set(name, new Map()).get(name)!;
					votes.set(value, (votes.get(value) ?? 0) + 1);
				}
			}
			for (const [name, votes] of seen) props.set(`${lib.name} ${e.name} ${name}`, [...votes].sort((a, b) => b[1] - a[1])[0]?.[0]);
		}
	}
	return {
		name: 'libraries.json data-slot sites (interim, until the semantic usage inventory lands)',
		candidates: (slot) => bySlot.get(slot) ?? [],
		libraries: () => counts,
		prop: (library, exportName, prop) => props.get(`${library} ${exportName} ${prop}`),
	};
}

/** The literal default of a destructured parameter of the function that encloses a line: `({ sideOffset = 4 })`. */
function paramDefault(mod: Module, line: number, name: string): string | undefined {
	let found: string | undefined;
	walk(mod.program, (node: N) => {
		if (found !== undefined) return false;
		if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return;
		if (mod.line(node.start) > line || mod.line(node.end) < line) return false;
		for (const param of (node.params ?? []) as N[]) {
			const pattern = param.type === 'AssignmentPattern' ? param.left : param;
			if (pattern?.type !== 'ObjectPattern') continue;
			for (const p of pattern.properties as N[]) {
				if (p.type !== 'Property' || p.key?.name !== name || p.value?.type !== 'AssignmentPattern') continue;
				const d = p.value.right;
				if (d.type === 'Literal' && (typeof d.value === 'string' || typeof d.value === 'number' || typeof d.value === 'boolean')) found = String(d.value);
				else if (d.type === 'UnaryExpression' && d.operator === '-' && d.argument.type === 'Literal') found = `-${d.argument.value}`;
			}
		}
	});
	return found;
}

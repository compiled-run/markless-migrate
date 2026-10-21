import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { UsageInventory } from '../usage/types.ts';
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
 * semantic usage inventory answers it (`usageResolver`); libraries.json is the fallback.
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
 * The resolver from the semantic usage inventory (`.migrate/usage.json`): each library component behaviour names the
 * export, the literal `data-slot` values written on it and its source sites. A prop the inventory records as dynamic
 * (passed through from the wrapping component) takes the parameter default written at the site.
 */
export async function usageResolver(usagePath: string, source?: string): Promise<PartResolver> {
	const usage = JSON.parse(await readFile(usagePath, 'utf8')) as UsageInventory;
	const bySlot = new Map<string, PartUsage[]>();
	const counts = new Map<string, number>();
	const sitesOf = new Map<string, { file: string; line: number }[]>();
	const literalProps = new Map<string, string>();
	for (const b of usage.behaviours) {
		if (b.kind === 'request' || b.library === 'script' || b.library === 'embed') continue;
		const props = (b.details.props ?? {}) as Record<string, unknown>;
		const fileSites = b.sites.filter((s): s is { file: string; line: number } => 'file' in s);
		const key = `${b.library} ${b.feature}`;
		sitesOf.set(key, [...(sitesOf.get(key) ?? []), ...fileSites]);
		for (const [name, value] of Object.entries(props)) if (Array.isArray(value) && value.length === 1 && (typeof value[0] === 'string' || typeof value[0] === 'number')) literalProps.set(`${key} ${name}`, String(value[0]));
		const slots = Array.isArray(props['data-slot']) ? (props['data-slot'] as unknown[]).filter((v): v is string => typeof v === 'string') : [];
		for (const slot of slots) {
			const list = bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!;
			if (list.some((u) => u.library === b.library && u.export === b.feature)) continue;
			const at = fileSites[0];
			list.push({ library: b.library, export: b.feature, file: at?.file ?? '', line: at?.line ?? 0 });
			counts.set(b.library, (counts.get(b.library) ?? 0) + 1);
		}
	}
	const modules = new Map<string, Module | undefined>();
	const defaults = new Map<string, string | undefined>();
	return {
		name: `the semantic usage inventory (${usagePath.split('/').slice(-2).join('/')})`,
		candidates: (slot) => bySlot.get(slot) ?? [],
		libraries: () => counts,
		prop(library, exportName, prop) {
			const key = `${library} ${exportName} ${prop}`;
			if (literalProps.has(key)) return literalProps.get(key);
			if (defaults.has(key) || !source) return defaults.get(key);
			const votes = new Map<string, number>();
			for (const site of sitesOf.get(`${library} ${exportName}`) ?? []) {
				if (!modules.has(site.file)) {
					let text: string | undefined;
					try {
						text = readFileSync(join(source, site.file), 'utf8');
					} catch {}
					modules.set(site.file, text === undefined ? undefined : parseModule(site.file, text));
				}
				const mod = modules.get(site.file);
				const value = mod ? paramDefault(mod, site.line, prop) : undefined;
				if (value !== undefined) votes.set(value, (votes.get(value) ?? 0) + 1);
			}
			const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
			defaults.set(key, best);
			return best;
		},
	};
}

/**
 * Fallback resolver when no usage inventory was written: reads `plan --source`'s libraries.json, where every element
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
		name: 'libraries.json data-slot sites',
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

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { UsageInventory } from '../usage/types.ts';
import { join } from 'node:path';
import { parseModule, walk, type Module, type N } from '../source/js.ts';
import { isScript, openProject, resolveImport } from '../source/files.ts';

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
	/**
	 * The same, only where the source renders the export with this literal `data-slot`: a library part several wrappers
	 * render with their own defaults (React Aria's Popover with `offset = 4` as a select's content, `offset = 6` as a
	 * combobox's).
	 */
	slotProp?(library: string, exportName: string, slot: string, prop: string): string | undefined;
	/**
	 * A prop where a wrapper renders another wrapper with this literal `data-slot` (a submenu's content rendering the
	 * menu's content with its own offsets): the value written there, else the default of the wrapper it renders. With a
	 * library, only sites that end on that library's parts count.
	 */
	forwardedProp?(slot: string, prop: string, library?: string): string | undefined;
}

interface LibrariesFile {
	readonly libraries: readonly {
		readonly name: string;
		readonly class: string;
		readonly exports: readonly { readonly name: string; readonly sites?: readonly { readonly file: string; readonly line: number; readonly in?: string; readonly kind?: string; readonly props?: Readonly<Record<string, string>> }[] }[];
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
		for (const [name, value] of Object.entries(props)) if (Array.isArray(value) && value.length === 1 && (typeof value[0] === 'string' || typeof value[0] === 'number' || typeof value[0] === 'boolean')) literalProps.set(`${key} ${name}`, String(value[0]));
		const slots = Array.isArray(props['data-slot']) ? (props['data-slot'] as unknown[]).filter((v): v is string => typeof v === 'string') : [];
		for (const slot of slots) {
			const list = bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!;
			if (list.some((u) => u.library === b.library && u.export === b.feature)) continue;
			const at = fileSites[0];
			list.push({ library: b.library, export: b.feature, file: at?.file ?? '', line: at?.line ?? 0 });
			counts.set(b.library, (counts.get(b.library) ?? 0) + 1);
		}
	}
	// A library a component drives through a call (Embla's useEmblaCarousel) renders no element of its own: the slots
	// written literally in a file that calls it, and that no library element renders, are that call's.
	if (source) {
		const called = new Map<string, PartUsage[]>();
		for (const b of usage.behaviours) {
			if ((b.details as { kind?: string }).kind !== 'function' || b.library === 'script' || b.library === 'embed') continue;
			for (const site of b.sites) {
				if (!('file' in site)) continue;
				let text = '';
				try {
					text = readFileSync(join(source, site.file), 'utf8');
				} catch {}
				for (const m of text.matchAll(/data-slot="([a-z0-9-]+)"/g)) {
					const list = called.get(m[1]!) ?? called.set(m[1]!, []).get(m[1]!)!;
					if (!list.some((u) => u.library === b.library && u.export === b.feature)) list.push({ library: b.library, export: b.feature, file: site.file, line: site.line });
				}
			}
		}
		for (const [slot, uses] of called) if (!bySlot.has(slot)) bySlot.set(slot, uses);
	}
	const modules = new Map<string, Module | undefined>();
	const defaults = new Map<string, string | undefined>();
	const slotProps = new Map<string, string | undefined>();
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
		slotProp(library, exportName, slot, prop) {
			if (!source) return undefined;
			const key = `${library} ${exportName} ${slot} ${prop}`;
			if (slotProps.has(key)) return slotProps.get(key);
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
				const value = mod ? slotSiteProp(mod, site.line, slot, prop) : undefined;
				if (value !== undefined) votes.set(value, (votes.get(value) ?? 0) + 1);
			}
			const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
			slotProps.set(key, best);
			return best;
		},
	};
}

/** A prop of the JSX element opened on `line` with this literal data-slot: its literal, or the default of the parameter it passes. */
function slotSiteProp(mod: Module, line: number, slot: string, prop: string): string | undefined {
	let found: string | undefined;
	walk(mod.program, (node: N) => {
		if (found !== undefined || node.type !== 'JSXOpeningElement' || mod.line(node.start) !== line) return;
		const attrs = (node.attributes ?? []) as N[];
		const named = (name: string) => attrs.find((a) => a.type === 'JSXAttribute' && a.name?.name === name);
		if (named('data-slot')?.value?.value !== slot) return;
		const written = named(prop);
		const value = written?.value;
		// A boolean prop written bare (`autoFocus`).
		if (written && !value) found = 'true';
		if (!value) return;
		if (value.type === 'Literal') found = String(value.value);
		else if (value.type === 'JSXExpressionContainer') {
			const e = value.expression;
			if (e.type === 'Literal') found = String(e.value);
			else if (e.type === 'UnaryExpression' && e.operator === '-' && e.argument.type === 'Literal') found = `-${e.argument.value}`;
			else if (e.type === 'Identifier') found = paramDefault(mod, line, e.name);
		}
	});
	return found;
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
	const modules = new Map<string, Module | undefined>();
	const moduleOf = async (rel: string) => {
		if (!modules.has(rel)) modules.set(rel, source ? await readFile(join(source, rel), 'utf8').then((text) => parseModule(rel, text), () => undefined) : undefined);
		return modules.get(rel);
	};
	// A value written on a site: a literal, or the default of the wrapper's parameter it passes (`data-slot={dataSlot}`).
	const valueAt = async (site: { readonly file: string; readonly line: number }, written: string): Promise<string | undefined> => {
		const value = literal(written) ?? (/^\{-?\d+(\.\d+)?\}$/.test(written) ? written.slice(1, -1) : undefined);
		const param = /^\{([A-Za-z_$][\w$]*)\}$/.exec(written)?.[1];
		if (value !== undefined || !param) return value;
		const mod = await moduleOf(site.file);
		return mod ? paramDefault(mod, site.line, param) : undefined;
	};
	const slotOf = new Map<object, string>();
	for (const lib of file.libraries) {
		if (!RENDERING.has(lib.class)) continue;
		for (const e of lib.exports) {
			for (const site of e.sites ?? []) {
				const written = site.props?.['data-slot'];
				const slot = written === undefined ? undefined : await valueAt(site, written);
				if (!slot) continue;
				slotOf.set(site, slot);
				const list = bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!;
				if (list.some((u) => u.library === lib.name && u.export === e.name)) continue;
				list.push({ library: lib.name, export: e.name, file: site.file, line: site.line });
				counts.set(lib.name, (counts.get(lib.name) ?? 0) + 1);
			}
		}
	}
	const forwarded = source ? await forwardedSlots(file, source) : { slots: new Map<string, PartUsage[]>(), props: (): string | undefined => undefined };
	for (const [slot, uses] of forwarded.slots) for (const u of uses) {
		const list = bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!;
		if (!list.some((x) => x.library === u.library && x.export === u.export)) list.push(u);
	}
	const props = new Map<string, string | undefined>();
	const slotProps = new Map<string, string | undefined>();
	for (const lib of file.libraries) {
		if (!RENDERING.has(lib.class)) continue;
		for (const e of lib.exports) {
			const seen = new Map<string, Map<string, number>>();
			const vote = (key: string, value: string) => {
				const votes = seen.get(key) ?? seen.set(key, new Map()).get(key)!;
				votes.set(value, (votes.get(value) ?? 0) + 1);
			};
			for (const site of e.sites ?? []) {
				const slot = slotOf.get(site);
				for (const [name, written] of Object.entries(site.props ?? {})) {
					const value = await valueAt(site, written);
					if (value === undefined) continue;
					vote(name, value);
					if (slot) vote(`${slot} ${name}`, value);
				}
			}
			for (const [key, votes] of seen) (key.includes(' ') ? slotProps : props).set(`${lib.name} ${e.name} ${key}`, [...votes].sort((a, b) => b[1] - a[1])[0]?.[0]);
		}
	}
	return {
		name: 'libraries.json data-slot sites',
		candidates: (slot) => bySlot.get(slot) ?? [],
		libraries: () => counts,
		prop: (library, exportName, prop) => props.get(`${library} ${exportName} ${prop}`),
		slotProp: (library, exportName, slot, prop) => slotProps.get(`${library} ${exportName} ${slot} ${prop}`),
		forwardedProp: (slot, prop, library) => forwarded.props(slot, prop, library),
	};
}

/**
 * The slots a component passes on to the library part it renders: `<DropdownMenuTrigger data-slot="menubar-trigger">`
 * where DropdownMenuTrigger renders `<Menu.Trigger data-slot="dropdown-menu-trigger" {...props} />` is a Menu.Trigger
 * the page marks menubar-trigger (the spread after the component's own slot wins), through any chain of such wrappers.
 */
async function forwardedSlots(file: LibrariesFile, source: string): Promise<{ slots: Map<string, PartUsage[]>; props: (slot: string, prop: string, library?: string) => string | undefined }> {
	const forwards = new Map<string, PartUsage[]>();
	const spreadsLast = (props: Readonly<Record<string, string>>) => {
		const keys = Object.keys(props);
		return keys.includes('...') && keys.lastIndexOf('...') > keys.indexOf('data-slot');
	};
	for (const lib of file.libraries) {
		if (!RENDERING.has(lib.class)) continue;
		for (const e of lib.exports)
			for (const site of e.sites ?? []) {
				if (!site.in || !site.props || !spreadsLast(site.props)) continue;
				const list = forwards.get(site.in) ?? forwards.set(site.in, []).get(site.in)!;
				if (!list.some((u) => u.library === lib.name && u.export === e.name)) list.push({ library: lib.name, export: e.name, file: site.file, line: site.line });
			}
	}
	const out = new Map<string, PartUsage[]>();
	if (!forwards.size) return { slots: out, props: () => undefined };
	const project = await openProject(source);
	const modules = new Map<string, Module>();
	// Each JSX element naming a component: the component it names, the slot it writes, whether it spreads after it, and the component it sits in.
	const edges: { target: string; slot?: string; spreads: boolean; within?: string; file: string; line: number }[] = [];
	for (const rel of project.files) {
		if (!isScript(rel) || !/\.[jt]sx$/.test(rel)) continue;
		const text = await project.read(rel);
		if (!/<[A-Z]/.test(text)) continue;
		const mod = parseModule(rel, text);
		modules.set(rel, mod);
		const owner = (ancestors: readonly N[]) => {
			for (let i = ancestors.length - 1; i >= 0; i--) {
				const a = ancestors[i]!;
				if (a.type === 'FunctionDeclaration' && a.id) return `${rel}#${a.id.name}`;
				if (a.type === 'VariableDeclarator' && a.id?.type === 'Identifier') return `${rel}#${a.id.name}`;
			}
			return undefined;
		};
		walk(mod.program, (n: N, ancestors) => {
			if (n.type !== 'JSXOpeningElement' || n.name?.type !== 'JSXIdentifier' || !/^[A-Z]/.test(n.name.name)) return;
			const local = n.name.name as string;
			const imp = mod.imports.get(local);
			const resolved = imp ? resolveImport(project, rel, imp.source) : rel;
			if (!resolved || imp?.imported === '*') return;
			const attrs = (n.attributes ?? []) as N[];
			const at = attrs.findIndex((a) => a.type === 'JSXAttribute' && a.name?.name === 'data-slot' && a.value?.type === 'Literal');
			const spread = attrs.findIndex((a) => a.type === 'JSXSpreadAttribute');
			edges.push({ target: `${resolved}#${imp ? (imp.imported === 'default' ? local : imp.imported) : local}`, ...(at >= 0 ? { slot: String(attrs[at]!.value.value) } : {}), spreads: spread > at, ...(owner(ancestors) ? { within: owner(ancestors)! } : {}), file: rel, line: mod.line(n.start) });
		});
	}
	// A component that renders a forwarding component with the props spread last forwards too.
	for (let grew = true; grew; ) {
		grew = false;
		for (const e of edges) {
			const to = forwards.get(e.target);
			if (!to || !e.within || !e.spreads || forwards.has(e.within)) continue;
			forwards.set(e.within, to);
			grew = true;
		}
	}
	const sites = new Map<string, (typeof edges)[number][]>();
	for (const e of edges) {
		const to = e.slot !== undefined ? forwards.get(e.target) : undefined;
		if (!to) continue;
		const list = out.get(e.slot!) ?? out.set(e.slot!, []).get(e.slot!)!;
		for (const u of to) if (!list.some((x) => x.library === u.library && x.export === u.export)) list.push(u);
		(sites.get(e.slot!) ?? sites.set(e.slot!, []).get(e.slot!)!).push(e);
	}
	// The default a component's own parameter gives a prop: `({ sideOffset = 4 })`.
	const defaultOf = (target: string, prop: string) => {
		const [file, name] = target.split('#') as [string, string];
		const mod = modules.get(file);
		const fn = mod?.bindings.get(name);
		return mod && fn ? paramDefault(mod, mod.line(fn.start), prop) : undefined;
	};
	const props = (slot: string, prop: string, library?: string) => {
		const votes = new Map<string, number>();
		for (const e of sites.get(slot) ?? []) {
			if (library !== undefined && !forwards.get(e.target)?.some((u) => u.library === library)) continue;
			const mod = modules.get(e.file)!;
			const value = slotSiteProp(mod, e.line, slot, prop) ?? defaultOf(e.target, prop);
			if (value !== undefined) votes.set(value, (votes.get(value) ?? 0) + 1);
		}
		return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
	};
	return { slots: out, props };
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
				// By its key (`offset = 4`) or the name it is bound to (`"data-slot": dataSlot = "dropdown-menu-content"`).
				if (p.type !== 'Property' || p.value?.type !== 'AssignmentPattern' || (p.key?.name !== name && p.value.left?.name !== name)) continue;
				const d = p.value.right;
				if (d.type === 'Literal' && (typeof d.value === 'string' || typeof d.value === 'number' || typeof d.value === 'boolean')) found = String(d.value);
				else if (d.type === 'UnaryExpression' && d.operator === '-' && d.argument.type === 'Literal') found = `-${d.argument.value}`;
			}
		}
	});
	return found;
}

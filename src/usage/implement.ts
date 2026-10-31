import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yuku';
import type { N } from '../source/js.ts';
import type { Behaviour, BehaviourKind, Implementation } from './types.ts';

export const USAGE_MAP_FILE = 'usage-map.json';

/**
 * Where the new app implements each behaviour, written by whoever implements it (the converting agent):
 * `{ "<behaviour id or a pattern with *>": { "by": "components/theme-toggle.tsrx" } }`, or `"by": "@markless/ui modal"`
 * for a shared part. An entry counts only when the file exists, or the new app imports the part.
 */
export type UsageMap = Readonly<Record<string, { readonly by: string; readonly note?: string }>>;

export async function readUsageMap(stateDir: string): Promise<UsageMap> {
	const path = join(stateDir, USAGE_MAP_FILE);
	const text = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? undefined : Promise.reject(error)));
	if (text === undefined) return {};
	const parsed = JSON.parse(text) as Record<string, unknown>;
	const map: Record<string, { by: string; note?: string }> = {};
	for (const [id, entry] of Object.entries(parsed)) {
		const by = (entry as { by?: unknown })?.by;
		if (typeof by !== 'string' || !by.trim()) throw new Error(`${path}: "${id}" needs "by": the file or shared part that implements it`);
		map[id] = { by, ...(typeof (entry as { note?: unknown }).note === 'string' ? { note: (entry as { note: string }).note } : {}) };
	}
	return map;
}

/** The shared Markless part that does a kind of behaviour, where one exists: a @markless/ui family. */
export const SHARED_PARTS: Partial<Readonly<Record<BehaviourKind, { readonly family: string; readonly module: string }>>> = {
	dialog: { family: 'modal', module: '@markless/ui' },
	search: { family: 'modal', module: '@markless/ui' },
	tabs: { family: 'tabs', module: '@markless/ui' },
	disclosure: { family: 'collapsible', module: '@markless/ui' },
	menu: { family: 'menu', module: '@markless/ui' },
	navbar: { family: 'drawer', module: '@markless/ui' },
};

const SOURCE = /\.(tsrx|[cm]?[jt]sx?)$/;
const SKIP = new Set(['node_modules', '.output', '.import', '.vercel', '.vite', 'dist', '.migrate', '.port', '.git']);

/** Every module the new app's own files import, with the names they import: TSRX files are read up to their first component. */
export async function newAppImports(dir: string): Promise<Map<string, Set<string>>> {
	const imports = new Map<string, Set<string>>();
	const visit = async (d: string): Promise<void> => {
		for (const entry of await readdir(d, { withFileTypes: true }).catch(() => [])) {
			if (SKIP.has(entry.name)) continue;
			const path = join(d, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (SOURCE.test(entry.name)) {
				let text = await readFile(path, 'utf8');
				if (path.endsWith('.tsrx')) {
					const lines = text.split('\n');
					const end = lines.findIndex((l) => /^(export\s+)?(default\s+)?(function|component|const|let|class)\b|@\{/.test(l));
					text = lines.slice(0, end < 0 ? lines.length : end).join('\n');
				}
				const program = parse(text, { path: path.endsWith('.tsrx') ? 'x.ts' : path, sourceType: 'module' }).program as unknown as N;
				for (const node of program.body as N[]) {
					if (node.type !== 'ImportDeclaration') continue;
					const names = imports.get(node.source.value) ?? new Set<string>();
					for (const s of node.specifiers as N[]) names.add(s.imported?.name ?? s.local?.name ?? '*');
					imports.set(node.source.value, names);
				}
			}
		}
	};
	await visit(dir);
	return imports;
}

const matches = (pattern: string, id: string) => (pattern.includes('*') ? new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(id) : pattern === id);

/** Whether each behaviour is implemented in the new app, by a declared file or an imported shared part; otherwise what would implement it. */
export async function implementations(behaviours: readonly Behaviour[], map: UsageMap, newSource: string | undefined): Promise<Implementation[]> {
	const imports = newSource ? await newAppImports(newSource) : new Map<string, Set<string>>();
	const entries = Object.entries(map);
	const out: Implementation[] = [];
	for (const b of behaviours) {
		const part = SHARED_PARTS[b.kind];
		const suggestion = b.kind === 'library' ? `keep ${b.library} as it is (load the same library)` : part ? `@markless/ui ${part.family}` : `the new app's own Markless code (${b.kind})`;
		// A kept library is implemented by keeping it: the new app imports the same package.
		if (b.kind === 'library' && imports.has(b.library)) {
			out.push({ behaviour: b.id, status: 'implemented', by: `${b.library}, kept`, how: 'part' });
			continue;
		}
		const declared = entries.find(([pattern]) => matches(pattern, b.id));
		if (!declared || !newSource) {
			out.push({ behaviour: b.id, status: 'unimplemented', suggestion });
			continue;
		}
		const by = declared[1].by;
		const asPart = /^@[\w-]+\/[\w-]+(\s+\w+)?$/.exec(by);
		if (asPart) {
			const [module, family] = by.split(/\s+/);
			const names = imports.get(module!);
			const ok = Boolean(names && (!family || names.has(family)));
			out.push(ok ? { behaviour: b.id, status: 'implemented', by, how: 'part' } : { behaviour: b.id, status: 'unimplemented', suggestion: `${by} is declared, but the new app does not import it` });
			continue;
		}
		const exists = await stat(join(newSource, by)).then(() => true, () => false);
		out.push(exists ? { behaviour: b.id, status: 'implemented', by: relative(newSource, join(newSource, by)), how: 'site' } : { behaviour: b.id, status: 'unimplemented', suggestion: `${by} is declared, but there is no such file in the new app` });
	}
	return out;
}

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parseSync } from 'oxc-parser';
import type { N } from '../source/js.ts';
import type { LibraryUsage } from './types.ts';

export interface InstalledPackage {
	readonly dir: string;
	readonly json: { name?: string; version?: string; types?: string; typings?: string; exports?: unknown; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
}

/** The package as Node would resolve it from `root`: the nearest node_modules up the tree. */
export async function installedPackage(root: string, name: string): Promise<InstalledPackage | undefined> {
	let dir = root;
	for (;;) {
		const candidate = join(dir, 'node_modules', name);
		const text = await readFile(join(candidate, 'package.json'), 'utf8').catch(() => undefined);
		if (text) {
			try {
				return { dir: await realpath(candidate), json: JSON.parse(text) as InstalledPackage['json'] };
			} catch {
				return undefined;
			}
		}
		const up = dirname(dir);
		if (up === dir) return undefined;
		dir = up;
	}
}

const FRAMEWORKS: [RegExp, LibraryUsage['framework']][] = [
	[/^(react|react-dom)$/, 'react'],
	[/^vue$/, 'vue'],
	[/^svelte$/, 'svelte'],
	[/^solid-js$/, 'solid'],
	[/^preact$/, 'preact'],
	[/^@angular\/core$/, 'angular'],
];

/** The UI framework a package binds to, from what it depends on or asks its host for. */
export function packageFramework(pkg: InstalledPackage): LibraryUsage['framework'] {
	const names = [...Object.keys(pkg.json.peerDependencies ?? {}), ...Object.keys(pkg.json.dependencies ?? {})];
	for (const [re, framework] of FRAMEWORKS) if (names.some((n) => re.test(n))) return framework;
	return 'none';
}

function typesEntry(json: InstalledPackage['json'], subpath = '.'): string | undefined {
	const pick = (value: unknown): string | undefined => {
		if (typeof value === 'string') return /\.d\.[cm]?ts$/.test(value) ? value : undefined;
		if (value && typeof value === 'object') {
			const o = value as Record<string, unknown>;
			for (const key of ['types', 'import', 'default', 'require', 'node']) {
				const hit = pick(o[key]);
				if (hit) return hit;
			}
		}
		return undefined;
	};
	const map = json.exports && typeof json.exports === 'object' && !Array.isArray(json.exports) ? (json.exports as Record<string, unknown>) : undefined;
	if (subpath !== '.') return pick(map?.[subpath]) ?? `${subpath.slice(2)}.d.ts`;
	const root = map ? (map['.'] ?? (Object.keys(map).some((k) => k.startsWith('.')) ? undefined : map)) : json.exports;
	return pick(root) ?? json.types ?? json.typings;
}

async function exists(path: string): Promise<boolean> {
	return stat(path).then((s) => s.isFile(), () => false);
}

async function resolveDts(from: string, spec: string): Promise<string | undefined> {
	const base = join(dirname(from), spec);
	const stripped = base.replace(/\.(m?js|cjs)$/, '');
	for (const candidate of [base, `${stripped}.d.ts`, `${stripped}.d.mts`, `${stripped}.d.cts`, join(base, 'index.d.ts')]) if (/\.d\.[cm]?ts$/.test(candidate) && (await exists(candidate))) return candidate;
	return undefined;
}

/**
 * Every name the package's type entry exports, following `export *` into relative files and other
 * packages; undefined when the package ships no types the scan can read.
 */
export async function exportedNames(pkg: InstalledPackage, root: string): Promise<Set<string> | undefined> {
	const entry = typesEntry(pkg.json);
	if (!entry) return undefined;
	const first = join(pkg.dir, entry);
	if (!(await exists(first))) return undefined;
	const names = new Set<string>();
	const seen = new Set<string>();
	const visit = async (file: string, depth: number): Promise<void> => {
		if (seen.has(file) || depth > 6 || seen.size > 80) return;
		seen.add(file);
		const text = await readFile(file, 'utf8').catch(() => '');
		const program = parseSync('x.d.ts', text, { sourceType: 'module' }).program as unknown as N;
		for (const stmt of program.body as N[]) {
			if (stmt.type === 'ExportNamedDeclaration') {
				const d = stmt.declaration;
				if (d?.id?.name) names.add(d.id.name);
				if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id?.name) names.add(v.id.name);
				for (const s of stmt.specifiers ?? []) names.add(s.exported?.name ?? s.exported?.value ?? '');
			} else if (stmt.type === 'ExportAllDeclaration') {
				const spec = String(stmt.source.value);
				if (stmt.exported) {
					names.add(stmt.exported.name ?? '');
					continue;
				}
				if (spec.startsWith('.')) {
					const target = await resolveDts(file, spec);
					if (target) await visit(target, depth + 1);
				} else {
					const name = spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');
					const other = name === pkg.json.name ? pkg : ((await installedPackage(pkg.dir, name)) ?? (await installedPackage(root, name)));
					const otherEntry = other && typesEntry(other.json, spec === name ? '.' : `.${spec.slice(name.length)}`);
					if (other && otherEntry && (await exists(join(other.dir, otherEntry)))) await visit(join(other.dir, otherEntry), depth + 1);
				}
			} else if (stmt.type === 'ExportDefaultDeclaration') names.add('default');
			else if (stmt.type === 'TSExportAssignment') names.add('default');
		}
	};
	await visit(first, 0);
	names.delete('');
	return names;
}

const CODE = /\.(m?js|cjs|css)$/;
const BUDGET = 4_000_000;

/** Class names, `data-*` attributes and custom properties the package writes into the page, found in its shipped code. */
export async function injectedTokens(pkg: InstalledPackage, prefixes: readonly string[]): Promise<string[]> {
	if (!prefixes.length) return [];
	const files: string[] = [];
	const walk = async (dir: string, depth: number): Promise<void> => {
		if (depth > 5) return;
		for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await walk(path, depth + 1);
			else if (CODE.test(entry.name) && !/\.(map|d\.ts)$/.test(entry.name)) files.push(path);
		}
	};
	await walk(pkg.dir, 0);
	// One build flavour is enough: prefer ESM over CJS and UMD copies of the same code.
	const preferred = files.filter((f) => !/\b(cjs|umd|commonjs|lib)\b/.test(relative(pkg.dir, f)));
	const list = (preferred.length ? preferred : files).sort();
	const found = new Set<string>();
	const res = prefixes.map((p) => new RegExp(`(?<![\\w-])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${/[-]$/.test(p) ? '[a-z0-9][a-z0-9_-]*' : '(?![\\w-])'}`, 'g'));
	let budget = BUDGET;
	for (const file of list) {
		if (budget <= 0) break;
		const text = await readFile(file, 'utf8').catch(() => '');
		budget -= text.length;
		for (const re of res) for (const m of text.matchAll(re)) found.add(m[0].replace(/-+$/, ''));
	}
	return [...found].sort().slice(0, 400);
}

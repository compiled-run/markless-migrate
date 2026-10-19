import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parseSync } from 'oxc-parser';
import type { N } from '../source/js.ts';
import type { LibraryUsage } from './types.ts';

export interface InstalledPackage {
	readonly dir: string;
	readonly json: { name?: string; version?: string; keywords?: string[]; main?: string; module?: string; style?: string; types?: string; typings?: string; exports?: unknown; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
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

/** A package whose entry is a stylesheet (fonts, CSS frameworks): importing it adds CSS, no code. */
export function cssPackage(pkg: InstalledPackage): boolean {
	const map = pkg.json.exports && typeof pkg.json.exports === 'object' && !Array.isArray(pkg.json.exports) ? (pkg.json.exports as Record<string, unknown>) : undefined;
	const root = map ? (map['.'] ?? map) : pkg.json.exports;
	const pick = (value: unknown): string | undefined => (typeof value === 'string' ? value : value && typeof value === 'object' ? pick((value as Record<string, unknown>).import ?? (value as Record<string, unknown>).default ?? (value as Record<string, unknown>).style) : undefined);
	const entry = pick(root) ?? pkg.json.module ?? pkg.json.main;
	return entry ? /\.(css|scss|sass|less)$/.test(entry) : !!pkg.json.style;
}

const CODE = /\.(m?js|cjs|css)$/;
const BUDGET = 4_000_000;
const DOM_WRITES = 12;
const DOM_WRITE = /\bcreateElement(NS)?\(|\.(appendChild|insertBefore|replaceChildren|attachShadow|insertAdjacentHTML)\(|\.innerHTML\s*=/g;
const WIDGET_WORDS = /^(data-?grid|grid|spreadsheet|charts?|charting|plotting|wysiwyg|rich-?text(-editor)?|code-?editor|date-?picker|carousel|calendar|widgets?)$/i;

export async function codeFiles(pkg: InstalledPackage): Promise<string[]> {
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
	return (preferred.length ? preferred : files).sort();
}

/** Whether a package with no UI framework still builds UI itself: its keywords name a widget, or its code writes DOM in many places. */
export async function rendersDom(pkg: InstalledPackage): Promise<boolean> {
	if (Array.isArray(pkg.json.keywords) && pkg.json.keywords.some((k) => typeof k === 'string' && WIDGET_WORDS.test(k))) return true;
	let writes = 0;
	let budget = BUDGET;
	for (const file of await codeFiles(pkg)) {
		if (budget <= 0 || !/\.(m?js|cjs)$/.test(file)) continue;
		const text = await readFile(file, 'utf8').catch(() => '');
		budget -= text.length;
		writes += text.match(DOM_WRITE)?.length ?? 0;
		if (writes >= DOM_WRITES) return true;
	}
	return false;
}

/** Class names, `data-*` attributes and custom properties the package writes into the page, found in its shipped code. */
export async function injectedTokens(pkg: InstalledPackage, prefixes: readonly string[]): Promise<string[]> {
	if (!prefixes.length) return [];
	const list = await codeFiles(pkg);
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

export function codeEntry(json: InstalledPackage['json']): string | undefined {
	const pick = (value: unknown): string | undefined => {
		if (typeof value === 'string') return /\.(m?js|cjs)$/.test(value) ? value : undefined;
		if (value && typeof value === 'object') {
			const o = value as Record<string, unknown>;
			for (const key of ['browser', 'import', 'module', 'default', 'require']) {
				const hit = pick(o[key]);
				if (hit) return hit;
			}
		}
		return undefined;
	};
	const map = json.exports && typeof json.exports === 'object' && !Array.isArray(json.exports) ? (json.exports as Record<string, unknown>) : undefined;
	return pick(map ? (map['.'] ?? map) : json.exports) ?? json.module ?? json.main ?? 'index.js';
}

/** Bytes of the code a bundler takes for the package's main import (its ESM entry when it has one), when installed. */
export async function entryBytes(pkg: InstalledPackage): Promise<number | undefined> {
	const entry = codeEntry(pkg.json);
	return entry ? stat(join(pkg.dir, entry)).then((s) => (s.isFile() ? s.size : undefined), () => undefined) : undefined;
}

const WEBGL = /getContext\(\s*['"](webgl2?|experimental-webgl)['"]/;
const CANVAS_2D = /getContext\(\s*['"]2d['"]/;
const CANVAS_DRAWS = /\.(fillRect|fillText|strokeText|lineTo|bezierCurveTo|quadraticCurveTo|drawImage|strokeRect|arc)\(/g;
const DRAWS_TO_COUNT = 20;

/** Whether the package draws its UI as pixels: a WebGL context, or a 2D canvas it paints on many times (not one used only to measure text). */
export async function drawsPixels(pkg: InstalledPackage): Promise<'canvas' | 'webgl' | undefined> {
	let budget = BUDGET;
	let canvas = false;
	let draws = 0;
	for (const file of await codeFiles(pkg)) {
		if (budget <= 0 || !/\.(m?js|cjs)$/.test(file)) continue;
		const text = await readFile(file, 'utf8').catch(() => '');
		budget -= text.length;
		if (WEBGL.test(text)) return 'webgl';
		canvas ||= CANVAS_2D.test(text);
		draws += text.match(CANVAS_DRAWS)?.length ?? 0;
	}
	return canvas && draws >= DRAWS_TO_COUNT ? 'canvas' : undefined;
}

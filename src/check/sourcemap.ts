import { existsSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { CssRule } from './stylesheet.ts';
import type { SourceLink } from './types.ts';

const maps = new Map<string, Promise<SourceMap | undefined>>();
const texts = new Map<string, Promise<string | undefined>>();

const get = (url: string) =>
	fetch(url)
		.then((r) => (r.ok ? r.text() : undefined))
		.catch(() => undefined);

function text(url: string): Promise<string | undefined> {
	if (!texts.has(url)) texts.set(url, get(url));
	return texts.get(url)!;
}

function mappingUrl(body: string): string | undefined {
	const matches = [...body.matchAll(/[#@]\s*sourceMappingURL=([^\s*'"]+)/g)];
	return matches.at(-1)?.[1];
}

async function load(url: string, body: string | undefined): Promise<SourceMap | undefined> {
	const source = body ?? (await text(url));
	const ref = source ? mappingUrl(source) : undefined;
	let payload: string | undefined;
	if (ref?.startsWith('data:')) {
		const comma = ref.indexOf(',');
		payload = ref.slice(0, comma).endsWith(';base64') ? Buffer.from(ref.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(ref.slice(comma + 1));
	} else {
		// Hidden source maps: built next to the file but not referenced from it.
		payload = (ref ? await get(new URL(ref, url).href) : undefined) ?? (await get(`${url.split(/[?#]/)[0]}.map`));
	}
	if (!payload) return undefined;
	try {
		return new SourceMap(JSON.parse(payload));
	} catch {
		return undefined;
	}
}

/** The source map of a served script or stylesheet, fetched once per URL. */
export function mapFor(url: string, body?: string): Promise<SourceMap | undefined> {
	if (!maps.has(url)) maps.set(url, load(url, body));
	return maps.get(url)!;
}

const SCHEMES = [/^webpack:\/\/[^/]*\//, /^turbopack:\/\/\/\[project\]\//, /^turbopack:\/\/\//, /^file:\/\//, /^rollup:\/\//, /^vite:\/\//, /^\/@fs/, /^\[project\]\//];

/** A source path as a source map or dev hook names it, made relative to the app's checkout when it exists there. */
export function sourceFile(source: string, root?: string): { file: string; path?: string } {
	let clean = source.split('?')[0]!;
	for (const scheme of SCHEMES) clean = clean.replace(scheme, '');
	if (root && isAbsolute(clean) && clean.startsWith(root + sep) && existsSync(clean)) return { file: relative(root, clean).split(sep).join('/'), path: clean };
	const parts = clean.split('/').filter((p) => p && p !== '.' && p !== '..');
	if (root) {
		for (let i = 0; i < parts.length; i++) {
			const candidate = join(root, ...parts.slice(i));
			if (existsSync(candidate)) return { file: parts.slice(i).join('/'), path: candidate };
		}
	}
	return { file: parts.join('/') || source };
}

/** Where a 1-based line and column of a served file came from, through its source map. */
export async function originalPosition(url: string, line: number, column: number, root?: string, body?: string): Promise<SourceLink | undefined> {
	const map = await mapFor(url, body);
	const entry = map?.findEntry(line - 1, Math.max(0, column - 1)) as { originalSource?: string; originalLine?: number; originalColumn?: number } | undefined;
	if (!entry?.originalSource) return undefined;
	// A bare relative source ("App.tsx", as Vite's dev server writes) is relative to the script that names it.
	const named = /^[a-z][\w+.-]*:|^\/|^\[/i.test(entry.originalSource) ? entry.originalSource : new URL(entry.originalSource, url).pathname;
	const { file, path } = sourceFile(named, root);
	return { file, line: (entry.originalLine ?? 0) + 1, column: (entry.originalColumn ?? 0) + 1, ...(path ? { path } : {}), how: 'source map' };
}

export const inDependencies = (file: string) => /(^|\/)node_modules\/|^\.?next\/dist\/|(^|\/)\.pnpm\//.test(file);

/** Each OLD rule with the source file and line its stylesheet's source map gives it. */
export async function mapRules(rules: readonly CssRule[], sources: readonly { readonly url: string; readonly text: string }[], origin: string, root?: string): Promise<CssRule[]> {
	const texts = new Map(sources.map((s) => [s.url, s.text]));
	return Promise.all(
		rules.map(async (rule) => {
			if (rule.file.includes(' <style> ')) return rule;
			const original = await originalPosition(new URL(rule.file, origin).href, rule.line, rule.column, root, texts.get(rule.file)).catch(() => undefined);
			return original && !inDependencies(original.file) ? { ...rule, original } : rule;
		}),
	);
}

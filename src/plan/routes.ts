import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { matchRoute } from '../source/pattern.ts';
import type { Inventory } from './inventory.ts';

export interface NeedsSample {
	readonly route: string;
	/** Dynamic segments no crawled path or sample filled. */
	readonly params: readonly string[];
	readonly file?: string;
	readonly line?: number;
}

export interface RouteTargets {
	/** Concrete page paths to check. */
	readonly pages: readonly string[];
	/** Non-page paths the source scan found (JSON route handlers and other GET endpoints). */
	readonly endpoints: readonly string[];
	/** Source routes with dynamic segments that nothing gave a value for. */
	readonly needsSample: readonly NeedsSample[];
	/** Pattern a concrete path was filled from, when it did not come from the crawl. */
	readonly filled: Readonly<Record<string, string>>;
}

/** `.migrate/samples.json`: `{ "lang": "en" }` fills a segment by name; `{ "/blog/:slug": "/blog/hello" }` names a path for a pattern. */
export type Samples = Readonly<Record<string, string>>;

export async function readSamples(dir: string): Promise<Samples> {
	try {
		return JSON.parse(await readFile(join(dir, 'samples.json'), 'utf8')) as Samples;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw error;
	}
}

const segmentsOf = (path: string) => path.split(/[?#]/)[0]!.split('/').filter(Boolean);
const patternSegments = (pattern: string) => pattern.split('/').filter(Boolean);

/** Values a concrete path gives each named segment of a pattern (single segments only). */
export function paramValues(pattern: string, path: string): Record<string, string> {
	const want = patternSegments(pattern);
	const have = segmentsOf(path);
	if (want.some((s) => s.startsWith('*') || s.endsWith('?')) || want.length !== have.length || !matchRoute(pattern, path)) return {};
	const out: Record<string, string> = {};
	want.forEach((s, i) => {
		if (s.startsWith(':')) out[s.slice(1)] = have[i]!;
	});
	return out;
}

/** Fills a pattern's segments from the values known by name; optional ones are dropped. Undefined when a required one is unknown. */
export function fillPattern(pattern: string, values: Readonly<Record<string, string>>): { path?: string; missing: string[] } {
	const missing: string[] = [];
	const parts: string[] = [];
	for (const s of patternSegments(pattern)) {
		if (!s.startsWith(':') && !s.startsWith('*')) {
			parts.push(s);
			continue;
		}
		const name = s.slice(1).replace(/\?$/, '');
		const value = values[name];
		if (value !== undefined) parts.push(value);
		else if (!s.endsWith('?')) missing.push(name);
	}
	if (missing.length) return { missing };
	const trailing = pattern.length > 1 && pattern.endsWith('/');
	return { path: `/${parts.join('/')}${trailing && parts.length ? '/' : ''}`, missing };
}

/** Every route `check --all` visits: crawled paths under each source pattern, source-only routes filled from crawled values or samples, and endpoints. */
export function routeTargets(inventory: Inventory, samples: Samples = {}): RouteTargets {
	const pages = new Set<string>(inventory.routes.map((r) => r.route));
	const endpoints = new Set<string>();
	const needsSample: NeedsSample[] = [];
	const filled: Record<string, string> = {};
	const union = inventory.routeUnion ?? [];
	const known: Record<string, string> = {};
	for (const entry of union) {
		for (const path of entry.crawled) {
			for (const [name, value] of Object.entries(paramValues(entry.route, path))) known[name] ??= value;
		}
	}
	for (const [key, value] of Object.entries(samples)) if (!key.startsWith('/')) known[key] = value;
	for (const entry of union) {
		const target = entry.kind === 'endpoint' ? endpoints : pages;
		if (entry.knownBy.includes('crawl')) {
			for (const path of entry.crawled) target.add(path);
			continue;
		}
		const sample = samples[entry.route];
		const result = sample ? { path: sample, missing: [] } : entry.dynamic ? fillPattern(entry.route, known) : { path: entry.route, missing: [] };
		if (result.path) {
			target.add(result.path);
			if (result.path !== entry.route) filled[result.path] = entry.route;
		} else needsSample.push({ route: entry.route, params: result.missing, ...(entry.file ? { file: entry.file, line: entry.line } : {}) });
	}
	for (const path of endpoints) pages.delete(path);
	return { pages: [...pages].sort(), endpoints: [...endpoints].sort(), needsSample, filled };
}

import type { SourceFacts as ScannedFacts } from '../source/index.ts';
import { matchRoute } from '../source/pattern.ts';

/** What the checker reads from the source readers (src/source): a structural subset of their SourceFacts. */
export interface SourceLocation {
	readonly file: string;
	readonly line: number;
}

export interface NondeterminismFact extends SourceLocation {
	/** `time`, `random`, `flag`, `ads`, `analytics` or `personalisation`. */
	readonly kind: string;
	/** What was read or called, for example `Date.now()`. */
	readonly what?: string;
	/** Where the code runs, when the reader can tell. */
	readonly side?: 'server' | 'client' | 'both';
}

export interface WriteFact {
	/** HTTP method; `*` is any method, `SDK` a write that is not an HTTP request. */
	readonly method: string;
	/** Route pattern with `:x`, `:x?`, `*x`, `*x?` segments; null when no request path is known (server actions, SDK calls, forms without an action). */
	readonly path: string | null;
	readonly handler: SourceLocation;
	readonly via?: string;
	/** Database and payment SDKs the handler reaches. */
	readonly touches?: readonly string[];
}

export interface ClientFact extends SourceLocation {
	/** CMS or API client, for example `rest`, `contentful`, `sanity`, `graphql`. */
	readonly kind: string;
	/** Queries, paths or URLs the call site sends, as written in the source. */
	readonly queries?: readonly string[];
	readonly fields?: readonly string[];
	readonly base?: string;
	readonly via?: SourceLocation;
}

export interface SourceFacts {
	readonly nondeterminism: readonly NondeterminismFact[];
	readonly writes: readonly WriteFact[];
	readonly clients: readonly ClientFact[];
	/** Route patterns and the files that serve them, to find which files render a failing element. */
	readonly routes?: readonly { readonly path: string; readonly file: string; readonly kind: string }[];
	readonly components?: readonly { readonly file: string; readonly kind: string }[];
}

type Scanner = { scanSource(dir: string): Promise<ScannedFacts> };

/** Scans the old app's source when the source readers are installed; undefined, with the reason, when they are not. */
export async function loadSourceFacts(dir: string): Promise<{ facts?: SourceFacts; error?: string }> {
	let scanner: Scanner;
	try {
		scanner = (await import(new URL('../source/index.ts', import.meta.url).href)) as Scanner;
	} catch (error) {
		return { error: `source readers are not available (${(error as Error).message.split('\n')[0]})` };
	}
	if (typeof scanner.scanSource !== 'function') return { error: 'source readers do not export scanSource' };
	const scanned = await scanner.scanSource(dir);
	const facts: SourceFacts = { nondeterminism: scanned.nondeterminism, writes: scanned.writes, clients: scanned.clients, routes: scanned.routes, components: scanned.components };
	return { facts };
}

/** The write the source facts name for this request, if any. */
export function writeHandler(facts: readonly WriteFact[], method: string, path: string): WriteFact | undefined {
	return facts.find((f) => f.path !== null && f.method !== 'SDK' && (f.method === '*' || f.method.toUpperCase() === method.toUpperCase()) && matchRoute(f.path, path));
}

export const at = (loc: SourceLocation) => `${loc.file}:${loc.line}`;

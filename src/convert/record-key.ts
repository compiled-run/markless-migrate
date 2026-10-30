// Where a route's recordings (captures, reveals, choices, toggles...) are kept: under a key of the old page as its server
// sends it and of the code that records, in check's reuse key scheme, so only a changed page or recorder records again.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { reuseKey } from '../check/ship-key.ts';

/** Bump when what every recording observes changes in code the recorder versions do not cover (the convert's orchestration). */
export const RECORDING_VERSION = 2;

// Next.js streams the head: the same page can come with its meta tags in another order.
const HEAD = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const TAGS = /<(?:meta|link|title|script|style)\b[\s\S]*?(?:<\/(?:title|script|style)>|\/?>)/gi;

/** The old page as the key reads it: its status and server HTML, the head's tags in any order. */
export function oldPageSource(status: number, html: string): string {
	const head = HEAD.exec(html);
	const normal = head ? html.replace(head[1]!, [...head[1]!.matchAll(TAGS)].map((m) => m[0]).sort().join('')) : html;
	return `${status}\n${normal}`;
}

/** The key of a route's recordings: the recorder's versions, the route and its old page. */
export function recordKey(versions: Readonly<Record<string, string>>, route: string, status: number, html: string): string {
	return reuseKey(versions, [`record ${route}\n`, oldPageSource(status, html)]);
}

const IMPORTS = /(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'|import\('(\.[^']+)'\)/g;
const SRC = resolve(import.meta.dirname, '..');

/**
 * The code that records, by content: `converter` is every convert module that drives a browser (index.ts, which only
 * orchestrates, aside) and what it imports within the converter and parts/; `probe` is each module it imports from
 * elsewhere in src/ (check's browser, capture and settle helpers); `playwright` the driver's version.
 */
export async function recorderVersions(): Promise<Record<string, string>> {
	const dir = import.meta.dirname;
	const entries: string[] = [];
	for (const name of (await readdir(dir)).sort()) if (name.endsWith('.ts') && name !== 'index.ts' && /from 'playwright'/.test(await readFile(join(dir, name), 'utf8'))) entries.push(join(dir, name));
	const converter = new Set<string>();
	const probe = new Set<string>();
	const visit = async (file: string): Promise<void> => {
		if (converter.has(file)) return;
		converter.add(file);
		for (const m of (await readFile(file, 'utf8')).matchAll(IMPORTS)) {
			const to = resolve(dirname(file), m[1] ?? m[2]!);
			if (!existsSync(to)) continue;
			if (to.startsWith(dir) || !to.startsWith(SRC)) await visit(to);
			else probe.add(to);
		}
	};
	for (const entry of entries) await visit(entry);
	const digest = async (files: Set<string>) => {
		const hash = createHash('sha256');
		for (const file of [...files].sort()) hash.update(`${relative(SRC, file)}\n`).update(await readFile(file));
		return hash.digest('hex').slice(0, 16);
	};
	return { recording: String(RECORDING_VERSION), converter: await digest(converter), probe: await digest(probe), playwright: String(createRequire(import.meta.url)('playwright/package.json').version) };
}

/** The key of a route's recordings, from one plain request for its old page (no browser). */
export async function fetchRecordKey(versions: Readonly<Record<string, string>>, origin: string, route: string, headers: Readonly<Record<string, string>> = {}): Promise<string> {
	try {
		const response = await fetch(new URL(route, origin), { headers: { ...headers }, redirect: 'manual' });
		return recordKey(versions, route, response.status, await response.text());
	} catch (error) {
		// Unknown: recorded again, never read back.
		return `unreachable-${createHash('sha256').update(String(error) + Date.now()).digest('hex').slice(0, 8)}`;
	}
}

const SOURCES = 'sources.json';

/**
 * The directory each route's recordings of one kind go in, under `root` (`.migrate/convert`): `<kind>/<key>`. A cache
 * from before keys (files directly in `<kind>/`, no sources.json) is read as the current pages': a route's recordings
 * stay there, in `<kind>/`, until its page changes.
 */
export class RecordDirs {
	private readonly root: string;
	/** Per route, the key its recordings directly in `<kind>/` were made under. */
	private readonly flat: Readonly<Record<string, string>> | undefined;
	private readonly used = new Map<string, string>();

	private constructor(root: string, flat: Readonly<Record<string, string>> | undefined) {
		this.root = root;
		this.flat = flat;
	}

	static async open(root: string): Promise<RecordDirs> {
		const saved = await readFile(join(root, SOURCES), 'utf8').then((t) => JSON.parse(t) as { flat?: Record<string, string> }, () => undefined);
		return new RecordDirs(root, saved ? (saved.flat ?? {}) : undefined);
	}

	async dir(route: string, key: string, kind: string): Promise<string> {
		this.used.set(route, key);
		const dir = join(this.root, kind, key);
		if (existsSync(dir)) return dir;
		if (this.flat ? this.flat[route] === key : await this.hasFlat(kind)) return join(this.root, kind);
		await mkdir(dir, { recursive: true });
		return dir;
	}

	private readonly kinds = new Map<string, Promise<boolean>>();
	private hasFlat(kind: string): Promise<boolean> {
		let found = this.kinds.get(kind);
		if (!found) {
			found = readdir(join(this.root, kind)).then((names) => names.some((n) => n.endsWith('.json')), () => false);
			this.kinds.set(kind, found);
		}
		return found;
	}

	/** Records the routes whose recordings are directly in `<kind>/`, with the key of the page they were made from. */
	async save(): Promise<void> {
		const flat = { ...this.flat };
		if (!this.flat) for (const [route, key] of this.used) flat[route] = key;
		await mkdir(this.root, { recursive: true });
		await writeFile(join(this.root, SOURCES), JSON.stringify({ flat }, null, 1));
	}
}

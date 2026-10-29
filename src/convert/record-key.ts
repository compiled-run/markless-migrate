// Where a route's recordings (captures, reveals, choices, toggles...) are kept: under a key made from the old page as its
// server sends it, so a page that changed is recorded again and one that did not is read back, whatever ran in between.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Bump when what every recording observes changes; each capture's own version and marks cover narrower changes. */
export const RECORDING_VERSION = 1;

// Next.js streams the head: the same page can come with its meta tags in another order.
const HEAD = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const TAGS = /<(?:meta|link|title|script|style)\b[\s\S]*?(?:<\/(?:title|script|style)>|\/?>)/gi;

/** The key of an old page: its server HTML, the head's tags in any order, and the recording version. */
export function oldPageKey(status: number, html: string): string {
	const head = HEAD.exec(html);
	const normal = head ? html.replace(head[1]!, [...head[1]!.matchAll(TAGS)].map((m) => m[0]).sort().join('')) : html;
	return createHash('sha256').update(`${RECORDING_VERSION}\n${status}\n${normal}`).digest('hex').slice(0, 16);
}

/** The old page's key, from one plain request for it (no browser): what its recordings are kept under. */
export async function fetchOldPageKey(origin: string, route: string, headers: Readonly<Record<string, string>> = {}): Promise<string> {
	try {
		const response = await fetch(new URL(route, origin), { headers: { ...headers }, redirect: 'manual' });
		return oldPageKey(response.status, await response.text());
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

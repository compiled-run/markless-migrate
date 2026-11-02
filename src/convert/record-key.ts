// Where a route's recordings (captures, reveals, choices, toggles...) are kept: each kind under a key of the old page as its
// server sends it and of the code that records that kind, so only a changed page, or the kinds a changed recorder records, record again.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reuseKey } from '../check/ship-key.ts';
import { codeKey } from '../code-closure.ts';

/** Bump when what every recording observes changes in code the kinds' module graphs do not cover (the convert's orchestration, index.ts). */
export const RECORDING_VERSION = 3;

// Next.js streams the head: the same page can come with its meta tags in another order.
const HEAD = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const TAGS = /<(?:meta|link|title|script|style)\b[\s\S]*?(?:<\/(?:title|script|style)>|\/?>)/gi;

/** The old page as the key reads it: its status and server HTML, the head's tags in any order. */
export function oldPageSource(status: number, html: string): string {
	const head = HEAD.exec(html);
	const normal = head ? html.replace(head[1]!, [...head[1]!.matchAll(TAGS)].map((m) => m[0]).sort().join('')) : html;
	return `${status}\n${normal}`;
}

/** The key of a route's old page, which every kind of its recordings is keyed under (with that kind's code). */
export function pageKey(route: string, status: number, html: string): string {
	return reuseKey({}, [`record ${route}\n`, oldPageSource(status, html)]);
}

/**
 * Each kind of recording (the directory under .migrate/convert it goes in) and the modules that record it: index.ts
 * hands each of their capture functions that kind's directory.
 */
export const RECORDING_KINDS = {
	captures: ['capture.ts'],
	scenes: ['scenes.ts'],
	clock: ['clock.ts'],
	tables: ['tanstack-table.ts'],
	'form-libraries': ['form-libraries.ts'],
	reveals: ['reveal.ts'],
	toggles: ['toggles.ts', 'sliders.ts', 'charts.ts', 'qwik-floating.ts', 'scrollers.ts'],
	'day-pickers': ['day-picker.ts'],
	'rac-calendars': ['rac-calendar.ts'],
	choices: ['choices.ts'],
} as const satisfies Record<string, readonly string[]>;

export type RecordingKind = keyof typeof RECORDING_KINDS;

/**
 * The kinds whose recordings a kind is handed (index.ts derives its arguments from them, and several of its files are
 * not keyed by them): reveals take the captures' dialogs open at load; toggles take the reveals, less those the scenes
 * play; the pickers, calendars and choices take the reveals after the toggles have filled them in.
 */
export const RECORDING_READS: Readonly<Record<RecordingKind, readonly RecordingKind[]>> = {
	captures: [],
	scenes: [],
	clock: [],
	tables: [],
	'form-libraries': [],
	reveals: ['captures'],
	toggles: ['reveals', 'scenes'],
	'day-pickers': ['toggles'],
	'rac-calendars': ['toggles'],
	choices: ['toggles'],
};

/** A kind and every kind it reads, transitively. */
export function kindsRead(kind: RecordingKind): RecordingKind[] {
	const out = new Set<RecordingKind>();
	const visit = (k: RecordingKind) => {
		if (out.has(k)) return;
		out.add(k);
		for (const r of RECORDING_READS[k]) visit(r);
	};
	visit(kind);
	return [...out].sort();
}

/** The code that records a kind: its modules and those of the kinds it reads, by their module graph. */
export function recorderEntries(kind: RecordingKind): string[] {
	return kindsRead(kind).flatMap((k) => RECORDING_KINDS[k].map((f) => join(import.meta.dirname, f)));
}

/** Each kind's recorder version: the recording version and the code (and packages) that record it. */
export async function recorderVersions(): Promise<Record<RecordingKind, string>> {
	const kinds = Object.keys(RECORDING_KINDS) as RecordingKind[];
	const keys = await Promise.all(kinds.map((kind) => codeKey(recorderEntries(kind), { recording: String(RECORDING_VERSION) })));
	return Object.fromEntries(kinds.map((kind, i) => [kind, keys[i]!])) as Record<RecordingKind, string>;
}

/** The directory key of one kind of a page's recordings. An unreachable page's never matches a kept one. */
export function kindKey(versions: Readonly<Record<string, string>>, kind: string, page: string): string {
	const version = versions[kind];
	if (version === undefined) throw new Error(`no recorder version for the recording kind ${kind}: list it in RECORDING_KINDS`);
	const key = reuseKey({ kind, recorder: version }, [page]);
	return page.startsWith('unreachable-') ? `unreachable-${createHash('sha256').update(key).digest('hex').slice(0, 8)}` : key;
}

/** The key of a route's old page, from one plain request for it (no browser). */
export async function fetchPageKey(origin: string, route: string, headers: Readonly<Record<string, string>> = {}): Promise<string> {
	try {
		const response = await fetch(new URL(route, origin), { headers: { ...headers }, redirect: 'manual' });
		return pageKey(route, response.status, await response.text());
	} catch (error) {
		// Unknown: recorded again, never read back.
		return `unreachable-${createHash('sha256').update(String(error) + Date.now()).digest('hex').slice(0, 8)}`;
	}
}

/** Where `visits/` keeps, per route, the page key and each kind's key it was last recorded under. */
export const VISITS = 'visits';
export const visitFile = (route: string) => `${createHash('sha256').update(route).digest('hex').slice(0, 16)}.json`;

export interface Visit {
	readonly route: string;
	readonly page: string;
	readonly kinds: Readonly<Record<string, string>>;
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
	private readonly versions: Readonly<Record<string, string>>;
	private readonly visits = new Map<string, { page: string; kinds: Record<string, string> }>();

	private constructor(root: string, flat: Readonly<Record<string, string>> | undefined, versions: Readonly<Record<string, string>>) {
		this.root = root;
		this.flat = flat;
		this.versions = versions;
	}

	static async open(root: string, versions: Readonly<Record<string, string>>): Promise<RecordDirs> {
		const saved = await readFile(join(root, SOURCES), 'utf8').then((t) => JSON.parse(t) as { flat?: Record<string, string> }, () => undefined);
		return new RecordDirs(root, saved ? (saved.flat ?? {}) : undefined, versions);
	}

	/** The directory of one kind of a route's recordings, from its page key (fetchPageKey). */
	async dir(route: string, page: string, kind: string): Promise<string> {
		const key = kindKey(this.versions, kind, page);
		const visit = this.visits.get(route)?.page === page ? this.visits.get(route)! : this.visits.set(route, { page, kinds: {} }).get(route)!;
		visit.kinds[kind] = key;
		const dir = join(this.root, kind, key);
		if (existsSync(dir)) return dir;
		if (this.flat ? this.flat[route] === page : await this.hasFlat(kind)) {
			this.used.set(route, page);
			return join(this.root, kind);
		}
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

	/** Records the routes whose recordings are directly in `<kind>/`, with the key of the page they were made from, and each route's visit. */
	async save(): Promise<void> {
		const flat = { ...this.flat, ...Object.fromEntries(this.used) };
		await mkdir(join(this.root, VISITS), { recursive: true });
		await writeFile(join(this.root, SOURCES), JSON.stringify({ flat }, null, 1));
		for (const [route, { page, kinds }] of this.visits) await writeFile(join(this.root, VISITS, visitFile(route)), JSON.stringify({ route, page, kinds: Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => (a < b ? -1 : 1))) } satisfies Visit));
	}
}

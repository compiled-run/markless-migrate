// Where a route's recordings are kept: each kind under a key of its old page, the code that records it, and the data its recorder is handed.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT } from '../code-closure.ts';
import { declarationClosure, type DeclarationClosure } from '../declaration-closure.ts';
import { INDEX, recordingFacts, STORE, type RecordingFacts } from './record-facts.ts';
import { ClosureProject, SpanIndex, type Span } from './record-reads.ts';

/** The store's format: a store written in another is emptied of its recordings once, never read. */
export const RECORDING_VERSION = 5;

// Next.js streams the head: the same page can come with its meta tags in another order.
const HEAD = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const TAGS = /<(?:meta|link|title|script|style)\b[\s\S]*?(?:<\/(?:title|script|style)>|\/?>)/gi;
// Tags whose order changes nothing; a stylesheet's or a script's order is the cascade's and the page's.
const UNORDERED = /^<(?:meta|title)\b/i;

/** The old page as the key reads it: its status and server HTML, the head's meta and title tags in any order. */
export function oldPageSource(status: number, html: string): string {
	const inner = HEAD.exec(html)?.[1];
	if (inner === undefined) return `${status}\n${html}`;
	const tags = [...inner.matchAll(TAGS)].map((m) => m[0]);
	const head = [...tags.filter((t) => UNORDERED.test(t)).sort(), ...tags.filter((t) => !UNORDERED.test(t))].join('');
	return `${status}\n${html.replace(inner, head)}`;
}

/** The key of a route's old page as its origin serves it (`<status>.<hash>`), which each kind of its recordings is kept under. */
export function pageKey(origin: string, route: string, status: number, html: string): string {
	return `${status}.${createHash('sha256').update(`record ${new URL(origin).origin} ${route}\n`).update(oldPageSource(status, html)).digest('base64url')}`;
}

/** The status the page answered the request its key was made from; none for a page that did not answer. */
export function pageStatus(page: string): number | undefined {
	const status = Number(page.slice(0, page.indexOf('.')));
	return page.indexOf('.') > 0 && Number.isInteger(status) ? status : undefined;
}

/** The key of a route's old page, from one plain request for it (no browser). An unreachable page's key matches nothing kept. */
export async function fetchPageKey(origin: string, route: string, headers: Readonly<Record<string, string>> = {}): Promise<string> {
	try {
		const response = await fetch(new URL(route, origin), { headers: { ...headers }, redirect: 'manual' });
		return pageKey(origin, route, response.status, await response.text());
	} catch (error) {
		return `unreachable-${createHash('sha256').update(String(error) + randomUUID()).digest('hex').slice(0, 8)}`;
	}
}

/** The convert options the orchestration reads, and why none changes a recording beyond what its key holds. */
export const OPTIONS_READ: Readonly<Record<string, string>> = {
	app: "the app's folder: each file the orchestration reads from it is keyed by its bytes",
	old: "the old site's origin: in every page key",
	only: "which routes are recorded, not what a route's recordings hold",
	reveal: 'whether controls are used at all: a recording it turns off is not read',
	concurrency: 'how many pages are recorded at once',
	recordKeys: 'the page keys themselves',
	captureOnly: 'whether convert stops once the recordings are made',
	log: 'where progress lines go',
};

/** App files the orchestration reads that no key holds, and why. */
export const UNKEYED_INPUTS: Readonly<Record<string, string>> = {
	'.migrate/inventory.json': "which routes are recorded: each route's recordings are keyed by its own page and what its recorders are handed",
	// It carries the time plan ran, so keying its bytes recorded everything again after every re-plan.
	'.migrate/usage.json': 'whether the TanStack table and form-library recorders run at all: a recording it turns on is made then, and one it turns off is not read',
	'.migrate/prefetch.json': "convert's own output: the last convert's prefetch facts, read back for the router's prefetch setting, never handed to a recorder",
};

/** Module state a recorder reads that code outside it sets, and the key part that holds what is set. */
export const MODULE_STATE: Readonly<Record<string, string>> = {};

export interface KindVersion {
	readonly version: string;
	/** Every file one of its recorders or the orchestration can run code of. */
	readonly files: readonly string[];
	/** Each declaration and orchestration statement its version holds (`path:offset name`). */
	readonly units: readonly string[];
	/** Environment variables its code reads. */
	readonly env: readonly string[];
	/** Mutable top-level bindings its code reads (`path name`). */
	readonly state: readonly string[];
	/** What could not be attributed: the version is then new on every call, and nothing recorded under it is read back. */
	readonly problems: readonly string[];
}

/** What every kind's version is made of: the facts read from index.ts, and the declaration closure each kind's code has. */
export async function recordingVersions(app?: string, facts: RecordingFacts = recordingFacts()): Promise<Record<string, KindVersion>> {
	const shared: string[] = [...facts.problems];
	for (const o of facts.options) if (!(o in OPTIONS_READ)) shared.push(`convert's recording reads options.${o}, which no key holds: key it or say why it changes no recording (OPTIONS_READ)`);
	const inputs = facts.inputs.filter((p) => !(p === STORE || p.startsWith(`${STORE}/`)) && !(p in UNKEYED_INPUTS));
	for (const p of inputs) if (p.includes('*')) shared.push(`convert's recording reads ${p}, files under a computed path no key can name`);
	// Without the old site's id nothing says its build and fixtures are the ones recorded: nothing is read back.
	const original = process.env.MIGRATE_ORIGINAL_ID;
	if (!original) shared.push('MIGRATE_ORIGINAL_ID names no old site: recordings are made again on every run');
	const inputParts: [string, string | Uint8Array][] = [];
	for (const p of inputs) inputParts.push([`input ${p}`, app ? await readFile(join(app, p)).catch(() => '\0absent') : '\0no app']);
	const kinds = [...facts.kinds].sort(([a], [b]) => (a < b ? -1 : 1));
	// One at a time: each closure parses its whole graph, and twelve at once held 700 MB of syntax trees.
	const closures: DeclarationClosure[] = [];
	for (const [, k] of kinds) closures.push(await declarationClosure([...k.entries.map((e) => ({ file: e.file, names: [e.name] })), { file: INDEX, names: k.names }]));
	const project = new ClosureProject(new Set([INDEX, ...closures.flatMap((c) => c.statements.map((st) => st.file))]));
	const spansOf = kinds.map(([, k], i): Span[] => [...(closures[i]?.statements ?? []), ...k.statements.map((st) => ({ file: INDEX, ...st }))]);
	const recording = new SpanIndex(spansOf.flat());
	const out: Record<string, KindVersion> = {};
	for (const [i, [kind, k]] of kinds.entries()) {
		const closure = closures[i];
		const spans = spansOf[i];
		if (!closure || !spans) continue;
		const found = project.reads(new SpanIndex(spans), recording);
		const problems = [...shared, ...closure.unresolved, ...found.problems];
		for (const st of found.state) if (!(st in MODULE_STATE)) problems.push(`the ${kind} recording reads ${st}, which another kind's recording changes: key what it is set to, then list it in MODULE_STATE`);
		const hash = createHash('sha256');
		const part = (name: string, value: string | Uint8Array) => {
			const bytes = typeof value === 'string' ? Buffer.from(value) : value;
			hash.update(`${name}\0${bytes.length}\0`).update(bytes);
		};
		part('format', String(RECORDING_VERSION));
		part('kind', kind);
		for (const [name, value] of closure.parts) part(name, value);
		for (const st of k.statements) part('orchestration', facts.source.slice(st.start, st.end));
		for (const name of [...found.env].sort()) part(`env ${name}`, process.env[name] ?? '\0unset');
		for (const [name, value] of inputParts) part(name, value);
		part('original', original ?? '');
		if (problems.length) part('problems', `${problems.join('\n')}\n${randomUUID()}`);
		const files = [...new Set([...closure.statements.map((st) => relative(ROOT, st.file)), ...closure.files.map((f) => relative(ROOT, f))])].sort();
		const units = [...closure.units, ...k.statements.map((st) => `${relative(ROOT, INDEX)}:${st.start} (orchestration)`)].sort();
		out[kind] = { version: hash.digest('base64url').slice(0, 32), files, units, env: [...found.env].sort(), state: [...found.state].sort(), problems: [...new Set(problems)].sort() };
	}
	return out;
}

/** Each kind's recorder version. */
export async function recorderVersions(app?: string): Promise<Record<string, string>> {
	return Object.fromEntries(Object.entries(await recordingVersions(app)).map(([kind, v]) => [kind, v.version]));
}

/** Data handed to a recorder, as bytes of one canonical form: a function handed at the top is a handle (a log, a limit) and counts only by its place. */
export function givenDigest(given: readonly unknown[]): string {
	const hash = createHash('sha256');
	const seen = new Set<object>();
	const put = (value: unknown, path: string): void => {
		if (value === undefined) return void hash.update('u;');
		if (value === null) return void hash.update('n;');
		switch (typeof value) {
			case 'string':
				return void hash.update(`s${Buffer.byteLength(value)}:`).update(value);
			case 'number':
			case 'boolean':
			case 'bigint':
				return void hash.update(`${(typeof value)[0]}${Object.is(value, -0) ? '-0' : String(value)};`);
			case 'function':
				throw new Error(`a recorder is handed a function inside ${path}: what it does is no part of the recording's key`);
			case 'symbol':
				throw new Error(`a recorder is handed a symbol at ${path}`);
		}
		const obj = value as object;
		if (seen.has(obj)) throw new Error(`a recorder is handed a cycle at ${path}`);
		seen.add(obj);
		if (Array.isArray(obj)) {
			hash.update(`[${obj.length};`);
			for (let i = 0; i < obj.length; i++) if (i in obj) put(obj[i], `${path}[${i}]`);
			else hash.update('h;');
		} else if (obj instanceof Map) {
			hash.update(`M${obj.size};`);
			for (const [k, v] of [...obj].sort(([a], [b]) => (String(a) < String(b) ? -1 : 1))) (put(k, `${path} key`), put(v, `${path}.get(${String(k)})`));
		} else if (obj instanceof Set) {
			hash.update(`S${obj.size};`);
			for (const v of [...obj].sort()) put(v, `${path} member`);
		} else {
			const proto = Object.getPrototypeOf(obj);
			if (proto !== Object.prototype && proto !== null) throw new Error(`a recorder is handed a ${proto?.constructor?.name ?? 'class'} instance at ${path}: hand it plain data`);
			const keys = Object.keys(obj).sort();
			hash.update(`{${keys.length};`);
			for (const k of keys) (hash.update(`k${Buffer.byteLength(k)}:`).update(k), put((obj as Record<string, unknown>)[k], `${path}.${k}`));
		}
		seen.delete(obj);
	};
	given.forEach((v, i) => (typeof v === 'function' ? hash.update('f;') : put(v, `argument ${i + 1}`)));
	return hash.digest('base64url');
}

/** The directory key of one recording: its kind and that kind's version, the route's page key, and the data handed to the recorder. */
export function recordDirKey(versions: Readonly<Record<string, string>>, kind: string, page: string, given: readonly unknown[]): string {
	const version = versions[kind];
	if (version === undefined) throw new Error(`no recorder version for the recording kind ${kind}`);
	return createHash('sha256').update(`${kind}\0${version}\0${page}\0${givenDigest(given)}`).digest('base64url');
}

export const FORMAT = 'format.json';
export const VISITS = 'visits';
export const visitFile = (route: string) => `${createHash('sha256').update(route).digest('hex').slice(0, 16)}.json`;

/** A route's last recording: the page key, and per kind the version and the directories its recordings went into. */
export interface Visit {
	readonly route: string;
	readonly page: string;
	readonly kinds: Readonly<Record<string, { readonly version: string; readonly dirs: readonly string[] }>>;
}

/** Folders of the store that hold no recording: kept when a store of another format is emptied. */
const NOT_RECORDINGS = new Set(['costs', 'prerender']);

/** Whether a store was written in this format; a store of another is emptied of every recording (and its visits) when opened. */
export async function storeFormat(root: string): Promise<boolean> {
	return readFile(join(root, FORMAT), 'utf8').then((t) => (JSON.parse(t) as { version?: number }).version === RECORDING_VERSION, () => false);
}

export async function readVisits(root: string): Promise<Visit[]> {
	if (!(await storeFormat(root))) return [];
	const out: Visit[] = [];
	for (const name of (await readdir(join(root, VISITS)).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort()) {
		const visit = await readFile(join(root, VISITS, name), 'utf8').then((t) => JSON.parse(t) as Visit, () => undefined);
		if (typeof visit?.route === 'string' && typeof visit.page === 'string' && visit.kinds && typeof visit.kinds === 'object') out.push(visit);
	}
	return out;
}

export interface Staged {
	readonly dir: string;
	readonly commit: () => Promise<void>;
	readonly abandon: () => Promise<void>;
}

/** The recording directories under `<root>/<kind>/<key>`, and each route's visit (`visits/`). */
export class RecordDirs {
	private readonly root: string;
	private readonly versions: Readonly<Record<string, string>>;
	private readonly visits = new Map<string, { page: string; kinds: Map<string, Set<string>> }>();

	private constructor(root: string, versions: Readonly<Record<string, string>>) {
		this.root = root;
		this.versions = versions;
	}

	static async open(root: string, versions: Readonly<Record<string, string>>): Promise<RecordDirs> {
		if (!(await storeFormat(root))) {
			for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) if ((entry.isDirectory() && !NOT_RECORDINGS.has(entry.name)) || entry.name === 'sources.json') await rm(join(root, entry.name), { recursive: true, force: true });
			await mkdir(root, { recursive: true });
			await writeFile(join(root, FORMAT), JSON.stringify({ version: RECORDING_VERSION }));
		}
		return new RecordDirs(root, versions);
	}

	/**
	 * Where a recorder of `kind` writes a route's recording, given the route's page key and what the recorder is handed: the
	 * kept directory, or a new one beside it that `commit` makes the kept one once the recorder succeeded. Only a committed
	 * directory is named in the route's visit.
	 */
	async stage(route: string, page: string, kind: string, given: readonly unknown[]): Promise<Staged> {
		const key = recordDirKey(this.versions, kind, page, given);
		const kept = join(this.root, kind, key);
		const note = () => {
			let visit = this.visits.get(route);
			if (visit?.page !== page) this.visits.set(route, (visit = { page, kinds: new Map() }));
			const dirs = visit.kinds.get(kind) ?? new Set<string>();
			visit.kinds.set(kind, dirs.add(key));
		};
		if (existsSync(kept)) return { dir: kept, commit: async () => note(), abandon: async () => {} };
		const staged = `${kept}.staging-${randomUUID().slice(0, 8)}`;
		await mkdir(staged, { recursive: true });
		return {
			dir: staged,
			commit: async () => {
				// Another recorder of the same key may have committed first: its files stay, this one's join them.
				if (existsSync(kept)) {
					for (const name of await readdir(staged)) await rename(join(staged, name), join(kept, name));
					await rm(staged, { recursive: true, force: true });
				} else await rename(staged, kept);
				note();
			},
			abandon: () => rm(staged, { recursive: true, force: true }),
		};
	}

	/** Writes each route's visit: the directories each kind recorded this run used, and from its last visit of the same page the kinds this run did not record, at their current version. */
	async save(): Promise<void> {
		await mkdir(join(this.root, VISITS), { recursive: true });
		for (const [route, { page, kinds }] of this.visits) {
			const file = join(this.root, VISITS, visitFile(route));
			const last = await readFile(file, 'utf8').then((t) => JSON.parse(t) as Visit, () => undefined);
			const merged: Record<string, { version: string; dirs: string[] }> = {};
			if (last?.page === page) for (const [kind, v] of Object.entries(last.kinds)) if (this.versions[kind] === v.version) merged[kind] = { version: v.version, dirs: [...v.dirs] };
			for (const [kind, dirs] of kinds) {
				const version = this.versions[kind];
				if (version !== undefined) merged[kind] = { version, dirs: [...dirs].sort() };
			}
			const visit: Visit = { route, page, kinds: Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : 1))) };
			await writeFile(file, JSON.stringify(visit));
		}
	}
}

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from 'yuku-css';
import { walk as walkCss } from 'yuku-css/ast';
import { attr, walk, type Document, type Element } from './dom.ts';

/** Attributes whose value is a URL the browser fetches as a resource of the page. */
const URL_ATTRIBUTES: readonly (readonly [tag: string, name: string])[] = [
	['link', 'href'],
	['script', 'src'],
	['img', 'src'],
	['source', 'src'],
	['video', 'src'],
	['video', 'poster'],
	['audio', 'src'],
	['track', 'src'],
	['input', 'src'],
	['image', 'href'],
	['use', 'href'],
	['object', 'data'],
	['embed', 'src'],
];
const SRCSET = new Set(['img', 'source']);
// A link to another page is navigation, not a resource.
const NOT_RESOURCES = new Set(['canonical', 'alternate', 'author', 'next', 'prev', 'search', 'help', 'license']);

/** Same-origin resource paths a document loads (stylesheets, scripts it keeps, images, fonts it preloads, icons, the manifest). */
export function resourcePaths(doc: Document | Element, origin: string): string[] {
	const out = new Set<string>();
	const add = (value: string | undefined) => {
		if (!value) return;
		const url = URL.parse(value.trim(), origin);
		// A resource whose query picks the answer (Next.js's image optimizer: /_next/image?url=&w=&q=) keeps it.
		if (url && url.origin === new URL(origin).origin && !url.pathname.endsWith('/')) out.add(url.search && url.pathname.startsWith('/_next/image') ? url.pathname + url.search : url.pathname);
	};
	for (const el of walk(doc)) {
		for (const [tag, name] of URL_ATTRIBUTES) {
			if (el.tagName !== tag) continue;
			if (tag === 'link' && (attr(el, 'rel') ?? '').split(/\s+/).some((rel) => NOT_RESOURCES.has(rel))) continue;
			add(attr(el, name) ?? (name === 'href' ? el.attrs.find((a) => a.name === 'href')?.value : undefined));
		}
		if (SRCSET.has(el.tagName)) for (const candidate of (attr(el, 'srcset') ?? '').split(',')) add(candidate.trim().split(/\s+/)[0]);
		const style = attr(el, 'style');
		if (style) for (const m of style.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) add(m[2]);
	}
	return [...out];
}

/** The URLs a stylesheet pulls in: `@import`s and `url()`s, resolved against the stylesheet's own URL. */
export function stylesheetPaths(css: string, sheetPath: string, origin: string): string[] {
	const base = new URL(sheetPath, origin);
	const out = new Set<string>();
	for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g)) {
		const raw = m[2] ?? m[4];
		if (!raw || raw.startsWith('data:') || raw.startsWith('#')) continue;
		const url = URL.parse(raw, base);
		if (url && url.origin === base.origin) out.add(url.pathname);
	}
	return [...out];
}

/** The same-origin paths a stylesheet pulls in, from its parse: each `url()` and each `@import`, resolved against the sheet. */
function sheetReferences(css: string, sheetPath: string, origin: string): string[] {
	const base = new URL(sheetPath, origin);
	const out = new Set<string>();
	const add = (raw: string) => {
		if (!raw || raw.startsWith('data:') || raw.startsWith('#')) return;
		const url = URL.parse(raw, base);
		if (url && url.origin === base.origin) out.add(url.pathname);
	};
	let ast: unknown;
	try {
		ast = parse(css).ast;
	} catch {
		return [];
	}
	walkCss(ast as never, {
		enter(node: { type: string; value?: string; name?: string; prelude?: { children?: { type: string; value?: string }[] } | null }) {
			if (node.type === 'Url') add(node.value ?? '');
			else if (node.type === 'Atrule' && node.name?.toLowerCase() === 'import') for (const c of node.prelude?.children ?? []) if (c.type === 'String') add(c.value ?? '');
		},
	});
	return [...out];
}

/**
 * Every same-origin path the written app still references: the resources in its markup (the pages, their extras, their
 * layers) and in its heads (`urls`), and, through each stylesheet among them that `publicDir` holds, what that sheet
 * pulls in, the fonts its @font-face rules name included.
 */
export async function referencedAssets(origin: string, publicDir: string, from: { readonly markup: Iterable<Document | Element>; readonly urls: Iterable<string> }): Promise<Set<string>> {
	const found = new Set<string>();
	const queue: string[] = [];
	const add = (path: string) => {
		if (found.has(path)) return;
		found.add(path);
		queue.push(path);
	};
	for (const node of from.markup) for (const path of resourcePaths(node, origin)) add(path);
	for (const raw of from.urls) {
		const url = URL.parse(raw, origin);
		if (url && url.origin === new URL(origin).origin) add(url.pathname);
	}
	while (queue.length) {
		const path = queue.shift()!;
		if (!path.endsWith('.css')) continue;
		const css = await readFile(join(publicDir, decodeURIComponent(path)), 'utf8').catch(() => undefined);
		if (css !== undefined) for (const next of sheetReferences(css, path, origin)) add(next);
	}
	return found;
}

/** Removes each copied asset `referenced` does not hold: what the old page loaded and the written app no longer uses. */
export async function pruneUnreferenced(publicDir: string, copied: readonly Pick<CopiedAsset, 'path' | 'bytes'>[], referenced: ReadonlySet<string>): Promise<Pick<CopiedAsset, 'path' | 'bytes'>[]> {
	const removed = copied.filter((c) => !referenced.has(c.path));
	await Promise.all(removed.map((c) => rm(join(publicDir, decodeURIComponent(c.path)), { force: true })));
	return removed;
}

/** The files a whole convert put in public/ (copied assets and cut sheets), kept so the next one removes those it no longer writes. */
export const MANAGED_ASSETS = 'assets.json';

export async function readManaged(file: string): Promise<string[]> {
	return readFile(file, 'utf8').then((t) => (JSON.parse(t) as { managed?: string[] }).managed ?? [], () => []);
}

export async function writeManaged(file: string, managed: Iterable<string>): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify({ managed: [...new Set(managed)].sort() }, null, '\t')}\n`);
}

export interface CopiedAsset {
	readonly path: string;
	readonly bytes: number;
	readonly sha256: string;
	readonly contentType: string;
}

/**
 * Copies every path from the old origin into `publicDir` at the same path, byte for byte, following stylesheets'
 * `url()`s. A path the old origin does not answer with 200 is reported and left out.
 */
/** With `reuse`, an asset already in `publicDir` is read from there instead of fetched again. */
export async function copyAssets(origin: string, paths: Iterable<string>, publicDir: string, log: (line: string) => void = () => {}, reuse = false): Promise<{ copied: CopiedAsset[]; missing: string[] }> {
	const queue = [...new Set(paths)];
	const seen = new Set(queue);
	const copied: CopiedAsset[] = [];
	const missing: string[] = [];
	for (let i = 0; i < queue.length; i++) {
		const path = queue[i]!;
		const target = join(publicDir, decodeURIComponent(path));
		const kept = reuse ? await readFile(target).catch(() => undefined) : undefined;
		const response = kept ? undefined : await fetch(new URL(path, origin)).catch(() => undefined);
		if (!kept && (!response || response.status !== 200)) {
			missing.push(`${path} (${response ? response.status : 'no answer'})`);
			continue;
		}
		const bytes = kept ?? Buffer.from(await response!.arrayBuffer());
		const contentType = response?.headers.get('content-type') ?? (path.endsWith('.css') ? 'text/css' : '');
		if (!kept) {
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, bytes);
		}
		copied.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), contentType });
		if (/text\/css/.test(contentType) || path.endsWith('.css'))
			for (const next of stylesheetPaths(bytes.toString('utf8'), path, origin))
				if (!seen.has(next)) {
					seen.add(next);
					queue.push(next);
				}
	}
	log(`copied ${copied.length} assets byte for byte${missing.length ? `, ${missing.length} not answered: ${missing.slice(0, 5).join(', ')}` : ''}`);
	return { copied, missing };
}

/** Copies a static directory the old framework serves as it is (Next.js's `public/`), keeping every path. */
export async function copyStaticDir(from: string, to: string): Promise<boolean> {
	const found = await stat(from).then((s) => s.isDirectory(), () => false);
	if (!found) return false;
	await cp(from, to, { recursive: true, force: true });
	return true;
}

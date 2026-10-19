import { createHash } from 'node:crypto';
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { attr, walk, type Document } from './dom.ts';

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
export function resourcePaths(doc: Document, origin: string): string[] {
	const out = new Set<string>();
	const add = (value: string | undefined) => {
		if (!value) return;
		const url = URL.parse(value.trim(), origin);
		if (url && url.origin === new URL(origin).origin && !url.pathname.endsWith('/')) out.add(url.pathname);
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
export async function copyAssets(origin: string, paths: Iterable<string>, publicDir: string, log: (line: string) => void = () => {}): Promise<{ copied: CopiedAsset[]; missing: string[] }> {
	const queue = [...new Set(paths)];
	const seen = new Set(queue);
	const copied: CopiedAsset[] = [];
	const missing: string[] = [];
	for (let i = 0; i < queue.length; i++) {
		const path = queue[i]!;
		const target = join(publicDir, decodeURIComponent(path));
		const response = await fetch(new URL(path, origin)).catch(() => undefined);
		if (!response || response.status !== 200) {
			missing.push(`${path} (${response ? response.status : 'no answer'})`);
			continue;
		}
		const bytes = Buffer.from(await response.arrayBuffer());
		const contentType = response.headers.get('content-type') ?? '';
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, bytes);
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

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parse } from 'yuku-css';
import { walk } from 'yuku-css/ast';

interface Tag {
	readonly tag: string;
	readonly attrs: Readonly<Record<string, string>>;
	readonly self?: unknown;
}

const isStylesheet = (t: Tag) => t.tag === 'link' && /\bstylesheet\b/.test(t.attrs.rel ?? '');

/** A plain same-origin stylesheet link: rel and href only, a path that is a file in the app's public folder. */
const movable = (t: Tag) => t.attrs.rel === 'stylesheet' && t.self === undefined && Object.keys(t.attrs).every((k) => k === 'rel' || k === 'href') && /^\/(?!\/)[^?#]*\.css$/.test(t.attrs.href ?? '');

/** A rule a browser drops under CSS error recovery, as the copy leaves it out. */
export interface DroppedRule {
	readonly href: string;
	readonly rule: string;
	readonly reason: string;
}

/**
 * The sheet as its copy must read: each relative url() becomes the root path it named from `href`, since the bundler
 * would resolve it against the copy's place, and each style rule whose selector does not parse is left out, as a
 * browser drops it. Undefined when it cannot move: an @import, or CSS that does not parse.
 */
function relocated(css: string, href: string): { css: string; urls: string[]; dropped: DroppedRule[] } | undefined {
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(css);
	} catch {
		return undefined;
	}
	const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
	const base = new URL(href, 'file://');
	const edits: { start: number; end: number; text: string }[] = [];
	const urls: string[] = [];
	const dropped: DroppedRule[] = [];
	let imports = false;
	walk(parsed.ast as never, {
		enter(node: { type: string; name?: string; value?: string; start?: number; end?: number; prelude?: { type: string; start: number; end: number } }) {
			if (node.type === 'Atrule' && node.name?.toLowerCase() === 'import') imports = true;
			else if (node.type === 'Rule' && node.prelude?.type === 'Raw') {
				const { start, end } = node.prelude;
				const error = errors.find((d) => d.start >= start && d.start <= end);
				if (!error) return;
				edits.push({ start: node.start!, end: node.end!, text: '' });
				dropped.push({ href, rule: css.slice(node.start, node.end), reason: error.message });
				return walk.skip;
			} else if (node.type === 'Url' && node.value && node.end !== undefined && !/^(?:#|[a-z][a-z\d+.-]*:)/i.test(node.value)) {
				const url = new URL(node.value, base);
				if (url.protocol !== 'file:') return;
				urls.push(url.pathname);
				if (!node.value.startsWith('/')) edits.push({ start: node.start!, end: node.end, text: `url(${JSON.stringify(url.pathname + url.search + url.hash)})` });
			}
		},
	});
	if (imports) return undefined;
	let out = css;
	for (const e of edits.sort((a, b) => b.start - a.start)) out = `${out.slice(0, e.start)}${e.text}${out.slice(e.end)}`;
	return { css: out, urls, dropped };
}

/** The hrefs in cascade order: a sheet linked twice applies at its last link, so that is where it stays. */
function lastOccurrences(hrefs: readonly string[]): string[] {
	return hrefs.filter((href, i) => hrefs.lastIndexOf(href) === i);
}

/**
 * Moves each page's stylesheet links into imports at the top of its page module (copies under styles/converted/), so a
 * Markless build carries that CSS inside the page's HTML instead of as render-blocking requests. The module imports the
 * sheets all its routes link first, in the same order; a route's sheets after those are returned in `body`, to be linked
 * first in the body, where they still follow every sheet the head carries. A page keeps its links when any of them is not
 * a plain same-origin file, or a sheet has an @import. Returns the pages moved, the same-origin paths the moved sheets load
 * (their fonts), which the heads no longer lead to, and the rules the copies left out.
 */
export async function importStylesheets<T extends Tag>(app: string, publicDir: string, pages: ReadonlyMap<string, readonly string[]>, heads: ReadonlyMap<string, T[]>, keepOthers: boolean): Promise<{ moved: number; urls: string[]; dropped: DroppedRule[]; body: Map<string, string[]> }> {
	const out = join(app, 'styles', 'converted');
	if (!keepOthers) await rm(out, { recursive: true, force: true });
	const copy = copier(publicDir);
	let moved = 0;
	const urls = new Set<string>();
	const dropped = new Map<string, readonly DroppedRule[]>();
	const body = new Map<string, string[]>();
	for (const [page, routes] of pages) {
		const lists = routes.map((route) => heads.get(route)?.filter(isStylesheet));
		if (!lists.length || lists.some((list) => !list?.length || !list.every(movable))) continue;
		const orders = lists.map((list) => lastOccurrences(list!.map((t) => t.attrs.href!)));
		let common = 0;
		while (common < orders[0]!.length && orders.every((o) => o[common] === orders[0]![common])) common++;
		if (common) {
			const done = await importInto(app, page, orders[0]!.slice(0, common), copy);
			if (!done) continue;
			for (const url of done.urls) urls.add(url);
			for (const [href, rules] of done.dropped) dropped.set(href, rules);
		}
		for (const [i, route] of routes.entries()) {
			const head = heads.get(route)!;
			head.splice(0, Infinity, ...head.filter((t) => !isStylesheet(t)));
			if (orders[i]!.length > common) body.set(route, orders[i]!.slice(common));
		}
		moved++;
	}
	return { moved, urls: [...urls], dropped: [...dropped.values()].flat(), body };
}

type Copier = (href: string) => Promise<ReturnType<typeof relocated>>;

function copier(publicDir: string): Copier {
	const copies = new Map<string, Promise<ReturnType<typeof relocated>>>();
	return (href) => copies.get(href) ?? copies.set(href, readFile(join(publicDir, href), 'utf8').then((css) => relocated(css, href), () => undefined)).get(href)!;
}

/**
 * Imports the sheets, in order, at the top of the module `file` (from the app), as copies under styles/converted/: two or
 * more as one combined copy, since a bundler that splits CSS across chunks loads a sheet other modules import too ahead
 * of the module's own. Undefined, and nothing written, when one cannot move.
 */
async function importInto(app: string, file: string, sheets: readonly string[], copy: Copier): Promise<{ urls: string[]; dropped: Map<string, readonly DroppedRule[]> } | undefined> {
	const css = await Promise.all(sheets.map(copy));
	if (css.some((c) => c === undefined)) return undefined;
	const out = join(app, 'styles', 'converted');
	const path = join(app, file);
	const urls = css.flatMap((c) => c!.urls);
	const dropped = new Map(sheets.map((href, i) => [href, css[i]!.dropped]));
	const combined = css.map((c) => c!.css).join('\n');
	const targets = sheets.length > 1 && joinable(css.map((c) => c!.css), combined) ? [{ target: join(out, '_combined', `${createHash('sha256').update(combined).digest('hex').slice(0, 12)}.css`), text: combined }] : sheets.map((href, i) => ({ target: join(out, href), text: css[i]!.css }));
	const imports = [];
	for (const { target, text } of targets) {
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, text);
		imports.push(`import ${JSON.stringify(relative(dirname(path), target).replace(/^(?!\.)/, './'))};`);
	}
	const source = await readFile(path, 'utf8');
	const firstLine = source.indexOf('\n') + 1;
	await writeFile(path, `${source.slice(0, firstLine)}${imports.join('\n')}\n${source.slice(firstLine)}`);
	return { urls, dropped };
}

/** Whether the sheets read the same as one text: none leaves a block or comment open for the next to fall into. */
function joinable(sheets: readonly string[], combined: string): boolean {
	try {
		return parse(combined).ast.children.length === sheets.reduce((n, css) => n + parse(css).ast.children.length, 0);
	} catch {
		return false;
	}
}

/** Imports the shared sheets into document.tsrx, so every page carries them ahead of its own and a navigation keeps them. Call after importStylesheets, which clears the copies. */
export async function importIntoDocument(app: string, publicDir: string, sheets: readonly string[]): Promise<{ urls: string[]; dropped: DroppedRule[] } | undefined> {
	const done = await importInto(app, 'document.tsrx', sheets, copier(publicDir));
	return done && { urls: done.urls, dropped: [...done.dropped.values()].flat() };
}

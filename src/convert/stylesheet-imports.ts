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

/**
 * The sheet as its copy must read: each relative url() becomes the root path it named from `href`, since the bundler
 * would resolve it against the copy's place. Undefined when it cannot move: an @import, or CSS that does not parse.
 */
function relocated(css: string, href: string): { css: string; urls: string[] } | undefined {
	let ast: unknown;
	try {
		ast = parse(css).ast;
	} catch {
		return undefined;
	}
	const base = new URL(href, 'file://');
	const edits: { start: number; end: number; url: string }[] = [];
	const urls: string[] = [];
	let imports = false;
	walk(ast as never, {
		enter(node: { type: string; name?: string; value?: string; start?: number; end?: number }) {
			if (node.type === 'Atrule' && node.name?.toLowerCase() === 'import') imports = true;
			else if (node.type === 'Url' && node.value && node.end !== undefined && !/^(?:#|[a-z][a-z\d+.-]*:)/i.test(node.value)) {
				const url = new URL(node.value, base);
				if (url.protocol !== 'file:') return;
				urls.push(url.pathname);
				if (!node.value.startsWith('/')) edits.push({ start: node.start!, end: node.end, url: url.pathname + url.search + url.hash });
			}
		},
	});
	if (imports) return undefined;
	let out = css;
	for (const e of edits.sort((a, b) => b.start - a.start)) out = `${out.slice(0, e.start)}url(${JSON.stringify(e.url)})${out.slice(e.end)}`;
	return { css: out, urls };
}

/** The hrefs in cascade order: a sheet linked twice applies at its last link, so that is where it stays. */
function lastOccurrences(hrefs: readonly string[]): string[] {
	return hrefs.filter((href, i) => hrefs.lastIndexOf(href) === i);
}

/**
 * Moves each page's stylesheet links into imports at the top of its page module (copies under styles/converted/), so a
 * Markless build carries that CSS inside the page's HTML instead of as render-blocking requests. A page keeps its links
 * when any of them is not a plain same-origin file, when its routes link different sheets (one module imports one set),
 * or when a sheet has an @import. Returns the pages moved and the same-origin paths the moved sheets load (their fonts),
 * which the heads no longer lead to.
 */
export async function importStylesheets<T extends Tag>(app: string, publicDir: string, pages: ReadonlyMap<string, readonly string[]>, heads: ReadonlyMap<string, T[]>, keepOthers: boolean): Promise<{ moved: number; urls: string[] }> {
	const out = join(app, 'styles', 'converted');
	if (!keepOthers) await rm(out, { recursive: true, force: true });
	const texts = new Map<string, Promise<string | undefined>>();
	const text = (href: string) => texts.get(href) ?? texts.set(href, readFile(join(publicDir, href), 'utf8').catch(() => undefined)).get(href)!;
	let moved = 0;
	const urls = new Set<string>();
	for (const [page, routes] of pages) {
		const lists = routes.map((route) => heads.get(route)?.filter(isStylesheet));
		if (!lists.length || lists.some((list) => !list?.length || !list.every(movable))) continue;
		const orders = lists.map((list) => lastOccurrences(list!.map((t) => t.attrs.href!)));
		if (orders.some((order) => order.join('\n') !== orders[0]!.join('\n'))) continue;
		const sheets = orders[0]!;
		const css = (await Promise.all(sheets.map(text))).map((c, i) => (c === undefined ? undefined : relocated(c, sheets[i]!)));
		if (css.some((c) => c === undefined)) continue;
		const file = join(app, page);
		const imports = [];
		for (const [i, href] of sheets.entries()) {
			const target = join(out, href);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, css[i]!.css);
			for (const url of css[i]!.urls) urls.add(url);
			imports.push(`import ${JSON.stringify(relative(dirname(file), target).replace(/^(?!\.)/, './'))};`);
		}
		const source = await readFile(file, 'utf8');
		const firstLine = source.indexOf('\n') + 1;
		await writeFile(file, `${source.slice(0, firstLine)}${imports.join('\n')}\n${source.slice(firstLine)}`);
		for (const route of routes) {
			const head = heads.get(route)!;
			head.splice(0, Infinity, ...head.filter((t) => !isStylesheet(t)));
		}
		moved++;
	}
	return { moved, urls: [...urls] };
}

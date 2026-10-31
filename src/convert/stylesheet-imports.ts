import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

interface Tag {
	readonly tag: string;
	readonly attrs: Readonly<Record<string, string>>;
	readonly self?: unknown;
}

const isStylesheet = (t: Tag) => t.tag === 'link' && /\bstylesheet\b/.test(t.attrs.rel ?? '');

/** A plain same-origin stylesheet link: rel and href only, a path that is a file in the app's public folder. */
const movable = (t: Tag) => t.attrs.rel === 'stylesheet' && t.self === undefined && Object.keys(t.attrs).every((k) => k === 'rel' || k === 'href') && /^\/(?!\/)[^?#]*\.css$/.test(t.attrs.href ?? '');

/** A url() or @import the bundler would resolve against the file's new place, so moving it would change what it loads. */
const placeBound = (css: string) => /@import\b/i.test(css) || [...css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)].some((m) => !/^(?:\/|data:|https?:|#|$)/i.test(m[2]!.trim()));

/** The hrefs in cascade order: a sheet linked twice applies at its last link, so that is where it stays. */
function lastOccurrences(hrefs: readonly string[]): string[] {
	return hrefs.filter((href, i) => hrefs.lastIndexOf(href) === i);
}

/**
 * Moves each page's stylesheet links into imports at the top of its page module (copies under styles/converted/), so a
 * Markless build carries that CSS inside the page's HTML instead of as render-blocking requests. A page keeps its links
 * when any of them is not a plain same-origin file, when its routes link different sheets (one module imports one set),
 * or when a sheet's url() or @import depends on where the file sits. Returns the pages moved.
 */
export async function importStylesheets<T extends Tag>(app: string, publicDir: string, pages: ReadonlyMap<string, readonly string[]>, heads: ReadonlyMap<string, T[]>, keepOthers: boolean): Promise<number> {
	const out = join(app, 'styles', 'converted');
	if (!keepOthers) await rm(out, { recursive: true, force: true });
	const texts = new Map<string, Promise<string | undefined>>();
	const text = (href: string) => texts.get(href) ?? texts.set(href, readFile(join(publicDir, href), 'utf8').catch(() => undefined)).get(href)!;
	let moved = 0;
	for (const [page, routes] of pages) {
		const lists = routes.map((route) => heads.get(route)?.filter(isStylesheet));
		if (!lists.length || lists.some((list) => !list?.length || !list.every(movable))) continue;
		const orders = lists.map((list) => lastOccurrences(list!.map((t) => t.attrs.href!)));
		if (orders.some((order) => order.join('\n') !== orders[0]!.join('\n'))) continue;
		const sheets = orders[0]!;
		const css = await Promise.all(sheets.map(text));
		if (css.some((c) => c === undefined || placeBound(c))) continue;
		const file = join(app, page);
		const imports = [];
		for (const href of sheets) {
			const target = join(out, href);
			await mkdir(dirname(target), { recursive: true });
			await copyFile(join(publicDir, href), target);
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
	return moved;
}

// Measurement only: one route's own stylesheets move from head links to page-module imports, as a converter that
// writes imports would leave them, so the framework can carry them inline. Usage: node import-route-styles.mjs <app> <route> <page file>
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const [app, route, pageFile] = process.argv.slice(2);
const { TAGS, ROUTES } = await import(pathToFileURL(join(app, 'heads.ts')).href);
const entry = ROUTES[route];
if (!entry) throw new Error(`no route ${route}`);
const isOwnSheet = (tag) => tag.tag === 'link' && /\bstylesheet\b/.test(tag.attrs.rel ?? '') && !tag.attrs.media && /^\/_converted\/styles\/[^/]+\.css$/.test(tag.attrs.href ?? '');
const sheets = [...new Set(entry.tags.map((index) => TAGS[index]).filter(isOwnSheet).map((tag) => tag.attrs.href))];
mkdirSync(join(app, 'styles', 'converted'), { recursive: true });
const page = join(app, pageFile);
const imports = sheets.map((href) => {
	const target = join(app, 'styles', 'converted', basename(href));
	copyFileSync(join(app, 'public', href), target);
	return `import ${JSON.stringify(relative(dirname(page), target).replace(/^(?!\.)/, './'))};`;
});
const source = readFileSync(page, 'utf8');
const firstLineEnd = source.indexOf('\n') + 1;
writeFileSync(page, source.slice(0, firstLineEnd) + imports.join('\n') + '\n' + source.slice(firstLineEnd));
const heads = readFileSync(join(app, 'heads.ts'), 'utf8');
const routes = { ...ROUTES, [route]: { ...entry, tags: entry.tags.filter((index) => !isOwnSheet(TAGS[index])) } };
const marker = 'export const ROUTES';
const at = heads.indexOf(marker);
const declaration = heads.slice(at, heads.indexOf('=', at) + 1);
writeFileSync(join(app, 'heads.ts'), `${heads.slice(0, at)}${declaration} ${JSON.stringify(routes)};\n`);
console.log(JSON.stringify({ route, imported: sheets }));

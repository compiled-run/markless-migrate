// Builds a subset of the site: removes every page outside the routes given (and the not-found page), so a check of a few routes
// builds within a standard CI runner. node scripts/keep-routes.mjs <route>...   (run on a disposable checkout)
import { readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

const app = join(import.meta.dirname, '..');
const pages = join(app, 'pages');
const keep = new Set(process.argv.slice(2).map((r) => r.replace(/\/$/, '') || '/'));
if (!keep.size) throw new Error('usage: keep-routes.mjs <route>...');
const routeOf = (file) => {
	const path = `/${relative(pages, file).replace(/\.tsrx$/, '').split('\\').join('/')}`;
	return path === '/index' ? '/' : path.replace(/\/index$/, '');
};
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.tsrx') ? [join(dir, e.name)] : []));
const all = files(pages);
const found = new Set(all.map(routeOf));
const missing = [...keep].filter((r) => !found.has(r));
if (missing.length) throw new Error(`no page for ${missing.join(', ')}`);
let removed = 0;
for (const file of all) {
	const route = routeOf(file);
	if (route === '/404' || keep.has(route)) continue;
	rmSync(file);
	removed++;
}
console.log(`kept ${all.length - removed} pages (${[...keep].join(', ')} and /404), removed ${removed}`);

// Rewrites the old build's stylesheet so each url() points at its source file under assets/: node .port/port-css.mjs <dist-css> <out>
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
const [css, out] = process.argv.slice(2);
const dist = dirname(css);
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })('assets');
const misses = [];
const text = readFileSync(css, 'utf8').replace(/url\(\/assets\/([^)]+)\.[\w-]{8}(\.\w+)\)/g, (all, name, ext) => {
	const built = readFileSync(join(dist, all.slice(12, -1)));
	const hit = files.find((f) => basename(f) === name + ext && readFileSync(f).equals(built));
	if (!hit) { misses.push(all); return all; }
	return `url(${relative(dirname(out), hit)})`;
});
writeFileSync(out, text);
console.log('unmapped:', misses);

// Copies the old site's own files the generated pages name (images, robots.txt) into public/ and its sitemap into content/, from the
// read-only mirror: node importer/capture-assets.ts [mirror-origin]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APP = join(import.meta.dirname, '..');
const origin = process.argv[2] ?? 'http://127.0.0.1:4420';
const files = (dir: string): string[] => readdirSync(join(APP, dir), { recursive: true }).map(String).filter((f) => f.endsWith('.tsrx')).map((f) => join(APP, dir, f));
const wanted = new Set(['/robots.txt']);
// The sitemap goes out from the server with the old one's content type (text/xml), so it is content, not a static file.
const endpoints: Record<string, string> = { '/sitemap.xml': 'content/endpoints/sitemap.xml' };
for (const file of [...files('pages'), ...files('demos'), ...files('components')]) {
	const source = readFileSync(file, 'utf8');
	for (const m of source.matchAll(/(?:src|href)="(\/(?:img|images)\/[^"]+)"/g)) wanted.add(m[1]!);
	// :src="'/img/morphs/morph'+slide+'.png'" cycles slide through 1..13 in the Morph demo's own buttons.
	for (const m of source.matchAll(/'(\/img\/[^']+)'\s*\+\s*\w+\s*\+\s*'(\.\w+)'/g)) for (let i = 1; i <= 13; i++) wanted.add(`${m[1]}${i}${m[2]}`);
}
let fetched = 0;
for (const path of [...wanted, ...Object.keys(endpoints)]) {
	const target = join(APP, endpoints[path] ?? join('public', path));
	if (existsSync(target)) continue;
	const response = await fetch(origin + path);
	if (!response.ok) {
		console.error(`${path}: ${response.status}`);
		continue;
	}
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, Buffer.from(await response.arrayBuffer()));
	fetched++;
}
console.log(`assets: ${wanted.size} named, ${fetched} fetched`);

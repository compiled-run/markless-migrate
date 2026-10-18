// Checks every page in the old site's sitemap and every other file the old site serves against the new one:
//   node scripts/verify-routes.ts <old-origin> <new-origin> [--refresh]
// Pages: status 200, the same <title> and the same first <h1> text. Other files (feeds, sitemap, robots.txt, alias
// pages, static files, redirects): the same status, redirect target and bytes. The old side is fetched once, slowly,
// into .import/old-site.json; --refresh fetches it again.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textOf } from './import/html-to-tsrx.ts';
import { NETLIFY_ROUTES } from '../netlify-routes.ts';

const [oldOrigin, newOrigin] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!oldOrigin || !newOrigin) throw new Error('usage: verify-routes.ts <old-origin> <new-origin> [--refresh]');
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(APP, '.import', 'old-site.json');

interface Seen {
	status: number;
	location?: string;
	title?: string;
	h1?: string;
	bytes?: string;
}

const clean = (html: string | undefined) => (html === undefined ? undefined : textOf(html).replace(/\s+/g, ' ').trim());
async function see(origin: string, path: string, page: boolean): Promise<Seen> {
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await fetch(origin + path, { redirect: 'manual', headers: { 'user-agent': 'markless-migrate route verification' } });
			const location = response.headers.get('location') ?? undefined;
			const body = Buffer.from(await response.arrayBuffer());
			if (!page) return { status: response.status, location: location && new URL(location, origin + path).pathname, bytes: response.status === 200 ? createHash('sha256').update(body).digest('hex') : undefined };
			if (location && response.status >= 300 && response.status < 400) {
				const followed = await see(origin, new URL(location, origin + path).pathname, true);
				return { ...followed, status: response.status, location: new URL(location, origin + path).pathname };
			}
			const html = body.toString('utf8');
			return { status: response.status, location, title: clean(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1]), h1: clean(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]) };
		} catch (error) {
			if (attempt >= 3) throw error;
			await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
		}
	}
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
	let next = 0;
	await Promise.all(Array.from({ length: size }, async () => {
		while (next < items.length) await work(items[next++]!);
	}));
}

function walk(dir: string, files: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, files);
		else files.push(path);
	}
	return files;
}

const sitemap = await (await fetch(`${oldOrigin}/sitemap.xml`)).text();
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
// Every file the Zola build writes besides pages, as the importer copied it; port-only stylesheets are not old files.
const publicDir = join(APP, '.import', 'public');
const files = walk(publicDir)
	.map((f) => `/${relative(publicDir, f)}`)
	.filter((p) => !p.startsWith('/css/port/'))
	.map((p) => (p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p));
// Netlify's own answers (redirects, Pretty URLs) and two paths no site has, for the 404 status.
const redirects = [...Object.keys(NETLIFY_ROUTES), '/no-such-page/', '/img/no-such-image.png'].filter((p) => !files.includes(p));

const old: Record<string, Seen> = existsSync(CACHE) && !process.argv.includes('--refresh') ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
// /x/index.html answers with the page itself.
const isPage = (p: string) => pages.includes(p) || (p.endsWith('/index.html') && pages.some((page) => page.toLowerCase() === p.slice(0, -'index.html'.length)));
const wanted = [...pages, ...files, ...redirects].map((p) => [p, isPage(p)] as const);
await pool(wanted.filter(([p, page]) => !old[p] || (page && !('title' in old[p]!))), 2, async ([path, page]) => {
	old[path] = await see(oldOrigin, path, page);
});
writeFileSync(CACHE, JSON.stringify(old));

const misses: string[] = [];
let pagesOk = 0;
let filesOk = 0;
await pool(wanted, 8, async ([path, page]) => {
	const was = old[path]!;
	const now = await see(newOrigin, path, page);
	const problems: string[] = [];
	if (page && now.status !== 200 && now.status !== was.status) problems.push(`status ${now.status}`);
	if (now.status !== was.status) problems.push(`status ${was.status} -> ${now.status}`);
	if (now.location !== was.location) problems.push(`redirect ${was.location} -> ${now.location}`);
	if (now.title !== was.title) problems.push(`title ${JSON.stringify(was.title)} -> ${JSON.stringify(now.title)}`);
	if (now.h1 !== was.h1) problems.push(`h1 ${JSON.stringify(was.h1)} -> ${JSON.stringify(now.h1)}`);
	if (now.bytes !== was.bytes) problems.push('bytes differ');
	if (problems.length) misses.push(`${path}: ${problems.join('; ')}`);
	else if (page) pagesOk++;
	else filesOk++;
});

const pageCount = wanted.filter(([, page]) => page).length;
console.log(`pages: ${pagesOk} of ${pageCount} match (200, or the same redirect to a 200 page; title; h1): the ${pages.length} sitemap routes and their /index.html forms`);
console.log(`other files and redirects: ${filesOk} of ${wanted.length - pageCount} match (status, redirect, bytes)`);
for (const miss of misses.sort()) console.log(`  miss ${miss}`);
process.exitCode = misses.length ? 1 : 0;

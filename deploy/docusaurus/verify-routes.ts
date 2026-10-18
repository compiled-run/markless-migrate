// Every route of the old site's sitemap must answer 200 on the new app with the same <title> and first <h1>:
// `node deploy/docusaurus/verify-routes.ts [old-origin] [new-origin]` (default: the two deployments).
import { DOCUSAURUS } from './urls.ts';

const oldOrigin = (process.argv[2] ?? DOCUSAURUS.old).replace(/\/$/, '');
const newOrigin = (process.argv[3] ?? DOCUSAURUS.new).replace(/\/$/, '');

const decode = (text: string) =>
	text
		.replace(/<[^>]+>/g, '')
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/​/g, '')
		.replace(/\s+/g, ' ')
		.trim();
const title = (html: string) => decode(/<title[^>]*>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '');
const h1 = (html: string) => decode(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');

const sitemap = await (await fetch(`${oldOrigin}/sitemap.xml`)).text();
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
const misses: string[] = [];
let checked = 0;
async function check(path: string): Promise<void> {
	const [oldRes, newRes] = await Promise.all([fetch(oldOrigin + path), fetch(newOrigin + path)]);
	const [oldHtml, newHtml] = await Promise.all([oldRes.text(), newRes.text()]);
	checked++;
	const problems: string[] = [];
	if (newRes.status !== 200) problems.push(`status ${newRes.status} (old ${oldRes.status})`);
	if (title(oldHtml) !== title(newHtml)) problems.push(`title ${JSON.stringify(title(newHtml))}, old ${JSON.stringify(title(oldHtml))}`);
	if (h1(oldHtml) !== h1(newHtml)) problems.push(`h1 ${JSON.stringify(h1(newHtml))}, old ${JSON.stringify(h1(oldHtml))}`);
	if (problems.length) misses.push(`${path}: ${problems.join('; ')}`);
}
const queue = [...routes];
await Promise.all(
	Array.from({ length: 8 }, async () => {
		while (queue.length) await check(queue.shift()!);
	}),
);
process.stdout.write(`${checked} sitemap routes checked: ${checked - misses.length} answer 200 with the old title and h1\n`);
for (const miss of misses.sort()) process.stdout.write(`  ${miss}\n`);
process.exit(misses.length ? 1 : 0);

// Every route the old site answers, asked of the old and the new site: status, redirect target, <title> and every <h1>.
// node deploy/alpinejs-dev/verify-routes.mjs <old-origin> <new-origin> <inventory.json>
import { readFileSync } from 'node:fs';

const [oldOrigin, newOrigin, inventoryPath] = process.argv.slice(2);
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const routes = [...new Set([...inventory.allRoutes.map((r) => r.route).filter((r) => r.startsWith('/')), ...(process.env.EXTRA ?? '').split(' ').filter(Boolean)])];

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
async function ask(origin, route) {
	const response = await fetch(origin + route, { redirect: 'manual' });
	const body = await response.text();
	const location = response.headers.get('location');
	const target = location ? new URL(location, origin + route) : undefined;
	return {
		status: response.status,
		redirect: target ? (target.host === new URL(origin).host || target.host === 'alpinejs.dev' ? target.pathname + target.search.replace(/state=\w+/, 'state=') : target.origin + target.pathname) : undefined,
		title: decode(/<title>([\s\S]*?)<\/title>/.exec(body)?.[1] ?? ''),
		h1: [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, ''))).join(' | '),
	};
}

let misses = 0;
for (const route of routes.sort()) {
	const [a, b] = [await ask(oldOrigin, route), await ask(newOrigin, route)];
	const problems = [];
	if (Math.floor(a.status / 100) !== Math.floor(b.status / 100)) problems.push(`status ${a.status} -> ${b.status}`);
	if (a.redirect !== b.redirect) problems.push(`redirect ${a.redirect} -> ${b.redirect}`);
	if (a.status === 200 && a.title !== b.title) problems.push(`title "${a.title}" -> "${b.title}"`);
	if (a.status === 200 && a.h1 !== b.h1) problems.push(`h1 "${a.h1}" -> "${b.h1}"`);
	if (problems.length) misses++;
	console.log(`${problems.length ? 'MISS' : 'ok  '} ${String(a.status).padEnd(3)} ${route}${problems.length ? `  ${problems.join('; ')}` : ''}`);
}
console.log(`${routes.length - misses} of ${routes.length} routes match; ${misses} misses`);
process.exitCode = misses ? 1 : 0;

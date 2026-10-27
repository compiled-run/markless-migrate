// Writes the vercel.json that serves qwik-ui's static build as Cloudflare Pages serves qwikui.com: its _redirects and
// _headers rules, folders at their trailing-slash path, 404.html for anything else. Vercel answers a missing trailing
// slash with 308 where Cloudflare answers 307.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const lines = (file) => readFileSync(join(dir, file), 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
const redirects = lines('_redirects').map((l) => l.trim().split(/\s+/)).map(([source, destination, status]) => ({ source, destination, statusCode: Number(status ?? 302) }));
const headers = [];
for (const line of lines('_headers')) {
	if (!/^\s/.test(line)) headers.push({ source: line.trim().replace(/\*$/, ':path*'), headers: [] });
	else {
		const at = line.indexOf(':');
		headers.at(-1).headers.push({ key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() });
	}
}
process.stdout.write(`${JSON.stringify({ trailingSlash: true, redirects, headers: headers.filter((h) => h.headers.length) }, null, '\t')}\n`);

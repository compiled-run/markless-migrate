// Writes old/vercel.json for the VitePress build: clean URLs, plus the redirects and headers its Netlify files declare.
// node deploy/vite-dev/old/vercel-config.mjs <old-docs-dist>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2];
const lines = (file) => readFileSync(join(dist, file), 'utf8').split('\n').map((l) => l.trim());
const pattern = (path) => path.replace(/\*/g, ':splat*');
const redirects = [];
const rewrites = [];
for (const line of lines('_redirects')) {
	if (!line || line.startsWith('#') || line.startsWith('http')) continue;
	const [from, to, status = '301'] = line.split(/\s+/);
	if (status.startsWith('200')) continue; // `/llms.txt /llms.txt 200!`: the file itself, which is served anyway.
	if (from === '/*.txt') {
		redirects.push({ source: '/:path((?!llms\\.txt$|llms-full\\.txt$).*)\\.txt', destination: '/:path.md', permanent: true });
		continue;
	}
	redirects.push({ source: pattern(from), destination: to.replace(':splat', ':splat*'), permanent: status.startsWith('301') });
}
const headers = [];
let current;
for (const line of lines('_headers')) {
	if (!line) continue;
	if (line.startsWith('/')) headers.push((current = { source: pattern(line), headers: [] }));
	else if (current) {
		const [key, ...value] = line.split(':');
		const header = current.headers.find((h) => h.key === key.trim());
		if (header) header.value += `, ${value.join(':').trim()}`;
		else current.headers.push({ key: key.trim(), value: value.join(':').trim() });
	}
}
writeFileSync(new URL('./vercel.json', import.meta.url), `${JSON.stringify({ cleanUrls: true, redirects, rewrites, headers }, null, '\t')}\n`);
process.stdout.write(`vercel.json: ${redirects.length} redirects, ${headers.length} header rules\n`);

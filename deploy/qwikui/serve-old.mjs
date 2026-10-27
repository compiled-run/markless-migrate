// Serves qwik-ui's static build (fetch-old.sh) as Cloudflare Pages serves qwikui.com: a folder's index.html at its path with a
// trailing slash (the path without it answers 307 there), _redirects and _headers applied, 404.html with status 404 for
// anything else, and gzip for text a browser accepts it for, so a slow-network check compares both sides compressed.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createGzip } from 'node:zlib';

const dir = process.env.OLD_DIST ?? join(import.meta.dirname, 'old/dist/apps/website/client');
const port = Number(process.env.PORT ?? process.argv[2] ?? 4610);
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|wasm)|image\/svg\+xml)/;

const redirects = readFileSync(join(dir, '_redirects'), 'utf8')
	.split('\n')
	.map((l) => l.trim())
	.filter((l) => l && !l.startsWith('#'))
	.map((l) => l.split(/\s+/))
	.map(([from, to, status]) => ({ from, to, status: Number(status ?? 302) }));

// _headers: a path pattern line, then its indented headers; `*` matches anything, and every matching block applies in order.
const headerRules = [];
for (const line of readFileSync(join(dir, '_headers'), 'utf8').split('\n')) {
	if (!line.trim() || line.trim().startsWith('#')) continue;
	if (!/^\s/.test(line)) headerRules.push({ re: new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`), headers: {} });
	else {
		const at = line.indexOf(':');
		headerRules.at(-1).headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
	}
}
const headersFor = (path) => {
	const out = {};
	for (const rule of headerRules) if (rule.re.test(path)) for (const [k, v] of Object.entries(rule.headers)) out[k] = out[k] ? `${out[k]}, ${v}` : v;
	return out;
};
const isFile = (file) => {
	try {
		return statSync(file).isFile();
	} catch {
		return false;
	}
};

function send(req, res, status, file, path) {
	const type = TYPES[extname(file)] ?? 'application/octet-stream';
	const headers = { 'content-type': type, ...headersFor(path) };
	const zip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && COMPRESSIBLE.test(type) && req.method !== 'HEAD';
	if (zip) Object.assign(headers, { 'content-encoding': 'gzip', vary: 'accept-encoding' });
	else headers['content-length'] = statSync(file).size;
	res.writeHead(status, headers);
	if (req.method === 'HEAD') return void res.end();
	const stream = createReadStream(file);
	(zip ? stream.pipe(createGzip()) : stream).pipe(res);
}

createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://x');
	const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
	const redirect = redirects.find((r) => r.from === path);
	if (redirect) return void res.writeHead(redirect.status, { location: redirect.to }).end();
	const file = join(dir, path);
	if (isFile(file)) return send(req, res, 200, file, path);
	if (path.endsWith('/') && isFile(join(file, 'index.html'))) return send(req, res, 200, join(file, 'index.html'), path);
	if (!path.endsWith('/') && isFile(join(file, 'index.html'))) return void res.writeHead(307, { location: `${path}/${url.search}` }).end();
	send(req, res, 404, join(dir, '404.html'), path);
}).listen(port, process.env.HOST ?? '127.0.0.1', () => process.stdout.write(`qwik-ui (old) at http://127.0.0.1:${port}\n`));

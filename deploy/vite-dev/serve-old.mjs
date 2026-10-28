// Serves the old site's build (fetch-old.sh) as its Vercel deployment did: old/vercel.json's redirects and headers, clean URLs,
// 404.html for a missing page, gzipped as deploy/shadcn-ui/serve-vercel-output.mjs serves the port.
// node deploy/vite-dev/serve-old.mjs [port]
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { createGzip } from 'node:zlib';

const port = Number(process.argv[2] ?? 4000);
const root = new URL('./old/public', import.meta.url).pathname;
const config = JSON.parse(readFileSync(new URL('./old/vercel.json', import.meta.url), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.xml': 'application/xml', '.rss': 'application/rss+xml', '.ico': 'image/x-icon', '.riv': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };

// A vercel.json source (`/x`, `/assets/:splat*`, `/:path(regex)\\.txt`) as a regular expression with named groups.
function pattern(source) {
	let re = '';
	for (let i = 0; i < source.length; ) {
		const param = /^:(\w+)(\((?:[^()]|\([^()]*\))*\))?(\*)?/.exec(source.slice(i));
		if (param) {
			re += `(?<${param[1]}>${param[2] ? param[2].slice(1, -1) : param[3] ? '.*' : '[^/]+'})`;
			i += param[0].length;
		} else if (source[i] === '\\') {
			re += source.slice(i, i + 2);
			i += 2;
		} else re += source[i++].replace(/[.+?^${}()|[\]]/g, '\\$&');
	}
	return new RegExp(`^${re}$`);
}
const redirects = config.redirects.map((r) => ({ ...r, re: pattern(r.source) }));
const headerRules = config.headers.map((h) => ({ ...h, re: pattern(h.source) }));
const fill = (to, groups) => to.replace(/:(\w+)\*?/g, (m, k) => groups?.[k] ?? m);

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json|ld\+json)|image\/svg\+xml)/;
function send(req, res, status, headers, file) {
	const length = file ? statSync(file).size : 0;
	const zip = file && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && COMPRESSIBLE.test(String(headers['content-type'])) && length >= 1024 && req.method !== 'HEAD';
	res.writeHead(status, zip ? { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' } : { ...headers, 'content-length': length });
	if (!file || req.method === 'HEAD') return void res.end();
	if (zip) createReadStream(file).pipe(createGzip()).pipe(res);
	else createReadStream(file).pipe(res);
}

createServer((req, res) => {
	try {
		const url = new URL(req.url ?? '/', `http://localhost:${port}`);
		const path = decodeURIComponent(url.pathname);
		const moved = (status, location) => void res.writeHead(status, { location: location + url.search }).end();
		if (path.endsWith('.html')) return moved(308, path.replace(/(\/index)?\.html$/, '') || '/');
		for (const r of redirects) {
			const m = r.re.exec(path);
			if (m) return moved(r.permanent ? 308 : 307, fill(r.destination, m.groups));
		}
		const headers = {};
		for (const h of headerRules) if (h.re.test(path)) for (const { key, value } of h.headers) headers[key.toLowerCase()] = value;
		const file = (candidate) => {
			const at = join(root, candidate);
			return at.startsWith(root) && existsSync(at) && statSync(at).isFile() ? at : undefined;
		};
		const found = file(path) ?? (path.endsWith('/') ? file(join(path, 'index.html')) : file(`${path}.html`));
		if (found) return send(req, res, 200, { 'content-type': TYPES[extname(found)] ?? 'application/octet-stream', ...headers }, found);
		// Clean URLs without a trailing-slash rule, as Vercel answers them (checked live): `/x/` serves x.html and `/x` x/index.html, unmoved.
		const other = path.endsWith('/') ? (path === '/' ? undefined : file(`${path.slice(0, -1)}.html`)) : file(join(path, 'index.html'));
		if (other) return send(req, res, 200, { 'content-type': TYPES['.html'], ...headers }, other);
		send(req, res, 404, { 'content-type': TYPES['.html'] }, join(root, '404.html'));
	} catch (error) {
		res.writeHead(500).end(String(error?.stack ?? error));
	}
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));

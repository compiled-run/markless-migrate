// Serves a Vercel Build Output API directory locally: config redirects, then static files, then the Node server function,
// gzipped as `next start` serves the old side, so a slow-network check compares the two over the same encoding.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const [dir, port = '4700'] = process.argv.slice(2);
const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
const handler = (await import(pathToFileURL(join(dir, 'functions/__server.func/index.mjs')).href)).default;
const filesystemAt = config.routes.findIndex((r) => r.handle === 'filesystem');
const before = config.routes.slice(0, filesystemAt < 0 ? 0 : filesystemAt).filter((r) => r.src);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.ico': 'image/x-icon' };

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json|ld\+json)|image\/svg\+xml)/;
// Gzip what a browser accepts it for, as the compression middleware next start uses does (at least 1 kB, or of unknown length).
function send(req, res, status, headers, stream, length) {
	const type = String(headers['content-type'] ?? '');
	const zip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && COMPRESSIBLE.test(type) && !headers['content-encoding'] && (length === undefined || length >= 1024) && req.method !== 'HEAD';
	if (!zip) {
		res.writeHead(status, headers);
		return void (stream ? stream.pipe(res) : res.end());
	}
	const { 'content-length': _, ...rest } = headers;
	res.writeHead(status, { ...rest, 'content-encoding': 'gzip', vary: 'accept-encoding' });
	if (stream) stream.pipe(createGzip()).pipe(res);
	else res.end();
}

createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
		const path = decodeURIComponent(url.pathname);
		const headers = {};
		for (const r of before) {
			const m = new RegExp(`^${r.src}$`).exec(path);
			if (!m) continue;
			if (r.headers && !r.status) Object.assign(headers, r.headers);
			if (r.status && r.headers?.Location) {
				const location = r.headers.Location.replace(/\$(\d+)/g, (_, i) => m[Number(i)] ?? '').replace(/\$([a-zA-Z_]\w*)/g, (_, k) => m.groups?.[k] ?? '');
				return void res.writeHead(r.status, { location }).end();
			}
		}
		for (const candidate of [path, `${path}.html`, join(path, 'index.html')]) {
			const file = join(dir, 'static', candidate);
			if (file.startsWith(join(dir, 'static')) && existsSync(file) && statSync(file).isFile()) {
				return void send(req, res, 200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers }, createReadStream(file), statSync(file).size);
			}
		}
		const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req);
		const request = new Request(url, { method: req.method, headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])), body, duplex: 'half' });
		const response = await handler.fetch(request, { waitUntil: () => {} });
		const out = {};
		response.headers.forEach((v, k) => {
			if (k !== 'set-cookie') out[k] = v;
		});
		const cookies = response.headers.getSetCookie?.() ?? [];
		const length = out['content-length'] === undefined ? undefined : Number(out['content-length']);
		send(req, res, response.status, { ...out, ...(cookies.length ? { 'set-cookie': cookies } : {}) }, response.body ? Readable.fromWeb(response.body) : undefined, length);
	} catch (error) {
		res.writeHead(500).end(String(error?.stack ?? error));
	}
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}`));

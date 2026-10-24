// Serves a Vercel Build Output API directory locally: config redirects, then static files, then the Node server function.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const [dir, port = '4700'] = process.argv.slice(2);
const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
const handler = (await import(pathToFileURL(join(dir, 'functions/__server.func/index.mjs')).href)).default;
const filesystemAt = config.routes.findIndex((r) => r.handle === 'filesystem');
const before = config.routes.slice(0, filesystemAt < 0 ? 0 : filesystemAt).filter((r) => r.src);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.ico': 'image/x-icon' };

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
				res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers });
				return void createReadStream(file).pipe(res);
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
		res.writeHead(response.status, { ...out, ...(cookies.length ? { 'set-cookie': cookies } : {}) });
		if (response.body) Readable.fromWeb(response.body).pipe(res);
		else res.end();
	} catch (error) {
		res.writeHead(500).end(String(error?.stack ?? error));
	}
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}`));

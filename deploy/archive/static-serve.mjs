// A static build served as `docusaurus serve` serves it: clean URLs, index.html for directories, 404.html for the rest.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
const [dir, port] = process.argv.slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon', '.gif': 'image/gif', '.mp4': 'video/mp4', '.wasm': 'application/wasm' };
const file = (p) => existsSync(p) && statSync(p).isFile() ? p : undefined;
createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	const hit = file(join(dir, path)) ?? file(join(dir, `${path}.html`)) ?? file(join(dir, path, 'index.html'));
	if (!hit) { res.writeHead(404, { 'content-type': TYPES['.html'] }); return void createReadStream(join(dir, '404.html')).on('error', () => res.end()).pipe(res); }
	res.writeHead(200, { 'content-type': TYPES[extname(hit)] ?? 'application/octet-stream' });
	createReadStream(hit).pipe(res);
}).listen(Number(port), '127.0.0.1');

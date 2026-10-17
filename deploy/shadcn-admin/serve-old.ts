// Serves shadcn-admin's Vite build the way its netlify.toml does: files as they are, every other path gets index.html with status 200.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const dist = join(import.meta.dirname, 'old/dist');
const port = Number(process.argv[2] ?? 4410);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain' };

createServer(async (req, res) => {
	const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
	let file = join(dist, path);
	if (!(await stat(file).then((s) => s.isFile(), () => false))) file = join(dist, 'index.html');
	res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
	createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => process.stdout.write(`shadcn-admin (old) at http://127.0.0.1:${port}\n`));

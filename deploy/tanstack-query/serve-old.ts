// Serves the kitchen-sink Vite build as a single-page app host does: files as they are, every other path gets index.html with status 200.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const dist = join(process.env.MM_UPSTREAMS ?? join(import.meta.dirname, '../../../mm-upstreams'), 'kitchen-sink-react-query/dist');
const port = Number(process.argv[2] ?? 4520);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

createServer(async (req, res) => {
	const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
	let file = join(dist, path);
	if (!(await stat(file).then((s) => s.isFile(), () => false))) file = join(dist, 'index.html');
	res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
	createReadStream(file).pipe(res);
}).listen(port, process.env.HOST ?? '127.0.0.1', () => process.stdout.write(`kitchen sink (old) at http://127.0.0.1:${port}\n`));

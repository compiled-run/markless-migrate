// Serves Devtron's built panel (old/dist/extension) as the devtools host opens it, with the host's chrome.runtime stub
// (the new app's public/devtools-host.js, so both apps get the same 5,000 events) loaded first.
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const dist = join(import.meta.dirname, 'old/dist/extension');
const host = join(import.meta.dirname, '../../examples/ag-grid-markless/public/devtools-host.js');
const port = Number(process.argv[2] ?? 4480);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };

export function withHost(html: string): string {
	return html.replace('<script src="./react.js"></script>', '<script src="/devtools-host.js"></script><script src="./react.js"></script>');
}

createServer(async (req, res) => {
	const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
	if (path === '/devtools-host.js') {
		res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-cache' });
		return createReadStream(host).pipe(res);
	}
	const file = join(dist, path === '/' ? 'index.html' : path);
	if (!(await stat(file).then((s) => s.isFile(), () => false))) {
		res.writeHead(404, { 'content-type': 'text/plain' });
		return res.end('Not found');
	}
	res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
	if (file.endsWith('index.html')) return res.end(withHost(await readFile(file, 'utf8')));
	createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => process.stdout.write(`devtron panel (old) at http://127.0.0.1:${port}\n`));

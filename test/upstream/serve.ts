// The servers a suite's adapter needs:
//   node test/upstream/serve.ts static <dir> <port>    a built site, a directory's index.html for its path
//   node test/upstream/serve.ts stories <origin> <port> Storybook's iframe.html?id=components-<story> as <origin>/story/<story>/,
//                                                       every other request passed through; the same for the library and the port
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Readonly<Record<string, string>> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

export function storyPath(url: string): string {
	const at = new URL(url, 'http://x');
	const id = at.searchParams.get('id');
	if (at.pathname !== '/iframe.html' || !id?.startsWith('components-')) return url;
	return `/story/${id.slice('components-'.length)}/`;
}

const [mode, target, port] = process.argv.slice(2);
if (import.meta.main) {
	if (mode === 'static') {
		createServer(async (req, res) => {
			const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
			let file = join(target!, path);
			if (await stat(file).then((s) => s.isDirectory(), () => false)) file = join(file, 'index.html');
			if (!(await stat(file).then((s) => s.isFile(), () => false))) return res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
			res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
			createReadStream(file).pipe(res);
		}).listen(Number(port), '127.0.0.1');
	} else if (mode === 'stories') {
		const origin = new URL(target!);
		createServer((req, res) => {
			const upstream = request({ host: origin.hostname, port: origin.port, method: req.method, path: storyPath(req.url ?? '/'), headers: { ...req.headers, host: origin.host } }, (answer) => {
				res.writeHead(answer.statusCode ?? 502, answer.headers);
				answer.pipe(res);
			});
			upstream.on('error', () => res.writeHead(502).end());
			req.pipe(upstream);
		}).listen(Number(port), '127.0.0.1');
	} else {
		throw new Error('usage: serve.ts static <dir> <port> | stories <origin> <port>');
	}
}

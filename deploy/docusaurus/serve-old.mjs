// Serves the old site's build (fetch-old.sh) as its Vercel deployment's config.json routes it (build.ts old): `/` is index.html,
// then a file at the path or a folder's index.html (Vercel's filesystem step), then `/x` or `/x/` as x.html, else 404.html; gzipped as deploy/shadcn-ui/serve-vercel-output.mjs serves the port.
// node deploy/docusaurus/serve-old.mjs [port]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { createGzip } from 'node:zlib';

const port = Number(process.argv[2] ?? 4000);
const root = new URL('./old/static', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.xml': 'application/xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json|ld\+json)|image\/svg\+xml)/;

function send(req, res, status, file) {
	const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
	const length = statSync(file).size;
	const zip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && COMPRESSIBLE.test(type) && length >= 1024 && req.method !== 'HEAD';
	res.writeHead(status, zip ? { 'content-type': type, 'content-encoding': 'gzip', vary: 'accept-encoding' } : { 'content-type': type, 'content-length': length });
	if (req.method === 'HEAD') return void res.end();
	if (zip) createReadStream(file).pipe(createGzip()).pipe(res);
	else createReadStream(file).pipe(res);
}

createServer((req, res) => {
	try {
		const path = decodeURIComponent(new URL(req.url ?? '/', `http://localhost:${port}`).pathname);
		const file = (candidate) => {
			const at = join(root, candidate);
			return at.startsWith(root) && existsSync(at) && statSync(at).isFile() ? at : undefined;
		};
		const clean = /^\/(.+?)\/?$/.exec(path);
		const found = path === '/' ? file('index.html') : (file(path) ?? file(join(path, 'index.html')) ?? (clean ? file(`${clean[1]}.html`) : undefined));
		if (found) return send(req, res, 200, found);
		send(req, res, 404, join(root, '404.html'));
	} catch (error) {
		res.writeHead(500).end(String(error?.stack ?? error));
	}
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));

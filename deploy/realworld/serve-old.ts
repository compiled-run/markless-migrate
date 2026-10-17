// Serves the Angular build the way its _redirects does (every unknown path gets index.html with 200) and
// forwards /api to the RealWorld backend: `node deploy/realworld/serve-old.ts [port] [api-origin]`.
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { UPSTREAMS } from './paths.ts';

const port = Number(process.argv[2] ?? 4101);
const apiOrigin = (process.argv[3] ?? process.env.API_ORIGIN ?? 'http://127.0.0.1:4100').replace(/\/$/, '');
const root = join(UPSTREAMS, 'angular-realworld-example-app/dist/angular-conduit/browser');

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.png': 'image/png',
	'.json': 'application/json',
	'.txt': 'text/plain; charset=utf-8',
};

async function proxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string' && name !== 'host' && name !== 'connection') headers.set(name, value);
	const upstream = await fetch(`${apiOrigin}${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
	const out: Record<string, string> = {};
	upstream.headers.forEach((value, name) => {
		if (name !== 'content-encoding' && name !== 'content-length' && name !== 'transfer-encoding') out[name] = value;
	});
	res.writeHead(upstream.status, out);
	res.end(Buffer.from(await upstream.arrayBuffer()));
}

async function file(path: string): Promise<string | undefined> {
	const full = normalize(join(root, path));
	if (!full.startsWith(root)) return undefined;
	const info = await stat(full).catch(() => undefined);
	return info?.isFile() ? full : undefined;
}

createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? '/', 'http://local');
		if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await proxy(req, res);
		const found = await file(decodeURIComponent(url.pathname));
		const path = found ?? join(root, 'index.html');
		res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
		res.end(await readFile(path));
	} catch (error) {
		res.writeHead(502, { 'content-type': 'text/plain' });
		res.end(String(error));
	}
}).listen(port, process.env.HOST ?? '0.0.0.0', () => process.stdout.write(`old Conduit at http://127.0.0.1:${port}, API ${apiOrigin}\n`));

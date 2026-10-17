// Read-only caching mirror of a live site, so checks hit production once per URL: `node deploy/htmx-org/mirror.ts <origin> <port> <cache-dir>`.
// Only GET and HEAD are forwarded; every other method is answered 405 here and never reaches production.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';

const origin = new URL(process.argv[2] ?? 'https://htmx.org').origin;
const port = Number(process.argv[3] ?? '4410');
const cache = resolve(process.argv[4] ?? '.mirror');
const userAgent = 'markless-migrate/0.0 (URL-only migration demo; read-only cached mirror; contact me@jackshelton.com)';
const DROP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'strict-transport-security', 'alt-svc']);

interface Entry {
	status: number;
	headers: Record<string, string>;
}

let chain: Promise<unknown> = Promise.resolve();
let fetched = 0;
let served = 0;

async function upstream(path: string): Promise<{ entry: Entry; body: Buffer }> {
	const key = createHash('sha256').update(path).digest('hex').slice(0, 24);
	const meta = join(cache, `${key}.json`);
	const data = join(cache, `${key}.body`);
	const hit = await readFile(meta, 'utf8').catch(() => undefined);
	if (hit) return { entry: JSON.parse(hit) as Entry, body: await readFile(data) };
	const run = chain.then(async () => {
		const again = await readFile(meta, 'utf8').catch(() => undefined);
		if (again) return { entry: JSON.parse(again) as Entry, body: await readFile(data) };
		await new Promise((done) => setTimeout(done, 250));
		const response = await fetch(origin + path, { redirect: 'manual', headers: { 'user-agent': userAgent, accept: '*/*' } });
		const headers: Record<string, string> = {};
		response.headers.forEach((value, name) => {
			if (!DROP.has(name)) headers[name] = name === 'location' ? value.replace(origin, `http://127.0.0.1:${port}`) : value;
		});
		const body = Buffer.from(await response.arrayBuffer());
		const entry = { status: response.status, headers, path };
		fetched++;
		if (response.status < 500) {
			await writeFile(data, body);
			await writeFile(meta, JSON.stringify(entry));
		}
		return { entry, body };
	});
	chain = run.catch(() => undefined);
	return run;
}

await mkdir(cache, { recursive: true });
createServer(async (request, response) => {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.writeHead(405, { allow: 'GET, HEAD' }).end('read-only mirror');
		return;
	}
	try {
		const { entry, body } = await upstream(request.url ?? '/');
		served++;
		response.writeHead(entry.status, entry.headers);
		response.end(request.method === 'HEAD' ? undefined : body);
	} catch (error) {
		response.writeHead(502).end(String(error));
	}
}).listen(port, '127.0.0.1', () => process.stdout.write(`mirror of ${origin} at http://127.0.0.1:${port} (cache ${cache})\n`));

setInterval(() => process.stdout.write(`fetched ${fetched} from ${origin}, served ${served}\n`), 60_000).unref();

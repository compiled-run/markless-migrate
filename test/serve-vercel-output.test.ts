import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { brotliCompressSync } from 'node:zlib';

const SERVER = new URL('../deploy/shadcn-ui/serve-vercel-output.mjs', import.meta.url).pathname;
const CHUNK = `export const answer = ${JSON.stringify('x'.repeat(2048))};\n`;

// A Build Output directory as @markless/router writes it for Vercel: chunks beside brotli copies, routed by Accept-Encoding.
let dir: string;
let origin: string;
let child: ChildProcess;
before(async () => {
	dir = mkdtempSync(join(tmpdir(), 'serve-vercel-'));
	mkdirSync(join(dir, 'static/build'), { recursive: true });
	mkdirSync(join(dir, 'functions/__server.func'), { recursive: true });
	writeFileSync(join(dir, 'static/build/chunk-a.js'), CHUNK);
	writeFileSync(join(dir, 'static/build/chunk-a.js.br'), brotliCompressSync(CHUNK));
	writeFileSync(join(dir, 'functions/__server.func/index.mjs'), "export default { fetch: (r) => new Response('page ' + new URL(r.url).pathname, { headers: { 'content-type': 'text/html' } }) };\n");
	writeFileSync(
		join(dir, 'config.json'),
		JSON.stringify({
			version: 3,
			routes: [
				{ src: '^/build/(.+\\.js)$', has: [{ type: 'header', key: 'accept-encoding', value: '.*\\bbr\\b.*' }], dest: '/build/$1.br', headers: { 'content-encoding': 'br', 'content-type': 'text/javascript; charset=utf-8', vary: 'Accept-Encoding' } },
				{ src: '/build/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
				{ handle: 'filesystem' },
				{ src: '/(.*)', dest: '/__server' },
			],
		}),
	);
	const port = await new Promise<number>((done) => {
		const s = createServer().listen(0, '127.0.0.1', () => {
			const p = (s.address() as { port: number }).port;
			s.close(() => done(p));
		});
	});
	origin = `http://127.0.0.1:${port}`;
	child = spawn(process.execPath, [SERVER, dir, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
	await new Promise<void>((done, fail) => {
		child.stdout!.on('data', (d) => String(d).includes('serving') && done());
		child.on('exit', (code) => fail(new Error(`server exited ${code}`)));
	});
});
after(() => {
	child?.kill();
	rmSync(dir, { recursive: true, force: true });
});

const raw = async (path: string, encoding: string) => {
	const res = await fetch(origin + path, { headers: { 'accept-encoding': encoding } });
	// fetch decodes the body by its content-encoding, and fails when the body is not in it, as the browser does.
	return { headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
};

test('a chunk asked for with brotli is the brotli copy the route names, so the browser can decode what content-encoding says', async () => {
	const { headers, body } = await raw('/build/chunk-a.js', 'gzip, deflate, br');
	assert.equal(headers.get('content-type'), 'text/javascript; charset=utf-8');
	assert.equal(body.toString(), CHUNK);
});

test('a chunk asked for without brotli is the plain file, gzipped as next start would, with no brotli header', async () => {
	const { headers, body } = await raw('/build/chunk-a.js', 'gzip');
	assert.equal(body.toString(), CHUNK);
	assert.equal(headers.get('cache-control'), 'public, max-age=31536000, immutable');
	assert.ok(!/br/.test(headers.get('content-encoding') ?? ''));
});

test('a page still reaches the server function', async () => {
	const { body } = await raw('/docs/x/', 'br');
	assert.equal(body.toString(), 'page /docs/x/');
});

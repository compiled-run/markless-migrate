import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { previousFilesGone } from '../src/cache/skew.ts';

// Two deployments of one app. The previous one's page names a stylesheet and an entry chunk, which imports a chunk
// statically and one on use; the next deployment rebuilt the stylesheet and the on-use chunk under new names.
function serve(files: Record<string, string>): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const body = files[path];
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html' }).end(body);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}
const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));
const at = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

test("a file the previous deployment's pages load, at once or on use, that the next deployment no longer serves is reported", async () => {
	const page = '<!doctype html><link rel="stylesheet" href="/_converted/styles/a1.css"><link rel="modulepreload" href="/build/entry-1.js"><script type="module" src="/build/entry-1.js"></script><a href="https://elsewhere.example/x.js">x</a>';
	const previous = await serve({ '/docs/': page, '/_converted/styles/a1.css': 'h1{}', '/build/entry-1.js': 'import "./shared-1.js"; export const open = () => import("./modal-1.js");', '/build/shared-1.js': '', '/build/modal-1.js': '' });
	const next = await serve({ '/docs/': page.replace('a1.css', 'b2.css'), '/_converted/styles/b2.css': 'h1{}', '/build/entry-1.js': 'import "./shared-1.js";', '/build/shared-1.js': '', '/build/modal-2.js': '' });
	servers.push(previous, next);
	const gone = await previousFilesGone(at(previous), at(next), ['/docs/']);
	assert.deepEqual(gone.map((g) => [g.route, g.path, g.status]).sort(), [
		['/docs/', '/_converted/styles/a1.css', 404],
		['/docs/', '/build/modal-1.js', 404],
	]);
	assert.deepEqual(await previousFilesGone(at(next), at(next), ['/docs/']), [], 'a deployment serves every file of its own pages');
});

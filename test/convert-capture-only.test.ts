// convert --capture-only: the old pages are captured into .migrate/convert and no page is written; a later full convert
// of the same app takes its pages from those captures without loading them from the old site again.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { convert } from '../src/convert/index.ts';

const PAGES: Record<string, string> = {
	'/': '<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1><a href="/about">About</a></main></body></html>',
	'/about': '<!doctype html><html lang="en"><head><title>About</title></head><body><main><h1>About</h1><a href="/">Home</a></main></body></html>',
};

let server: Server;
let origin: string;
const loads: string[] = [];
before(async () => {
	server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const page = PAGES[path];
		// A browser's load: the plain request convert keys a page's recordings with is not one.
		if (page && req.headers['user-agent'] !== 'node') loads.push(path);
		res.writeHead(page ? 200 : 404, { 'content-type': 'text/html' }).end(page ?? '<!doctype html><title>Not found</title>');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('convert --capture-only captures every route and writes no page; the full convert after it loads no page again', async () => {
	const app = await mkdtemp(join(tmpdir(), 'capture-only-'));
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: Object.keys(PAGES).map((route) => ({ route, status: 200 })) }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'capture-only', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		const only = Object.keys(PAGES);
		const captured = await convert({ old: origin, app, only, reveal: false, captureOnly: true });
		assert.deepEqual(captured.routes, []);
		assert.equal(existsSync(join(app, 'pages')), false, 'no page is written');
		assert.equal((await readdir(join(app, '.migrate', 'convert', 'captures'))).length, only.length);
		const before = loads.length;
		assert.ok(before >= only.length);
		const report = await convert({ old: origin, app, only, reveal: false });
		assert.deepEqual(report.routes.map((r) => r.route).sort(), [...only].sort());
		assert.equal(loads.length, before, 'every page came from the captures');
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

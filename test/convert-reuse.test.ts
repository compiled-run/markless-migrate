// `markless-migrate dev` converts a few routes again and again into an app that already holds their static files and
// server: what is on disk is not fetched or written again.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { copyAssets } from '../src/convert/assets.ts';
import { keepRouting } from '../src/convert/endpoints.ts';

test('with reuse, an asset already on disk is read from it, and what a stylesheet there pulls in is still copied', async () => {
	const fetched: string[] = [];
	const files: Record<string, [string, string]> = { '/s.css': ['text/css', 'body{background:url(/bg.png)}'], '/bg.png': ['image/png', 'png'], '/a.js': ['text/javascript', 'a'] };
	const server = createServer((req, res) => {
		fetched.push(req.url!);
		const file = files[req.url!];
		res.writeHead(file ? 200 : 404, { 'content-type': file?.[0] ?? 'text/plain' }).end(file?.[1] ?? '');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'reuse-assets-'));
	try {
		await writeFile(join(dir, 's.css'), 'body{background:url(/bg.png)}');
		const reused = await copyAssets(origin, ['/s.css', '/a.js'], dir, undefined, true);
		assert.deepEqual(fetched.sort(), ['/a.js', '/bg.png']);
		assert.deepEqual(reused.copied.map((c) => c.path).sort(), ['/a.js', '/bg.png', '/s.css']);
		assert.equal(await readFile(join(dir, 'bg.png'), 'utf8'), 'png');
		fetched.length = 0;
		await copyAssets(origin, ['/s.css', '/a.js'], dir);
		assert.deepEqual(fetched.sort(), ['/a.js', '/bg.png', '/s.css'], 'without reuse every asset is fetched again');
	} finally {
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test("with reuse, the app's routing middleware is kept as written and only learns the pages it renders now", async () => {
	const app = await mkdtemp(join(tmpdir(), 'reuse-routing-'));
	try {
		assert.equal(await keepRouting(app, ['/a']), false, 'none to keep: convert writes it');
		await mkdir(join(app, 'server'), { recursive: true });
		const handlers = `import * as handler0 from './handlers/app/api/search/route.ts';\n`;
		await writeFile(join(app, 'server', 'routing.ts'), `${handlers}const PAGES = new Set<string>(["/docs/b","/docs/a"]);\nconst OTHER = 1;\n`);
		assert.equal(await keepRouting(app, ['/docs/c', '/$&']), true);
		assert.equal(await readFile(join(app, 'server', 'routing.ts'), 'utf8'), `${handlers}const PAGES = new Set<string>(["/docs/c","/$&"]);\nconst OTHER = 1;\n`);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

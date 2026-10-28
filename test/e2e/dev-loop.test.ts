import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { dev } from '../../src/dev/index.ts';
import { ROOT } from './harness.ts';

const SITE = join(ROOT, 'fixtures/convert-compiles');
// A Markless app's packages, installed in another folder: an app in a scratch worktree links its node_modules there.
const PACKAGES = join(ROOT, 'fixtures/dev-loop/node_modules');

test("dev converts a route and serves it on Markless's dev server when the app's node_modules links to another worktree's", { timeout: 600_000 }, async () => {
	const server = createServer(async (req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const body = await readFile(join(SITE, path.endsWith('/') ? `${path}index.html` : path)).catch(() => undefined);
		res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(body ?? '<!DOCTYPE html><title>Not found</title><h1>Not found</h1>');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const old = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
	// Outside this repository, so no workspace root above the app reaches the packages' real folder.
	const root = await mkdtemp(join(tmpdir(), 'mm-dev-loop-'));
	const app = join(root, 'app');
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin: old, routes: [{ route: '/', status: 200 }, { route: '/b/', status: 200 }] }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'scratch', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, 'vite.config.ts'), "import { markless } from '@markless/core/vite';\nimport { router } from '@markless/router/vite';\nimport { defineConfig } from 'vite-plus';\n\nexport default defineConfig({ plugins: [markless(), router()] });\n");
		await symlink(PACKAGES, join(app, 'node_modules'));
		const lines: string[] = [];
		const code = await dev({ app, route: ['/'], old, noProbes: true, log: (line) => lines.push(line) });
		const said = lines.join('\n');
		assert.equal(code, 0, said);
		assert.match(said, /dev server answers http:\/\/localhost:\d+\/ after/);
		assert.doesNotMatch(said, /does not load on the port/);
	} finally {
		server.close();
		await rm(root, { recursive: true, force: true });
	}
});

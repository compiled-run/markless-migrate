import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { compileTsrxModule, collectTsrxModuleDiagnostics } from '@markless/compiler';
import { convert } from '../../src/convert/index.ts';

const SITE = join(import.meta.dirname, '../../fixtures/convert-compiles');
const ROUTES = ['/', '/b/'];

async function tsrxFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true });
	return entries.filter((e) => e.isFile() && e.name.endsWith('.tsrx') && !e.parentPath.includes('node_modules')).map((e) => join(e.parentPath, e.name));
}

// What convert writes must compile: a converter change that ships a module Markless rejects goes red here, before merge.
test('every module convert writes for two pages sharing a stateful header compiles with Markless, with no error diagnostics', { timeout: 600_000 }, async () => {
	const server = createServer(async (req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const file = join(SITE, path.endsWith('/') ? `${path}index.html` : path);
		const body = await readFile(file).catch(() => undefined);
		res.writeHead(body ? 200 : 404, { 'content-type': !body || file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(body ?? '<!DOCTYPE html><title>Not found</title><h1>Not found</h1>');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	try {
		const app = await mkdtemp(join(tmpdir(), 'mm-convert-compiles-'));
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ routes: ROUTES.map((route) => ({ route, status: 200 })) }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'converted', private: true, type: 'module', dependencies: {} }));
		const report = await convert({ old: `http://127.0.0.1:${port}`, app, concurrency: 2 });
		for (const route of ROUTES) assert.ok(report.routes.some((r) => r.route === route), route);
		const files = await tsrxFiles(app);
		const shared = files.filter((f) => f.includes(join('components', 'converted')));
		assert.ok(shared.length > 0, 'the header both pages render is one shared component');
		const errors: string[] = [];
		for (const file of files) {
			const result = await compileTsrxModule({ filename: relative(app, file), source: await readFile(file, 'utf8'), symbols: [] });
			for (const d of collectTsrxModuleDiagnostics(result)) if (d.severity === 'error') errors.push(`${relative(app, file)}: ${d.code}: ${d.message}`);
		}
		assert.deepEqual(errors, []);
		assert.ok((await Promise.all(shared.map((f) => readFile(f, 'utf8')))).some((s) => /\bstate\(/.test(s)), 'the switch inside it keeps its state');
	} finally {
		server.close();
	}
});

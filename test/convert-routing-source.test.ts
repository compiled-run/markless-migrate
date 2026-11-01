import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { writeRouting } from '../src/convert/endpoints.ts';

test('--source may be a directory without a package.json of its own (an app inside a monorepo package)', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-routing-source-'));
	try {
		const app = join(dir, 'app');
		const source = join(dir, 'examples');
		await mkdir(app, { recursive: true });
		await mkdir(source, { recursive: true });
		const routing = await writeRouting({ app, source, old: 'http://127.0.0.1:1', endpoints: [], redirects: [], builtPaths: [], pages: ['/'] });
		assert.deepEqual(routing.ports, []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

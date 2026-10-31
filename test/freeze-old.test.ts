// The shadcn old site is served as built: no prerendered route revalidates, so two loads of one route answer the same
// HTML and its recording key holds, and a fixture answers the third-party data its build renders.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('freeze-old turns every revalidating prerendered route static and leaves static ones alone', async () => {
	const app = await mkdtemp(join(tmpdir(), 'freeze-old-'));
	try {
		await mkdir(join(app, '.next'));
		await writeFile(join(app, '.next', 'prerender-manifest.json'), JSON.stringify({ version: 4, routes: { '/a': { initialRevalidateSeconds: 86400 }, '/b': { initialRevalidateSeconds: false }, '/c': { initialRevalidateSeconds: 300 } }, dynamicRoutes: {} }));
		const said = execFileSync(process.execPath, ['deploy/shadcn-ui/freeze-old.mjs', app], { encoding: 'utf8' });
		assert.match(said, /2 of 3 prerendered routes no longer revalidate/);
		const routes = JSON.parse(await readFile(join(app, '.next', 'prerender-manifest.json'), 'utf8')).routes as Record<string, { initialRevalidateSeconds: number | false }>;
		assert.deepEqual(Object.values(routes).map((r) => r.initialRevalidateSeconds), [false, false, false]);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

test("the old site's fetch of a fixtured URL is answered from the fixture, every time", () => {
	const script = "for (let i = 0; i < 2; i++) { const r = await fetch('https://api.github.com/repos/shadcn-ui/ui?x=1'); console.log(r.status, (await r.json()).stargazers_count); }";
	const out = execFileSync(process.execPath, ['--import', './deploy/shadcn-ui/old-fixtures.mjs', '--input-type=module', '-e', script], { encoding: 'utf8' });
	assert.deepEqual(out.trim().split('\n'), ['200 127002', '200 127002']);
});

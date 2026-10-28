import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const probe = new URL('../scripts/probe/dead-controls.mjs', import.meta.url).pathname;

test('the dead-controls probe dev runs is in the checkout, parses, and imports only packages this repository has', async () => {
	assert.equal(spawnSync(process.execPath, ['--check', probe]).status, 0);
	const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	const has = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
	for (const [, name] of (await readFile(probe, 'utf8')).matchAll(/^import .* from '([^.'][^']*)';$/gm)) if (!name!.startsWith('node:')) assert.ok(has.has(name!), name);
});

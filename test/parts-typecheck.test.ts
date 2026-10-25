import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PART_DEPENDENCIES, writeParts } from '../src/convert/parts.ts';

// `pnpm typecheck` checks parts/ against the packages convert adds to an app and stand-ins for the modules it generates.
const root = new URL('../', import.meta.url);

test('parts typecheck against the versions of the packages convert adds to an app', async () => {
	const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	for (const [name, version] of Object.entries(PART_DEPENDENCIES)) assert.equal(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name], version, name);
});

test("the typecheck's stand-in for choices.ts declares the type convert generates", async () => {
	const app = await mkdtemp(join(tmpdir(), 'parts-typecheck-'));
	try {
		await writeFile(join(app, 'package.json'), '{}');
		await writeParts(app, new Set(['cmdk']));
		const declaration = (source: string) => source.match(/^export const CHOICES[^=]*/m)?.[0];
		const generated = await readFile(join(app, 'lib', 'parts', 'choices.ts'), 'utf8');
		const standIn = await readFile(new URL('test/parts-env/choices.ts', root), 'utf8');
		assert.ok(declaration(generated));
		assert.equal(declaration(standIn), declaration(generated));
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

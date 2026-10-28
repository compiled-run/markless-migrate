import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('each port written alone carries every parts module it imports, so a page using only it builds', async () => {
	const { PORTS } = await import('../src/convert/parts.ts');
	const { existsSync } = await import('node:fs');
	const { dirname } = await import('node:path');
	const missing: string[] = [];
	for (const port of PORTS) {
		const app = await mkdtemp(join(tmpdir(), 'parts-closure-'));
		try {
			await writeFile(join(app, 'package.json'), '{}');
			const { files } = await writeParts(app, new Set([port.module]));
			for (const file of files) {
				const source = await readFile(join(app, 'lib', 'parts', file), 'utf8');
				for (const m of source.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+'(\.{1,2}\/[^']+\.ts)'/gm)) {
					const target = join(dirname(join(app, 'lib', 'parts', file)), m[1]!);
					if (!existsSync(target) && !target.endsWith('/choices.ts')) missing.push(`${port.module}: ${file} imports ${m[1]}`);
				}
			}
		} finally {
			await rm(app, { recursive: true, force: true });
		}
	}
	assert.deepEqual(missing, []);
});

test("a part a site component imports is copied though no page's ports use it, with what it imports in turn", async () => {
	const app = await mkdtemp(join(tmpdir(), 'parts-site-'));
	try {
		await writeFile(join(app, 'package.json'), '{}');
		await mkdir(join(app, 'lib', 'site', 'nested'), { recursive: true });
		await writeFile(join(app, 'lib', 'site', 'list.tsrx'), "import { showRendered } from '../parts/base-ui/tooltip.ts';\nexport default function List() @{ <p /> }\n");
		await writeFile(join(app, 'lib', 'site', 'nested', 'helper.ts'), "export { openRendered } from '../../parts/base-ui/dialog.ts';\n");
		const { files } = await writeParts(app, new Set(['cmdk']));
		for (const file of ['base-ui/tooltip.ts', 'base-ui/popup.ts', 'base-ui/dialog.ts']) assert.ok(files.includes(file), `${file} in ${files.join(', ')}`);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

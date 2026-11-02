// check --reuse keys a route's result by the checker's version: the code the check command runs, by its module graph.
import assert from 'node:assert/strict';
import { appendFile, cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../src/code-closure.ts';

// The repository's own code, copied, so each of its files can be edited in turn without touching the checkout.
async function copyRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'checker-version-'));
	for (const path of ['src', 'parts', 'package.json']) await cp(join(ROOT, path), join(root, path), { recursive: true });
	await symlink(join(ROOT, 'node_modules'), join(root, 'node_modules'));
	return root;
}

test("editing any module of the check command's graph changes the checker's version; the converter, another command and a part's code do not", async () => {
	const root = await copyRepo();
	try {
		const ship = (await import(pathToFileURL(join(root, 'src/check/ship-key.ts')).href)) as typeof import('../src/check/ship-key.ts');
		const copy = (await import(pathToFileURL(join(root, 'src/code-closure.ts')).href)) as typeof import('../src/code-closure.ts');
		const base = await ship.checkerVersion();
		assert.equal(await ship.checkerVersion(), base);
		const { closure, text } = await ship.checkerClosure();
		assert.deepEqual(closure.unresolved, []);
		const key = await copy.keyOf(closure, { 'check command': text });
		assert.equal(key, base);
		for (const file of closure.files) {
			const before = await readFile(file);
			await appendFile(file, '\n');
			assert.notEqual(await copy.keyOf(closure, { 'check command': text }), key, `${relative(root, file)} is keyed`);
			await writeFile(file, before);
		}
		const edit = async (file: string, change: (text: string) => string) => {
			const before = await readFile(join(root, file), 'utf8');
			await writeFile(join(root, file), change(before));
			const v = await ship.checkerVersion();
			await writeFile(join(root, file), before);
			return v;
		};
		for (const file of ['src/check/run.ts', 'src/check/motion.ts', 'src/check/record-server.cjs', 'src/check/journeys.ts', 'src/source/js.ts', 'src/overrides.ts', 'src/convert/app-parts.ts']) assert.notEqual(await edit(file, (t) => `${t}\n`), base, `${file} is the checker's`);
		for (const file of ['src/convert/index.ts', 'src/convert/reveal.ts', 'src/convert/parts.ts', 'src/plan/command.ts']) assert.equal(await edit(file, (t) => `${t}\n`), base, `${file} is not the checker's`);
		assert.equal(await edit('src/cli.ts', (t) => t.replace("case 'plan':", "case 'plan':\n\t\t\tvoid 0;")), base, "another command's branch");
		assert.notEqual(await edit('src/cli.ts', (t) => t.replace("case 'check': {", "case 'check': {\n\t\t\tvoid 0;")), base, "the check command's branch");
		assert.equal(await edit('parts/cmdk.ts', (t) => `${t}\nexport const unused = 1;\n`), base, 'a part whose selectors are the same');
		assert.notEqual(await edit('parts/cmdk.ts', (t) => `${t}\nexport const SELECTOR_X = '[data-new-part-attribute]';\n`), base, 'a part with a new selector');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

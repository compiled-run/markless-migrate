import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PRODUCERS } from '../src/data/original/lock.ts';
import { declarationClosure, declarationKey } from '../src/declaration-closure.ts';

async function tree(files: Record<string, string>): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-decl-'));
	for (const [name, text] of Object.entries(files)) {
		await mkdir(join(dir, name, '..'), { recursive: true });
		await writeFile(join(dir, name), text);
	}
	return dir;
}

const recorder = {
	'rec.ts': `import { capture } from './capture.ts';\nimport * as fmt from './fmt.ts';\nimport type { Shape } from './types.ts';\nexport async function record(url: string): Promise<Shape> { return { at: fmt.stamp(), page: await capture(url) }; }\n`,
	'capture.ts': `export { capture } from './inner.ts';\nexport function judge(a: string, b: string) { return a === b ? 'same' : 'differs'; }\n`,
	'inner.ts': `const LIMIT = 3;\nconst UNREAD = expensive();\nfunction expensive() { return 1; }\nexport async function capture(url: string) { return url.slice(0, LIMIT); }\n`,
	'fmt.ts': `export const stamp = () => 'now';\nexport const other = () => 'other';\n`,
	'types.ts': `export interface Shape { at: string; page: string }\n`,
	'judge.ts': `import { judge } from './capture.ts';\nexport const verdict = (a: string, b: string) => judge(a, b);\n`,
};

test('the closure of a producer reaches what it calls through imports, re-exports and namespaces, and leaves out code it never reaches', async () => {
	const dir = await tree(recorder);
	const { units, unresolved } = await declarationClosure([{ file: join(dir, 'rec.ts'), names: ['record'] }]);
	assert.deepEqual(unresolved, []);
	const names = units.map((u) => u.replace(/^.*\/(\w+\.ts):\d+ /, '$1 '));
	for (const reached of ['rec.ts record', 'inner.ts capture', 'inner.ts LIMIT', 'fmt.ts stamp', 'fmt.ts other']) assert.ok(names.includes(reached), `${reached} in ${names.join(', ')}`);
	for (const left of ['capture.ts judge', 'judge.ts verdict', 'inner.ts UNREAD', 'inner.ts expensive']) assert.ok(!names.includes(left), `${left} left out`);
});

test('a judge-only edit leaves the producer digest alone; an edit to code the producer runs moves it', async () => {
	const dir = await tree(recorder);
	const key = () => declarationKey([{ file: join(dir, 'rec.ts'), names: ['record'] }]);
	const before = await key();
	await writeFile(join(dir, 'capture.ts'), recorder['capture.ts'].replace("'differs'", "'differs now'"));
	await writeFile(join(dir, 'judge.ts'), recorder['judge.ts'].replace('judge(a, b)', 'judge(b, a)'));
	assert.equal(await key(), before, 'comparison code changed, producing code did not');
	await writeFile(join(dir, 'inner.ts'), recorder['inner.ts'].replace('LIMIT = 3', 'LIMIT = 4'));
	assert.notEqual(await key(), before, 'a constant the producer reads changed');
});

test('a load from a computed path takes in every file it could load, so an edit to any of them moves the digest', async () => {
	const dir = await tree({ 'rec.ts': `export async function record(name: string) { return import(\`./\${name}.ts\`); }\n`, 'one.ts': 'export const a = 1;\n' });
	const key = () => declarationKey([{ file: join(dir, 'rec.ts'), names: ['record'] }]);
	const before = await key();
	await writeFile(join(dir, 'one.ts'), 'export const a = 2;\n');
	assert.notEqual(await key(), before);
});

test("the original's producers reach explore and capture, not the comparisons or the timing phases", async () => {
	const loads = (await declarationClosure(PRODUCERS.loads)).units.join('\n');
	const journeys = await declarationClosure(PRODUCERS.journeys);
	assert.match(loads, /capture\.ts:\d+ captureRoute\n/);
	assert.match(journeys.units.join('\n'), /journeys\.ts:\d+ explore\n/);
	for (const judge of ['compareJourneys', 'compareRoute', 'HINTS', 'observeMotion', 'checkResponsiveness', 'observeProbes', 'retime']) {
		assert.doesNotMatch(loads, new RegExp(` ${judge}\\n`), `loads reach ${judge}`);
		assert.doesNotMatch(journeys.units.join('\n'), new RegExp(` ${judge}\\n`), `journeys reach ${judge}`);
	}
	assert.deepEqual(journeys.unresolved, []);
});

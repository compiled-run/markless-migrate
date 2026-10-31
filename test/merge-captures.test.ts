// The emit's merge of the capture shards' recordings keeps a file two shards wrote alike once, and refuses one they wrote differently.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { mergeCaptures } from '../scripts/merge-captures.ts';

const put = async (root: string, files: Record<string, string>) => {
	for (const [rel, text] of Object.entries(files)) {
		await mkdir(dirname(join(root, rel)), { recursive: true });
		await writeFile(join(root, rel), text);
	}
};

test('shards that wrote a file alike merge, and shards that wrote it differently are named', async () => {
	const root = await mkdtemp(join(tmpdir(), 'merge-captures-'));
	try {
		await put(join(root, 'a'), { 'captures/k1/page.json': '1', 'choices/k9/palette-14b00638.shown.json': '{"Typography":{"href":"/docs/typeset"}}' });
		await put(join(root, 'b'), { 'captures/k2/page.json': '2', 'choices/k9/palette-14b00638.shown.json': '{"Typography":{"href":"/docs/typeset"}}' });
		const alike = await mergeCaptures(join(root, 'out'), [join(root, 'a'), join(root, 'b')]);
		assert.deepEqual(alike, { files: 3, disagreements: [] });
		assert.equal(await readFile(join(root, 'out', 'captures/k2/page.json'), 'utf8'), '2');
		await put(join(root, 'c'), { 'choices/k9/palette-14b00638.shown.json': '{"Typography":{"href":"/docs/components/radix/typography"}}' });
		const differ = await mergeCaptures(join(root, 'out2'), [join(root, 'a'), join(root, 'b'), join(root, 'c')]);
		assert.deepEqual(differ.disagreements, [{ file: 'choices/k9/palette-14b00638.shown.json', shards: [`${join(root, 'a')},${join(root, 'b')}`, join(root, 'c')] }]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("one control's options recorded under two pages' keys must agree too: a site-wide palette is the same on every page", async () => {
	const root = await mkdtemp(join(tmpdir(), 'merge-captures-'));
	try {
		await put(join(root, 'a'), { 'choices/home/palette-c1bbdbca.shown.json': '{"Accordion":{}}', 'choices/home/menu-r1.chosen.json': '{"x":{}}' });
		await put(join(root, 'b'), { 'choices/blocks/palette-c1bbdbca.shown.json': '{"Accordion":{"href":"/docs/components/base/accordion"}}', 'choices/blocks/menu-r1.chosen.json': '{"y":{}}' });
		const { disagreements } = await mergeCaptures(join(root, 'out'), [join(root, 'a'), join(root, 'b')]);
		assert.deepEqual(disagreements, [{ file: 'choices/*/palette-c1bbdbca.shown.json', shards: [`${join(root, 'a')} (choices/home/palette-c1bbdbca.shown.json)`, `${join(root, 'b')} (choices/blocks/palette-c1bbdbca.shown.json)`] }]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

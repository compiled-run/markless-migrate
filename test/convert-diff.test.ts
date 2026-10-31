import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalIds, compareConverts } from '../scripts/convert-diff.ts';

test('generated ids are numbered by first occurrence, so a consistent renaming compares equal and a changed pairing does not', () => {
	assert.equal(canonicalIds('<b id="radix-_r_6_" aria-controls="_R_3mb_"></b><i for="radix-_r_6_">'), canonicalIds('<b id="radix-_r_gm_" aria-controls="_R_9x_"></b><i for="radix-_r_gm_">'));
	assert.notEqual(canonicalIds('<b id=":r1:"></b><i for=":r1:">'), canonicalIds('<b id=":r1:"></b><i for=":r2:">'));
	assert.equal(canonicalIds('react-aria2693073801-_r_l_ react-aria-12 «r3»'), 'react-aria2693073801-ID0 ID1 ID2');
	assert.equal(canonicalIds('<b aria-controls="radix-_r_gr_"></b><i id="radix-_r_gr_">'), canonicalIds('<b aria-controls="mm-2cd2f0e1-7"></b><i id="mm-2cd2f0e1-7">'), 'a Radix id the converter renamed after a collision is the same id');
	assert.equal(canonicalIds("import Layer141 from './layers/layer-141.tsrx'; <Layer6 />"), canonicalIds("import Layer144 from './layers/layer-144.tsrx'; <Layer6 />"), 'layer components renumbered alike');
});

test('converts are compared file by file against any reference: renamed ids match, content-hashed names are a set, other changes are listed', async () => {
	const root = await mkdtemp(join(tmpdir(), 'convert-diff-'));
	try {
		const app = async (name: string, files: Record<string, string>) => {
			for (const [path, text] of Object.entries(files)) {
				await mkdir(join(root, name, path, '..'), { recursive: true });
				await writeFile(join(root, name, path), text);
			}
			return join(root, name);
		};
		const a = await app('a', { 'pages/x.tsrx': '<b id="_r_1_">x</b>', 'public/_converted/layers/0123456789abcdef.html': '<p id="_r_2_">', '.migrate/convert/reveals/k.json': JSON.stringify({ route: '/', reveals: [{ key: 'radix-_r_0_' }, { key: 'radix-_r_0_' }] }) });
		const b = await app('b', { 'pages/x.tsrx': '<b id="_r_9_">x</b>', 'public/_converted/layers/fedcba9876543210.html': '<p id="_r_7_">', '.migrate/convert/reveals/k.json': JSON.stringify({ route: '/', reveals: [{ key: 'radix-_r_0_' }, { key: 'radix-_r_5_' }] }) });
		assert.deepEqual(compareConverts(b, [a]), { files: 3, renamed: [], idsOnly: [] });
		const keyed = await app('keyed', { 'pages/x.tsrx': '<b id="_r_9_">x</b>', 'public/_converted/layers/fedcba9876543210.html': '<p id="_r_7_">', '.migrate/convert/reveals/di-qJuCSGcUBLlEUchNdd8juBcRINbbcUypnW83jyXo/k.json': JSON.stringify({ route: '/', reveals: [{ key: 'radix-_r_0_' }, { key: 'radix-_r_5_' }] }) });
		assert.deepEqual(compareConverts(keyed, [a]), { files: 3, renamed: [], idsOnly: [] }, 'a recording under its route key is the same file');
		const c = await app('c', { 'pages/x.tsrx': '<b id="_r_9_">y</b>', 'public/_converted/layers/fedcba9876543210.html': '<p id="_r_7_">', '.migrate/convert/reveals/k.json': '{"route":"/","reveals":[]}' });
		assert.deepEqual(compareConverts(c, [a]), { files: 3, renamed: ['.migrate/convert/reveals/k.json', 'pages/x.tsrx'], idsOnly: [] });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

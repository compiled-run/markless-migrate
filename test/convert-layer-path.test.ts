import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { publicHashedAssets } from '../src/cache/apply.ts';
import { LAYER_FILL, layerTable, SERVED_LAYER_BYTES } from '../src/convert/document.ts';

test('a served layer is a directory index fetched by its directory URL, which no static host answers with a redirect', () => {
	const fill = `<div>${'x'.repeat(SERVED_LAYER_BYTES)}</div>`;
	const table = layerTable(new Map([['/', [{ key: 'palette', markup: fill, shell: `<div data-mm-layer="palette" data-src="${LAYER_FILL}"></div>`, fill }]]]));
	assert.equal(table.served.length, 1);
	const { path } = table.served[0]!;
	assert.match(path, /^\/_converted\/layers\/[0-9a-f]{16}\/$/);
	const source = table.files[0]!.source;
	assert.ok(source.includes(`data-mm-layer-src="${path}"`), source);
	assert.ok(source.includes(`href="${path}"`), 'its preload names the same URL');
	assert.ok(!source.includes('.html'), source);
});

test('layer directory indexes are kept by browsers for a year under one rule', async () => {
	const app = await mkdtemp(join(tmpdir(), 'mm-layer-cache-'));
	try {
		for (const file of ['_converted/layers/3d5bbe6acaa7b123/index.html', '_converted/layers/4854a8c8888f7fb3/index.html', 'logo.svg']) {
			await mkdir(dirname(join(app, 'public', file)), { recursive: true });
			await writeFile(join(app, 'public', file), 'x');
		}
		assert.deepEqual(await publicHashedAssets(app, { hashedAssets: [] }), ['/_converted/layers/**']);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

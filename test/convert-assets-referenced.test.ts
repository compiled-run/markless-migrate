// convert copies the old page's resources byte for byte, then keeps only those the written pages and their stylesheets
// still reference: the old framework's scripts and the full sheets a cut sheet replaced are not shipped.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { pruneUnreferenced, referencedAssets } from '../src/convert/assets.ts';
import type { Element } from '../src/convert/dom.ts';

const ORIGIN = 'https://old.example';

async function files(dir: string): Promise<string[]> {
	return (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(dir.length)).sort();
}

test('the assets a page references are its markup\'s, its head\'s and what its stylesheets pull in through url() and @import', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-assets-'));
	try {
		await mkdir(join(dir, '_next', 'static', 'chunks'), { recursive: true });
		await writeFile(join(dir, '_next', 'static', 'chunks', 'a.used-1.css'), '@import "./b.css"; @font-face { src: url(../media/kept.woff2) format("woff2") } .x { background: url(data:image/png;base64,AA) }');
		await writeFile(join(dir, '_next', 'static', 'chunks', 'b.css'), '.y { background: url("/img/bg.png") }');
		const root = parseFragment('<main><img src="/img/a.png" srcset="/img/a2.png 2x"><div style="background:url(/img/c.png)"></div></main>').childNodes[0] as unknown as Element;
		const found = await referencedAssets(ORIGIN, dir, { markup: [root], urls: ['/_next/static/chunks/a.used-1.css', '/favicon.ico'] });
		assert.deepEqual([...found].sort(), ['/_next/static/chunks/a.used-1.css', '/_next/static/chunks/b.css', '/_next/static/media/kept.woff2', '/favicon.ico', '/img/a.png', '/img/a2.png', '/img/bg.png', '/img/c.png']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a copied asset nothing references is removed; a referenced one, and any file convert did not copy, stays', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-assets-'));
	try {
		await mkdir(join(dir, '_next', 'static', 'chunks'), { recursive: true });
		await mkdir(join(dir, '_next', 'static', 'media'), { recursive: true });
		for (const f of ['_next/static/chunks/app.js', '_next/static/chunks/a.css', '_next/static/chunks/a.used-1.css', '_next/static/media/kept.woff2', '_next/static/media/unused.woff2', 'own.png']) await writeFile(join(dir, f), 'x');
		const copied = ['/_next/static/chunks/app.js', '/_next/static/chunks/a.css', '/_next/static/media/kept.woff2', '/_next/static/media/unused.woff2'].map((path) => ({ path, bytes: 1, sha256: '', contentType: '' }));
		const removed = await pruneUnreferenced(dir, copied, new Set(['/_next/static/chunks/a.used-1.css', '/_next/static/media/kept.woff2']));
		assert.deepEqual(removed.map((c) => c.path).sort(), ['/_next/static/chunks/a.css', '/_next/static/chunks/app.js', '/_next/static/media/unused.woff2']);
		assert.deepEqual(await files(dir), ['/_next/static/chunks/a.used-1.css', '/_next/static/media/kept.woff2', '/own.png']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

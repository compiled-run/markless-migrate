// A route's recordings are kept under a key made from its old page as the server sends it: an unchanged page reads them
// back, a changed one is recorded again, and a cache from before keys is read as the current pages'.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { oldPageKey, RecordDirs } from '../src/convert/record-key.ts';

test("an old page's key ignores the order its head's tags were streamed in, and nothing else", () => {
	const page = (head: string, body = '<p>x</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
	assert.equal(oldPageKey(200, page('<meta name="a"/><meta name="b"/><title>T</title>')), oldPageKey(200, page('<title>T</title><meta name="b"/><meta name="a"/>')));
	assert.notEqual(oldPageKey(200, page('<meta name="a"/>')), oldPageKey(200, page('<meta name="c"/>')));
	assert.notEqual(oldPageKey(200, page('')), oldPageKey(200, page('', '<p>y</p>')));
	assert.notEqual(oldPageKey(200, page('')), oldPageKey(404, page('')));
});

test('a cache from before keys is read where it is for the pages as they are now; once saved, a changed page gets a directory of its own', async () => {
	const root = await mkdtemp(join(tmpdir(), 'record-dirs-'));
	try {
		await mkdir(join(root, 'reveals'), { recursive: true });
		await writeFile(join(root, 'reveals', 'old.json'), '{}');
		const first = await RecordDirs.open(root);
		assert.equal(await first.dir('/a', 'k1', 'reveals'), join(root, 'reveals'), 'the legacy files are read where they are');
		assert.deepEqual(await readdir(await first.dir('/a', 'k1', 'toggles')), [], 'a kind with no legacy files gets a keyed directory');
		await first.save();
		const second = await RecordDirs.open(root);
		assert.equal(await second.dir('/a', 'k1', 'reveals'), join(root, 'reveals'), 'an unchanged page reads back what it recorded');
		assert.equal(await second.dir('/a', 'k1', 'toggles'), join(root, 'toggles', 'k1'));
		assert.equal(await second.dir('/a', 'k2', 'reveals'), join(root, 'reveals', 'k2'), 'a changed page is recorded again');
		assert.equal(await second.dir('/b', 'k3', 'reveals'), join(root, 'reveals', 'k3'), 'a route the old cache never had starts keyed');
		await second.save();
		assert.deepEqual(JSON.parse(await readFile(join(root, 'sources.json'), 'utf8')), { flat: { '/a': 'k1' } });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// A route's recordings are kept under a key made from its old page as the server sends it: an unchanged page reads them
// back, a changed one is recorded again, and a cache from before keys is read as the current pages'.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { recordKey, recorderVersions, RecordDirs } from '../src/convert/record-key.ts';

test("a route's key ignores the order its old page's head tags were streamed in, and nothing else", () => {
	const v = { converter: 'c', probe: 'p' };
	const page = (head: string, body = '<p>x</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
	assert.equal(recordKey(v, '/', 200, page('<meta name="a"/><meta name="b"/><title>T</title>')), recordKey(v, '/', 200, page('<title>T</title><meta name="b"/><meta name="a"/>')));
	assert.notEqual(recordKey(v, '/', 200, page('<meta name="a"/>')), recordKey(v, '/', 200, page('<meta name="c"/>')));
	assert.notEqual(recordKey(v, '/', 200, page('')), recordKey(v, '/', 200, page('', '<p>y</p>')));
	assert.notEqual(recordKey(v, '/', 200, page('')), recordKey(v, '/', 404, page('')));
	assert.notEqual(recordKey(v, '/', 200, page('')), recordKey(v, '/b', 200, page('')));
	assert.notEqual(recordKey(v, '/', 200, page('')), recordKey({ ...v, converter: 'd' }, '/', 200, page('')), 'another recorder records again');
});

test("the recorder's versions are the recording version, the converter's and probe's code, and playwright's version", async () => {
	const v = await recorderVersions();
	assert.deepEqual(Object.keys(v).sort(), ['converter', 'playwright', 'probe', 'recording']);
	assert.match(v.converter!, /^[0-9a-f]{16}$/);
	assert.match(v.probe!, /^[0-9a-f]{16}$/);
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
		const fresh = await mkdtemp(join(tmpdir(), 'record-dirs-'));
		const none = await RecordDirs.open(fresh);
		assert.equal(await none.dir('/a', 'k1', 'reveals'), join(fresh, 'reveals', 'k1'));
		await none.save();
		assert.deepEqual(JSON.parse(await readFile(join(fresh, 'sources.json'), 'utf8')), { flat: {} }, 'a cache made with keys names no route as flat');
		await rm(fresh, { recursive: true, force: true });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// What a producer returns is read back from its row as the same value: the judge sees no difference between a live run and its rows.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { decode, digest, encode, MemoryBlobs } from '../src/data/codec.ts';

const roundTrip = (value: unknown) => {
	const blobs = new MemoryBlobs();
	const json = JSON.parse(JSON.stringify(encode(value, blobs)));
	return { back: decode(json, blobs), blobs };
};

test('plain data, Maps, Sets, undefined and non-finite numbers come back as they went in, keys in their order', () => {
	const value = { b: 1, a: [1, undefined, null, 'x'], gone: undefined, map: new Map<unknown, unknown>([['k', { v: 1 }], [2, [3]]]), set: new Set(['p', 'q']), odd: [Number.NaN, Infinity, -Infinity, -0], $weird: { $map: 'not a tag' }, nested: { $undef: 1 } };
	const { back } = roundTrip(value);
	assert.deepStrictEqual(back, value);
	assert.deepEqual(Object.keys(back as object), Object.keys(value));
	assert.ok('gone' in (back as object), 'a key holding undefined is kept');
	assert.ok(Object.is((back as typeof value).odd[3], -0));
});

test('Buffers are kept once each as blobs, by the sha256 of their bytes; a decoded PNG is plain data around them', () => {
	const shot = Buffer.from('pixels');
	const image = new PNG({ width: 2, height: 1 });
	image.data.set([1, 2, 3, 4, 5, 6, 7, 8]);
	const frame = PNG.sync.read(PNG.sync.write(image));
	const { back, blobs } = roundTrip({ a: shot, b: shot, frames: [frame] });
	const out = back as { a: Buffer; b: Buffer; frames: (typeof frame)[] };
	assert.ok(out.a.equals(shot) && out.b.equals(shot));
	assert.equal(blobs.bytes.size, 2);
	assert.deepStrictEqual(out.frames[0], frame);
	assert.throws(() => encode({ image }, new MemoryBlobs()), /\$\.image: a .*instance cannot be kept/);
});

test('a value that cannot be written back exactly is refused, never kept as something else', () => {
	const blobs = new MemoryBlobs();
	assert.throws(() => encode({ f: () => 1 }, blobs), /\$\.f: a function/);
	assert.throws(() => encode({ at: new Date(0) }, blobs), /\$\.at: a Date instance/);
	const cycle: Record<string, unknown> = {};
	cycle.self = cycle;
	assert.throws(() => encode(cycle, blobs), /cycle/);
	assert.doesNotThrow(() => {
		const shared = { x: 1 };
		encode({ a: shared, b: shared }, blobs);
	}, 'the same object twice is not a cycle');
});

test('the digest names what a value holds', () => {
	assert.equal(digest({ a: Buffer.from('x'), b: [1] }), digest({ a: Buffer.from('x'), b: [1] }));
	assert.notEqual(digest({ a: Buffer.from('x') }), digest({ a: Buffer.from('y') }));
	assert.notEqual(digest({ a: undefined }), digest({}));
});

test('an object reached twice comes back as one object, so a judge matching elements by identity sees the same graph', () => {
	const el = { id: 1 };
	const other = { id: 2 };
	const capture = { elements: [el, other], motions: [{ element: el }, { element: el }], map: new Map([['a', el]]) };
	const back = roundTrip(capture).back as typeof capture;
	assert.deepStrictEqual(back, capture);
	assert.equal(back.motions[0]!.element, back.elements[0]);
	assert.equal(back.motions[1]!.element, back.elements[0]);
	assert.equal(back.map.get('a'), back.elements[0]);
	assert.notEqual(back.elements[1], back.elements[0]);
	assert.equal(new Set([...back.elements, ...back.motions.map((m) => m.element)]).size, 2);
});

test('the digest reads what a value holds, not which of its objects are shared', () => {
	const target = { role: 'button', name: 'Open' };
	assert.equal(digest({ steps: [target, target] }), digest({ steps: [{ ...target }, { ...target }] }));
});

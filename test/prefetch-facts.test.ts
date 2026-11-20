import assert from 'node:assert/strict';
import { test } from 'node:test';
import { learnShapes, maxInFlight, pageOf, shapeOf, targetOf, type PrefetchRequest } from '../src/prefetch/facts.ts';

const req = (path: string, phase = 'load', type = 'fetch', start = 0, end = 10): PrefetchRequest => ({ path, type, phase, start, end, outcome: 'completed' });

test('a request names a target only on segment edges, its query values open', () => {
	assert.equal(shapeOf('/docs/a?_rsc=1x9', '/docs/a'), '{path}?_rsc=*');
	assert.equal(shapeOf('/_next/data/b1/docs/a.json', '/docs/a'), '/_next/data/b1{path}.json');
	assert.equal(shapeOf('/docs/a/__data.json?x-sveltekit-invalidated=01', '/docs/a'), '{path}/__data.json?x-sveltekit-invalidated=*');
	assert.equal(shapeOf('/docs/ab?_rsc=1', '/docs/a'), undefined);
	assert.equal(shapeOf('/?_rsc=1', '/'), '{path}?_rsc=*');
	assert.equal(shapeOf('/docs?_rsc=1', '/'), undefined);
	assert.equal(targetOf('/docs/'), '/docs');
	assert.equal(targetOf('/'), '/');
});

test('a shape is learned from two targets, or one a click fetched; a nested path is its own page, not its parent\'s', () => {
	const targets = ['/docs', '/docs/a', '/docs/b', '/blog'];
	const requests = [req('/docs/a?_rsc=1'), req('/docs/b?_rsc=2'), req('/blog.data', 'click /blog')];
	assert.deepEqual(learnShapes(requests, targets, [{ phase: 'click /blog', target: '/blog' }]), ['{path}.data', '{path}?_rsc=*']);
	assert.equal(pageOf(req('/docs/a?_rsc=3'), ['{path}?_rsc=*'], targets), '/docs/a');
	assert.equal(pageOf(req('/docs/a.js', 'load', 'script'), ['{path}.js'], targets), undefined, 'a script is not a page');
	assert.deepEqual(learnShapes([req('/docs/a?_rsc=1')], targets), [], 'one target alone, never clicked, is not a shape');
	const after = [req('/blog.data', 'click /blog', 'fetch', 0), req('/blog/2024/post?_rsc=1', 'click /blog', 'fetch', 50)];
	assert.deepEqual(learnShapes(after, targets, [{ phase: 'click /blog', target: '/blog' }]), ['{path}.data'], 'what the new page fetches after the click names its children, not the click');
});

test('requests in flight at once', () => {
	assert.equal(maxInFlight([req('/a', 'x', 'fetch', 0, 10), req('/b', 'x', 'fetch', 5, 15), req('/c', 'x', 'fetch', 10, 20)]), 2);
	assert.equal(maxInFlight([]), 0);
});

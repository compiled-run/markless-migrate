import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { attr, walk, type Element } from '../src/convert/dom.ts';
import { queryVariants } from '../src/convert/query-variants.ts';

const root = (html: string) => [...walk(parseFragment(html) as unknown as Element)][0]!;
const byTag = (el: Element, tag: string) => [...walk(el)].find((x) => x.tagName === tag)!;

test('variants that differ only in a link the visitor cannot see become a table on the base page', () => {
	const base = root('<main><h1>New</h1><a href="/v0?t=next" id="a1">Open</a></main>');
	const vite = root('<main><h1>New</h1><a href="/v0?t=vite" id="a1">Open</a></main>');
	const plan = queryVariants(base, new Map([['?t=vite', vite]]), () => undefined);
	const link = byTag(base, 'a');
	assert.deepEqual(plan.expressions.get(link), { href: 'v0' });
	assert.deepEqual(plan.table, { '': { v0: '/v0?t=next' }, '?t=vite': { v0: '/v0?t=vite' } });
	assert.equal(plan.unaligned.size, 0);
	assert.ok(plan.holds.has(base) && plan.holds.has(link), 'the elements around a difference are written inline');
});

test('an attribute only a variant has is absent from the base row, so the base renders without it', () => {
	const base = root('<main><div class="layout">x</div></main>');
	const open = root('<main><div class="layout" aria-hidden="true">x</div></main>');
	const plan = queryVariants(base, new Map([['?open=1', open]]), () => undefined);
	assert.deepEqual(plan.table, { '': {}, '?open=1': { v0: 'true' } });
});

test('text, structure, a visible attribute or converter content that differs leaves the element unaligned', () => {
	const base = root('<main><p>One</p><ul><li>a</li></ul><img src="/a.png"><div id="d">x</div></main>');
	const other = root('<main><p>Two</p><ul><li>a</li><li>b</li></ul><img src="/b.png"><div id="d">x</div></main>');
	const theirs = new Set(walk(other));
	const plan = queryVariants(base, new Map([['?p=2', other]]), (el) => (attr(el, 'id') === 'd' ? (theirs.has(el) ? 'panel B' : 'panel A') : undefined));
	assert.deepEqual(
		[...plan.unaligned].map((el) => el.tagName),
		['p', 'ul', 'img', 'div'],
	);
});

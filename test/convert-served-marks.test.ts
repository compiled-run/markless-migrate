import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse as parseDocument, serialize } from 'parse5';
import { scrollSpyAsServed } from '../src/convert/served-marks.ts';

const toc = (active: [string, string][]) => `<html><head></head><body><nav>${active.map(([id, a]) => `<a href="#${id}" data-depth="2" data-active="${a}">${id}</a>`).join('')}</nav><a href="#open-code" data-active="${active[0]![1]}">again</a><h2 id="open-code">Open Code</h2></body></html>`;

test("a table of contents' active link is written as the old page served it, not as its scroll spy had marked it when captured", () => {
	// docs-toc.tsx's useActiveItem starts with no link active; after load its observer marks the heading in view.
	const served = parseDocument(toc([['open-code', 'false'], ['composition', 'false']]));
	const settled = parseDocument(toc([['open-code', 'true'], ['composition', 'false']]));
	assert.equal(scrollSpyAsServed(settled, served), 2);
	assert.equal(serialize(settled), serialize(served));
});

test('an in-page link the server did not send, or a mark the server sent as the page shows it, is left alone', () => {
	const served = parseDocument('<html><head></head><body><a href="#a" aria-current="true">a</a><a href="/b" data-active="false">b</a></body></html>');
	const settled = parseDocument('<html><head></head><body><a href="#a" aria-current="true">a</a><a href="/b" data-active="true">b</a><a href="#c" data-active="true">c</a></body></html>');
	const before = serialize(settled);
	assert.equal(scrollSpyAsServed(settled, served), 0);
	assert.equal(serialize(settled), before);
});

test('a mark the scroll spy added to a link the server sent without one is taken off', () => {
	const served = parseDocument('<html><head></head><body><a href="#a">a</a></body></html>');
	const settled = parseDocument('<html><head></head><body><a href="#a" aria-current="location">a</a></body></html>');
	assert.equal(scrollSpyAsServed(settled, served), 1);
	assert.equal(serialize(settled), serialize(served));
});

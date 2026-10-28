import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageRoot } from '../src/convert/index.ts';
import { attr, body, elementChildren, parseDocument } from '../src/convert/dom.ts';

const kids = (html: string) => elementChildren(body(parseDocument(`<!doctype html><html><body>${html}</body></html>`)));

test("a page's own root is the body child holding its main landmark, though a shared header outweighs it", () => {
	const header = `<div id="header"><header>${'<button>swatch</button>'.repeat(200)}</header></div>`;
	const content = '<div id="content"><aside>nav</aside><main><h1>Dropdown</h1></main></div>';
	assert.equal(attr(pageRoot(kids(`${header}${content}<script></script>`)), 'id'), 'content');
	assert.equal(attr(pageRoot(kids(`${header}<div id="content"><div role="main"><h1>x</h1></div></div>`)), 'id'), 'content');
	assert.equal(attr(pageRoot(kids(`<div id="small">a</div><div id="big">${'b'.repeat(500)}</div>`)), 'id'), 'big', 'without a main landmark, the largest child');
});

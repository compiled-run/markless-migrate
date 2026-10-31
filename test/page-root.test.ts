import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodyChildren, pageRoot } from '../src/convert/index.ts';
import { attr, body, elementChildren, parseDocument, textContent } from '../src/convert/dom.ts';

const kids = (html: string) => elementChildren(body(parseDocument(`<!doctype html><html><body>${html}</body></html>`)));

test("a page's own root is the body child holding its main landmark, though a shared header outweighs it", () => {
	const header = `<div id="header"><header>${'<button>swatch</button>'.repeat(200)}</header></div>`;
	const content = '<div id="content"><aside>nav</aside><main><h1>Dropdown</h1></main></div>';
	assert.equal(attr(pageRoot(kids(`${header}${content}<script></script>`)), 'id'), 'content');
	assert.equal(attr(pageRoot(kids(`${header}<div id="content"><div role="main"><h1>x</h1></div></div>`)), 'id'), 'content');
	assert.equal(attr(pageRoot(kids(`<div id="small">a</div><div id="big">${'b'.repeat(500)}</div>`)), 'id'), 'big', 'without a main landmark, the largest child');
});

test('a dialog open on load, portaled to the body, is never the page root, though it holds a main landmark', () => {
	const page = `<div id="page" aria-hidden="true" data-aria-hidden="true"><div><button aria-haspopup="dialog" aria-expanded="true">Open Dialog</button></div></div>`;
	const overlay = '<div data-state="open" data-slot="dialog-overlay"></div>';
	const dialog = `<div role="dialog" id="dialog" data-state="open" data-slot="dialog-content"><nav>${'<a href="#">x</a>'.repeat(50)}</nav><main><h1>Settings</h1></main></div>`;
	assert.equal(attr(pageRoot(kids(`${page}<section aria-label="Notifications"></section>${overlay}${dialog}`)), 'id'), 'page');
});

test('a body with no element of its own (a bare 404) gets one root holding what it shows', () => {
	const doc = parseDocument('<!doctype html><html><head><title>Not found</title></head><body>Not found</body></html>');
	const kids = bodyChildren(doc);
	assert.equal(kids.length, 1);
	assert.equal(pageRoot(kids), kids[0]);
	assert.equal(textContent(kids[0]!), 'Not found');
	assert.equal(elementChildren(body(doc))[0], kids[0]);
	assert.equal(bodyChildren(parseDocument('<body><main>x</main></body>')).length, 1);
});

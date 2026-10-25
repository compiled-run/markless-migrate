import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyBinding } from '../src/convert/choices.ts';
import { attr, body, parseDocument, walk } from '../src/convert/dom.ts';
import { emitElement } from '../src/convert/tsrx.ts';

test("a menu item whose choosing copied text on the old page writes that text on click; one that did not, and another role's, are left alone", () => {
	const menu = body(parseDocument('<body><div role="menu"><div role="menuitem">Copy payment ID</div><div role="menuitem">View customer</div><div role="option">Copy payment ID</div></div></body>'));
	const choices = { 'Copy payment ID': { copied: 'm5gr84i9' }, 'View customer': {} };
	const out = emitElement(menu, { bind: (el) => copyBinding(el, choices) });
	assert.match(out, /<div role="menuitem" onClick=\{\(\) => \{ void navigator\.clipboard\.writeText\("m5gr84i9"\); \}\}>Copy payment ID<\/div><div role="menuitem">View customer<\/div><div role="option">Copy payment ID<\/div>/);
	assert.equal([...walk(menu)].filter((el) => attr(el, 'role') === 'menuitem').map((el) => copyBinding(el, undefined)).filter(Boolean).length, 0, 'a layer without recorded choices binds nothing');
});

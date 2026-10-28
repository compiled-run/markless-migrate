// A menu layer's checkable items, marked for its menu's port to switch as captureMenuToggles saw them switch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { attr, isElement, outer, type Element } from '../src/convert/dom.ts';
import { markMenuCheckables } from '../src/convert/index.ts';
import type { MenuToggles } from '../src/convert/menu-toggles.ts';

const item = (text: string, on: boolean) => ({ attrs: { role: 'menuitemcheckbox', 'aria-checked': String(on), 'data-state': on ? 'checked' : 'unchecked' }, inner: `<span>${on ? '<svg></svg>' : ''}</span>${text}` });
const layer = () => (parseFragment('<div data-mm-layer="m"><div role="menu"><div role="menuitemcheckbox" aria-checked="false" data-state="unchecked" tabindex="-1"><span></span>Status Bar</div></div></div>').childNodes as Element[]).filter(isElement);
const toggles = (lasts: 'kept' | 'reset'): MenuToggles => ({ key: 'm', groups: [{ kind: 'toggle', lasts, controls: [{ sig: 'div||Status Bar', nth: 0, role: 'menuitemcheckbox', initial: false, on: item('Status Bar', true), off: item('Status Bar', false) }] }] });

test("a menu layer's checkbox item carries both states' attributes, both indicators (the other hidden) and how long its state lasts", () => {
	const kept = layer();
	assert.equal(markMenuCheckables(toggles('reset'), kept), 1);
	assert.equal(outer(kept[0]!), '<div data-mm-layer="m"><div role="menu"><div role="menuitemcheckbox" aria-checked="false" data-state="unchecked" tabindex="-1" data-mm-toggle="reset" data-mm-on="{&quot;aria-checked&quot;:&quot;true&quot;,&quot;data-state&quot;:&quot;checked&quot;}" data-mm-off="{&quot;aria-checked&quot;:&quot;false&quot;,&quot;data-state&quot;:&quot;unchecked&quot;}"><span data-mm-when="off"></span><span data-mm-when="on" hidden=""><svg></svg></span>Status Bar</div></div></div>');
});

test("an item another plan already binds (a TanStack table's column) is left to it", () => {
	const kept = layer();
	assert.equal(markMenuCheckables(toggles('kept'), kept, (el) => attr(el, 'role') === 'menuitemcheckbox'), 0);
	assert.doesNotMatch(outer(kept[0]!), /data-mm-toggle/);
});

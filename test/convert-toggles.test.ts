import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attr, body, find, parseDocument, walk, type Element } from '../src/convert/dom.ts';
import { CheckablePlan } from '../src/convert/stateful.ts';
import { emitElement } from '../src/convert/tsrx.ts';

test('a checkbox the old page switched in place is a state() its click flips, with the attributes and indicator of each state', () => {
	const doc = parseDocument('<body><div><span role="checkbox" tabindex="0" aria-checked="false" data-unchecked="" data-slot="checkbox"></span><input type="checkbox" aria-hidden="true"></div></body>');
	const box = find(body(doc), (el) => attr(el, 'role') === 'checkbox')!;
	const plan = new CheckablePlan();
	const placed = plan.add(body(doc), [{ kind: 'toggle', controls: [{ sig: 's', nth: 0, role: 'checkbox', initial: false, off: { attrs: { role: 'checkbox', 'aria-checked': 'false', 'data-unchecked': '' }, inner: '' }, on: { attrs: { role: 'checkbox', 'aria-checked': 'true', 'data-checked': '' }, inner: '<span data-slot="checkbox-indicator"></span>' } }] }], () => box, (html) => html);
	assert.equal(placed, 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /aria-checked=\{tg0 \? "true" : "false"\}/);
	assert.match(out, /data-checked=\{tg0 \? "" : undefined\}/);
	assert.match(out, /onClick=\{\(\) => \{ tg0 = !tg0; \}\}/);
	assert.match(out, /@if \(tg0\) \{ <><span data-slot="checkbox-indicator"><\/span><\/> \} @else \{ <><\/> \}/);
	assert.match(out, /<input type="checkbox" aria-hidden="true" checked=\{tg0\}/, 'the hidden input its label targets follows the state');
	assert.deepEqual(plan.bind(box)?.declare, ['let tg0 = state(false);']);
});

test('radios share one state: choosing one is its index, and a single-choice toggle group clears on a second choice', () => {
	const doc = parseDocument('<body><div role="group"><button role="radio" aria-checked="true">a</button><button role="radio" aria-checked="false">b</button></div></body>');
	const [a, b] = [...walk(body(doc))].filter((el) => attr(el, 'role') === 'radio') as [Element, Element];
	const state = (checked: boolean) => ({ attrs: { role: 'radio', 'aria-checked': String(checked) }, inner: '' });
	const plan = new CheckablePlan();
	plan.add(body(doc), [{ kind: 'radio', clears: true, controls: [{ sig: 'a', nth: 0, role: 'radio', initial: true, on: state(true), off: state(false) }, { sig: 'b', nth: 0, role: 'radio', initial: false, on: state(true), off: state(false) }] }], (sig) => (sig === 'a' ? a : b), (h) => h);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /aria-checked=\{rg0 === 1 \? "true" : "false"\}/);
	assert.match(out, /rg0 = rg0 === 1 \? -1 : 1/);
	assert.match(out, /radioKeys\(event, false\)/, 'a toggle group\'s arrows only move focus');
	assert.deepEqual(plan.bind(a)?.declare, ['let rg0 = state(0);']);
});

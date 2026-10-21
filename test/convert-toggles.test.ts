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

test('Base UI tabs render the chosen tab\'s panel content in an arm per tab, with the panel\'s id and label bound', async () => {
	const { BaseTabsPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="tabs" data-activation-direction="none"><div role="tablist" data-activation-direction="none"><button role="tab" id="base-ui-a" aria-selected="true" tabindex="0" data-active="" aria-controls="p-a">A</button><button role="tab" id="base-ui-b" aria-selected="false" tabindex="-1">B</button></div><div role="tabpanel" id="p-a" aria-labelledby="base-ui-a" data-activation-direction="none"><p>a</p></div></div></body>');
	const b = [...walk(body(doc))].find((el) => attr(el, 'id') === 'base-ui-b')!;
	const plan = new BaseTabsPlan();
	const placed = plan.add(body(doc), (el) => /^base-ui-/.test(attr(el, 'id') ?? ''), (t) => (t === b ? { attrs: { role: 'tabpanel', id: 'p-b', 'aria-labelledby': 'base-ui-b' }, inner: '<p>b</p>' } : undefined), (h) => h);
	assert.equal(placed, 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /@if \(btab0 === 0\) \{ <><p>a<\/p><\/> \}@if \(btab0 === 1\) \{ <><p>b<\/p><\/> \}/);
	assert.match(out, /id=\{btab0 === 0 \? "p-a" : "p-b"\}/);
	assert.match(out, /aria-controls=\{btab0 === 1 \? "p-b" : undefined\}/);
	assert.match(out, /btab0d = 1 > btab0 \? "right"/);
});

test('a disclosure that mounts its content where it opens renders that content in an arm at the same place', async () => {
	const { InsertedDisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div><button id="base-ui-t" aria-expanded="false">More</button><p>after</p></div></body>');
	const trigger = [...walk(body(doc))].find((el) => attr(el, 'id') === 'base-ui-t')!;
	const parent = trigger.parentNode as Element;
	const after = [...walk(body(doc))].find((el) => el.tagName === 'p')!;
	const plan = new InsertedDisclosurePlan();
	assert.equal(plan.add([{ trigger, parent, before: after, markup: '<div data-slot="collapsible-content">x</div>' }]), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /aria-expanded=\{ins0 \? "true" : "false"\}/);
	assert.match(out, /data-panel-open=\{ins0 \? "" : undefined\}/);
	assert.match(out, /<\/button>@if \(ins0\) \{ <><div data-slot="collapsible-content">x<\/div><\/> \}<p>after<\/p>/);
});

test('controls that switch the same attributes share one state, and each use writes the cookies of its state', async () => {
	const { SwitchPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="sidebar" data-state="expanded" data-collapsible=""></div><button data-slot="sidebar-trigger"></button><button data-slot="sidebar-rail"></button></body>');
	const [sidebar, trigger, rail] = [...walk(body(doc))].filter((el) => el.tagName !== 'body') as [Element, Element, Element];
	const changes = [{ sig: 's', nth: 0, attr: 'data-state', before: 'expanded', after: 'collapsed' }, { sig: 's', nth: 0, attr: 'data-collapsible', before: '', after: 'icon' }];
	const on = [{ name: 'sidebar_state', value: 'false', path: '/', maxAge: 604800 }];
	const off = [{ name: 'sidebar_state', value: 'true', path: '/', maxAge: 604800 }];
	const plan = new SwitchPlan();
	const placed = plan.add([{ sig: 't', nth: 0, changes, cookiesOn: on, cookiesOff: off }, { sig: 'r', nth: 0, changes, cookiesOn: on, cookiesOff: off }], (sig) => ({ s: sidebar, t: trigger, r: rail })[sig as 's' | 't' | 'r']);
	assert.equal(placed, 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /data-state=\{sw0 \? "collapsed" : "expanded"\}/);
	assert.match(out, /data-collapsible=\{sw0 \? "icon" : ""\}/);
	assert.equal(out.match(/sw0 = !sw0; writeCookies\(sw0 \? \[\{"name":"sidebar_state","value":"false"/g)?.length, 2, 'the trigger and the rail switch one state');
});

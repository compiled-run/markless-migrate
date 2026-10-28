import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { isElement, type Element } from '../src/convert/dom.ts';
import { besideTrigger } from '../src/convert/beside-trigger.ts';
import { layerNames } from '../src/convert/layer-ids.ts';

const layer = (key: string, html: string, inPage = true) => ({ key, inPage, kept: (parseFragment(html).childNodes as Element[]).filter(isElement) });

test('two lists captured on separate loads keep their own ids: the one whose group names a label it lacks still lacks it', () => {
	const fruits = layer('radix-_R_a_', '<div id="radix-_R_a_" role="listbox"><div role="group" aria-labelledby="radix-_r_28_"><div id="radix-_r_28_">Fruits</div><div role="option" aria-labelledby="radix-_r_29_"><span id="radix-_r_29_">Apple</span></div></div></div>');
	const plain = layer('radix-_R_b_', '<div id="radix-_R_b_" role="listbox"><div role="group" aria-labelledby="radix-_r_28_"><div role="option" aria-labelledby="radix-_r_29_"><span id="radix-_r_29_">Light</span></div></div></div>');
	const { each, page } = layerNames([fruits, plain]);
	const label = each[0]!.get('radix-_r_28_')!;
	assert.ok(label);
	assert.notEqual(each[1]!.get('radix-_r_28_'), label, 'the second list names no label of the first');
	assert.notEqual(each[0]!.get('radix-_r_29_'), each[1]!.get('radix-_r_29_'), 'each option text has its own id');
	assert.equal(page.get('radix-_R_b_'), each[1]!.get('radix-_R_b_'), 'the page names each list by its own key');
	assert.notEqual(page.get('radix-_R_a_'), page.get('radix-_R_b_'));
});

test('a submenu and the menu it was captured with still name each other', () => {
	const menu = layer('radix-_R_m_', '<div id="radix-_R_m_" role="menu"><div role="menuitem" id="radix-_r_5_" data-mm-key="radix-_R_m_-sub-0" aria-controls="radix-_r_6_">More</div></div>');
	const sub = layer('radix-_R_m_-sub-0', '<div id="radix-_r_6_" role="menu" aria-labelledby="radix-_r_5_"><div role="menuitem" id="radix-_r_7_">One</div></div>', false);
	const other = layer('radix-_R_o_', '<div id="radix-_R_o_" role="menu"><div role="menuitem" id="radix-_r_5_">Else</div><div id="radix-_r_6_">x</div></div>');
	const { each } = layerNames([other, menu, sub]);
	assert.equal(each[2]!.get('radix-_r_5_'), each[1]!.get('radix-_r_5_'), "the submenu's label is its menu's item");
	assert.equal(each[1]!.get('radix-_r_6_'), each[2]!.get('radix-_r_6_'), "the menu's item controls its submenu");
	assert.notEqual(each[0]!.get('radix-_r_5_'), each[1]!.get('radix-_r_5_'), 'an unrelated menu keeps its own');
});

test('the same layer captured twice (two parts of one reveal, two viewports) keeps one name per id', () => {
	const a = layer('radix-_R_k_', '<div id="radix-_R_k_"><span id="radix-_r_1_">A</span></div>');
	const b = layer('radix-_R_k_', '<div data-viewport="mobile"><div id="radix-_R_k_"><span id="radix-_r_1_">A</span></div></div>');
	const { each } = layerNames([a, b]);
	assert.equal(each[0]!.get('radix-_r_1_'), each[1]!.get('radix-_r_1_'));
	assert.equal(each[0]!.get('radix-_R_k_'), each[1]!.get('radix-_R_k_'));
});

test("what Floating UI puts beside an open trigger keeps its aria-owns span, named after that trigger's own portal", () => {
	const beside = besideTrigger('<span data-type="outside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard=""></span><span aria-owns="_r_0_"></span><span data-type="outside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard=""></span>');
	assert.deepEqual(beside.map((e) => e.attrs.map((a) => a.name).join(',')), ['aria-owns']);
	const first = layer('base-ui-_R_a_', '<div id="_r_0_" data-base-ui-portal=""><div id="base-ui-_R_a_-list" role="listbox"></div></div>');
	const second = layer('base-ui-_R_b_', '<div id="_r_0_" data-base-ui-portal=""><div id="base-ui-_R_b_-list" role="listbox"></div></div>');
	const names = layerNames([first, second]);
	assert.equal(names.of('base-ui-_R_b_').get('_r_0_'), names.each[1]!.get('_r_0_'));
	assert.notEqual(names.of('base-ui-_R_b_').get('_r_0_'), names.of('base-ui-_R_a_').get('_r_0_'));
});

test("a trigger's aria-controls names the layer it opens, even when an earlier layer captured on another load holds that id", () => {
	// React's client ids start over on each load: the first sheet's code block holds radix-_r_3_, the second sheet's key.
	const first = layer('radix-_r_0_', '<div id="radix-_r_0_" role="dialog"><div id="radix-_r_1_">Code</div><button id="radix-_r_3_">Copy</button></div>');
	const second = layer('radix-_r_3_', '<div id="radix-_r_3_" role="dialog"><div id="radix-_r_4_">Code</div></div>');
	const { each, page } = layerNames([first, second]);
	assert.equal(page.get('radix-_r_3_'), each[1]!.get('radix-_r_3_'), 'the second trigger controls the second sheet');
	assert.equal(page.get('radix-_r_0_'), each[0]!.get('radix-_r_0_'));
});

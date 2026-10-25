import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { isElement, type Element } from '../src/convert/dom.ts';
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

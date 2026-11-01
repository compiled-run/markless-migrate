import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TYPED_TO_ENTER_MS } from '../scripts/probe/typing.ts';

// A person presses Enter one inter-key interval after the last character: 238.656 ms is the mean over 168,960 typists
// (Dhakal, Feit, Kristensson and Oulasvirta, "Observations on Typing from 136 Million Keystrokes", CHI 2018).
// Measured 2026-11-01 on qwikui.com's search box (typed "42", 15 ms a key, cold page): the results were in 2 to 16 ms after
// the last key; with the CPU slowed 4x 39 to 46 ms, 6x 39 to 202 ms. Enter 15 ms after typing raced that on a busy machine
// (the Combobox found no value and the dialog stayed); 240 ms does not, and no person is faster.
test('the probe presses Enter one measured inter-key interval after typing, not at machine speed', () => {
	assert.equal(TYPED_TO_ENTER_MS, 240);
});

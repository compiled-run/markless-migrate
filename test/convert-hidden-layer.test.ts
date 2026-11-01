import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIDDEN_LAYER_CSS, withHiddenLayers } from '../src/convert/index.ts';

// A closed layer is in the page with the hidden attribute; its own display (Radix Select's inline display: flex, a
// Tailwind 3 `flex` class) would beat the attribute and show it, covering the page.
test("a page with layers carries the rule that keeps a closed layer's own display from showing it", () => {
	assert.match(HIDDEN_LAYER_CSS, /^\[data-mm-layer\]\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
	const page = (layers: number) => ({ layers: Array.from({ length: layers }, (_, i) => ({ key: `k${i}`, markup: '', shell: '', fill: '' })), bodyCss: ['body{color:red}'] });
	const shown = page(2);
	withHiddenLayers(shown);
	assert.deepEqual(shown.bodyCss, [HIDDEN_LAYER_CSS, 'body{color:red}']);
	const none = page(0);
	withHiddenLayers(none);
	assert.deepEqual(none.bodyCss, ['body{color:red}'], 'a page without layers is not given a rule it does not need');
});

// Where convert places a React Aria popover: the placement and offsets its own instance was given win over the side it
// was captured on and the source's most common offsets.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { racPlacement } from '../src/convert/index.ts';
import type { Element } from '../src/convert/dom.ts';
import type { PartResolver } from '../src/convert/usage.ts';

const resolver: PartResolver = { name: 'test', candidates: () => [{ library: 'react-aria-components', export: 'Popover', file: 'ui.tsx', line: 1 }], libraries: () => new Map(), prop: (_l, _e, prop) => ({ offset: '4', crossOffset: '0' })[prop] };
const popover = (attrs: string) => (parseFragment(`<div data-rac="" data-trigger="SubmenuTrigger" data-slot="context-menu-sub-content" data-placement="right" style="--trigger-anchor-point: -5px 3px" ${attrs}></div>`).childNodes[0] as unknown as Element);

test("a React Aria submenu's popover is placed as its instance was given, the attributes moved off the element to its layer", () => {
	const el = popover('data-mm-placement="end top" data-mm-offset="0" data-mm-cross-offset="-3"');
	assert.equal(racPlacement(el, resolver), ' data-mm-placement="end top" data-mm-offset="0" data-mm-cross-offset="-3"');
	assert.deepEqual(el.attrs.filter((a) => a.name.startsWith('data-mm-')), []);
});

test('without instance props, a React Aria popover keeps its captured side and the source offsets', () => {
	assert.equal(racPlacement(popover(''), resolver), ' data-mm-placement="right" data-mm-offset="4" data-mm-cross-offset="0"');
});

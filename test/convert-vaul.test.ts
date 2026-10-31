import assert from 'node:assert/strict';
import { test } from 'node:test';
import { find, parseDocument } from '../src/convert/dom.ts';
import { portFor, useResolver } from '../src/convert/parts.ts';

// vaul's Drawer is Radix Dialog underneath, so its parts carry Radix's markup (data-state, radix- ids).
test("a vaul drawer's trigger, which carries Radix Dialog's markup, gets the Radix dialog port", () => {
	useResolver({ name: 'test', candidates: (slot) => (slot.startsWith('drawer-') ? [{ library: 'vaul', export: `Drawer.${slot === 'drawer-trigger' ? 'Trigger' : slot === 'drawer-close' ? 'Close' : 'Content'}`, file: 'page.tsx', line: 1 }] : []), libraries: () => new Map(), prop: () => undefined });
	const el = (html: string, tag: string) => find(parseDocument(`<body>${html}</body>`), (e) => e.tagName === tag)!;
	assert.equal(portFor(el('<button data-testid="trigger" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="radix-:R2llla:" data-state="closed" data-slot="drawer-trigger">Open Drawer</button>', 'button')), 'radix/dialog');
	assert.equal(portFor(el('<div role="dialog" id="radix-:R2llla:" data-state="open" data-vaul-drawer="" data-slot="drawer-content"><button data-slot="drawer-close">Close</button></div>', 'div')), 'radix/dialog');
});

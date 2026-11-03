import assert from 'node:assert/strict';
import { test } from 'node:test';
import { find, parseDocument } from '../src/convert/dom.ts';
import { portFor, useResolver } from '../src/convert/parts.ts';

test('a Base UI select trigger given its own id is still Base UI\'s: the hidden input its root renders after it keeps the generated id', () => {
	useResolver({ name: 'test', candidates: (slot) => (slot === 'select-trigger' ? [{ library: 'radix-ui', export: 'Select.Trigger', file: 'r.tsx', line: 1 }, { library: '@base-ui/react', export: 'Select.Trigger', file: 'b.tsx', line: 1 }] : []), libraries: () => new Map(), prop: () => undefined });
	const trigger = (html: string) => find(parseDocument(`<body><div data-slot="field">${html}</div></body>`), (e) => e.tagName === 'button')!;
	const hidden = '<input id="base-ui-_R_2fig3aanpfknqbr6lb_-hidden-input" tabindex="-1" aria-hidden="true" value="">';
	assert.equal(portFor(trigger(`<button id="checkout-exp-month" role="combobox" aria-haspopup="listbox" data-slot="select-trigger"><span data-slot="select-value">MM</span></button>${hidden}`)), 'base-ui/select');
	assert.equal(portFor(trigger(`<button id="base-ui-_R_4j_" role="combobox" aria-haspopup="listbox" data-slot="select-trigger">MM</button>${hidden}`)), 'base-ui/select');
	assert.equal(portFor(trigger('<button id="checkout-exp-month" role="combobox" aria-haspopup="listbox" data-slot="select-trigger">MM</button><input tabindex="-1" aria-hidden="true">')), undefined, 'an input the author renders says nothing');
	assert.equal(portFor(trigger(`${hidden}<button id="checkout-exp-month" role="combobox" aria-haspopup="listbox" data-slot="select-trigger">MM</button>`)), undefined, 'only an input after the trigger is its root\'s');
	assert.equal(portFor(trigger(`<button type="button" role="combobox" aria-haspopup="listbox" data-slot="select-trigger" data-state="closed">MM</button>`)), 'radix/select');
});

test("a Base UI scroll area is Base UI's by the data-id its viewport and scrollbars carry, so it gets the Base UI port, not none", () => {
	const both = (slot: string, part: string) => [{ library: 'radix-ui', export: `ScrollArea.${part}`, file: 'r.tsx', line: 1 }, { library: '@base-ui/react', export: `ScrollArea.${part}`, file: 'b.tsx', line: 1 }];
	useResolver({ name: 'test', candidates: (slot) => (slot === 'scroll-area-viewport' ? both(slot, 'Viewport') : slot === 'scroll-area-scrollbar' ? both(slot, 'Scrollbar') : []), libraries: () => new Map(), prop: () => undefined });
	const el = (html: string) => find(parseDocument(`<body><div data-slot="scroll-area">${html}</div></body>`), (e) => (e.attrs.find((a) => a.name === 'data-slot')?.value ?? '').startsWith('scroll-area-'))!;
	assert.equal(portFor(el('<div role="presentation" data-id="base-ui-_R_43aanpfknqbr6lb_-viewport" tabindex="0" data-slot="scroll-area-viewport"></div>')), 'base-ui/scroll-area');
	assert.equal(portFor(el('<div data-orientation="vertical" data-id="base-ui-_R_43aanpfknqbr6lb_-scrollbar" data-slot="scroll-area-scrollbar"></div>')), 'base-ui/scroll-area');
	assert.equal(portFor(el('<div data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport"></div>')), 'radix/scroll-area');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { open, settled } from './base-ui-menu-harness.ts';
import { portAttributes, useResolver } from '../src/convert/parts.ts';
import { find, parseDocument } from '../src/convert/dom.ts';

const item = (v: string, on = false) => `<div cmdk-item="" role="option" aria-disabled="false" aria-selected="${on}" data-selected="${on}" data-value="${v}">${v}</div>`;
const command = (attrs: string) => `<main><div cmdk-root="" tabindex="-1" ${attrs}><input cmdk-input="" role="combobox" type="text" value=""><div cmdk-list="" role="listbox"><div cmdk-list-sizer="">${item('first', true)}${item('second')}</div></div></div></main>`;
const chosen = () => document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute('data-value');

test('cmdk: Ctrl+N and Ctrl+J move the selection, unless the command was rendered with vimBindings={false}', async () => {
	for (const [attrs, after] of [['', 'second'], ['data-mm-vim-bindings="false"', 'first']] as const) {
		const page = await open(command(attrs), ['cmdk']);
		for (const key of ['Control+n', 'Control+j']) {
			await page.locator('[cmdk-input]').focus();
			await page.keyboard.press(key);
			await settled(page);
			assert.equal(await page.evaluate(chosen), after, `${key} with ${attrs || 'vim bindings on'}`);
			await page.keyboard.press('Home');
		}
		await page.close();
	}
});

test("convert writes a command's literal vimBindings={false} on its root", () => {
	useResolver({ name: 'test', candidates: (slot) => (slot === 'command' ? [{ library: 'cmdk', export: 'Command', file: 'c.tsx', line: 1 }] : []), libraries: () => new Map(), prop: (lib, exp, prop) => (lib === 'cmdk' && exp === 'Command' && prop === 'vimBindings' ? 'false' : undefined) });
	const root = find(parseDocument('<body><div cmdk-root="" data-slot="command"></div></body>'), (e) => e.tagName === 'div')!;
	assert.deepEqual(portAttributes(root)?.extra, ['data-mm-vim-bindings="false"']);
});

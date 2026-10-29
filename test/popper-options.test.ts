import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optionsOf } from '../parts/popper.ts';

test('a Radix layer opens on the side and alignment its source asked for, not the side a flip at capture left on it', () => {
	const attrs: Record<string, string> = { 'data-side': 'top', 'data-align': 'end', 'data-mm-side': 'bottom', 'data-mm-align': 'center' };
	const content = { getAttribute: (name: string) => attrs[name] ?? null } as unknown as Element;
	const { side, align } = optionsOf({ dataset: {} } as HTMLElement, content);
	assert.deepEqual([side, align], ['bottom', 'center']);
});

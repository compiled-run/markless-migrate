// The selectors each part claims its markup by are the string values of its source, read with yuku's analyzer.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { partSelectors } from '../src/check/probe-parts.ts';

test("a part's selectors are its string values that name a non-generic attribute; a comment, a computed template or a generic attribute is none", async () => {
	const root = await mkdtemp(join(tmpdir(), 'probe-parts-'));
	try {
		await mkdir(join(root, 'parts/lib'), { recursive: true });
		await writeFile(
			join(root, 'parts/lib/menu.ts'),
			[
				`export const ITEM = '[data-slot="menu-item"], [role="menuitem"]';`,
				'export const TEMPLATE = `[data-state="open"]`;',
				// eslint-disable-next-line no-template-curly-in-string
				'export const COMPUTED = (k: string) => `[data-${k}]`;',
				`// '[data-commented]'`,
				`export const ESCAPED = "[data-label=\\"it's\\"]";`,
				`export const GENERIC = '[role="button"]';`,
			].join('\n'),
		);
		await writeFile(join(root, 'parts/lib/menu.test.ts'), `export const T = '[data-test-only]';\n`);
		assert.deepEqual(await partSelectors(root), [{ file: 'parts/lib/menu.ts', selectors: ['[data-slot="menu-item"]', '[data-state="open"]', `[data-label="it's"]`] }]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

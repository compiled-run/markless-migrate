// A fumadocs-mdx collection's pages in a fixed order, whatever directory listing the machine that generated it returned.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderCollection } from '../src/convert/fumadocs/index.ts';

const file = (paths: readonly string[]) => `export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_9, }, {${paths.map((p, i) => `"${p}": __fd_glob_${i}, `).join('')}});`;
const listed = (text: string) => [...text.matchAll(/"([^"]+\.mdx)"/g)].map((m) => m[1]);
const PATHS = ['components/radix/button.mdx', 'index.mdx', 'components/base/button.mdx', '(root)/cli.mdx', 'components/aria/button.mdx'];

test("a collection's pages are ordered by path, each keeping its own import", () => {
	const { text, moved } = orderCollection(file(PATHS));
	assert.deepEqual(listed(text), ['(root)/cli.mdx', 'components/aria/button.mdx', 'components/base/button.mdx', 'components/radix/button.mdx', 'index.mdx']);
	assert.match(text, /"components\/radix\/button\.mdx": __fd_glob_0, /);
	assert.match(text, /\{"meta\.json": __fd_glob_9, \}/, 'meta files are left as they are');
	assert.equal(moved, 4, "base/button was already third");
});

test("given a deployment's sitemap order, the pages take that order (a group folder and index are not in the URL)", () => {
	const order = ['/', '/docs', '/docs/components/aria/button', '/docs/components/radix/button', '/docs/components/base/button', '/docs/cli', '/blocks'];
	const { text } = orderCollection(file(PATHS), order);
	assert.deepEqual(listed(text), ['index.mdx', 'components/aria/button.mdx', 'components/radix/button.mdx', 'components/base/button.mdx', '(root)/cli.mdx']);
	// A page the sitemap does not list goes after those it does, by path.
	assert.deepEqual(listed(orderCollection(file([...PATHS, 'a/new.mdx']), order).text).slice(-1), ['a/new.mdx']);
});

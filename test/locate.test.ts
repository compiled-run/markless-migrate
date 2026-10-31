import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { indexMarkup, locate } from '../src/check/markup.ts';
import { originalPosition, sourceFile } from '../src/check/sourcemap.ts';
import { stepRoutes } from '../src/plan/source.ts';
import { scanSource, planOrder } from '../src/source/index.ts';

const fixtures = join(import.meta.dirname, '../fixtures');
const el = (tag: string, text: string, name = '') => ({ tag, text, name });

test('elements are found in HTML, JSX and TSRX source by tag, written text and accessible name, with the text a dictionary supplies', async () => {
	const vite = await indexMarkup(join(fixtures, 'vite-site'));
	assert.deepEqual(pick(locate(vite, el('h1', 'About the guides', 'About the guides'))), ['about/index.html', 29]);
	assert.deepEqual(pick(locate(vite, el('img', '', 'Cliff path leading to a white lighthouse'))), ['index.html', 45]);
	const markless = await indexMarkup(join(fixtures, 'markless-site'));
	assert.deepEqual(pick(locate(markless, el('h1', 'About the guides', 'About the guides'), ['pages/about/index.tsrx'])), ['pages/about/index.tsrx', 3]);
	assert.deepEqual(pick(locate(markless, el('span', 'Walks booked today:'))), ['pages/index.tsrx', 16]);
	const next = await indexMarkup(join(fixtures, 'next-app'));
	assert.equal(locate(next, el('h1', 'About us', 'About us')), undefined, 'an h1 whose text is an expression is only a guess outside the route files');
	const hit = locate(next, el('h1', 'About us', 'About us'), ['app/[lang]/about/page.tsx']);
	assert.deepEqual([...pick(hit), hit?.textFrom?.file], ['app/[lang]/about/page.tsx', 18, 'app/dictionaries.ts']);
	assert.ok(vite.css.some((r) => r.selector === '.lede' && r.file === 'src/style.css'));
});

const pick = (hit: ReturnType<typeof locate>) => [hit?.element.file, hit?.element.line] as const;

test('source map paths are made relative to the checkout they name, and a position is followed through an inline map', async () => {
	const root = join(fixtures, 'next-app');
	assert.deepEqual(sourceFile('turbopack:///[project]/.mutants/next-app-x/app/[lang]/tip.tsx', root), { file: 'app/[lang]/tip.tsx', path: join(root, 'app/[lang]/tip.tsx') });
	assert.deepEqual(sourceFile('webpack://_N_E/./src/missing.tsx'), { file: 'src/missing.tsx' });
	const map = { version: 3, sources: ['webpack://_N_E/./app/[lang]/tip.tsx'], names: [], mappings: 'AAAA;AACA,IAAI' };
	const body = `a();\nb();\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`;
	assert.deepEqual(await originalPosition('http://127.0.0.1:9/chunk.js', 2, 5, root, body), { file: 'app/[lang]/tip.tsx', line: 2, column: 5, path: join(root, 'app/[lang]/tip.tsx'), how: 'source map' });
});

test('each migration step lists the route patterns it is part of: a layout the routes below it, a component the routes rendering it', async () => {
	const facts = await scanSource(join(fixtures, 'next-app'));
	const order = planOrder(facts);
	const routes = (name: string) => stepRoutes(facts, order.find((s) => s.name === name)!);
	assert.deepEqual(routes('Tip'), ['/:lang']);
	assert.ok(routes('LangLayout').includes('/:lang/about'));
	assert.deepEqual(routes('About'), ['/:lang/about']);
	assert.ok(order.findIndex((s) => s.name === 'Tip') < order.findIndex((s) => s.name === 'Home'));
});

test('JSX text and attributes with an HTML entity are found by the text and name the page shows', async () => {
	const { mkdtemp, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const dir = await mkdtemp(join(tmpdir(), 'mm-entity-'));
	await writeFile(join(dir, 'Alert.tsx'), 'export const Alert = () => (\n\t<div>\n\t\t<p>We&apos;ve added dark mode</p>\n\t\t<a aria-label="Tom &amp; Jerry" href="/t">T</a>\n\t</div>\n);\n');
	const index = await indexMarkup(dir);
	assert.deepEqual(pick(locate(index, { tag: 'p', text: "We've added dark mode", name: '', chain: '' }, ['Alert.tsx'])), ['Alert.tsx', 3]);
	assert.deepEqual(pick(locate(index, { tag: 'a', text: 'T', name: 'Tom & Jerry', chain: '' })), ['Alert.tsx', 4], 'an attribute is matched by its decoded value');
});

test('string literals are indexed in source order, a type annotation before the body it types', async () => {
	const { mkdtemp, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const dir = await mkdtemp(join(tmpdir(), 'mm-order-'));
	await writeFile(join(dir, 'format.ts'), "export function format(raw: Post['date']): Post['label'] {\n\treturn new Date(raw).toLocaleDateString('en-US', { month: 'long' });\n}\n");
	const index = await indexMarkup(dir);
	assert.deepEqual(index.strings.filter((s) => s.file === 'format.ts').map((s) => s.value), ['date', 'label', 'en-US', 'long']);
});

test('of two elements written alike, the one whose ancestors and position among its siblings match the page is chosen', async () => {
	const { mkdtemp, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const dir = await mkdtemp(join(tmpdir(), 'mm-alike-'));
	await writeFile(join(dir, 'index.html'), '<html><body>\n<header><p>Free entry</p></header>\n<main><ul>\n<li>Walk</li>\n<li>Walk</li>\n</ul></main>\n<footer><p>Free entry</p></footer>\n</body></html>\n');
	await writeFile(join(dir, 'Card.tsx'), 'export const Cards = () => (\n\t<section>\n\t\t<article><b>New</b></article>\n\t\t<article><b>New</b></article>\n\t</section>\n);\n');
	const index = await indexMarkup(dir);
	const at = (tag: string, text: string, chain: string) => pick(locate(index, { tag, text, name: '', chain }, ['index.html', 'Card.tsx']));
	assert.deepEqual(at('p', 'Free entry', 'html:1>body:1>footer:1>p:1'), ['index.html', 7]);
	assert.deepEqual(at('p', 'Free entry', 'html:1>body:1>header:1>p:1'), ['index.html', 2]);
	assert.deepEqual(at('li', 'Walk', 'html:1>body:1>main:1>ul:1>li:2'), ['index.html', 5]);
	assert.deepEqual(at('b', 'New', 'html:1>body:1>div:1>section:1>article:2>b:1'), ['Card.tsx', 4], 'a component file matches the end of the page chain');
	assert.deepEqual(at('p', 'Free entry', ''), ['index.html', 2], 'without a chain, the first one written');
});

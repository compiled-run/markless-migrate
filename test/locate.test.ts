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

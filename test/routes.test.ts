import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Inventory } from '../src/plan/inventory.ts';
import { fillPattern, paramValues, routeTargets } from '../src/plan/routes.ts';

const inventory = {
	routes: [{ route: '/en' }, { route: '/fr/about' }],
	routeUnion: [
		{ route: '/:lang', knownBy: ['crawl', 'source'], crawled: ['/en', '/fr'], dynamic: true, kind: 'page' },
		{ route: '/:lang/about', knownBy: ['crawl', 'source'], crawled: ['/fr/about'], dynamic: true, kind: 'page' },
		{ route: '/:lang/legal', knownBy: ['source'], crawled: [], dynamic: true, kind: 'page', file: 'app/[lang]/legal/page.tsx', line: 3 },
		{ route: '/:lang/news/:slug', knownBy: ['source'], crawled: [], dynamic: true, kind: 'page', file: 'app/[lang]/news/[slug]/page.tsx', line: 9 },
		{ route: '/:lang/docs/*rest?', knownBy: ['source'], crawled: [], dynamic: true, kind: 'page' },
		{ route: '/api/news', knownBy: ['source'], crawled: [], dynamic: false, kind: 'endpoint' },
		{ route: '/old', knownBy: ['crawl'], crawled: ['/old'] },
	],
} as unknown as Inventory;

test('check --all fills dynamic segments from crawled paths, lists what has no value, and keeps endpoints apart', () => {
	assert.deepEqual(paramValues('/:lang/about', '/fr/about'), { lang: 'fr' });
	assert.deepEqual(fillPattern('/:lang/docs/*rest?', { lang: 'en' }), { path: '/en/docs', missing: [] });
	const targets = routeTargets(inventory);
	assert.deepEqual(targets.pages, ['/en', '/en/docs', '/en/legal', '/fr', '/fr/about', '/old']);
	assert.deepEqual(targets.endpoints, ['/api/news']);
	assert.deepEqual(targets.needsSample, [{ route: '/:lang/news/:slug', params: ['slug'], file: 'app/[lang]/news/[slug]/page.tsx', line: 9 }]);
	assert.equal(targets.filled['/en/legal'], '/:lang/legal');
});

test('.migrate/samples.json fills a segment by name or names a path for a pattern', () => {
	assert.deepEqual(routeTargets(inventory, { slug: 'first-post' }).pages.filter((p) => p.includes('news')), ['/en/news/first-post']);
	assert.deepEqual(routeTargets(inventory, { '/:lang/news/:slug': '/fr/news/bonjour' }).needsSample, []);
});

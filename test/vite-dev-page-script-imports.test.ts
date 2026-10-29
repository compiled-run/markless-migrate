import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staticImports } from '../examples/vite-dev-markless/scripts/page-script-imports.ts';

test('each page-script entry lists its whole static import closure once, not its dynamic imports or other entries', () => {
	const bundle = {
		'page-scripts/page.js': { type: 'chunk', fileName: 'page-scripts/page.js', name: 'page', isEntry: true, imports: ['page-scripts/site-a.js', 'page-scripts/helper-b.js'] },
		'page-scripts/home.js': { type: 'chunk', fileName: 'page-scripts/home.js', name: 'home', isEntry: true, imports: ['page-scripts/site-a.js'] },
		'page-scripts/site-a.js': { type: 'chunk', fileName: 'page-scripts/site-a.js', name: 'site', imports: ['page-scripts/icons-c.js', 'page-scripts/helper-b.js'] },
		'page-scripts/helper-b.js': { type: 'chunk', fileName: 'page-scripts/helper-b.js', name: 'helper', imports: [] },
		'page-scripts/icons-c.js': { type: 'chunk', fileName: 'page-scripts/icons-c.js', name: 'icons' },
		'page-scripts/lazy-d.js': { type: 'chunk', fileName: 'page-scripts/lazy-d.js', name: 'lazy', imports: [] },
		'assets/style.css': { type: 'asset', fileName: 'assets/style.css' },
	} as const;
	assert.deepEqual(staticImports(bundle), {
		home: ['/page-scripts/helper-b.js', '/page-scripts/icons-c.js', '/page-scripts/site-a.js'],
		page: ['/page-scripts/helper-b.js', '/page-scripts/icons-c.js', '/page-scripts/site-a.js'],
	});
});

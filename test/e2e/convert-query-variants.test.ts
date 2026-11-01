import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compileTsrxModule, collectTsrxModuleDiagnostics } from '@markless/compiler';
import { pageFileSignals } from '../../src/cache/signals.ts';
import { convert } from '../../src/convert/index.ts';

const page = (title: string, body: string) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><div id="app"><main>${body}</main></div></body></html>`;
// The designer's link names the query's template, which the old page wrote in the browser; the text a visitor reads is alike.
const designer = (template: string) => page('Create', `<h1>New project</h1><p>Pick a template.</p><a href="https://v0.dev/chat?url=/init?template=${template}" target="_blank">Open in v0</a>`);
const SITE: Record<string, string> = {
	'/': page('Home', '<h1>Home</h1><a href="/create">Create</a> <a href="/list">List</a> <a href="/news">News</a>'),
	'/create': designer('next'),
	'/create?template=vite': designer('vite'),
	'/list': page('List', '<h1>Directory</h1><ul><li>One</li><li>Two</li></ul>'),
	'/list?page=2': page('List', '<h1>Directory</h1><ul><li>One</li><li>Two</li></ul>'),
	'/news': page('News', '<h1>News</h1><ol><li>First story</li></ol>'),
	'/news?p=2': page('News', '<h1>News</h1><ol><li>Second story</li></ol>'),
};
const ROUTES = Object.keys(SITE);

test('a page captured per query is written as one page the server renders alike for every query, unless what a visitor sees differs', { timeout: 600_000 }, async () => {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		const body = SITE[url.pathname + url.search];
		res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
		res.end(body ?? page('Not found', '<h1>Not found</h1>'));
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	try {
		const app = await mkdtemp(join(tmpdir(), 'mm-convert-query-'));
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ routes: ROUTES.map((route) => ({ route, status: 200 })) }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'converted', private: true, type: 'module', dependencies: {} }));
		await convert({ old: `http://127.0.0.1:${port}`, app, concurrency: 2 });
		const source = (file: string) => readFile(join(app, file), 'utf8');

		const create = await source('pages/create.tsrx');
		assert.doesNotMatch(create, /\burl\.search\b/, 'the server render of /create reads no query');
		assert.match(create, /QUERY_VARIANTS/, 'the captured queries are a table the browser reads');
		assert.ok(create.includes('template=vite') && create.includes('template=next'), 'both captured links are in the table');
		assert.match(create, /onVisible=/, 'the page picks its variant once it runs');
		assert.deepEqual((await pageFileSignals(app, 'pages/create.tsrx')).queryKeys, [], 'the caching plan sees no query read, so the page is built ahead');

		const list = await source('pages/list.tsrx');
		assert.doesNotMatch(list, /\burl\.search\b|QUERY_VARIANTS|onVisible=/, 'queries that show the same page are that one page');

		const news = await source('pages/news.tsrx');
		assert.match(news, /@switch \(search\)/, 'a query that changes what a visitor reads stays rendered per query on the server');
		assert.deepEqual((await pageFileSignals(app, 'pages/news.tsrx')).queryKeys, ['p']);

		const errors: string[] = [];
		for (const file of ['pages/create.tsrx', 'pages/list.tsrx', 'pages/news.tsrx']) {
			const result = await compileTsrxModule({ filename: file, source: await source(file), symbols: [] });
			for (const d of collectTsrxModuleDiagnostics(result)) if (d.severity === 'error') errors.push(`${file}: ${d.code}: ${d.message}`);
		}
		assert.deepEqual(errors, []);
	} finally {
		server.close();
	}
});

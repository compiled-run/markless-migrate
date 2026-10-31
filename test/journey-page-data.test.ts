import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Report } from '../src/check/types.ts';

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
});
after(async () => {
	await browser?.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

function serve(handler: (path: string) => { type: string; body: string } | undefined): Promise<string> {
	const server = createServer((req, res) => {
		const found = handler(new URL(req.url ?? '/', 'http://x').pathname);
		if (!found) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': found.type, 'access-control-allow-origin': '*' }).end(found.body);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

const list = (items: string) => `<ul id="posts">${items}</ul><button id="more" type="button">Show more</button>`;

test("a single-page app's own data from another origin answers its journeys as it answered the page load, so they explore the app and not its error screen", async () => {
	const api = await serve((path) => (path === '/posts' ? { type: 'application/json', body: '["First post","Second post"]' } : undefined));
	// The old app reads its posts in the browser from the API; on a failed fetch it shows an error with a button of its own.
	const spa = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Posts</title></head><body><main><h1>Posts</h1><div id="out"></div></main>
<script>
fetch('${api}/posts').then((r) => r.json()).then((posts) => {
	document.getElementById('out').innerHTML = ${JSON.stringify(list(''))}.replace('</ul>', posts.map((p) => '<li>' + p + '</li>').join('') + '</ul>');
	document.getElementById('more').onclick = () => document.getElementById('posts').insertAdjacentHTML('beforeend', '<li>Third post</li>');
}, () => {
	document.getElementById('out').innerHTML = '<p>Something went wrong</p><button id="retry" type="button">Show error</button>';
	document.getElementById('retry').onclick = () => document.getElementById('out').insertAdjacentHTML('beforeend', '<pre>Failed to fetch</pre>');
});
</script></body></html>`;
	// The port renders the same posts on its server.
	const ssr = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Posts</title></head><body><main><h1>Posts</h1><div id="out">${list('<li>First post</li><li>Second post</li>')}</div></main>
<script>document.getElementById('more').onclick = () => document.getElementById('posts').insertAdjacentHTML('beforeend', '<li>Third post</li>');</script></body></html>`;
	const [oldOrigin, newOrigin] = await Promise.all([serve((p) => (p === '/' ? { type: 'text/html', body: spa } : undefined)), serve((p) => (p === '/' ? { type: 'text/html', body: ssr } : undefined))]);
	const report: Report = await runCheck({ oldOrigin, newOrigin, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1 });
	const route = report.routes[0]!;
	const journeys = route.journeys?.map((j) => j.name) ?? [];
	assert.ok(journeys.some((n) => n.includes('Show more')), JSON.stringify(journeys));
	assert.ok(!journeys.some((n) => /Show error/i.test(n)), `the old page's journeys never reached its error screen: ${JSON.stringify(journeys)}`);
	const behaviour = route.failures.filter((f) => !f.accepted && (f.dimension === 'behaviour' || f.dimension === 'a11y'));
	assert.deepEqual(behaviour.map((f) => [f.check, f.actual]), []);
});

test('with the old source scanned, a data call to a host its API client names is answered in journeys even when this page did not load it', async () => {
	const { clientHosts } = await import('../src/check/run.ts');
	assert.deepEqual([...clientHosts([{ kind: 'rest', file: 'src/utils/mockTodos.ts', line: 53, queries: ['https://jsonplaceholder.typicode.com/posts'] }, { kind: 'rest', file: 'a.ts', line: 1, queries: ['/api/me'], base: 'https://api.example.com/v1' }])].sort(), ['api.example.com', 'jsonplaceholder.typicode.com']);
	// An app whose start page links to a page that reads the posts: the journey follows the link, the start page loaded nothing from the API.
	const api = await serve((path) => (path === '/posts' ? { type: 'application/json', body: '["First post"]' } : undefined));
	const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Posts</title></head><body><main>${body}</main></body></html>`;
	const reader = `<h1>Posts</h1><div id="out"></div><script>fetch('${api}/posts').then((r) => r.json()).then((p) => { document.getElementById('out').textContent = p.join(', '); }, () => { document.getElementById('out').textContent = 'Failed to fetch'; });</script>`;
	const old = await serve((p) => (p === '/' ? { type: 'text/html', body: page('<h1>Home</h1><a href="/posts">Posts</a>') } : p === '/posts' ? { type: 'text/html', body: page(reader) } : undefined));
	const next = await serve((p) => (p === '/' ? { type: 'text/html', body: page('<h1>Home</h1><a href="/posts">Posts</a>') } : p === '/posts' ? { type: 'text/html', body: page('<h1>Posts</h1><div id="out">First post</div>') } : undefined));
	const source = { routes: [], authGuards: [], nondeterminism: [], clients: [{ kind: 'rest', file: 'src/posts.ts', line: 3, queries: [`${api}/posts`] }], writes: [], components: [] } as never;
	const report: Report = await runCheck({ oldOrigin: old, newOrigin: next, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, source });
	const route = report.routes[0]!;
	const followed = route.journeys?.find((j) => j.name === 'click link "Posts"');
	assert.ok(followed, JSON.stringify(route.journeys?.map((j) => j.name)));
	assert.ok(!JSON.stringify(followed.expected).includes('Failed to fetch'), JSON.stringify(followed.expected));
});

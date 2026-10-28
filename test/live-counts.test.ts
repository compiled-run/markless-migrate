// A star count the old site reads from GitHub when it is built, and the port has from when it was converted: once
// GitHub's API confirms the old page shows the live count, the new page is shown it too; otherwise the difference stands.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { countLinks, learnLiveCounts, showsCount } from '../src/check/live-counts.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type RouteCapture } from '../src/check/types.ts';

function site(count: string, repo: string): Promise<Server> {
	const server = createServer((req, res) => {
		if (new URL(req.url ?? '/', 'http://x').pathname !== '/') return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html lang="en"><title>Docs</title><header><a href="https://github.com/acme/${repo}"><svg width="8" height="8" aria-hidden="true"></svg><span>${count}</span></a> <a href="https://github.com/acme/${repo}/issues">12 issues</a></header><main><h1>Docs</h1></main>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
const servers: Server[] = [];
const realFetch = globalThis.fetch;
const stars = new Map<string, number>();
before(async () => {
	browser = await chromium.launch();
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const repo = /^https:\/\/api\.github\.com\/repos\/acme\/([\w-]+)$/.exec(url)?.[1];
		if (!repo) return realFetch(input, init);
		const n = stars.get(repo);
		return n === undefined ? new Response('{}', { status: 403 }) : Response.json({ stargazers_count: n });
	}) as typeof fetch;
});
after(async () => {
	globalThis.fetch = realFetch;
	await browser?.close();
	for (const s of servers) s.close();
});
const at = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const check = async (repo: string, old: string, port: string) => {
	const [a, b] = await Promise.all([site(old, repo), site(port, repo)]);
	servers.push(a, b);
	return runCheck({ oldOrigin: at(a), newOrigin: at(b), routes: ['/'], viewports: [VIEWPORTS[0]!], browser });
};
const unaccepted = (r: Awaited<ReturnType<typeof check>>) => r.routes[0]!.failures.filter((f) => !f.accepted).map((f) => `${f.dimension}: ${f.check}: ${f.expected} / ${f.actual}`);

test('a repository star count GitHub confirms on the old page is shown on the new page too, and named among what is pinned', async () => {
	stars.set('widgets', 126_912);
	const report = await check('widgets', '127k', '126k');
	assert.deepEqual(unaccepted(report), []);
	assert.ok(report.pinned?.some((p) => /star count/.test(p) && /github\.com\/acme\/widgets.*127k/.test(p)), report.pinned?.join('\n'));
});

test('the difference stands when GitHub does not answer, or answers a count the old page does not show', async () => {
	const silent = await check('silent', '127k', '126k');
	assert.ok(unaccepted(silent).some((f) => /126k/.test(f)), unaccepted(silent).join('\n'));
	stars.set('other', 90_000);
	const other = await check('other', '127k', '126k');
	assert.ok(unaccepted(other).some((f) => /126k/.test(f)), unaccepted(other).join('\n'));
});

test('a count link is a link to a repository whose name ends in a count, and a count shows stars at its own precision', () => {
	const aria = ['- banner:', '  - link "127k":', '    - /url: https://github.com/acme/widgets', '    - img', '    - text: 127k', '  - link "12 issues":', '    - /url: https://github.com/acme/widgets/issues', '  - link "GitHub 1,204":', '    - /url: https://github.com/acme/tools/'];
	assert.deepEqual(countLinks(aria), [{ repo: 'https://github.com/acme/widgets', text: '127k' }, { repo: 'https://github.com/acme/tools', text: '1,204' }]);
	assert.ok(showsCount('127k', 126_501) && showsCount('127k', 127_999) && !showsCount('127k', 125_000));
	assert.ok(showsCount('1.2k', 1_249) && !showsCount('1.2k', 1_400));
	assert.ok(showsCount('1,204', 1_210) && !showsCount('1,204', 1_300));
});

test('learnLiveCounts keeps only the counts GitHub confirms', async () => {
	const page = (aria: string[]) => ({ pages: { desktop: { aria } } }) as unknown as RouteCapture;
	const into = new Map<string, string>();
	const fetcher = (async (url: string) => (url.endsWith('/widgets') ? Response.json({ stargazers_count: 127_100 }) : Response.json({ stargazers_count: 5 }))) as unknown as typeof fetch;
	await learnLiveCounts([page(['- link "127k":', '  - /url: https://github.com/acme/widgets']), page(['- link "9k":', '  - /url: https://github.com/acme/learn-other'])], into, fetcher);
	assert.deepEqual([...into], [['https://github.com/acme/widgets', '127k']]);
});

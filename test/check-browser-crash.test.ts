// check, its own browser dying partway through the routes: the route it died under is checked once more on a new
// browser, and the routes after it are checked as if nothing happened.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const page = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`;
const ROUTES = ['/a', '/once', '/b'];

/** Kills every Chromium this test process launched, as a crash or the kernel would. */
function killBrowsers(): void {
	for (const row of execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' }).trim().split('\n')) {
		const [pid, ppid, ...command] = row.trim().split(/\s+/);
		if (Number(ppid) === process.pid && /chrom/i.test(command.join(' '))) process.kill(Number(pid), 'SIGKILL');
	}
}

const servers: Server[] = [];
const serve = (onPage: (path: string, browser: boolean) => void = () => {}): Promise<Server> => {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		onPage(path, /HeadlessChrome|Chrome\//.test(req.headers['user-agent'] ?? ''));
		const known = ROUTES.includes(path);
		res.writeHead(known ? 200 : 404, { 'content-type': 'text/html' }).end(known ? page(path) : page('Not found'));
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
};
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
after(() => {
	for (const s of servers) s.close();
});

test("the check's browser dying under a route is launched again: that route is checked once more and the rest as usual", async () => {
	let killed = 0;
	const old = await serve();
	const next = await serve((path, browser) => {
		if (browser && path === '/once' && !killed++) killBrowsers();
	});
	const report = await runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: ROUTES, viewports: [VIEWPORTS[0]!], concurrency: 1, journeys: { maxJourneys: 5 } });
	assert.equal(killed > 0, true, 'the browser was killed under /once');
	for (const route of ROUTES) {
		const result = report.routes.find((r) => r.route === route)!;
		assert.ok(!result.failures.some((f) => /stopped|has been closed/.test(f.actual ?? '')), `${route} was checked to the end: ${JSON.stringify(result.failures.map((f) => f.actual))}`);
	}
});

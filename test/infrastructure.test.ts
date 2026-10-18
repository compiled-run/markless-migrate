import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';

process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS = '300';
const { loadPage, InfrastructureError } = await import('../src/check/infrastructure.ts');
const { runCheck } = await import('../src/check/run.ts');
const { summarize } = await import('../src/check/summary.ts');
const { VIEWPORTS } = await import('../src/check/types.ts');

const PAGE = '<!doctype html><html lang="en"><title>Home</title><main><h1>Home</h1></main>';
const listen = (handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Server> => new Promise((done) => {
	const server = createServer(handler);
	server.listen(0, '127.0.0.1', () => done(server));
});
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

let browser: Browser;
let good: Server;
before(async () => {
	browser = await chromium.launch();
	good = await listen((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
});
after(async () => {
	await browser?.close();
	good?.closeAllConnections();
	good?.close();
});

test('a page load that times out is tried once more after the backoff, and a load that answers then is kept', async () => {
	let seen = 0;
	const flaky = await listen((_, res) => {
		if (++seen === 1) return;
		res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
	});
	const page = await browser.newPage();
	try {
		const started = Date.now();
		const response = await loadPage(page, `${origin(flaky)}/`, { timeout: 500 });
		assert.equal(response?.status(), 200);
		assert.equal(seen, 2);
		assert.ok(Date.now() - started >= 800, 'waited out the first load and the backoff');
	} finally {
		await page.close();
		flaky.closeAllConnections();
		flaky.close();
	}
});

test('a load the network fails twice is an InfrastructureError naming the cause', async () => {
	const page = await browser.newPage();
	try {
		await assert.rejects(loadPage(page, 'http://markless-migrate-nowhere.invalid/', { timeout: 5_000 }), (error: unknown) => {
			assert.ok(error instanceof InfrastructureError);
			assert.equal(error.infrastructure.cause, 'dns');
			assert.match(error.message, /^DNS: markless-migrate-nowhere\.invalid does not resolve \(ERR_NAME_NOT_RESOLVED\).*twice/);
			return true;
		});
	} finally {
		await page.close();
	}
});

const one = (oldOrigin: string, newOrigin: string, timeoutMs?: number) => runCheck({ oldOrigin, newOrigin, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, ...(timeoutMs ? { timeoutMs } : {}) });

test('an old origin that does not resolve is reported as a DNS infrastructure failure on OLD, not as a red route', async () => {
	const report = await one('http://markless-migrate-nowhere.invalid', origin(good));
	const route = report.routes[0]!;
	assert.equal(report.ok, false);
	assert.deepEqual(route.failures, []);
	assert.equal(route.endpoint, undefined, 'not mistaken for a non-page endpoint');
	assert.equal(route.infrastructure?.side, 'old');
	assert.equal(route.infrastructure?.cause, 'dns');
	assert.match(route.infrastructure!.message, /DNS: markless-migrate-nowhere\.invalid does not resolve/);
	assert.match(summarize(report), /NETWORK +\/ +not checked, an infrastructure failure \(not the app's\): OLD: /);
	assert.match(summarize(report), /0 of 1 routes green, 1 not checked for an infrastructure failure/);
});

test('a new origin that refuses connections is named as a connection failure on NEW', async () => {
	const closed = await listen(() => {});
	const gone = origin(closed);
	await new Promise((done) => closed.close(done));
	const route = (await one(origin(good), gone)).routes[0]!;
	assert.equal(route.infrastructure?.side, 'new');
	assert.equal(route.infrastructure?.cause, 'connect');
	assert.match(route.infrastructure!.code ?? '', /CONNECTION_REFUSED|ECONNREFUSED/);
});

test('a deployment that hangs part way cannot stall the run: the route stops at --timeout as an infrastructure failure', async () => {
	// The checker's own requests get an answer; the browser's page load never finishes.
	const hung = await listen((req, res) => {
		if (/Chrome/.test(req.headers['user-agent'] ?? '')) return void res.writeHead(200, { 'content-type': 'text/html' }).write('<!doctype html><title>');
		res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
	});
	try {
		const started = Date.now();
		const route = (await one(origin(good), origin(hung), 3_000)).routes[0]!;
		assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started} ms`);
		assert.equal(route.infrastructure?.cause, 'check timeout');
		assert.match(route.infrastructure!.message, /did not finish within 3 s \(--timeout\)/);
		assert.deepEqual(route.failures, []);
	} finally {
		hung.closeAllConnections();
		hung.close();
	}
});

test('a retried load that the about:blank before it aborts is loaded again, not a crash of the whole check', async () => {
	const calls: string[] = [];
	const outcomes: (() => unknown)[] = [
		() => Object.assign(new Error('page.goto: Timeout 500ms exceeded.'), { name: 'TimeoutError' }),
		() => undefined,
		() => new Error('page.goto: Navigation to "http://x/a/" is interrupted by another navigation to "about:blank"'),
		() => undefined,
	];
	const page = {
		goto: async (url: string) => {
			calls.push(url);
			const outcome = outcomes.shift()!();
			if (outcome instanceof Error) throw outcome;
			return url === 'about:blank' ? null : ({ ok: true } as unknown);
		},
	} as unknown as import('playwright').Page;
	assert.deepEqual(await loadPage(page, 'http://x/a/', { timeout: 500, backoffMs: 1 }), { ok: true });
	assert.deepEqual(calls, ['http://x/a/', 'about:blank', 'http://x/a/', 'http://x/a/']);
});

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
		assert.match(route.infrastructure!.message, /incomplete: timed out after 3 s, steps done \d+ of \d+/);
		assert.deepEqual(route.failures, []);
	} finally {
		hung.closeAllConnections();
		hung.close();
	}
});

test('a load that times out names the request the page was still waiting on', async () => {
	const stuck = await listen((req, res) => {
		if (req.url === '/never.png') return;
		res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>x</title><img src="/never.png"><script>fetch("/never.png?poll")</script>');
	});
	try {
		const context = await browser.newContext();
		const page = await context.newPage();
		const error = await loadPage(page, `${origin(stuck)}/chart`, { timeout: 1_500, backoffMs: 10 }).catch((e: Error) => e);
		await context.close();
		assert.match((error as Error).message, /did not finish loading within 2 s, twice, 0 s apart; still waiting on http:\/\/127\.0\.0\.1:\d+\/never\.png \(image, \d+ s\)$/);
	} finally {
		stuck.closeAllConnections();
		stuck.close();
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

test('a route whose check is still going at --timeout while both apps keep answering is red for running out of time, not an infrastructure failure', async () => {
	const { withDeadline } = await import('../src/check/run.ts');
	const { defaultEnv } = await import('../src/check/browser.ts');
	const run = { old: defaultEnv(origin(good)), new: defaultEnv(origin(good)), frozen: false };
	// Stands in for the journeys of a page with hundreds of controls: every load answers, there are just too many of them.
	const route = await withDeadline('/thread', run, 2_000, async (scoped) => {
		const context = await browser.newContext();
		scoped.old.scope!.track(context);
		const page = await context.newPage();
		for (;;) await page.goto(origin(good));
	});
	assert.equal(route.infrastructure, undefined, JSON.stringify(route.infrastructure));
	assert.equal(route.ok, false);
	assert.equal(route.failures[0]?.check, 'the check of this route');
	assert.match(route.failures[0]!.actual, /^incomplete: timed out after 2 s, steps done 0 of 0; both apps were still answering/);
});

test('a route still in a part that sends no request at --timeout, after both apps answered, is red as incomplete and says how far it got', async () => {
	const { withDeadline, profiled } = await import('../src/check/run.ts');
	const { defaultEnv } = await import('../src/check/browser.ts');
	const run = { old: defaultEnv(origin(good)), new: defaultEnv(origin(good)), frozen: false };
	const route = await withDeadline('/quiet', run, 2_000, async (scoped) => {
		const context = await browser.newContext();
		scoped.old.scope!.track(context);
		const page = await context.newPage();
		await profiled('/quiet', 'load both sides', () => page.goto(origin(good)));
		// Stands in for a busy-CPU lane or journeys deciding what to do: well past the last answer, no request in flight.
		return profiled('/quiet', 'journeys', () => new Promise<never>(() => {}));
	});
	assert.equal(route.infrastructure, undefined, JSON.stringify(route.infrastructure));
	assert.equal(route.ok, false);
	assert.match(route.failures[0]!.actual, /^incomplete: timed out after 2 s, steps done 1 of 2 \(load both sides; running: journeys\)/);
});

test('a request its page dropped by navigating away or closing does not make a route that ran out of time an infrastructure failure', async () => {
	const { withDeadline } = await import('../src/check/run.ts');
	const { defaultEnv } = await import('../src/check/browser.ts');
	const run = { old: defaultEnv(origin(good)), new: defaultEnv(origin(good)), frozen: false };
	const hung = await listen(() => {});
	try {
		const route = await withDeadline('/thread', run, 2_000, async (scoped) => {
			const context = await browser.newContext();
			scoped.old.scope!.track(context);
			const closed = await context.newPage();
			await closed.goto(origin(good));
			await closed.evaluate((url) => void fetch(url, { mode: 'no-cors' }).catch(() => {}), `${origin(hung)}/closed`);
			const page = await context.newPage();
			await page.goto(origin(good));
			await page.evaluate((url) => void fetch(url, { mode: 'no-cors' }).catch(() => {}), `${origin(hung)}/left`);
			await new Promise((done) => setTimeout(done, 100));
			await closed.close();
			for (;;) await page.goto(origin(good));
		});
		assert.equal(route.infrastructure, undefined, JSON.stringify(route.infrastructure));
		assert.match(route.failures[0]!.actual, /^incomplete: timed out after 2 s/);
	} finally {
		hung.closeAllConnections();
		hung.close();
	}
});

test('at --timeout, an app that has not answered the route\'s pages is an infrastructure failure even while the other keeps answering', async () => {
	const { withDeadline } = await import('../src/check/run.ts');
	const { defaultEnv } = await import('../src/check/browser.ts');
	const hung = await listen((_, res) => void res.writeHead(200, { 'content-type': 'text/html' }).write('<!doctype html><title>'));
	try {
		const run = { old: defaultEnv(origin(good)), new: defaultEnv(origin(hung)), frozen: false };
		const route = await withDeadline('/', run, 2_000, async (scoped) => {
			const context = await browser.newContext();
			scoped.old.scope!.track(context);
			const oldPage = await context.newPage();
			const newPage = await context.newPage();
			// The new side's load starts late and is still young at the deadline, as on a slow machine.
			setTimeout(() => void newPage.goto(origin(hung)).catch(() => {}), 1_700);
			for (;;) await oldPage.goto(origin(good));
		});
		assert.equal(route.infrastructure?.cause, 'check timeout', JSON.stringify(route.failures));
	} finally {
		hung.closeAllConnections();
		hung.close();
	}
});

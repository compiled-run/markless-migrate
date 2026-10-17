import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

process.env.MARKLESS_MIGRATE_REQUEST_TIMEOUT_MS = '800';
const { captureHttp } = await import('../src/check/capture.ts');
const { probeWall } = await import('../src/check/blocked.ts');
const { captureEndpoint } = await import('../src/check/endpoints.ts');
const { defaultEnv } = await import('../src/check/browser.ts');

// Answers with headers and the start of a body, then goes silent with the connection open, as a server that drops a client does.
let server: Server;
let origin: string;
before(async () => {
	server = createServer((_, res) => {
		res.writeHead(200, { 'content-type': 'text/html', 'content-length': '100000' });
		res.write('<!doctype html><title>x');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server?.closeAllConnections?.() ?? server?.close());

const within = <T>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms))]);

test('a server that goes silent mid-response does not hold check: the request gives up and names the origin', async () => {
	assert.equal(await within(probeWall(defaultEnv(origin), '/x', 'old'), 5_000), undefined);
	await assert.rejects(within(captureEndpoint(defaultEnv(origin), '/feed.xml'), 5_000), new RegExp(`could not reach ${origin.replace(/[.]/g, '\\.')} \\(/feed\\.xml\\): no complete answer within 1 s`));
});

test('an origin that refuses the connection is named instead of "fetch failed"', async () => {
	const closed = createServer();
	await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
	const gone = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
	await new Promise((done) => closed.close(done));
	await assert.rejects(captureHttp(gone, '/about'), new RegExp(`could not reach ${gone.replace(/[.]/g, '\\.')} \\(/about\\): ECONNREFUSED`));
});

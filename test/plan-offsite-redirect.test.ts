import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { plan } from '../src/plan/inventory.ts';

const listen = (server: Server) => new Promise<string>((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

test('plan records a redirect to another site as the old app\'s redirect, not as a wall on the old app', async () => {
	const elsewhere = createServer((_req, res) => {
		res.writeHead(403, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }).end('<title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script>');
	});
	const away = await listen(elsewhere);
	const old = createServer((req, res) => {
		if (req.url === '/discord') res.writeHead(301, { location: `${away}/invite` }).end();
		else res.writeHead(200, { 'content-type': 'text/html' }).end('<html lang="en"><title>Home</title><a href="/discord">chat</a></html>');
	});
	const origin = await listen(old);
	try {
		const inventory = await plan({ origin, limit: 5 });
		const discord = inventory.routes.find((r) => r.route === '/discord');
		assert.equal(discord?.status, 301);
		assert.equal(discord?.redirectsTo, `${away}/invite`);
	} finally {
		old.close();
		elsewhere.close();
	}
});

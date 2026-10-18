import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { SideEnv } from '../src/check/browser.ts';
import { checkCoverage } from '../src/check/coverage.ts';

// Both apps send every unknown path to /install, as alpinejs.dev sends it to /essentials/installation.
function app(pages: readonly string[]): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (pages.includes(path)) res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>${path}</title>`);
		else res.writeHead(302, { location: '/install' }).end();
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const env = (server: Server) => ({ origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, freeze: false, block: () => false, sendWrites: false, writeFacts: [] }) as unknown as SideEnv;

test("the page an old site's catch-all redirects to is present when the new app answers it and copies the catch-all", async () => {
	const [old, next] = await Promise.all([app(['/', '/install', '/docs']), app(['/', '/install'])]);
	try {
		const coverage = await checkCoverage(env(old), env(next), ['/', '/install', '/docs']);
		assert.deepEqual(coverage.missing, ['/docs']);
		assert.equal(coverage.present, 2);
	} finally {
		old.close();
		next.close();
	}
});

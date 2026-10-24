import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

const serve = (body: string): Promise<string> => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body));
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
};
const page = (style: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Grid</title><style>body { margin: 0 } ${style} .card { height: 40px; background: rgb(30, 30, 30) }</style></head><body><main><section class="grid"><div class="card"></div></section></main></body></html>`;

test('a margin written another way that leaves every box and pixel where it was is not a difference; one that moves the box is', async () => {
	const margin = page('.grid { padding: 0 } .card { margin: 0 16px }');
	const padding = page('.grid { padding: 0 16px } .card { margin: 0 }');
	const moved = page('.grid { padding: 0 } .card { margin: 0 24px }');
	const [a, b, c] = await Promise.all([serve(margin), serve(padding), serve(moved)]);
	const css = async (next: string) => (await runCheck({ oldOrigin: a, newOrigin: next, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1 })).routes[0]!.failures.filter((f) => f.dimension === 'css' && /margin/.test(f.expected));
	assert.deepEqual((await css(b)).map((f) => f.expected), []);
	assert.ok((await css(c)).length, 'a margin that moves the card is red');
});

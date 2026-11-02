// The table recorder's first look at a page: on a busy machine React takes over a server-rendered table well after load,
// and a look at a fixed time after load found no table and recorded none, with no error.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureTables } from '../../src/convert/tanstack-table.ts';

const require = createRequire(import.meta.url);
const TABLE_CORE = join(dirname(require.resolve('@tanstack/table-core/package.json')), 'dist');
const STORE = join(dirname(require.resolve('@tanstack/store/package.json', { paths: [TABLE_CORE] })), 'dist');

// A table the server rendered; `takeOver` is whether the page's script later gives it a TanStack instance through a React
// fiber, after load and in slices of work the way React's scheduler hydrates.
const page = (takeOver: boolean) => `<!doctype html><html lang="en"><head><title>Payments</title>
<script type="importmap">{"imports":{"@tanstack/table-core":"/tc/index.js","@tanstack/table-core/":"/tc/","@tanstack/store":"/st/index.js"}}</script>
<script>globalThis.process = { env: { NODE_ENV: 'production' } };</script></head>
<body><main><div id="region"><table><tbody><tr><td>ken99@example.com</td></tr><tr><td>Abe45@example.com</td></tr></tbody></table></div></main>
<script type="module">
import { constructTable } from '@tanstack/table-core';
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings.js';
const table = constructTable({
	features: { coreReactivityFeature: storeReactivityBindings() },
	data: [{ email: 'ken99@example.com' }, { email: 'Abe45@example.com' }],
	columns: [{ id: 'email', accessorKey: 'email' }],
});
const region = document.getElementById('region');
const el = region.querySelector('table');
// About 25 ms of work per slice on an idle machine, counted in iterations: the recorder's page has a frozen clock.
const burn = () => { let x = 0; for (let i = 0; i < 3e7; i++) x += i; return x; };
addEventListener('load', () => {
	let left = 5;
	const slice = () => {
		burn();
		if (--left) return setTimeout(slice, 0);
		if (${takeOver}) el.__reactFiber$test = { memoizedState: { memoizedState: table, next: null }, child: { stateNode: region } };
	};
	setTimeout(slice, 0);
});
</script></body></html>`;

let browser: Browser;
const servers: Server[] = [];
const dirs: string[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
	await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

async function serve(html: string): Promise<string> {
	const server = createServer(async (req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const root = path.startsWith('/tc/') ? TABLE_CORE : path.startsWith('/st/') ? STORE : undefined;
		if (!root) return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
		const file = normalize(join(root, path.slice(4)));
		if (!file.startsWith(root)) return res.writeHead(404).end();
		const body = await readFile(file).catch(() => undefined);
		res.writeHead(body ? 200 : 404, { 'content-type': 'text/javascript' }).end(body);
	});
	servers.push(server);
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** The browser with every page it opens throttled `rate` times on the CPU from before its first load. */
function throttled(rate: number): Browser {
	return new Proxy(browser, {
		get(target, key) {
			if (key !== 'newContext') return Reflect.get(target, key, target);
			return async (...args: Parameters<Browser['newContext']>) => {
				const context = await target.newContext(...args);
				const newPage = context.newPage.bind(context);
				context.newPage = async () => {
					const p = await newPage();
					await (await context.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate });
					return p;
				};
				return context;
			};
		},
	});
}

const cacheDir = async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-tables-'));
	dirs.push(dir);
	return dir;
};

test('under 8x CPU throttling the first look finds the table React takes over well after load', { timeout: 120_000 }, async () => {
	const origin = await serve(page(true));
	const captured = await captureTables(throttled(8), origin, '/', await cacheDir(), () => {}, 1);
	assert.equal(captured.notFound, undefined);
	assert.equal(captured.tables.length, 1, JSON.stringify(captured.skipped));
	assert.deepEqual(captured.tables[0]!.data, [{ email: 'ken99@example.com' }, { email: 'Abe45@example.com' }]);
});

test('a table the settled page showed that is never taken over is recorded as not found, and not kept as the route\'s capture', { timeout: 120_000 }, async () => {
	const origin = await serve(page(false));
	const dir = await cacheDir();
	const captured = await captureTables(browser, origin, '/', dir, () => {}, 1);
	assert.equal(captured.tables.length, 0);
	assert.match(captured.notFound ?? '', /0 of the 1 tables/);
	const again = await captureTables(browser, origin, '/', dir, () => {}, 1);
	assert.ok(again.notFound, 'looked for again, not read back from the cache');
});

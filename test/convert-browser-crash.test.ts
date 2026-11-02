// convert --capture-only when the recorder's browser dies partway through: the pages captured on it at the time are
// captured once more on a new browser, a page whose capture kills the browser again is reported failed with its reason
// and keeps no recording, and every other page is still captured.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { convert } from '../src/convert/index.ts';

const page = (title: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`;
const ROUTES = ['/a', '/once', '/b', '/always', '/c', '/d'];
// A page whose markup a recorder cannot read: its capture throws an error of its own, the browser alive.
const BROKEN = `<!doctype html><html lang="en"><head><title>Broken</title><script>Object.defineProperty(document.documentElement, 'outerHTML', { get() { throw new TypeError('no markup here'); } });</script></head><body><main><h1>Broken</h1></main></body></html>`;
const ISOLATED = ['/e', '/broken', '/f', '/g', '/h'];

/** Kills every Chromium this test process launched, as a crash or the kernel would. */
function killBrowsers(): void {
	const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' }).trim().split('\n');
	for (const row of rows) {
		const [pid, ppid, ...command] = row.trim().split(/\s+/);
		if (Number(ppid) === process.pid && /chrom/i.test(command.join(' '))) process.kill(Number(pid), 'SIGKILL');
	}
}

let server: Server;
let origin: string;
const kills: string[] = [];
before(async () => {
	server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		// The plain request convert keys a page's recordings with comes from node, not the browser.
		const browser = req.headers['user-agent'] !== 'node';
		if (browser && (path === '/always' || (path === '/once' && !kills.includes('/once')))) {
			kills.push(path);
			killBrowsers();
		}
		const known = ROUTES.includes(path) || ISOLATED.includes(path);
		res.writeHead(known ? 200 : 404, { 'content-type': 'text/html' }).end(path === '/broken' ? BROKEN : known ? page(path) : page('Not found'));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function appFor(routes: readonly string[]): Promise<string> {
	const app = await mkdtemp(join(tmpdir(), 'capture-crash-'));
	await mkdir(join(app, '.migrate'), { recursive: true });
	await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: routes.map((route) => ({ route, status: 200 })) }));
	await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'capture-crash', private: true, type: 'module', dependencies: {} }));
	await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
	return app;
}

const capturedFiles = async (app: string) => (await readdir(join(app, '.migrate', 'convert', 'captures'), { recursive: true })).filter((f) => f.endsWith('.json'));

test('a browser that dies mid-shard is launched again: its pages are captured once more, one that kills it twice is failed, the rest captured', async () => {
	const app = await appFor(ROUTES);
	try {
		const lines: string[] = [];
		const report = await convert({ old: origin, app, only: ROUTES, reveal: false, captureOnly: true, concurrency: 1, log: (line) => lines.push(line) }).catch((error: Error) => assert.fail(`the shard failed: ${error.message.split('\n')[0]}\n${lines.join('\n')}`));
		assert.ok(kills.filter((k) => k === '/once').length === 1 && kills.filter((k) => k === '/always').length >= 2, `the browser was killed under /once once and under /always on each try: ${kills.join(', ')}`);
		assert.equal((await capturedFiles(app)).length, ROUTES.length - 1, 'every page but the one that failed twice keeps its capture');
		assert.deepEqual(report.unconverted, [{ route: '/always', reason: report.unconverted[0]?.reason }]);
		assert.match(report.unconverted[0]!.reason, /browser/i, 'the failed page says why');
		assert.ok(lines.some((l) => l.includes('/once') && /again/.test(l)), `the retried page is logged: ${lines.join('\n')}`);
		assert.ok(lines.some((l) => l.includes('/always') && /failed/.test(l)), 'the page that failed twice is logged');
		for (const route of ['/c', '/d']) assert.ok(lines.some((l) => l.startsWith('captured ') && l.endsWith(` ${route}`)), `${route}, after the crashes, is captured`);
		assert.equal(existsSync(join(app, '.migrate', 'convert', 'sources.json')), true, 'the recordings are saved');
	} finally {
		await rm(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	}
});

test("one page's capture throwing fails that page alone: the browser stays open for the pages after it", async () => {
	const app = await appFor(ISOLATED);
	try {
		const lines: string[] = [];
		const report = await convert({ old: origin, app, only: ISOLATED, reveal: false, captureOnly: true, concurrency: 1, log: (line) => lines.push(line) }).catch((error: Error) => assert.fail(`the shard failed: ${error.message.split('\n')[0]}\n${lines.join('\n')}`));
		assert.deepEqual(report.unconverted.map((u) => u.route), ['/broken']);
		assert.match(report.unconverted[0]!.reason, /no markup here/);
		assert.equal((await capturedFiles(app)).length, ISOLATED.length - 1);
		assert.ok(!lines.some((l) => /has been closed/.test(l)), `no other page lost its browser: ${lines.join('\n')}`);
	} finally {
		await rm(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	}
});

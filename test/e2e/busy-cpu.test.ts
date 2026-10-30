import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, firefox, webkit, type Browser } from 'playwright';
import { defaultEnv } from '../../src/check/browser.ts';
import { busyCpu, checkBusyCpu } from '../../src/check/busy-cpu.ts';
import { VIEWPORTS } from '../../src/check/types.ts';

const page = (script: string) => `<!doctype html><html lang="en"><head><title>Busy</title></head><body><main><h1>Busy</h1><button id="save">Save</button><p id="out">idle</p></main><script>${script}</script></body></html>`;
// The original answers whatever the CPU is doing.
const STEADY = page(`document.getElementById('save').onclick = () => { document.getElementById('out').textContent = 'saved'; };`);
// The port's answer is lost when its work runs slower than on an idle CPU (it measures that work at load, idle): what a
// handler woken late on a busy device looks like.
const FRAGILE = page(`
const work = () => { const t = performance.now(); let x = 0; for (let i = 0; i < 4e7; i++) x += i; return performance.now() - t; };
const idle = Math.min(work(), work(), work());
document.getElementById('save').onclick = () => { if (work() < idle * 1.5) document.getElementById('out').textContent = 'saved'; };`);

const servers: Server[] = [];
const browsers: Record<string, Browser> = {};
before(async () => {
	[browsers.chromium, browsers.firefox, browsers.webkit] = await Promise.all([chromium.launch(), firefox.launch(), webkit.launch()]);
});
after(async () => {
	await Promise.all(Object.values(browsers).map((b) => b.close()));
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

async function serve(html: string): Promise<string> {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html));
	servers.push(server);
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('a busy CPU slows a page down: a loop takes longer in it than on an idle machine', async () => {
	const p = await browsers.chromium!.newPage();
	const loop = () => p.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 4e7; i++) x += i; return performance.now() - t; });
	const idle = Math.min(await loop(), await loop());
	const busy = await busyCpu(() => loop());
	await p.close();
	assert.ok(busy > idle * 1.5, `idle ${idle} ms, busy ${busy} ms`);
});

test('a control that answers on an idle CPU but not on a busy one is red in every engine, and one that answers either way is not', { timeout: 600_000 }, async () => {
	const sides = { old: defaultEnv(await serve(STEADY)), new: defaultEnv(await serve(FRAGILE)) };
	const out = await checkBusyCpu(browsers, sides, '/', VIEWPORTS[0]!);
	for (const engine of ['Chromium', 'Firefox', 'WebKit']) assert.ok(out.failures.some((f) => f.check.includes(`busy CPU (${engine})`) && f.expected.includes('button "Save"')), `${engine}: ${JSON.stringify(out.failures)}`);
	const same = { old: defaultEnv(await serve(STEADY)), new: defaultEnv(await serve(STEADY)) };
	assert.deepEqual((await checkBusyCpu(browsers, same, '/', VIEWPORTS[0]!)).failures, []);
});

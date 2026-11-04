import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { openSession } from '../src/check/journeys.ts';
import { measureOnce } from '../src/check/responsiveness.ts';
import { speeds, speedTiming } from '../src/check/responsiveness-compare.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A dialog whose code the page imports eagerly (`eager`), or only once it has gone idle, as a deferred part is.
const page = (eager: boolean) => `<!doctype html><html lang="en"><head><title>Idle</title></head><body><main><h1>Idle</h1><button id="b">Open</button><p id="out"></p><p id="ready"></p></main><script>
let mod;
const load = () => import('/chunk.js').then((m) => { document.getElementById('ready').textContent = 'Parts loaded'; return (mod = m); });
${eager ? 'load();' : 'requestIdleCallback(load);'}
document.getElementById('b').onclick = async () => { (mod ?? (await load())).open(); };
</script></body></html>`;
const CHUNK = `export function open() { document.getElementById('out').textContent = 'Opened'; }`;

let browser: Browser;
const servers: Server[] = [];
const serve = (eager: boolean): Promise<string> =>
	new Promise((done) => {
		const server = createServer((req, res) => {
			if (req.url === '/chunk.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(CHUNK);
			res.writeHead(req.url === '/' ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(req.url === '/' ? page(eager) : '');
		});
		servers.push(server);
		server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
	});
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

const step = { action: 'click' as const, target: { role: 'button', name: 'Open', nth: 0 } };

test('a press is timed before the page\'s idle work, on every run: code the page would only import at idle is code the press fetched', async () => {
	const [eager, idle] = await Promise.all([serve(true), serve(false)]);
	const [desktop] = speeds(4);
	for (let run = 0; run < 3; run++) {
		const [old, next] = [await measureOnce(browser, defaultEnv(eager), '/', desktop!, step), await measureOnce(browser, defaultEnv(idle), '/', desktop!, step)];
		assert.deepEqual(old.fetches.filter((f) => f.kind === 'code').map((f) => f.url), [], 'the eager page has its code before the press');
		assert.deepEqual(next.fetches.filter((f) => f.kind === 'code').map((f) => f.url), ['/chunk.js'], `run ${run}: the press fetched the idle import`);
		assert.match(speedTiming(desktop!, 'in-page', [old], [next], 200).problems.join(), /fetched code on the first interaction: \/chunk\.js/);
	}
});

test('a journey step starts once the page\'s idle work has run, so what that work changes is never the step\'s', async () => {
	const idle = await serve(false);
	for (let run = 0; run < 3; run++) {
		const session = await openSession(browser, defaultEnv(idle), '/', VIEWPORTS[0]!);
		try {
			const result = await session.run(step);
			assert.ok(!result.added.some((l) => l.includes('Parts loaded')), `run ${run}: what the idle work showed is not the step's (${JSON.stringify(result.added)})`);
			assert.ok(result.added.some((l) => l.includes('Opened')), JSON.stringify(result.added));
		} finally {
			await session.context.close();
		}
	}
});

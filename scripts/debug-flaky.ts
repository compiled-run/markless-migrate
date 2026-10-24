// Runs the dead-carousel check several times and prints what the old and new reactions were each time.
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';
const src = (await import('node:fs')).readFileSync('test/dead-controls.test.ts', 'utf8');
const W = /const WIDGETS = `([\s\S]*?)`;/.exec(src)![1];
const B = /const BEHAVIOUR = `([\s\S]*?)<\/script>`;/.exec(src)![1] + '</script>';
const page = (b: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Widgets</title></head><body><header><nav><a href="/">Home</a></nav></header><main><h1>Widgets</h1>${b}</main></body></html>`;
const mk = (body: string) => new Promise<string>((d) => { const s = createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(body)); s.listen(0, '127.0.0.1', () => d(`http://127.0.0.1:${(s.address() as { port: number }).port}`)); });
const browser = await chromium.launch();
for (let i = 0; i < Number(process.argv[2] ?? 4); i++) {
	const [a, b] = await Promise.all([mk(page(W + B)), mk(page(W))]);
	const r = await runCheck({ oldOrigin: a, newOrigin: b, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 4, journeys: { budgetMs: 60_000 } });
	const f = r.routes[0]!.failures.find((x) => x.check === 'click button "Next slide"');
	const j = r.routes[0]!.journeys?.find((x) => x.name === 'click button "Next slide"');
	const runs = (r.routes[0] as unknown as { journeys?: { name: string; expected: { reaction?: unknown }[] }[] }).journeys;
	console.log(i, JSON.stringify(f?.actual), 'explore:', JSON.stringify(j?.expected[0]?.reaction));
}
await browser.close(); process.exit(0);

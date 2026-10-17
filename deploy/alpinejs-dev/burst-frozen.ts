// Like burst.mjs, with markless-migrate's frozen clock: node deploy/alpinejs-dev/burst-frozen.ts <url> <n>
import { chromium } from 'playwright';
import { freezePage } from '../../src/check/freeze.ts';
const b = await chromium.launch();
const url = process.argv[2]!; const n = Number(process.argv[3] ?? 16); const origin = new URL(url).origin;
await Promise.all(Array.from({ length: n }, async (_, i) => {
	const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
	await ctx.addInitScript(freezePage, { time: Date.parse('2026-01-15T12:00:00Z'), seed: 1 });
	await ctx.route('**/*', (route) => { const r = route.request(); const u = new URL(r.url()); if (u.origin === origin) return route.continue(); return r.method() === 'GET' && ['script', 'stylesheet', 'font', 'image'].includes(r.resourceType()) ? route.continue() : route.abort(); });
	const p = await ctx.newPage();
	const t = Date.now();
	try { await p.goto(url, { waitUntil: 'load', timeout: 30000 }); console.log(i, 'load', Date.now() - t); } catch { console.log(i, 'TIMEOUT'); }
}));
await b.close();

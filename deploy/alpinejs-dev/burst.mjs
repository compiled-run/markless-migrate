// Opens N journey-style contexts at once (cross-origin assets allowed, other cross-origin requests aborted) and reports load times and requests still pending: node deploy/alpinejs-dev/burst.mjs <url> <n>
import { chromium } from 'playwright';
const b = await chromium.launch();
const url = process.argv[2]; const n = Number(process.argv[3] ?? 16); const origin = new URL(url).origin;
const pending = new Map();
await Promise.all(Array.from({ length: n }, async (_, i) => {
	const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
	await ctx.route('**/*', (route) => { const r = route.request(); const u = new URL(r.url()); if (u.origin === origin) return route.continue(); return r.method() === 'GET' && ['script', 'stylesheet', 'font', 'image'].includes(r.resourceType()) ? route.continue() : route.abort(); });
	p.on('request', (r) => pending.set(r, i)); p.on('requestfinished', (r) => pending.delete(r)); p.on('requestfailed', (r) => pending.delete(r));
	const t = Date.now();
	try { await p.goto(url, { waitUntil: 'load', timeout: 30000 }); console.log(i, 'load', Date.now() - t); } catch { console.log(i, 'TIMEOUT'); }
}));
const left = new Map(); for (const [r] of pending) left.set(r.url().slice(0, 100), (left.get(r.url().slice(0, 100)) ?? 0) + 1);
console.log('pending', [...left]);
await b.close();

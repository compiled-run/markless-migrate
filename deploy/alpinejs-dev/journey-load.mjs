import { chromium } from 'playwright';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
const origin = new URL(process.argv[2]).origin;
await ctx.route('**/*', (route) => {
	const r = route.request(); const u = new URL(r.url());
	if (u.origin === origin) return route.continue();
	const asset = r.method() === 'GET' && ['script', 'stylesheet', 'font', 'image'].includes(r.resourceType());
	console.log(asset ? 'continue' : 'abort', r.resourceType(), u.href.slice(0, 100));
	return asset ? route.continue() : route.abort();
});
const t = Date.now();
try { await p.goto(process.argv[2], { waitUntil: 'load', timeout: 20000 }); console.log('load ms', Date.now() - t); } catch { console.log('TIMEOUT'); }
await b.close();

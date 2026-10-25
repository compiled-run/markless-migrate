// A page's load in Chromium: navigation timings, long tasks, and JavaScript executed at load (V8 precise coverage, used bytes).
import { chromium } from 'playwright';
const [origin, path, cookie] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext();
if (cookie) await context.addCookies([{ name: '__prerender_bypass', value: cookie, url: origin }]);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
await page.addInitScript(() => {
	window.__long = 0;
	new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: true });
});
await page.goto(origin + path, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const { result } = await cdp.send('Profiler.takePreciseCoverage');
let executed = 0;
for (const script of result) {
	const end = Math.max(0, ...script.functions.flatMap((f) => f.ranges.map((r) => r.endOffset)));
	const counts = new Uint32Array(end);
	// Ranges nest; a later, inner range overrides the count of the one around it.
	const ranges = script.functions.flatMap((f) => f.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
	for (const r of ranges) counts.fill(r.count, r.startOffset, r.endOffset);
	for (const c of counts) if (c > 0) executed++;
}
const t = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(fcp?.startTime ?? 0), long: Math.round(window.__long) }; });
console.log(JSON.stringify({ origin, path, ...t, executedKB: +(executed / 1024).toFixed(1) }));
await browser.close();

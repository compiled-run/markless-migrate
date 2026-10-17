// JavaScript bytes transferred (as served, compressed or not) and run at load, one load per URL: node deploy/htmx-org/weigh.mjs <url>...
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const url of process.argv.slice(2)) {
	const p = await b.newPage();
	await p.route(/usefathom|carbonads|doubleclick|cloudflareinsights/, (r) => r.abort());
	const sizes = [];
	p.on('requestfinished', async (r) => { if (r.resourceType() === 'script') sizes.push(r.sizes().then((s) => s.responseBodySize + s.responseHeadersSize).catch(() => 0)); });
	await p.coverage.startJSCoverage({ resetOnNavigation: false });
	await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1500);
	const cov = await p.coverage.stopJSCoverage();
	let ran = 0;
	for (const e of cov) for (const f of e.functions) for (const r of f.ranges) if (r.count > 0 && f.ranges[0] === r) ran += r.endOffset - r.startOffset;
	const wire = (await Promise.all(sizes)).reduce((a, n) => a + n, 0);
	console.log(`${url}\t${(wire / 1024).toFixed(1)} kB transferred\t${sizes.length} scripts`);
	await p.close();
}
await b.close();

// peek with the checker's frozen clock: node peek-frozen.mjs <url> <cookie> <width> <runs>
import { chromium } from '../../node_modules/playwright/index.mjs';
import { freezePage, DEFAULT_FREEZE } from '../../src/check/freeze.ts';
const [url, cookie, width = '1280', runs = '5'] = process.argv.slice(2);
const b = await chromium.launch();
for (let i = 0; i < Number(runs); i++) {
	const ctx = await b.newContext({ viewport: { width: Number(width), height: 800 } });
	await ctx.addInitScript(freezePage, { time: DEFAULT_FREEZE.time, seed: DEFAULT_FREEZE.seed });
	await ctx.addCookies(cookie.split('; ').map((c) => { const j = c.indexOf('='); return { name: c.slice(0, j), value: c.slice(j + 1), domain: new URL(url).hostname, path: '/' }; }));
	const p = await ctx.newPage(); const fetches = []; p.on('request', (r) => ['fetch', 'xhr'].includes(r.resourceType()) && fetches.push(r.url()));
	await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
	const snap = await p.locator('body').ariaSnapshot();
	console.log(i, 'pictures', (snap.match(/profile picture/g) ?? []).length, 'fetches', fetches.join(' '));
	await ctx.close();
}
await b.close();

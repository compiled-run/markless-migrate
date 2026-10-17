// node peek.mjs <url> <cookie> [width] : prints the aria snapshot and console errors, saves /tmp/peek.png
import { chromium } from '../../node_modules/playwright/index.mjs';
const [url, cookie, width = '1280'] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: Number(width), height: 844 } });
if (cookie) await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(url).hostname, path: '/' }; }));
const p = await ctx.newPage(); p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text())); p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1500);
console.log(await p.locator('body').ariaSnapshot()); await p.screenshot({ path: '/tmp/peek.png', fullPage: true }); await b.close();

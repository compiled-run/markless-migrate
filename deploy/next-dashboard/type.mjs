// node type.mjs <url> <cookie> <placeholder> <text>: types into a search box, prints console errors, URL and the aria snapshot
import { chromium } from '../../node_modules/playwright/index.mjs';
const [url, cookie, placeholder, text] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
if (cookie) await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(url).hostname, path: '/' }; }));
const p = await ctx.newPage(); p.on('console', (m) => console.log(`console.${m.type()}:`, m.text())); p.on('pageerror', (e) => console.log('pageerror:', e.stack));
p.on('request', (r) => r.resourceType() === 'fetch' && console.log('fetch', r.method(), r.url()));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(500);
await p.getByPlaceholder(placeholder).fill(text); await p.waitForTimeout(1500);
console.log('URL', p.url()); console.log((await p.locator('body').ariaSnapshot()).split('\n').slice(0, 25).join('\n'));
await b.close();

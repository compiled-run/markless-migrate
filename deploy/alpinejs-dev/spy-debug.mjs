// Scrolls a docs page and logs the contents highlighter's spy events: node deploy/alpinejs-dev/spy-debug.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const d = await b.newPage({ viewport: { width: 1400, height: 900 } });
d.on('console', (c) => console.log('console', c.text())); d.on('pageerror', (e) => console.log('pageerror', e.message));
await d.route(/carbonads|usefathom|cloudflareinsights/, (r) => r.abort());
await d.goto(process.argv[2] + '/directives/model', { waitUntil: 'load' });
await d.evaluate(() => document.querySelector('aside.fixed.right-0').addEventListener('spy', (e) => console.log('spy', e.detail)));
for (let k = 0; k < 4; k++) { await d.mouse.move(700, 500); await d.mouse.wheel(0, 900); await d.waitForTimeout(400); }
console.log(await d.evaluate(() => [...document.querySelectorAll('aside.fixed.right-0 a')].map((a) => a.className).filter((c) => c.includes('font-medium'))));
await b.close();

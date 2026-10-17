// Loads a page, logs console output, errors and failed requests, scrolls, then prints #probe: node deploy/alpinejs-dev/probe.mjs <url>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
p.on('console', (m) => console.log('console', m.type(), m.text()));
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('requestfailed', (r) => console.log('failed', r.url()));
p.on('response', (r) => { if (r.url().includes('/build/')) console.log('loaded', r.status(), r.url().split('/').pop()); });
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
await p.evaluate(() => { document.body.style.height = '5000px'; });
await p.waitForTimeout(1500); if (process.env.CLICK) { await p.click('#probe'); await p.waitForTimeout(500); console.log('after click:', await p.textContent('#probe'), await p.getAttribute('#probe', 'data-attached')); }
await p.mouse.wheel(0, 700); await p.waitForTimeout(800);
console.log('text:', await p.textContent('#probe').catch(() => 'n/a'));
await b.close();

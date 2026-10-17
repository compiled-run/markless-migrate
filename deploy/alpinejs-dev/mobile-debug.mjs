import { chromium } from 'playwright';
const b = await chromium.launch();
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
m.on('console', (c) => console.log('console', c.text()));
await m.route(/carbonads|usefathom|cloudflareinsights/, (r) => r.abort());
await m.goto('http://127.0.0.1:4421/directives/model', { waitUntil: 'load' });
await m.getByRole('button', { name: 'Show navigation' }).click(); await m.waitForTimeout(500);
console.log(await m.evaluate(() => { const p = document.querySelector('div.fixed.top-0.bottom-0.right-0'); const f = p.querySelector('a[href], button:not([disabled])'); const r = [getComputedStyle(p).display, f?.outerHTML.slice(0, 80), document.activeElement?.outerHTML.slice(0, 60)]; f?.focus(); r.push(document.activeElement?.outerHTML.slice(0, 60)); return r; }));
await b.close();

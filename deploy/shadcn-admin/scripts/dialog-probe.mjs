import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://127.0.0.1:4471/', { waitUntil: 'networkidle' });
await p.click('button:has-text("Search")');
await p.waitForTimeout(400);
console.log(await p.evaluate(() => [...document.body.children].map((c) => c.outerHTML.slice(0, 400)).join('\n---\n')));
console.log(await p.evaluate(() => ({ body: document.body.getAttribute('style'), attrs: document.body.getAttributeNames(), html: document.documentElement.getAttribute('style') })));
await b.close();

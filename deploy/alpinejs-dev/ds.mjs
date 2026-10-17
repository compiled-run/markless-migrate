import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://127.0.0.1:4421/directives/model', { waitUntil: 'load' }); await p.waitForTimeout(1500);
console.log(await p.evaluate(() => [typeof window.docsearch, document.body.lastElementChild?.outerHTML.slice(0, 200)]));
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true })));
await p.waitForTimeout(800); console.log('modal', await p.locator('.DocSearch-Modal').count());
await b.close();

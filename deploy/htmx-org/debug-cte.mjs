import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror', e.message)); p.on('console', (m) => console.log('console', m.type(), m.text()));
await p.goto('http://127.0.0.1:4411/examples/click-to-edit/', { waitUntil: 'load' }); await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Click To Edit' }).click(); await p.waitForTimeout(800); console.log(await p.evaluate(() => document.querySelector('#demo-timeline').outerHTML.slice(0, 300))); await p.getByRole('button', { name: 'Cancel' }).click(); await p.waitForTimeout(800); console.log(await p.evaluate(() => document.querySelector('#demo-timeline').outerHTML.slice(0, 400))); await p.getByRole('button', { name: 'Click To Edit' }).click(); await p.waitForTimeout(800);
console.log(await p.evaluate(() => [document.querySelector('#demo-timeline').outerHTML.slice(0, 400), document.querySelector('#demo-canvas').outerHTML.slice(0, 300)]));
await b.close();

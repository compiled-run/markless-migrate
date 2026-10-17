import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:4411/examples/click-to-edit/', { waitUntil: 'load' }); await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Click To Edit' }).click(); await p.waitForTimeout(500);
await p.locator('#firstName').fill('Ada'); await p.getByRole('button', { name: 'Submit' }).click(); await p.waitForTimeout(500);
console.log(await p.evaluate(() => [document.querySelector('#demo-canvas > div').outerHTML, document.querySelector('#firstName').outerHTML, document.querySelector('#firstName').value]));
await b.close();

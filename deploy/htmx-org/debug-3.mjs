import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://127.0.0.1:4411/examples/click-to-edit/', { waitUntil: 'load' }); await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Click To Edit' }).click(); await p.waitForTimeout(500);
console.log(await p.evaluate(() => document.querySelector('#demo-current-request').innerHTML.slice(0, 700)));
await p.goto('http://127.0.0.1:4411/', { waitUntil: 'load' }); await p.waitForTimeout(800);
const box = await p.getByRole('link', { name: 'talk' }).first().boundingBox();
console.log('talk box', box, await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.outerHTML.slice(0, 150); }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }));
await b.close();

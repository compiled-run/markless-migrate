import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:4411/probe', { waitUntil: 'load' });
for (let i = 0; i < 2; i++) { await p.click('#add'); await p.waitForTimeout(400); console.log(await p.evaluate(() => ['empty-start', 'empty-block', 'one-start'].map((id) => id + ':' + document.getElementById(id).innerText.replace(/\n/g, ',')).join(' | '))); }
await b.close();

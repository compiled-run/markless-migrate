import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
p.on('console', (m) => console.log('console', m.type(), m.text()));
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
await p.click('button'); await p.waitForTimeout(500); await p.click('button'); await p.waitForTimeout(500);
console.log(await p.textContent('button'));
await b.close();

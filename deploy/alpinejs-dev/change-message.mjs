// Aria snapshot of the "Change Message" demo before and after its click: node deploy/alpinejs-dev/change-message.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
await p.route(/usefathom|carbonads|doubleclick|cloudflareinsights|docsearch/, (r) => r.abort());
await p.goto(process.argv[2] + '/directives/model', { waitUntil: 'networkidle' });
const demo = p.locator('.demo').nth(1);
console.log(await demo.ariaSnapshot());
await p.getByRole('button', { name: 'Change Message' }).click();
for (const ms of [0, 50, 300, 1000]) { await p.waitForTimeout(ms); console.log(ms, JSON.stringify(await demo.ariaSnapshot()), await demo.locator('input').inputValue(), await demo.locator('input').getAttribute('value')); }
await b.close();

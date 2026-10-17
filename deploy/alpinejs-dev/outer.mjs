// Prints the live outerHTML of a selector after scripts ran: node deploy/alpinejs-dev/outer.mjs <url> <selector>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.route(/usefathom|carbonads|doubleclick|cloudflareinsights/, (r) => r.abort());
await p.goto(process.argv[2], { waitUntil: 'load' }); await p.waitForTimeout(1500);
console.log(await p.locator(process.argv[3]).first().evaluate((e) => e.outerHTML));
await b.close();

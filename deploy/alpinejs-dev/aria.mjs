// Prints the aria snapshot of the n-th element matching a selector: node deploy/alpinejs-dev/aria.mjs <url> <selector> [n]
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
await p.route(/usefathom|carbonads|doubleclick|cloudflareinsights/, (r) => r.abort());
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
console.log(await p.locator(process.argv[3]).nth(Number(process.argv[4] ?? 0)).ariaSnapshot());
await b.close();

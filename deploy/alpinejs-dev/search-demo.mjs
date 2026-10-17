// Types into the /start-here search demo and prints the list: node deploy/alpinejs-dev/search-demo.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.route(/carbonads|usefathom|cloudflareinsights/, (r) => r.abort());
await p.goto(process.argv[2] + '/start-here', { waitUntil: 'load' });
const input = p.getByPlaceholder('Search...');
for (const v of ['b', 'ba', 'baz', '', 'x']) { await input.fill(v); await p.waitForTimeout(300); console.log(JSON.stringify(v), await p.locator('.demo ul li').allTextContents()); }
await b.close();

// Prints the "On this page" headings the live alpinejs.dev page builds: node deploy/alpinejs-dev/extract-toc.mjs <url>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.route(/usefathom|carbonads|doubleclick|cloudflareinsights/, (r) => r.abort());
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
const toc = await p.evaluate(() => [...document.querySelectorAll('aside[x-data] ul li a')].map((a) => ({ id: a.getAttribute('href').slice(1), text: a.textContent, level: a.parentElement.className.includes('ml-4') ? 3 : a.parentElement.className.includes('ml-8') ? 4 : 2, active: a.className })));
console.log(JSON.stringify(toc));
await b.close();

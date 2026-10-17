import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(process.argv[2] + '/directives/model', { waitUntil: 'networkidle' });
const btn = p.getByRole('button', { name: 'Show navigation' });
console.log('count', await btn.count(), 'visible', await btn.first().isVisible(), await btn.first().evaluate((e) => [getComputedStyle(e.parentElement).display, e.parentElement.className]));
await b.close();

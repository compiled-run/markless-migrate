// Lists visible elements with a background colour, in document order, at a viewport width: node bg-probe.mjs <url> <width>
import { chromium } from 'playwright';
const [url, width = '767'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(width), height: 800 } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
console.log((await p.evaluate(() => [...document.querySelectorAll('body, body *')].filter((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.backgroundColor !== 'rgba(0, 0, 0, 0)'; }).map((e) => `${e.tagName.toLowerCase()}.${(e.getAttribute('data-slot') || '').slice(0, 20)} ${getComputedStyle(e).backgroundColor} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`))).join('\n'));
await b.close();

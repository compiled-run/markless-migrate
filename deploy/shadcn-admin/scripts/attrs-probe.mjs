// Prints an element's attributes (not class) before and after clicks: node attrs-probe.mjs <url> <selector> [click]...
import { chromium } from 'playwright';
const [url, sel, ...clicks] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
p.on('console', (m) => console.log('console:', m.type(), m.text()));
await p.goto(url, { waitUntil: 'networkidle' });
const dump = () => p.$eval(sel, (e) => e.getAttributeNames().filter((n) => n !== 'class').map((n) => `${n}=${e.getAttribute(n)}`).join(' '));
console.log('before', await dump());
for (const c of clicks) { await p.click(c); await p.waitForTimeout(500); console.log('after', c, await dump()); }
await b.close();

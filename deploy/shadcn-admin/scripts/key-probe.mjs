// Focuses an element, presses keys, and prints an element's attributes: node key-probe.mjs <url> <focus> <read> <key>...
import { chromium } from 'playwright';
const [url, focus, read, ...keys] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
p.on('console', (m) => console.log('console:', m.type(), m.text()));
await p.goto(url, { waitUntil: 'networkidle' });
await p.focus(focus);
for (const k of keys) { await p.keyboard.press(k); await p.waitForTimeout(400); }
console.log(await p.$eval(read, (e) => e.getAttributeNames().filter((n) => n !== 'class' && n !== 'style').map((n) => `${n}=${e.getAttribute(n)}`).join(' ')));
console.log(await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 150)));
await b.close();

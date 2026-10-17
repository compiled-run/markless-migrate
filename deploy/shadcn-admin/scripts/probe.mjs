// Evaluates an expression in a loaded route: node probe.mjs <url> '<js expression>'
import { chromium } from 'playwright';
const [url, expr] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(300);
console.log(JSON.stringify(await p.evaluate(expr), null, 1));
await b.close();

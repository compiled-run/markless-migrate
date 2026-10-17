import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.addInitScript(() => {
  const orig = Math.random;
  window.__draws = [];
  Math.random = function () { const v = orig(); window.__draws.push((new Error().stack || '').split('\n').slice(2, 4).join(' | ').replace(/https?:\/\/[^/]+/g, '')); return v; };
});
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
const draws = await p.evaluate(() => window.__draws);
console.log(draws.length);
const groups = {};
for (const d of draws) { const k = d.replace(/:\d+:\d+/g, ''); groups[k] = (groups[k] || 0) + 1; }
console.log(draws.slice(0, 6).join('\n'));
console.log(groups);
await b.close();

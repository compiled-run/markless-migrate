import { chromium } from 'playwright';
const b = await chromium.launch();
for (const port of [4471, 4472]) {
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
console.log(port, await p.evaluate(() => [...document.querySelectorAll('.recharts-xAxis-tick-labels tspan')].filter(t => t.closest('g').style.display !== 'none').map(t => t.textContent).join(' ')));
}
await b.close();

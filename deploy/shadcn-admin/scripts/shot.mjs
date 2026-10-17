import { chromium } from 'playwright';
const [base, out, ...routes] = process.argv.slice(2);
const b = await chromium.launch();
for (const r of routes) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(base + r, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${r.replace(/\W+/g, '_') || 'root'}.png`, fullPage: true });
  await p.close();
}
await b.close();

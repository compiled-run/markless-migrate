import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('console', (m) => console.log('console:', m.text()));
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
const steps = JSON.parse(process.argv[3] ?? '[]');
for (const s of steps) {
  if (s.fill) await p.fill(s.fill, s.value);
  if (s.click) await p.click(s.click);
  if (s.press) await p.press(s.on ?? 'body', s.press);
  await p.waitForTimeout(s.wait ?? 200);
  if (s.read) console.log(s.read, '=>', JSON.stringify(await p.$$eval(s.read, (els) => els.map((e) => e.outerHTML))));
}
await b.close();

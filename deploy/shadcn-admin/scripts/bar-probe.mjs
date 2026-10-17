import { chromium } from 'playwright';
const b = await chromium.launch();
for (const wait of [0, 150, 400, 900, 2000]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`${process.argv[2] ?? 'http://127.0.0.1:4471'}/sign-in`, { waitUntil: 'load' });
  await p.waitForTimeout(wait);
  console.log(wait, await p.evaluate(() => { const a = document.querySelector('#root')?.firstElementChild; if (!a?.firstElementChild) return 'not yet'; return [a.firstElementChild.getAttribute('style'), a.firstElementChild.firstElementChild.getAttribute('style')].join(' || '); }));
  await p.close();
}
await b.close();

import { chromium } from 'playwright';
const b = await chromium.launch(); 
for (const origin of ['http://127.0.0.1:4420', 'https://mm-alpinejs-dev-new.vercel.app']) for (const route of ['/magics/watch', '/advanced/extending']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.route(/carbonads|usefathom|buysellads/, (r) => r.abort());
  await p.goto(origin + route);
  const out = [];
  for (const t of [300, 1000, 3000]) { await p.waitForTimeout(t); out.push(await p.evaluate(() => [...document.querySelectorAll('aside a.font-medium, [data-toc] a.font-medium')].map(a=>a.textContent.trim()).join(',') + ' scrollY=' + scrollY)); }
  console.log(origin.slice(0,30), route, out.join(' | '));
  await p.close();
}
await b.close();

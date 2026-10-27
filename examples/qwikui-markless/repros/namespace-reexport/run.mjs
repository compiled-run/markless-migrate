import { chromium } from '/Users/jacksm5pro/dev/open-source/mm-wt-qwikui/node_modules/playwright/index.mjs';
const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await p.goto('http://127.0.0.1:4612/'); await p.waitForTimeout(400); await p.click('#go'); await p.waitForTimeout(1200);
console.log('out:', JSON.stringify(await p.textContent('#out')), 'errors:', errs); await b.close();

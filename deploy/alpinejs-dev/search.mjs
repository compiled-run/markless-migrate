// Clicks the search button and reports whether the DocSearch modal opened: node deploy/alpinejs-dev/search.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await p.goto(process.argv[2] + '/directives/model', { waitUntil: 'load' }); await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Search (Command+K)' }).first().click(); await p.waitForTimeout(1000); console.log('after first', await p.locator('.DocSearch-Modal').count()); if (process.env.TWICE) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.getByRole('button', { name: 'Search (Command+K)' }).first().click(); await p.waitForTimeout(1000); }
console.log('modal', await p.locator('.DocSearch-Modal').count());
await p.keyboard.type('x-show'); await p.waitForTimeout(1500);
console.log('hits', await p.locator('.DocSearch-Hit').count());
await b.close();

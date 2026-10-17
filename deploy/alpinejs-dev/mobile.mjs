// Mobile menu and contents-highlighter checks on a docs page: node deploy/alpinejs-dev/mobile.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch();
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
m.on('pageerror', (e) => console.log('pageerror', e.message));
await m.route(/carbonads|usefathom|cloudflareinsights/, (r) => r.abort());
await m.goto(process.argv[2] + '/directives/model', { waitUntil: 'load' });
const panel = m.locator('div.fixed.top-0.bottom-0.right-0');
await m.getByRole('button', { name: 'Show navigation' }).click(); await m.waitForTimeout(500);
console.log('open', await panel.isVisible(), 'focus', await m.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20)), 'html overflow', await m.evaluate(() => document.documentElement.style.overflow));
await m.keyboard.press('Escape'); await m.waitForTimeout(400);
console.log('after escape', await panel.isVisible(), 'focus', await m.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20)));
await m.getByRole('button', { name: 'Show navigation' }).click(); await m.waitForTimeout(400);
await m.mouse.click(20, 400); await m.waitForTimeout(400);
console.log('after outside click', await panel.isVisible());
const d = await b.newPage({ viewport: { width: 1400, height: 900 } });
await d.route(/carbonads|usefathom|cloudflareinsights/, (r) => r.abort());
await d.goto(process.argv[2] + '/directives/model', { waitUntil: 'load' });
for (let k = 0; k < 6; k++) { await d.mouse.move(700, 500); await d.mouse.wheel(0, 900); await d.waitForTimeout(250); }
console.log('highlighted', await d.evaluate(() => [...document.querySelectorAll('aside.fixed.right-0 a.font-medium')].map((a) => a.textContent)));
await b.close();

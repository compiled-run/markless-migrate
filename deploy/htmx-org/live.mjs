// Prints the live click-to-edit demo and request log after each step: node deploy/htmx-org/live.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(process.argv[2] + '/examples/click-to-edit/', { waitUntil: 'load' }); await p.waitForTimeout(800);
const dump = async (label) => console.log(`== ${label}\n`, await p.evaluate(() => [document.querySelector('#demo-canvas').innerHTML, document.querySelector('#demo-server-info').outerHTML].join('\n----\n').replace(/\n\s*\n/g, '\n').slice(0, 3000)));
await dump('load');
await p.getByRole('button', { name: 'Click To Edit' }).click(); await p.waitForTimeout(800); await dump('edit');
console.log('focus', await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 100)));
await p.locator('#firstName').fill('Ada'); await p.getByRole('button', { name: 'Submit' }).click(); await p.waitForTimeout(800); await dump('submitted');
await p.locator('#request-info-toggler').click(); await p.waitForTimeout(300); console.log('toggler', await p.locator('#request-info-toggler').textContent(), await p.locator('#demo-server-info').getAttribute('class'));
await b.close();

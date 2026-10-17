// Drives the click-to-edit demo on one origin and prints what it shows: node deploy/htmx-org/smoke.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(process.argv[2] + '/examples/click-to-edit/', { waitUntil: 'load' }); await p.waitForTimeout(500);
const canvas = async (label) => console.log(label, JSON.stringify((await p.locator('#demo-canvas').innerText()).replace(/\s+/g, ' ')), '| count', JSON.stringify(await p.locator('#request-count').innerText()), '| timeline', JSON.stringify((await p.locator('#demo-timeline').innerText()).replace(/\s+/g, ' ')), '| active', await p.locator('#demo-timeline li.active').getAttribute('id'));
await canvas('load');
await p.getByRole('button', { name: 'Click To Edit' }).click(); await p.waitForTimeout(500); await canvas('edit');
console.log('focus', await p.evaluate(() => document.activeElement?.id));
await p.locator('#firstName').fill('Ada'); await p.getByRole('button', { name: 'Submit' }).click(); await p.waitForTimeout(500); await canvas('submit');
await p.getByRole('button', { name: 'Click To Edit' }).click(); await p.waitForTimeout(500); console.log('refilled', await p.locator('#firstName').inputValue());
await p.getByRole('button', { name: 'Cancel' }).click(); await p.waitForTimeout(500); await canvas('cancel');
await p.locator('#request-info-toggler').click(); await p.waitForTimeout(300); await p.locator('#demo-timeline li', { hasText: 'Initial State' }).locator('a').click(); await p.waitForTimeout(300);
console.log('shown entry', await p.locator('#demo-current-request > div:not(.hide)').getAttribute('id'), JSON.stringify((await p.locator('#demo-current-request > div:not(.hide)').innerText()).slice(0, 80)));
console.log('toggler', await p.locator('#request-info-toggler').innerText(), await p.locator('#demo-server-info').getAttribute('class'));
await p.locator('#demo-timeline li', { hasText: 'GET /contact/1/edit' }).first().locator('a').click(); await p.waitForTimeout(300);
console.log('req text', JSON.stringify(await p.locator('#demo-current-request > div:not(.hide)').innerText()));
await b.close();

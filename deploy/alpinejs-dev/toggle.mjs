// Clicks the /start-here Toggle a few times and prints whether "Contents..." shows: node deploy/alpinejs-dev/toggle.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message)); p.on('console', (m) => console.log('console', m.type(), m.text()));
await p.route(/carbonads|usefathom/, (r) => r.abort());
await p.goto(process.argv[2] + '/start-here', { waitUntil: 'load' });
const contents = p.getByText('Contents...', { exact: true });
for (const what of ['toggle', 'toggle', 'toggle', 'outside']) {
	if (what === 'toggle') await p.getByRole('button', { name: 'Toggle' }).click(); else await p.mouse.click(5, 300);
	await p.waitForTimeout(300); console.log(what, await contents.isVisible());
}
await b.close();

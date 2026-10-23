// Clicks vite.dev's "Copy code" buttons right after load, as check does, on both sides, and prints whether each answered.
import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const [side, origin] of [['old', 'http://127.0.0.1:4000'], ['new', 'http://127.0.0.1:3000']]) {
	for (const nth of [0, 1, 2, 3, 4, 5]) {
		for (const wait of [150, 3000]) {
			const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'] });
			const page = await context.newPage();
			const logs = [];
			page.on('console', (m) => { if (m.type() === 'error' && !/FloatingVue/.test(m.text())) logs.push(m.text().slice(0, 160)); });
			page.on('pageerror', (e) => logs.push(`pageerror: ${e.message.slice(0, 160)}`));
			const requests = [];
			await page.goto(`${origin}/config/build-options`, { waitUntil: 'load' });
			await page.waitForTimeout(wait);
			page.on('request', (r) => requests.push(new URL(r.url()).pathname));
			const button = page.getByRole('button', { name: 'Copy code' }).nth(nth);
			await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
			const before = await button.evaluate((el) => { window.__mm_el = el; return el.className; });
			await button.click();
			await page.waitForTimeout(400);
			const after = await page.evaluate(() => ({ same: document.contains(window.__mm_el), cls: window.__mm_el.className, active: document.activeElement?.className ?? document.activeElement?.localName }));
			console.log(side, `nth=${nth} wait=${wait}`, JSON.stringify({ before, after, requests: requests.slice(0, 5), logs: logs.slice(0, 3) }));
			await context.close();
		}
	}
}
await browser.close();

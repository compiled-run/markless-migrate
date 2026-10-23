// Clicks vite.dev's first "Copy code" button on both sides and prints what each page shows and logs.
import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const [side, origin] of [['old', 'http://127.0.0.1:4000'], ['new', 'http://127.0.0.1:3000']]) {
	for (const grant of [false, true]) {
		const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...(grant ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
		const page = await context.newPage();
		const logs = [];
		page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
		page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
		await page.goto(`${origin}/config/build-options`, { waitUntil: 'load' });
		await page.waitForTimeout(1500);
		const button = page.getByRole('button', { name: 'Copy code' }).first();
		const html = await button.evaluate((b) => b.outerHTML.slice(0, 300));
		await button.click();
		await page.waitForTimeout(300);
		const after = await button.evaluate((b) => ({ name: b.getAttribute('aria-label') ?? b.textContent, cls: b.className, active: document.activeElement?.outerHTML.slice(0, 120), secure: isSecureContext }));
		console.log(side, `grant=${grant}`, JSON.stringify({ html, after, logs: logs.slice(0, 8) }));
		await context.close();
	}
}
await browser.close();

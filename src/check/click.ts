import type { Locator } from 'playwright';

/**
 * Clicks once. A click the page acknowledged only after the timeout (a handler holding a busy runner's main thread) has
 * still landed and counts as done; Playwright throws for it, and clicked again a toggle closes what it just opened.
 */
export async function clickOnce(target: Locator, options: Parameters<Locator['click']>[0] = {}): Promise<void> {
	const page = target.page();
	const seen = () => page.evaluate(() => (globalThis as unknown as { __mmTrustedClicks?: number }).__mmTrustedClicks).catch(() => undefined);
	await page
		.evaluate(() => {
			const w = globalThis as unknown as { __mmTrustedClicks?: number };
			if (w.__mmTrustedClicks !== undefined) return;
			w.__mmTrustedClicks = 0;
			addEventListener('click', (event) => void (event.isTrusted && w.__mmTrustedClicks!++), true);
		})
		.catch(() => {});
	const before = await seen();
	try {
		await target.click(options);
	} catch (error) {
		const after = await seen();
		if (before !== undefined && after !== undefined && after > before) return;
		throw error;
	}
}

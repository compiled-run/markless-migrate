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
	const position = options.position ?? (await drawnPoint(target));
	try {
		await target.click({ ...options, ...(position ? { position } : {}) });
	} catch (error) {
		const after = await seen();
		if (before !== undefined && after !== undefined && after > before) return;
		throw error;
	}
}

/** Where to click a control whose box centre is a gap between what it draws (an axis' tick labels): the centre of its first drawn part the pointer reaches. */
async function drawnPoint(target: Locator): Promise<{ x: number; y: number } | undefined> {
	if ((await target.count().catch(() => 0)) !== 1) return undefined;
	return target
		.evaluate((el) => {
			const box = el.getBoundingClientRect();
			const reaches = (x: number, y: number) => {
				const hit = document.elementFromPoint(x, y);
				return Boolean(hit && (hit === el || el.contains(hit)));
			};
			if (!box.width || !box.height || reaches(box.x + box.width / 2, box.y + box.height / 2)) return undefined;
			for (const part of [el, ...el.querySelectorAll('*')])
				for (const r of part.getClientRects()) {
					const x = r.x + r.width / 2;
					const y = r.y + r.height / 2;
					if (r.width >= 1 && r.height >= 1 && reaches(x, y)) return { x: x - box.x, y: y - box.y };
				}
			return undefined;
		}, undefined, { timeout: 1_000 })
		.catch(() => undefined);
}


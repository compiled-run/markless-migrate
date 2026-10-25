import type { Browser } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { HINTS } from './hints.ts';
import { loadPage } from './infrastructure.ts';
import type { Failure, Viewport } from './types.ts';

const SETTLE_MS = 1_000;

/** A route of a hash-routed old app, opened on the new app by its old address `/#<route>`, must land on the route. */
export async function hashLinkFailures(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<Failure[]> {
	const { context, page } = await openPage(browser, env, viewport, { sameOriginOnly: true });
	try {
		await loadPage(page, `${new URL(env.origin).origin}/#${route}`);
		await page.waitForURL((url) => url.pathname + url.search === route, { timeout: SETTLE_MS }).catch(() => {});
		const at = new URL(page.url());
		const landed = at.pathname + at.search + at.hash;
		if (at.pathname + at.search === route) return [];
		return [{ route, dimension: 'http', check: 'old hash link', expected: `/#${route} lands on ${route}`, actual: `/#${route} stays on ${landed}`, hint: HINTS.hashLink }];
	} finally {
		await context.close();
	}
}

/** The DocSearch (Algolia) search the old site runs: its application, search-only key and index. */
export interface DocSearchUse {
	readonly appId: string;
	readonly apiKey: string;
	readonly indexName: string;
	readonly shell?: string;
}

const value = (name: string) => new RegExp(`["']?${name}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`);

/**
 * The DocSearch config a script carries, read from its literals: `docsearch({ appId, apiKey, indexName })` in a page
 * script, or the same keys in a theme's built config (Docusaurus' `algolia`, VitePress' `search.options`). The three keys
 * are taken from within one object, around each `indexName`.
 */
export function docsearchConfig(text: string): DocSearchUse | undefined {
	const at = /["']?indexName["']?\s*:/g;
	for (let m = at.exec(text); m; m = at.exec(text)) {
		const window = text.slice(Math.max(0, m.index - 600), m.index + 600);
		const indexName = value('indexName').exec(window)?.[1];
		const appId = value('appId').exec(window)?.[1];
		const apiKey = value('apiKey').exec(window)?.[1];
		if (indexName && appId && apiKey && /^[A-Z0-9]{6,}$/.test(appId) && /^[a-f0-9]{16,}$/i.test(apiKey)) return { appId, apiKey, indexName };
	}
	return undefined;
}

/**
 * DocSearch's dialog as the old site first draws it when its search button is pressed (the overlay, the focused input,
 * the empty start screen): the docsearch part shows this markup on a press made before DocSearch's script is in.
 */
export async function captureDocSearchShell(origin: string, routes: readonly string[], headers: Readonly<Record<string, string>> = {}): Promise<string | undefined> {
	const { chromium } = await import('playwright');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { ...headers } });
		for (const route of routes.slice(0, 5)) {
			await page.goto(new URL(route, origin).href, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
			const button = page.locator('.DocSearch-Button').filter({ visible: true }).first();
			if (!(await button.count())) continue;
			await button.click({ timeout: 5000 }).catch(() => undefined);
			const html = await page
				.locator('.DocSearch-Container')
				.first()
				.evaluate((el) => {
					const copy = el.cloneNode(true) as HTMLElement;
					copy.querySelector<HTMLElement>('.DocSearch-Modal')?.style.removeProperty('--docsearch-vh');
					if (copy.querySelector<HTMLElement>('.DocSearch-Modal')?.getAttribute('style') === '') copy.querySelector('.DocSearch-Modal')!.removeAttribute('style');
					return copy.outerHTML;
				}, undefined, { timeout: 8000 })
				.catch(() => undefined);
			if (html) return html;
		}
		return undefined;
	} finally {
		await browser.close();
	}
}

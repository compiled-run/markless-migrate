/** The DocSearch (Algolia) search the old site runs: its application, search-only key and index. */
export interface DocSearchUse {
	readonly appId: string;
	readonly apiKey: string;
	readonly indexName: string;
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

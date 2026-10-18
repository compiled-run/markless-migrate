// Mermaid diagrams, drawn by the mermaid library the old site uses, in a browser (it measures text), with the
// site's mermaid theme config: the light diagram goes in the page, the dark one is kept for lib/site.ts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../../../node_modules/playwright/index.mjs';
import { website } from './site.mjs';

const script = join(website, '../node_modules/.pnpm/mermaid@12.0.0/node_modules/mermaid/dist/mermaid.min.js');
const cache = join(import.meta.dirname, '../.cache/mermaid');

export async function drawMermaid(values, themeConfig) {
	const out = new Map();
	const todo = [];
	mkdirSync(cache, { recursive: true });
	for (const value of values) {
		const file = join(cache, `${createHash('sha1').update(value + JSON.stringify(themeConfig)).digest('hex')}.json`);
		if (existsSync(file)) out.set(value, JSON.parse(readFileSync(file, 'utf8')));
		else todo.push([value, file]);
	}
	if (!todo.length) return out;
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.setContent('<!DOCTYPE html><html><body></body></html>');
	await page.addScriptTag({ path: script });
	let n = 0;
	for (const [value, file] of todo) {
		const result = {};
		for (const mode of ['light', 'dark']) {
			result[mode] = await page.evaluate(
				async ({ text, config, id }) => {
					// eslint-disable-next-line no-undef
					mermaid.initialize(config);
					// eslint-disable-next-line no-undef
					return (await mermaid.render(id, text)).svg;
				},
				{ text: value, config: { startOnLoad: false, ...themeConfig.options, theme: themeConfig.theme[mode] }, id: `mermaid-svg-${n++}` },
			).catch((error) => {
				// A diagram mermaid cannot draw shows the theme's error fallback, with mermaid's message.
				result.error = error.message.replace(/^page\.evaluate: (?:\w*Error: )?/, '').split('\n')[0];
				return null;
			});
		}
		writeFileSync(file, JSON.stringify(result));
		out.set(value, result);
	}
	await browser.close();
	return out;
}

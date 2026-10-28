// Mermaid diagrams, drawn by the mermaid library the old site uses, in a browser (it measures text), with the
// site's mermaid theme config: the light diagram goes in the page, the dark one is kept for lib/site.ts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../../../node_modules/playwright/index.mjs';
import { website } from './site.mjs';

const script = join(website, '../node_modules/.pnpm/mermaid@12.0.0/node_modules/mermaid/dist/mermaid.min.js');
const cache = join(import.meta.dirname, '../.cache/mermaid');

// Each diagram is drawn with the ids the old page gives it ({ value, ids: { light, dark } }); `tooltip` is the element
// mermaid adds to <body> for it (its flowcharts' tooltip), if any.
export async function drawMermaid(diagrams, themeConfig) {
	const out = new Map();
	const todo = [];
	mkdirSync(cache, { recursive: true });
	for (const diagram of diagrams) {
		const file = join(cache, `${createHash('sha1').update(JSON.stringify([diagram.value, diagram.ids, themeConfig, 2])).digest('hex')}.json`);
		if (existsSync(file)) out.set(diagram, JSON.parse(readFileSync(file, 'utf8')));
		else todo.push([diagram, file]);
	}
	if (!todo.length) return out;
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.setContent('<!DOCTYPE html><html><body></body></html>');
	await page.addScriptTag({ path: script });
	for (const [diagram, file] of todo) {
		const result = {};
		for (const mode of ['light', 'dark']) {
			const drawn = await page.evaluate(
				async ({ text, config, id }) => {
					document.querySelector('.mermaidTooltip')?.remove();
					// eslint-disable-next-line no-undef
					mermaid.initialize(config);
					// eslint-disable-next-line no-undef
					const { svg, bindFunctions } = await mermaid.render(id, text);
					// As theme-mermaid does once the diagram is in the page.
					const container = document.createElement('div');
					container.innerHTML = svg;
					document.body.append(container);
					bindFunctions?.(container);
					container.remove();
					return { svg, tooltip: document.querySelector('.mermaidTooltip')?.outerHTML };
				},
				{ text: diagram.value, config: { startOnLoad: false, ...themeConfig.options, theme: themeConfig.theme[mode] }, id: diagram.ids[mode] },
			).catch((error) => {
				// A diagram mermaid cannot draw shows the theme's error fallback, with mermaid's message.
				result.error = error.message.replace(/^page\.evaluate: (?:\w*Error: )?/, '').split('\n')[0];
				return null;
			});
			result[mode] = drawn?.svg ?? null;
			if (mode === 'light' && drawn?.tooltip) result.tooltip = drawn.tooltip;
		}
		writeFileSync(file, JSON.stringify(result));
		out.set(diagram, result);
	}
	await browser.close();
	return out;
}

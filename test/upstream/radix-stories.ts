// Radix's Cypress suite visits Storybook stories (`iframe.html?id=components-<story>`). Each story it visits is built as
// a page of its own (/stories/<story>/) the way Storybook renders it (fullscreen layout, preview.css, StrictMode), so
// convert can take it; stories-proxy.ts sends the suite's iframe.html address to that page on either side.
//   node test/upstream/radix-stories.ts <apps/storybook of the checkout>
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Each story the suite visits: its Storybook id, the stories file and its export. */
export const STORIES: readonly { readonly id: string; readonly file: string; readonly name: string }[] = [
	{ id: 'contextmenu--submenus', file: 'context-menu', name: 'Submenus' },
	{ id: 'dropdownmenu--submenus', file: 'dropdown-menu', name: 'Submenus' },
	{ id: 'menubar--cypress', file: 'menubar', name: 'Cypress' },
	{ id: 'select--cypress', file: 'select', name: 'Cypress' },
	{ id: 'dialog--cypress', file: 'dialog', name: 'Cypress' },
	{ id: 'form--cypress', file: 'form', name: 'Cypress' },
	{ id: 'toast--cypress', file: 'toast', name: 'Cypress' },
];

export const PAGES = 'upstream-pages';
export const OUT = 'upstream-dist';

export async function writeStoryPages(storybook: string): Promise<void> {
	const dir = resolve(storybook, PAGES);
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	const links = STORIES.map((s) => `<li><a href="/stories/${s.id}/">${s.id}</a></li>`).join('');
	await writeFile(join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Radix stories</title></head><body><ul>${links}</ul></body></html>\n`);
	for (const story of STORIES) {
		await mkdir(join(dir, 'stories', story.id), { recursive: true });
		await writeFile(join(dir, 'stories', story.id, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${story.id}</title></head><body><div id="storybook-root"></div><script type="module" src="./main.tsx"></script></body></html>\n`);
		await writeFile(
			join(dir, 'stories', story.id, 'main.tsx'),
			`import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../.storybook/preview.css';
import { ${story.name} } from '../../../stories/${story.file}.stories';
createRoot(document.getElementById('storybook-root')!).render(<React.StrictMode><${story.name} /></React.StrictMode>);
`,
		);
	}
	const input: Record<string, string> = { index: join(dir, 'index.html') };
	for (const s of STORIES) input[s.id] = join(dir, 'stories', s.id, 'index.html');
	await writeFile(
		join(storybook, 'upstream-vite.config.mjs'),
		`export default { root: ${JSON.stringify(PAGES)}, logLevel: 'warn', esbuild: { jsx: 'automatic' }, build: { outDir: '../${OUT}', emptyOutDir: true, rollupOptions: { input: ${JSON.stringify(input)} } } };\n`,
	);
}

if (import.meta.main) await writeStoryPages(process.argv[2] ?? '.');

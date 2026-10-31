// react-day-picker's keyboard tests render an example component with props (render(<Keyboard dir="rtl" />)). Each such
// render is built as a page of its own, so convert can take it and the shim (day-picker-shim.ts) can visit it.
//   node test/upstream/day-picker-pages.ts <react-day-picker checkout>
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Each render the tests make: the example, its props, and the page that shows it. */
export const RENDERS: readonly { readonly example: string; readonly props: Readonly<Record<string, string | number>>; readonly path: string }[] = [
	{ example: 'Keyboard', props: { mode: 'single', dir: 'ltr' }, path: '/keyboard-ltr/' },
	{ example: 'Keyboard', props: { mode: 'single', dir: 'rtl' }, path: '/keyboard-rtl/' },
	{ example: 'Keyboard', props: { mode: 'single', weekStartsOn: 1 }, path: '/keyboard-monday/' },
];

/** The test files whose renders RENDERS covers. */
export const TESTS: readonly string[] = ['examples/Keyboard.test.tsx'];

export const OUT = 'upstream-dist';

export async function writePages(checkout: string): Promise<void> {
	const app = resolve(checkout, 'examples-app');
	const dir = join(app, 'upstream-pages');
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DayPicker examples</title></head><body><ul>${RENDERS.map((r) => `<li><a href="${r.path}">${r.path}</a></li>`).join('')}</ul></body></html>\n`);
	const input: Record<string, string> = { index: join(dir, 'index.html') };
	// The examples are copied beside the pages, so the source convert reads (examples-app) holds what imports DayPicker.
	await mkdir(join(dir, 'examples'), { recursive: true });
	for (const example of new Set(RENDERS.map((r) => r.example))) await copyFile(resolve(checkout, 'examples', `${example}.tsx`), join(dir, 'examples', `${example}.tsx`));
	for (const render of RENDERS) {
		const page = join(dir, render.path);
		await mkdir(page, { recursive: true });
		await writeFile(join(page, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${render.example}</title></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>\n`);
		const props = Object.entries(render.props).map(([k, v]) => `${k}={${JSON.stringify(v)}}`).join(' ');
		await writeFile(
			join(page, 'main.tsx'),
			`import React from 'react';
import { createRoot } from 'react-dom/client';
import 'react-day-picker/style.css';
import { ${render.example} } from '../examples/${render.example}';
createRoot(document.getElementById('root')!).render(<React.StrictMode><${render.example} ${props} /></React.StrictMode>);
`,
		);
		input[render.path.replaceAll('/', '')] = join(page, 'index.html');
	}
	const root = resolve(checkout);
	await writeFile(
		join(app, 'upstream-vite.config.mjs'),
		`import react from '@vitejs/plugin-react';
export default {
	root: ${JSON.stringify(dir)},
	logLevel: 'warn',
	plugins: [react()],
	resolve: { dedupe: ['react', 'react-dom'], alias: [{ find: /^react-day-picker\\/style\\.css$/, replacement: ${JSON.stringify(join(root, 'src', 'style.css'))} }, { find: /^react-day-picker$/, replacement: ${JSON.stringify(join(root, 'src', 'index.ts'))} }] },
	build: { outDir: ${JSON.stringify(join(app, OUT))}, emptyOutDir: true, rollupOptions: { input: ${JSON.stringify(input)} } },
};
`,
	);
}

if (import.meta.main) await writePages(process.argv[2] ?? '.');

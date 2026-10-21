// Bundles the page's load-time scripts for a plain <script type="module">; files keep the old build's /assets/name.hash.ext URLs.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// The docs' stylesheet, byte for byte at its old URL, and the fonts and images it links to. Each of those is emitted
// from its source under assets/ with the same name, so it gets the same content hash, and so the same URL, as on the
// old build; a URL that comes out missing fails the build.
const STYLESHEET = 'styles/style.B3BAO59d.css';
function oldStylesheet(): Plugin {
	const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sources(join(dir, entry.name)) : [join(dir, entry.name)]));
	return {
		name: 'old-stylesheet',
		generateBundle() {
			const css = readFileSync(STYLESHEET);
			this.emitFile({ type: 'asset', fileName: `assets/${basename(STYLESHEET)}`, source: css });
			const wanted = new Set(css.toString().match(/(?<=url\()\/assets\/[^)"']+/g));
			const all = sources('assets');
			const emitted = new Set<string>();
			for (const url of wanted) {
				const name = basename(url).replace(/\.[^.]+(\.[^.]+)$/, '$1');
				for (const file of all.filter((file) => basename(file) === name)) {
					const ref = this.emitFile({ type: 'asset', name, source: readFileSync(file) });
					emitted.add(`/${this.getFileName(ref)}`);
				}
			}
			const missing = [...wanted].filter((url) => !emitted.has(url));
			if (missing.length) this.error(`${STYLESHEET} links to files no source under assets/ produces: ${missing.join(', ')}`);
		},
	};
}

export default defineConfig({
	publicDir: false,
	plugins: [oldStylesheet()],
	build: {
		outDir: 'public',
		emptyOutDir: false,
		target: 'es2022',
		rollupOptions: {
			input: { page: 'page-scripts/page.ts', home: 'page-scripts/home.ts' },
			output: {
				entryFileNames: 'page-scripts/[name].js',
				chunkFileNames: 'page-scripts/[name]-[hash].js',
				assetFileNames: 'assets/[name].[hash][extname]',
			},
		},
	},
});
